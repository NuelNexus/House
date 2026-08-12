// One-shot: purge every piece of media already posted on the site
// (photos AND videos) via the Supabase Management API. Safe to re-run
// (nothing left to delete).
//
// Usage:
//   SUPABASE_PAT=<token> node scripts/purge-videos.mjs
//
// The project ref is read from VITE_SUPABASE_URL in .env, or pass it
// as the first argument:
//   SUPABASE_PAT=<token> node scripts/purge-videos.mjs <project-ref>
//
// Get a token at supabase.com → Account Settings → Access Tokens.
// Revoke it afterwards — it has full access to your account.
//
// Deletes every posted hype (photos + videos), group clips and storage
// files but keeps the posting features, so users can still post new ones.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pat = process.env.SUPABASE_PAT;
if (!pat) {
  console.error(
    "Missing SUPABASE_PAT. Get one at supabase.com → Account Settings → Access Tokens."
  );
  process.exit(1);
}

let ref = process.argv[2];
if (!ref) {
  try {
    const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    const m = env.match(/VITE_SUPABASE_URL=https:\/\/([a-z0-9]+)\.supabase\.co/);
    if (m) ref = m[1];
  } catch {
    /* .env missing — fall through */
  }
}
if (!ref) {
  console.error(
    "Could not find the project ref — pass it as an argument, e.g. node scripts/purge-videos.mjs abcd1234"
  );
  process.exit(1);
}

const sql = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "purge-videos.sql"),
  "utf8"
);

console.log(`Purging posted videos from project: ${ref}`);
const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  }
);
const text = await res.text();
if (!res.ok) {
  console.error(`ERROR ${res.status}: ${text.slice(0, 3000)}`);
  process.exit(1);
}
console.log(`OK (${res.status}) — posted videos purged.`);
if (text.trim()) console.log(text.slice(0, 2000));
