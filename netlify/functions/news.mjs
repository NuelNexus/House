// ============================================================
// FesGH — Netlify serverless news proxy
//
// NewsAPI.org blocks browser requests, so the key stays server-
// side. This function powers the Blog "Live wire" section on
// static hosting (netlify.toml routes /api/news → this handler).
// Set VITE_NEWS_API_KEY in the Netlify environment variables.
// ============================================================

const DEFAULT_QUERY =
  'Ghana music OR afrobeats OR "Ghana entertainment" OR Accra OR Kumasi';

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
