import { Account, Client, Databases, ID, Query, Storage } from "appwrite";

// Appwrite backend — project "House" on fra.cloud.appwrite.io.
// Endpoint + project ID are public-safe (client-side SDK).
const endpoint =
  import.meta.env.VITE_APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1";
const projectId =
  import.meta.env.VITE_APPWRITE_PROJECT_ID || "6a7787c400111ab52135";

if (!import.meta.env.VITE_APPWRITE_PROJECT_ID) {
  console.warn(
    "Appwrite env vars missing. Add VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID and VITE_APPWRITE_PROJECT_NAME to .env"
  );
}

export const appwrite = new Client().setEndpoint(endpoint).setProject(projectId);
export const account = new Account(appwrite);
export const databases = new Databases(appwrite);
export const storage = new Storage(appwrite);
export { ID };

// ------------------------------------------------------------------
// Database / collection ids (created by scripts/setup-appwrite.mjs)
// ------------------------------------------------------------------
export const DB_ID = "house";
export const COLLECTIONS = {
  profiles: "profiles",
  follows: "follows",
  messages: "messages",
  hypes: "hypes",
  streaks: "hype_streaks",
  contactRequests: "contact_requests",
  // User-generated content mirrored to the cloud so posts, parties,
  // reviews and tickets survive sign-out and follow the account across
  // devices (created by scripts/setup-appwrite.mjs).
  posts: "posts",
  parties: "parties",
  reviews: "reviews",
  tickets: "tickets",
};
// Single shared storage bucket (the free plan allows one) — holds
// avatars AND hype videos.
export const MEDIA_BUCKET = "avatars";

// Appwrite replaces the whole prefs object on update, so always
// read-then-merge. Theme, bio, avatar etc. all live in account prefs.
export async function mergePrefs(partial) {
  let current = {};
  try {
    current = (await account.getPrefs()) || {};
  } catch {
    /* not signed in — ignore */
  }
  return account.updatePrefs({ ...current, ...partial });
}

// Mirror a user's public info into the profiles collection so other
// clients can look people up (messenger, hype authors, follows).
// Existence is checked with a query (no exception flow), so a missing
// doc always gets created and an existing one updated.
export async function syncProfileDoc(userId, { name, bio, avatar, avatarUrl }) {
  if (!userId) return;
  const data = {
    name: name || "",
    bio: bio || "",
    avatar: avatar ?? 0,
    avatar_url: avatarUrl || "",
  };
  try {
    const res = await databases.listDocuments(DB_ID, COLLECTIONS.profiles, [
      Query.equal("$id", userId),
    ]);
    if (res.documents.length) {
      await databases.updateDocument(DB_ID, COLLECTIONS.profiles, userId, data);
    } else {
      await databases.createDocument(
        DB_ID,
        COLLECTIONS.profiles,
        userId,
        data,
        [`read("any")`, `write("user:${userId}")`]
      );
    }
  } catch (e) {
    // Collection missing or offline — never crash the auth flow.
    console.warn("profile sync:", e.message);
  }
}
