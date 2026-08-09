// ----------------------------------------------------------
// Netlify Blobs backup for user content.
//
// Posts, parties, reviews and tickets are backed up to Netlify's
// built-in blob storage through the /api/data serverless function
// (netlify.toml redirects /api/data → /.netlify/functions/data).
// No external service, no API keys, no setup — just Netlify.
//
// localStorage remains the fast offline cache; these calls are the
// durable backup that survives sign-out, browser data wipes and
// other devices. Every call fails soft: if the API is unreachable
// the app keeps working with local data only.
// ----------------------------------------------------------

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");

export const CONTENT_TYPES = ["posts", "parties", "reviews", "tickets"];

async function request(path, options) {
  const res = await fetch(`${API_BASE}/api/data${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`data api ${res.status}`);
  return res.json();
}

export async function apiSaveContent(userId, type, id, data) {
  if (!userId || !type || !id) return false;
  try {
    await request("", {
      method: "POST",
      body: JSON.stringify({ user: userId, type, id, data }),
    });
    return true;
  } catch (e) {
    console.warn("content backup:", e.message);
    return false;
  }
}

export async function apiDeleteContent(userId, type, id) {
  if (!userId || !type || !id) return;
  try {
    await request("", {
      method: "DELETE",
      body: JSON.stringify({ user: userId, type, id }),
    });
  } catch {
    /* nothing server-side — local-only row */
  }
}

// Returns { posts, parties, reviews, tickets } — each an array of
// rows (with their `id`) or null when that fetch failed, so the
// caller keeps the local cache untouched for unavailable types.
export async function apiListContent(userId) {
  const out = {};
  if (!userId) return out;
  await Promise.all(
    CONTENT_TYPES.map(async (type) => {
      try {
        const json = await request(
          `?user=${encodeURIComponent(userId)}&type=${type}`
        );
        out[type] = Array.isArray(json.items) ? json.items : [];
      } catch {
        out[type] = null;
      }
    })
  );
  return out;
}
