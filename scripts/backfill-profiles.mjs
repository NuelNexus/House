// Backfill: ensure every Appwrite user has a profile document in the
// `profiles` collection, so everyone is findable in People / messenger /
// hype author lookups. Idempotent — safe to run any time.
// Uses the REST API directly (no SDK dependency).
//
// Usage:  APPWRITE_API_KEY=std_... node scripts/backfill-profiles.mjs
const ENDPOINT = process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1";
const PROJECT = process.env.APPWRITE_PROJECT_ID || "6a7787c400111ab52135";
const KEY = process.env.APPWRITE_API_KEY;
if (!KEY) {
  console.error("Missing APPWRITE_API_KEY");
  process.exit(1);
}

const DB_ID = "house";
const COLLECTION = "profiles";
const HEADERS = { "X-Appwrite-Key": KEY, "X-Appwrite-Project": PROJECT };

function seedFor(id = "") {
  let n = 0;
  for (let i = 0; i < id.length; i++) n += id.charCodeAt(i);
  return Math.abs(n) % 5;
}

async function api(path, opts) {
  const headers = { ...HEADERS, ...(opts?.body ? { "Content-Type": "application/json" } : {}) };
  const res = await fetch(`${ENDPOINT}${path}`, { ...opts, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  // 1. Every user (server-only Users endpoint, paginated).
  let users = [];
  let offset = 0;
  while (true) {
    const json = await api(`/users?limit=100&offset=${offset}`);
    users = users.concat(json.users || []);
    if (users.length >= (json.total || 0)) break;
    offset += 100;
  }
  console.log(`Found ${users.length} Appwrite user(s)`);

  // 2. Existing profile docs.
  const existing = await api(
    `/databases/${DB_ID}/collections/${COLLECTION}/documents?limit=5000`
  );
  const haveIds = new Set((existing.documents || []).map((d) => d.$id));
  console.log(`Existing profile docs: ${haveIds.size}`);

  // 3. Create the missing ones.
  let created = 0;
  for (const u of users) {
    if (haveIds.has(u.$id)) continue;
    const name = u.name || (u.email || "").split("@")[0] || "Festivity member";
    await api(`/databases/${DB_ID}/collections/${COLLECTION}/documents`, {
      method: "POST",
      body: JSON.stringify({
        documentId: u.$id,
        data: { name, bio: "", avatar: seedFor(u.$id), avatar_url: "" },
        permissions: [`read("any")`, `write("user:${u.$id}")`],
      }),
    });
    created++;
    console.log(`  created profile for ${u.$id} (${name})`);
  }
  console.log(
    created
      ? `Created ${created} profile doc(s).`
      : "All users already have profile docs. Nothing to do."
  );
}

main().catch((e) => {
  console.error("backfill failed:", e.message);
  process.exit(1);
});
