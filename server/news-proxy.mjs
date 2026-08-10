// ============================================================
// FesGH — static server + NewsAPI proxy
//
// NewsAPI.org does not allow browser (CORS) requests, so the
// API key never ships to the client. This tiny server:
//   · serves the production build (dist/)
//   · proxies /api/news to newsapi.org with the key server-side
//   · caches responses for 5 minutes to protect the daily quota
//
// Run:  npm run serve   (builds then starts on :8787)
//       npm run proxy   (just the server, for use with `npm run dev`)
// ============================================================

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.PORT || 8787);

// Read VITE_NEWS_API_KEY from .env if it isn't already in the process env.
function loadNewsKey() {
  try {
    const raw = readFileSync(join(ROOT, ".env"), "utf8");
    const match = raw.match(/^\s*VITE_NEWS_API_KEY\s*=\s*(.+)\s*$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    /* no .env */
  }
  return "";
}

const NEWS_KEY = process.env.VITE_NEWS_API_KEY || loadNewsKey();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
};

const CACHE = new Map(); // query -> { expires, json }
const CACHE_TTL = 5 * 60 * 1000;

async function fetchNews(params) {
  // Protected values are pinned AFTER the spread so a client can
  // never override the key, language or page size.
  const qs = new URLSearchParams({
    ...params,
    apiKey: NEWS_KEY,
    language: "en",
    sortBy: "publishedAt",
    pageSize: "9",
  });
  const res = await fetch(`https://newsapi.org/v2/everything?${qs}`);
  const json = await res.json();
  if (!res.ok || json.status !== "ok") {
    throw new Error(json.message || `NewsAPI error ${res.status}`);
  }
  return json;
}

function sendFile(res, filePath) {
  try {
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(readFileSync(filePath));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", "*");

  // ---- News proxy -------------------------------------------------
  if (url.pathname === "/api/news") {
    try {
      const q =
        url.searchParams.get("q") ||
        'Ghana music OR afrobeats OR "Ghana entertainment" OR Accra OR Kumasi';
      const params = { q };
      const cacheKey = JSON.stringify(params);
      const cached = CACHE.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        res.writeHead(200, { "Content-Type": "application/json", "X-News-Cache": "hit" });
        return res.end(JSON.stringify(cached.json));
      }
      const json = await fetchNews(params);
      CACHE.set(cacheKey, { expires: Date.now() + CACHE_TTL, json });
      res.writeHead(200, { "Content-Type": "application/json", "X-News-Cache": "miss" });
      return res.end(JSON.stringify(json));
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "error", message: err.message }));
    }
  }

  // ---- Static build ------------------------------------------------
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return sendFile(res, join(DIST, "index.html"));
  }
  const filePath = normalize(join(DIST, url.pathname));
  if (filePath.startsWith(DIST) && existsSync(filePath) && statSync(filePath).isFile()) {
    return sendFile(res, filePath);
  }
  return sendFile(res, join(DIST, "index.html"));
});

server.listen(PORT, () => {
  console.log(`FesGH → http://localhost:${PORT}`);
  console.log(`News API key: ${NEWS_KEY ? "configured" : "MISSING — add VITE_NEWS_API_KEY to .env"}`);
});
