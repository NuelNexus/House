// One-shot: provision the Appwrite backend for Festivity/Hypez.
//   APPWRITE_API_KEY=<key> node scripts/setup-appwrite.mjs
// Idempotent — safe to re-run. Creates:
//   database "house" + collections (profiles, follows, messages, hypes,
//   hype_streaks, contact_requests) with attributes + indexes, and the
//   public "hype" storage bucket.
import { readFileSync } from "node:fs";

const KEY = process.env.APPWRITE_API_KEY;
if (!KEY) {
  console.error("Missing APPWRITE_API_KEY. Get one in Console → Project Settings → API Keys.");
  process.exit(1);
}

// Read project id from .env if present, else default.
let PROJECT = process.env.APPWRITE_PROJECT_ID || "6a7787c400111ab52135";
try {
  const env = readFileSync(".env", "utf8");
  const m = env.match(/VITE_APPWRITE_PROJECT_ID=(.+)/);
  if (m) PROJECT = m[1].trim();
} catch {}

const BASE = process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1";

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "X-Appwrite-Key": KEY,
      "X-Appwrite-Project": PROJECT,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    // 409 = already exists; treat as success for idempotency.
    if (res.status === 409) return { alreadyExists: true };
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

const DB = "house";
const COLLECTIONS = {
  profiles: {
    name: "Profiles",
    attributes: [
      ["string", "name", { size: 255 }],
      ["string", "bio", { size: 1000, required: false }],
      ["integer", "avatar", { required: false }],
      ["string", "avatar_url", { size: 1000, required: false }],
    ],
    indexes: [],
  },
  follows: {
    name: "Follows",
    attributes: [
      ["string", "follower_id", { size: 64 }],
      ["string", "following_id", { size: 64 }],
    ],
    indexes: [
      ["key", "idx_follower", ["follower_id"]],
      ["key", "idx_following", ["following_id"]],
      ["unique", "uniq_edge", ["follower_id", "following_id"]],
    ],
  },
  messages: {
    name: "Messages",
    attributes: [
      ["string", "sender_id", { size: 64 }],
      ["string", "recipient_id", { size: 64 }],
      ["string", "body", { size: 5000 }],
      ["string", "read_at", { size: 64, required: false }],
      ["string", "created_at", { size: 64, required: false }],
    ],
    indexes: [
      ["key", "idx_sender", ["sender_id"]],
      ["key", "idx_recipient", ["recipient_id"]],
      ["key", "idx_read", ["read_at"]],
    ],
  },
  hypes: {
    name: "Hypes",
    attributes: [
      ["string", "user_id", { size: 64 }],
      ["string", "recipient_id", { size: 64, required: false }],
      ["string", "video_url", { size: 2000 }],
      ["string", "caption", { size: 500, required: false }],
      ["string", "created_at", { size: 64, required: false }],
    ],
    indexes: [
      ["key", "idx_user", ["user_id"]],
      ["key", "idx_recipient", ["recipient_id"]],
    ],
  },
  hype_streaks: {
    name: "Hype streaks",
    attributes: [
      ["string", "user_a", { size: 64 }],
      ["string", "user_b", { size: 64 }],
      ["integer", "streak", { required: false }],
      ["string", "last_date", { size: 32, required: false }],
    ],
    indexes: [["unique", "uniq_pair", ["user_a", "user_b"]]],
  },
  contact_requests: {
    name: "Contact requests",
    attributes: [
      ["string", "sender_id", { size: 64, required: false }],
      ["string", "sender_name", { size: 255, required: false }],
      ["string", "event_name", { size: 255, required: false }],
      ["string", "host_name", { size: 255, required: false }],
      ["string", "kind", { size: 32, required: false }],
      ["string", "body", { size: 5000 }],
      ["string", "created_at", { size: 64, required: false }],
    ],
    indexes: [],
  },
};

// Note: posts/parties/reviews/tickets are NOT Appwrite collections —
// user content backs up to Netlify Blobs via /api/data (see
// src/lib/contentApi.js). Nothing to provision here for them.

const PERMS = [
  'read("any")',
  'create("users")',
  'update("users")',
  'delete("users")',
];

console.log(`Provisioning ${BASE} project ${PROJECT}…`);

// 1. Database (create only if missing)
try {
  const { databases = [] } = await api("GET", "/databases");
  if (databases.some((d) => d.$id === DB)) {
    console.log("✔ database (exists):", DB);
  } else {
    await api("POST", "/databases", { databaseId: DB, name: "House" });
    console.log("✔ database:", DB);
  }
} catch (e) {
  console.error("✘ database:", e.message);
  process.exit(1);
}

// Wait until every attribute is fully processed (Appwrite creates them
// asynchronously — indexes require them to be "available" first).
async function waitForAttributes(colId, keys) {
  for (let i = 0; i < 20; i++) {
    const { attributes = [] } = await api(
      "GET",
      `/databases/${DB}/collections/${colId}/attributes`
    );
    const have = new Set(attributes.filter((a) => a.status === "available").map((a) => a.key));
    if (keys.every((k) => have.has(k))) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`attributes never became available: ${keys.join(", ")}`);
}

// 2. Collections + attributes + indexes
for (const [id, def] of Object.entries(COLLECTIONS)) {
  try {
    await api("POST", `/databases/${DB}/collections`, {
      collectionId: id,
      name: def.name,
      permissions: PERMS,
      documentSecurity: false,
      enabled: true,
    });
    console.log("✔ collection:", id);
  } catch (e) {
    console.error("✘ collection:", id, e.message);
    process.exit(1);
  }
  const attrKeys = [];
  for (const [type, key, opts] of def.attributes) {
    try {
      await api(
        "POST",
        `/databases/${DB}/collections/${id}/attributes/${type}`,
        { key, required: opts.required ?? true, ...(type === "string" ? { size: opts.size } : {}) }
      );
      console.log("   ✔ attr:", `${id}.${key}`);
    } catch (e) {
      console.error("   ✘ attr:", `${id}.${key}`, e.message);
    }
    attrKeys.push(key);
  }
  if (attrKeys.length) {
    try {
      await waitForAttributes(id, attrKeys);
    } catch (e) {
      console.error("   ✘ waiting for attrs:", e.message);
      process.exit(1);
    }
  }
  for (const [type, key, attrs] of def.indexes) {
    try {
      await api("POST", `/databases/${DB}/collections/${id}/indexes`, {
        key,
        type,
        attributes: attrs,
      });
      console.log("   ✔ index:", `${id}.${key}`);
    } catch (e) {
      console.error("   ✘ index:", `${id}.${key}`, e.message);
    }
  }
}

// 3. Storage — the free plan allows a single bucket, so the existing
// "avatars" bucket doubles as the shared media bucket (images + hype
// videos). Widen its limits + extensions.
try {
  const { buckets = [] } = await api("GET", "/storage/buckets");
  if (buckets.length) {
    const b = buckets[0];
    await api("PUT", `/storage/buckets/${b.$id}`, {
      name: "Media (avatars + hype)",
      maximumFileSize: 50000000, // 50 MB
      allowedFileExtensions: [
        "jpg", "jpeg", "png", "gif", "webp", "avif",
        "mp4", "webm", "mov", "m4v",
      ],
      antivirus: false,
    });
    console.log("✔ bucket updated:", b.$id, "→ media (100MB, images + videos)");
  } else {
    await api("POST", "/storage/buckets", {
      bucketId: "avatars",
      name: "Media",
      permissions: PERMS,
      fileSecurity: false,
      enabled: true,
      maximumFileSize: 50000000,
      allowedFileExtensions: ["jpg", "jpeg", "png", "gif", "webp", "avif", "mp4", "webm", "mov", "m4v"],
      compression: "none",
      encryption: true,
      antivirus: false,
    });
    console.log("✔ bucket created: avatars → media");
  }
} catch (e) {
  console.error("✘ bucket setup:", e.message);
}

console.log("Done.");
