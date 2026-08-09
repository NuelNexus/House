import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { rememberAuthContext } from "../lib/nav";
import { useStore } from "./StoreContext";

const AuthContext = createContext(null);

const displayName = (user) =>
  user?.user_metadata?.name ||
  user?.user_metadata?.full_name ||
  user?.email?.split("@")[0] ||
  "Guest";

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
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cloudProfile, setCloudProfile] = useState(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setAuthLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const user = session?.user ?? null;

  // Pull the extended profile (bio + avatar) from Supabase when signed in,
  // falling back to what we saved locally.
  useEffect(() => {
    if (!user) {
      setCloudProfile(null);
      return;
    }
    let active = true;
    supabase
      .from("profiles")
      .select("name, bio, avatar, theme")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setCloudProfile(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id]);

  // Sign-in now lives on its own page (#auth). Opening it remembers
  // where the user came from so they land back in the right place.
  // `next` is the route to continue to after signing in (e.g. the
  // post-a-party form), which only makes sense when the user just
  // needed to authenticate to reach it.
  const openAuth = useCallback((next) => {
    // onClick handlers may pass the event here — only treat real
    // route strings as a destination to continue to after signing in.
    rememberAuthContext(typeof next === "string" ? next : undefined);
    window.location.hash = "#auth";
  }, []);

  const ensureAuth = useCallback(
    (next) => {
      // Session may not have loaded yet — don't wrongly block or navigate.
      if (authLoading) return false;
      if (user) return true;
      openAuth(next);
      return false;
    },
    [user, authLoading, openAuth]
  );

  const signIn = useCallback(
    async ({ email, password }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw new Error(error.message);
      notify(`Welcome back, ${displayName(data.user)}`);
      return data;
    },
    [notify]
  );

  const signUp = useCallback(
    async ({ name, email, password }) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: name || email.split("@")[0] } },
      });
      if (error) throw new Error(error.message);
      if (data.session) {
        notify("Account created — you're in!");
      }
      return data;
    },
    [notify]
  );

  // Sign in (or sign up) with Google. This is a redirect flow — the
  // browser leaves to accounts.google.com and comes back with a session
  // in the URL hash, which supabase-js picks up automatically. The
  // redirect target must be whitelisted in Supabase → Authentication →
  // URL Configuration.
  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    resetUserContent();
    notify("Signed out. See you at the next party!");
  }, [notify, resetUserContent]);

  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw new Error(error.message);
  }, []);

  // Finish a password reset: the recovery email signs the user in with
  // a recovery session, then this sets the new password on that session.
  const updatePassword = useCallback(
    async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      notify("Password updated — you're all set.");
    },
    [notify]
  );

  const profile = useMemo(() => {
    if (!user) return null;
    const local = readLocalProfile(user.id);
    const base = cloudProfile || local || {};
    return {
      name: base.name || displayName(user),
      bio:
        base.bio ||
        "House party enthusiast. Accra · Kumasi · Takoradi. Always first on the dance floor.",
      avatar: base.avatar ?? seedFor(user.id),
      avatarUrl: base.avatar_url || base.avatarUrl || null,
      theme: base.theme || null,
    };
  }, [user, cloudProfile]);

  const saveProfile = useCallback(
    async ({ name, bio, avatar, avatarUrl = null }) => {
      if (!user) throw new Error("Not signed in");
      const next = { name, bio, avatar, avatarUrl };
      try {
        localStorage.setItem(`festivity.profile.${user.id}`, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      // Name lives in auth metadata so it survives everywhere.
      const { error } = await supabase.auth.updateUser({ data: { name } });
      // Bio + avatar live in the profiles table (if the schema has been run).
      // Try it regardless of the metadata result so bio/avatar still sync.
      const { error: pe } = await supabase
        .from("profiles")
        .upsert({ id: user.id, name, bio, avatar, avatar_url: avatarUrl });
      if (pe) console.warn("profile sync:", pe.message);
      if (error) throw new Error(error.message);
      notify("Profile updated");
    },
    [user, notify]
  );

  const value = useMemo(
    () => ({
      user,
      name: displayName(user),
      initial: (displayName(user) || "G").charAt(0).toUpperCase(),
      profile,
      saveProfile,
      authLoading,
      openAuth,
      ensureAuth,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      resetPassword,
      updatePassword,
    }),
    [user, profile, saveProfile, authLoading, openAuth, ensureAuth, signIn, signUp, signInWithGoogle, signOut, resetPassword, updatePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
