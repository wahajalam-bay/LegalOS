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

const ROOT = __dirname;
const PORT = process.env.PORT || 4600;

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
];

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);

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
      res.writeHead(304, { ETag: etag, "Cache-Control": "no-cache, must-revalidate" });
      return res.end();
    }
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-cache, must-revalidate",
      ETag: etag,
    });
    res.end(data);
  });
}

server.listen(PORT, () => {
  console.log("");
  console.log("  LegalOS running:");
  console.log("  →  http://localhost:" + PORT);
  console.log("");
});
