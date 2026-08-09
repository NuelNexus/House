// ============================================================
// Festivity GH — user content backup (Netlify Blobs)
//
// /api/data is the durable backup for posts, parties, reviews and
// tickets. Data lives in Netlify's built-in blob store — it
// persists across function invocations and deploys, needs no
// external database, no API keys and no setup.
//
//   GET    /api/data?user=<id>&type=<type>        → list a user's rows
//   POST   /api/data   { user, type, id, data }   → upsert one row
//   DELETE /api/data   { user, type, id }         → remove one row
//
// Keys are "type:user:id". The client supplies the user id, so
// this trusts the app layer (the user is authenticated in-app);
// fine for a community demo, not for banking.
// ============================================================

import { getStore } from "@netlify/blobs";

const TYPES = new Set(["posts", "parties", "reviews", "tickets"]);
const STORE_NAME = "festivity-content";

// Strings only — keeps blob keys clean.
const clean = (value, max = 100) =>
  typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : null;

const json = (statusCode, payload) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    // The app may call from another origin when VITE_API_BASE points at
    // a deployed site (e.g. localhost → netlify). Same-origin in prod.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  },
  body: JSON.stringify(payload),
});

export const handler = async (event) => {
  // Browser CORS preflight.
  if (event.httpMethod === "OPTIONS") {
    return json(200, { status: "ok" });
  }

  const store = getStore({ name: STORE_NAME });

  try {
    if (event.httpMethod === "GET") {
      const user = clean(event.queryStringParameters?.user);
      const type = clean(event.queryStringParameters?.type);
      if (!user || !type || !TYPES.has(type)) {
        return json(400, {
          status: "error",
          message: "query params user and type are required",
        });
      }
      const prefix = `${type}:${user}:`;
      // Walk every page (store.list caps each page) so no rows are
      // ever silently left out of the response.
      const items = [];
      const pages = store.list({ prefix, paginate: true });
      for await (const page of pages) {
        for (const entry of page.blobs || []) {
          const value = await store.get(entry.key, { type: "json" });
          if (value) items.push({ id: entry.key.slice(prefix.length), ...value });
        }
      }
      return json(200, { status: "ok", items });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { status: "error", message: "invalid JSON body" });
    }

    if (event.httpMethod === "POST") {
      const { user, type, id, data } = body;
      if (!clean(user) || !clean(type) || !TYPES.has(type) || !clean(id) || data == null) {
        return json(400, {
          status: "error",
          message: "user, type, id and data are required",
        });
      }
      await store.setJSON(`${type}:${user}:${id}`, data);
      return json(200, { status: "ok" });
    }

    if (event.httpMethod === "DELETE") {
      const { user, type, id } = body;
      if (!clean(user) || !clean(type) || !TYPES.has(type) || !clean(id)) {
        return json(400, {
          status: "error",
          message: "user, type and id are required",
        });
      }
      await store.delete(`${type}:${user}:${id}`);
      return json(200, { status: "ok" });
    }

    return json(405, { status: "error", message: "method not allowed" });
  } catch (err) {
    return json(500, { status: "error", message: err.message });
  }
};
