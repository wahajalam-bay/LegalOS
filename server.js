// LegalOS static server — zero dependencies, Node built-ins only.
// Usage: node server.js  (optional: PORT env)
//
// Mount-point agnostic: every asset/link in the app is RELATIVE, so the same
// tree serves correctly at "/" (local dev) and behind an nginx prefix such as
// "/legalos/" (production, where proxy_pass strips the prefix). The one thing
// relative paths need is a trailing slash on directory URLs — see the 301 below.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const apiRouter = require("./api/router");

const ROOT = __dirname;
const PORT = process.env.PORT || 4600;
/* Which interface to accept connections on.
   DEFAULT IS LOOPBACK, deliberately. Production ingress is
   Internet -> Cloudflare -> Cloudflare Access -> nginx :80 -> 127.0.0.1:4600,
   so this process never needs to answer on a public interface. Binding 0.0.0.0
   (Node's default when no host is given) published the app on the instance's
   public interface, where a request reached it WITHOUT passing through nginx --
   which makes any Cloudflare allow-list installed at the nginx layer moot.
   Override only for a deliberate non-proxied deployment. */
const HOST = process.env.HOST || process.env.BIND_HOST || "127.0.0.1";

/* Security headers on every document this server returns.
   Scoped to what the application actually loads, and verified against it — a
   policy that breaks the page is worse than none, because the next person turns
   it off entirely:
     • scripts and styles come from esm.sh (the module CDN this app is built on)
       and Google Fonts; 'unsafe-inline' is required for the inline bootstrap in
       index.html and for the style attributes htm/preact render.
     • frame-ancestors 'none' is the clickjacking control (X-Frame-Options is
       kept for older browsers that ignore CSP).
     • connect-src stays same-origin plus the CDN, so a compromised dependency
       cannot quietly post legal data to a third party.
     • Documents are streamed through /api/knowledge/file/... and rendered in
       an iframe/object, so frame-src and img-src allow blob: and data:.
   HSTS is deliberately NOT set here: TLS terminates at Cloudflare and this
   origin also answers plain HTTP on the loopback for health checks. */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://esm.sh",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://drive.google.com https://docs.google.com https://*.googleusercontent.com",
    "connect-src 'self' https://esm.sh",
    "frame-src 'self' blob: data: https://drive.google.com https://docs.google.com",
    "object-src 'self' blob: data:",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

// Never serve source docs, local tooling output, or the stale nested copy.
// The app itself needs none of them, and a deployment is public to everyone
// the access policy admits.
const DENY = [
  /(^|\/)\./,               // dotfiles/dirs — .git above all, plus .gitignore
  /\.(docx|bat|log|bak|orig)$/i,
  /^\/legalos\//,           // stale nested duplicate of this same tree
  /^\/node_modules\//,
  /^\/package(-lock)?\.json$/,
  /^\/tests\//,
  /^\/app\//,               // TypeScript foundation — built alongside, not live yet
  /^\/config\//,           // secrets: the service-account key and the mailbox password
  /^\/api\//,              // served by the API router below, never from disk
];

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);

    // The API is dispatched before the static rules below. It is the only part
    // of this server that reads a credential or reaches the network, and it is
    // the only part that knows who the caller is.
    if (urlPath === "/api" || urlPath.startsWith("/api/")) {
      const query = new URL(req.url, "http://localhost").searchParams;
      return apiRouter.handle(req, res, urlPath, query).catch((e) => {
        console.error("[api]", urlPath, e && e.message);
        if (res.headersSent) return res.end();
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "internal", detail: String((e && e.message) || e) }));
      });
    }

    if (DENY.some((re) => re.test(urlPath))) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found: " + urlPath);
    }

    if (urlPath === "/") urlPath = "/index.html";

    // Resolve safely inside ROOT
    const filePath = path.join(ROOT, path.normalize(urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    fs.stat(filePath, (err, stat) => {
      // Directory → its index.html (this is how /portal/ resolves).
      if (!err && stat.isDirectory()) {
        // A directory URL MUST end in "/" or the browser resolves the page's
        // relative assets against the parent directory. Redirect rather than
        // serve, so "/portal" and "/portal/" both work.
        //
        // The Location is RELATIVE (last segment + "/") on purpose: nginx strips
        // the "/legalos" prefix before we see the request, so an absolute
        // "/portal/" would send the browser outside the mount point. Resolved
        // against the request URL, "portal/" lands correctly either way.
        if (!urlPath.endsWith("/")) {
          const leaf = urlPath.split("/").filter(Boolean).pop() || "";
          res.writeHead(301, { Location: leaf + "/" });
          return res.end();
        }
        return sendFile(req, res, path.join(filePath, "index.html"));
      }
      if (err || !stat.isFile()) {
        // SPA fallback for unknown non-asset routes. The requester portal is a
        // SEPARATE app, so a deep link under /portal must fall back to the
        // portal's own shell, not LegalOS's.
        if (!path.extname(urlPath)) {
          const shell = urlPath.startsWith("/portal") ? path.join("portal", "index.html") : "index.html";
          return sendFile(req, res, path.join(ROOT, shell));
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("Not found: " + urlPath);
      }
      sendFile(req, res, filePath);
    });
  } catch (e) {
    res.writeHead(500);
    res.end("Server error");
  }
});

// Compressed copies of files already served, keyed by path + content hash.
// Re-gzipping a 500KB module on every request would trade bandwidth for CPU;
// the app's files change only on deploy, so one compression each is enough.
const gzCache = new Map();

// Only compress what actually benefits. Images, fonts and PDFs are already
// compressed — running them through gzip costs CPU and can make them bigger.
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml)|image\/svg)/;

function acceptsGzip(req) {
  return /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
}

function sendFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      return res.end("Read error");
    }
    // "no-cache" alone told caches to revalidate but gave them NOTHING to
    // revalidate against — no ETag, no Last-Modified — which is how an edited
    // file kept coming back stale through a CDN or a warm browser cache. The
    // ETag is content-derived, so an unchanged file still answers 304 and stays
    // cheap; a changed one can never be served from a stale copy.
    const etag = '"' + crypto.createHash("sha1").update(data).digest("hex").slice(0, 27) + '"';
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ETag: etag, "Cache-Control": "no-cache, must-revalidate", Vary: "Accept-Encoding" });
      return res.end();
    }
    const headers = {
      "Content-Type": type,
      "Cache-Control": "no-cache, must-revalidate",
      ETag: etag,
      ...SECURITY_HEADERS,
      // The same URL now has two representations. Without this, a shared cache
      // could hand a gzipped body to a client that never asked for one.
      Vary: "Accept-Encoding",
    };

    // 1400 bytes is roughly one network packet — below that, compressing costs
    // more than it saves.
    if (acceptsGzip(req) && COMPRESSIBLE.test(type) && data.length > 1400) {
      let gz = gzCache.get(etag);
      if (!gz) {
        gz = zlib.gzipSync(data, { level: 6 });
        if (gzCache.size > 400) gzCache.clear();
        gzCache.set(etag, gz);
      }
      headers["Content-Encoding"] = "gzip";
      headers["Content-Length"] = gz.length;
      res.writeHead(200, headers);
      return res.end(gz);
    }

    headers["Content-Length"] = data.length;
    res.writeHead(200, headers);
    res.end(data);
  });
}

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("  LegalOS running:");
  console.log("  →  http://localhost:" + PORT + "   (bound to " + HOST + ")");
  console.log("");
});
