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
import { runPayoutsForReference } from "../netlify/functions/payout-core.mjs";

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

// Paystack's SECRET key — used server-side to verify charges. Read from
// the process env first (Netlify), falling back to .env for local runs
// (npm run proxy). Never ships to the browser: it only lives in this
// server file and .env (gitignored).
function loadPaystackKey() {
  try {
    const raw = readFileSync(join(ROOT, ".env"), "utf8");
    const match = raw.match(/^\s*PAYSTACK_SECRET_KEY\s*=\s*(.+)\s*$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    /* no .env */
  }
  return "";
}

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || loadPaystackKey();

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

// The Live wire is entertainment / party news only — politics, sport
// and the rest never make the feed.
const ENTERTAINMENT_QUERY =
  '"Ghana entertainment" OR afrobeats OR amapiano OR highlife OR concert OR festival OR nightlife OR nightclub OR celebrity OR musician OR album OR tour';

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (terms) =>
  new RegExp(terms.map((t) => `\\b${esc(t)}\\b`).join("|"), "i");

const ENTERTAINMENT_TERMS = [
  "music", "afrobeats", "amapiano", "highlife", "concert", "festival",
  "nightlife", "nightclub", "club", "celebrity", "entertainment",
  "musician", "artist", "artiste", "album", "tour", "rapper", "singer",
  "dj", "grammy", "showbiz", "premiere", "actress", "actor", "movie",
  "film", "party", "vibe", "performer", "stage", "comedy", "carnival",
];
const ENTERTAINMENT_BLOCK = [
  "politics", "election", "parliament", "minister", "government",
  "economy", "inflation", "gdp", "war", "military", "court", "police",
  "crime", "murder", "stock", "oil", "covid", "vaccine", "church",
  "bible", "prayer", "football", "soccer", "epl", "cricket", "tennis",
];
const ENT_RE = wordRe(ENTERTAINMENT_TERMS);
const BLOCK_RE = wordRe(ENTERTAINMENT_BLOCK);

function isEntertainment(a) {
  const text = `${a.title || ""} ${a.description || ""} ${a.content || ""}`;
  if (BLOCK_RE.test(text)) return false;
  return ENT_RE.test(text);
}

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", "*");

  // ---- News proxy (entertainment / party news only) ---------------
  if (url.pathname === "/api/news") {
    try {
      const q = url.searchParams.get("q") || ENTERTAINMENT_QUERY;
      const params = { q };
      const cacheKey = JSON.stringify(params);
      const cached = CACHE.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        res.writeHead(200, { "Content-Type": "application/json", "X-News-Cache": "hit" });
        return res.end(JSON.stringify(cached.json));
      }
      const json = await fetchNews(params);
      // Keep only stories that are actually about entertainment/parties.
      if (Array.isArray(json.articles)) {
        json.articles = json.articles.filter(isEntertainment);
      }
      CACHE.set(cacheKey, { expires: Date.now() + CACHE_TTL, json });
      res.writeHead(200, { "Content-Type": "application/json", "X-News-Cache": "miss" });
      return res.end(JSON.stringify(json));
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "error", message: err.message }));
    }
  }

  // ---- Paystack verification ------------------------------------------
  // Confirms a charge settled before the app issues tickets. Needs the
  // secret key server-side; without it, reports not-configured and the
  // client trusts the popup callback.
  if (url.pathname === "/api/paystack/verify") {
  const reference = url.searchParams.get("reference") || "";
  if (!reference) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ verified: false, reason: "missing reference" }));
  }
  if (!PAYSTACK_SECRET_KEY) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        verified: false,
        reason: "PAYSTACK_SECRET_KEY is not set — add it to your environment.",
      })
    );
  }
  try {
    const vres = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );
    const json = await vres.json();
    const settled = json.status === true && json.data?.status === "success";
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        verified: settled,
        reference,
        // Always carry a reason so the client can distinguish "not
        // configured" from a genuinely failed/abandoned charge.
        reason: settled ? null : json.message || `charge status: ${json.data?.status || "unknown"}`,
        amount: json.data?.amount ?? null,
        currency: json.data?.currency ?? null,
      })
    );
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ verified: false, reason: err.message }));
  }
}

  // ---- Paystack auto-payouts ------------------------------------------
  // Splits a verified ticket charge to the host's + affiliate's mobile
  // money numbers. POST { reference } — idempotent per purchase/role.
  if (url.pathname === "/api/paystack/payout") {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json", Allow: "POST" });
      return res.end(JSON.stringify({ ok: false, reason: "method not allowed" }));
    }
    let body = {};
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, reason: "invalid JSON body" }));
    }
    const reference = String(body.reference || "").trim();
    const role =
      body.role === "host" || body.role === "affiliate" ? body.role : null;
    try {
      const result = await runPayoutsForReference({ reference, role, env: process.env });
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: result.ok, ...result }));
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, reason: err.message }));
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
  console.log(`Paystack verify: ${PAYSTACK_SECRET_KEY ? "configured" : "MISSING — add PAYSTACK_SECRET_KEY to env"}`);
});
