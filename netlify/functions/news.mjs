// ============================================================
// FesGH — Netlify serverless news proxy
//
// NewsAPI.org blocks browser requests, so the key stays server-
// side. This function powers the Blog "Live wire" section on
// static hosting (netlify.toml routes /api/news → this handler).
// Set VITE_NEWS_API_KEY in the Netlify environment variables.
// ============================================================

const DEFAULT_QUERY =
  '"Ghana entertainment" OR afrobeats OR amapiano OR highlife OR concert OR festival OR nightlife OR nightclub OR celebrity OR musician OR album OR tour';

// The Live wire is entertainment / party news only — everything else
// (politics, sport, economy…) gets filtered out before it reaches the
// blog.
const esc = (t) => t.replace(/[.*+?^${}()[\]\\]/g, "\\$&");
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

export const handler = async (event) => {
  const q = event.queryStringParameters?.q || DEFAULT_QUERY;
  const apiKey = process.env.VITE_NEWS_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "error",
        message: "VITE_NEWS_API_KEY is not set in the Netlify environment variables.",
      }),
    };
  }

  try {
    const qs = new URLSearchParams({
      q,
      apiKey,
      language: "en",
      sortBy: "publishedAt",
      pageSize: "9",
    });
    const res = await fetch(`https://newsapi.org/v2/everything?${qs}`);
    const json = await res.json();
    if (!res.ok || json.status !== "ok") {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "error",
          message: json.message || `NewsAPI error ${res.status}`,
        }),
      };
    }
    // Keep only entertainment/party stories.
    if (Array.isArray(json.articles)) {
      json.articles = json.articles.filter(isEntertainment);
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "error", message: err.message }),
    };
  }
};
