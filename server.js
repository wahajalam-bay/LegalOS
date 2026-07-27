// LegalOS static server — zero dependencies, Node built-ins only.
// Usage: node server.js  (optional: PORT env)
const http = require("http");
const fs = require("fs");
const path = require("path");

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

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
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
        return sendFile(res, path.join(filePath, "index.html"));
      }
      if (err || !stat.isFile()) {
        // SPA fallback for unknown non-asset routes. The requester portal is a
        // SEPARATE app, so a deep link under /portal must fall back to the
        // portal's own shell, not LegalOS's.
        if (!path.extname(urlPath)) {
          const shell = urlPath.startsWith("/portal") ? path.join("portal", "index.html") : "index.html";
          return sendFile(res, path.join(ROOT, shell));
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("Not found: " + urlPath);
      }
      sendFile(res, filePath);
    });
  } catch (e) {
    res.writeHead(500);
    res.end("Server error");
  }
});

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      return res.end("Read error");
    }
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-cache",
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
