import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { account, appwrite, mergePrefs, syncProfileDoc, ID } from "../lib/appwrite";
import { rememberAuthContext } from "../lib/nav";
import { useStore } from "./StoreContext";

const AuthContext = createContext(null);

// Where auth emails (email verification / password reset) link back to.
// Always the live site — even when the request came from localhost, so
// the link never points at a local dev server.
const APP_URL = import.meta.env.VITE_APP_URL || "https://hypez.netlify.app";

const displayName = (u) => u?.name || u?.email?.split("@")[0] || "Guest";

const AVATAR_SEEDS = 5;

function seedFor(id = "") {
  let n = 0;
  for (let i = 0; i < id.length; i++) n += id.charCodeAt(i);
  return Math.abs(n) % AVATAR_SEEDS;
}

function readLocalProfile(uid) {
  try {
    return JSON.parse(localStorage.getItem(`festivity.profile.${uid}`) || "null");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const { notify, resetUserContent } = useStore();
  // Appwrite user object, mapped to expose `.id` (= `$id`) so the rest
  // of the app can keep using user.id without changes.
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const u = await account.get();
      setUser({ ...u, id: u.$id });
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const u = await account.get();
        if (mounted) setUser({ ...u, id: u.$id });
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();

    // Appwrite fires the "account" realtime channel on sign-in/out and
    // session changes — keep React state in sync from anywhere. A slow
    // poll covers browsers where realtime is unavailable.
    let unsub = () => {};
    try {
      unsub = appwrite.subscribe("account", () => refreshSession());
    } catch {
      /* realtime unavailable — poll handles it */
    }
    const poll = window.setInterval(refreshSession, 30000);

    return () => {
      mounted = false;
      unsub();
      window.clearInterval(poll);
    };
  }, [refreshSession]);

  // Sign-in lives on its own page (#auth). Opening it remembers where
  // the user came from so they land back in the right place.
  const openAuth = useCallback((next) => {
    rememberAuthContext(typeof next === "string" ? next : undefined);
    window.location.hash = "#auth";
  }, []);

  const ensureAuth = useCallback(
    (next) => {
      if (authLoading) return false;
      if (user) return true;
      openAuth(next);
      return false;
    },
    [user, authLoading, openAuth]
  );

  const signIn = useCallback(
    async ({ email, password }) => {
      await account.createEmailPasswordSession(email, password);
      const u = await account.get();
      setUser({ ...u, id: u.$id });
      notify(`Welcome back, ${displayName(u)}`);
      return u;
    },
    [notify]
  );

  const signUp = useCallback(
    async ({ name, email, password }) => {
      await account.create(ID.unique(), email, password, name);
      // Appwrite doesn't auto-create a session — sign the new user in.
      await account.createEmailPasswordSession(email, password);
      const u = await account.get();
      setUser({ ...u, id: u.$id });
      // Make them findable in the people list + hype/messenger lookups.
      syncProfileDoc(u.$id, { name: name || displayName(u), avatar: seedFor(u.$id) }).catch(
        () => {}
      );
      notify("Account created — you're in!");
      return u;
    },
    [notify]
  );

  const signOut = useCallback(async () => {
    try {
      await account.deleteSession("current");
    } catch {
      /* no session */
    }
    setUser(null);
    resetUserContent();
    notify("Signed out. See you at the next party!");
  }, [notify, resetUserContent]);

  // ---- Email verification (Appwrite sends the email itself) ----------
  const sendVerification = useCallback(async () => {
    await account.createVerification(`${APP_URL}/#auth/verify`);
  }, []);

  const completeVerification = useCallback(async (userId, secret) => {
    await account.updateVerification(userId, secret);
  }, []);

  // ---- Password recovery ---------------------------------------------
  // Appwrite emails a link to /#auth/recovery?userId=..&secret=..
  const resetPassword = useCallback(async (email) => {
    await account.createRecovery(email, `${APP_URL}/#auth/recovery`);
  }, []);

  // Finish a recovery: set the new password. Logs the user in on success.
  const completeRecovery = useCallback(async (userId, secret, password) => {
    await account.updateRecovery(userId, secret, password, password);
  }, []);

  const updatePassword = useCallback(
    async (password, oldPassword) => {
      await account.updatePassword(password, oldPassword);
      notify("Password updated — you're all set.");
    },
    [notify]
  );

  // Profile = account name + prefs (bio, avatar, theme), with the
  // device-local cache as fallback when prefs are empty.
  const profile = useMemo(() => {
    if (!user) return null;
    const prefs = user.prefs || {};
    const local = readLocalProfile(user.id);
    return {
      name: user.name || displayName(user),
      bio:
        prefs.bio ||
        local?.bio ||
        "House party enthusiast. Accra · Kumasi · Takoradi. Always first on the dance floor.",
      avatar: prefs.avatar ?? local?.avatar ?? seedFor(user.id),
      avatarUrl: prefs.avatarUrl || local?.avatarUrl || null,
      theme: prefs.theme || null,
    };
  }, [user]);

  const saveProfile = useCallback(
    async ({ name, bio, avatar, avatarUrl = null }) => {
      if (!user) throw new Error("Not signed in");
      try {
        localStorage.setItem(
          `festivity.profile.${user.id}`,
          JSON.stringify({ name, bio, avatar, avatarUrl })
        );
      } catch {
        /* storage unavailable */
      }
      await account.updateName(name);
      await mergePrefs({ bio, avatar, avatarUrl });
      // Public profile doc so other users can find you.
      syncProfileDoc(user.id, { name, bio, avatar, avatarUrl }).catch(() => {});
      // Refresh the user so prefs/profile stay in sync immediately.
      const u = await account.get();
      setUser({ ...u, id: u.$id });
      notify("Profile updated");
    },
    [user, notify]
  );

  const value = useMemo(
    () => ({
      user,
      name: displayName(user),
      initial: (displayName(user) || "G").charAt(0).toUpperCase(),
      emailVerified: !!user?.emailVerification,
      profile,
      saveProfile,
      authLoading,
      openAuth,
      ensureAuth,
      signIn,
      signUp,
      signOut,
      resetPassword,
      completeRecovery,
      sendVerification,
      completeVerification,
      updatePassword,
    }),
    [user, profile, saveProfile, authLoading, openAuth, ensureAuth, signIn, signUp, signOut, resetPassword, completeRecovery, sendVerification, completeVerification, updatePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
