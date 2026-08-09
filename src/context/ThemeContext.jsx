import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

const ThemeContext = createContext(null);

const THEME_KEY = "festivity.theme";

// Curated looks. Each preset sets a dark/light starting point; the
// CSS uses [data-preset] to swap the accent tokens.
export const PRESETS = [
  {
    id: "daylight",
    name: "Daylight",
    mode: "light",
    swatch: "#f6f3fd",
    desc: "The classic paper & ink",
  },
  {
    id: "midnight",
    name: "Midnight",
    mode: "dark",
    swatch: "#10131c",
    desc: "True black-room energy",
  },
  {
    id: "violet",
    name: "Violet Rave",
    mode: "dark",
    swatch: "#1b1130",
    accent: "#b18cff",
    desc: "Deep purple club lights",
  },
  {
    id: "embers",
    name: "Embers",
    mode: "dark",
    swatch: "#241310",
    accent: "#ff8a5c",
    desc: "Warm fire & copper",
  },
  {
    id: "emerald",
    name: "Emerald Room",
    mode: "dark",
    swatch: "#0d1f17",
    accent: "#4fdaa0",
    desc: "Green-room after hours",
  },
  {
    id: "ocean",
    name: "Deep Ocean",
    mode: "dark",
    swatch: "#0b1626",
    accent: "#4fb4ff",
    desc: "Midnight dive",
  },
];

// Pure-CSS backgrounds (no assets needed).
export const PATTERNS = [
  { id: "none", name: "Plain", icon: "fa-solid fa-square" },
  { id: "dots", name: "Dots", icon: "fa-solid fa-table-cells" },
  { id: "grid", name: "Grid", icon: "fa-solid fa-border-all" },
  { id: "stripes", name: "Stripes", icon: "fa-solid fa-bars-staggered" },
  { id: "cross", name: "Cross", icon: "fa-solid fa-hashtag" },
  { id: "noise", name: "Noise", icon: "fa-solid fa-wave-square" },
];

const DEFAULT_THEME = {
  mode: "light",
  preset: "daylight",
  accent: null,
  background: { kind: "none", value: null },
};

function loadTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_THEME,
      ...parsed,
      background: { ...DEFAULT_THEME.background, ...(parsed.background || {}) },
    };
  } catch {
    return null;
  }
}

// Push the theme onto <html> so every CSS variable and attribute
// selector ([data-mode], [data-preset], [data-bg]) reacts instantly.
function applyTheme(t) {
  const root = document.documentElement;
  root.dataset.mode = t.mode;
  root.dataset.preset = t.preset;
  if (t.accent) root.style.setProperty("--rose-deep", t.accent);
  else root.style.removeProperty("--rose-deep");
  const bg = t.background || { kind: "none", value: null };
  root.dataset.bg =
    bg.kind === "pattern" ? bg.value : bg.kind === "image" ? "image" : "none";
  if (bg.kind === "image") root.style.setProperty("--bg-image", `url("${bg.value}")`);
  else root.style.removeProperty("--bg-image");
}

export function ThemeProvider({ children }) {
  const { user, profile } = useAuth();
  const [theme, setTheme] = useState(() => loadTheme() || DEFAULT_THEME);
  const adoptedRef = useRef(false);

  // Apply to the DOM on every change (and once on mount).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // When someone signs in on a fresh device with no local theme,
  // adopt the look they saved to their account.
  useEffect(() => {
    if (user && profile?.theme && !adoptedRef.current && !localStorage.getItem(THEME_KEY)) {
      try {
        const saved = JSON.parse(profile.theme);
        if (saved && saved.preset) {
          adoptedRef.current = true;
          setTheme({
            ...DEFAULT_THEME,
            ...saved,
            background: { ...DEFAULT_THEME.background, ...(saved.background || {}) },
          });
        }
      } catch {
        /* ignore malformed theme */
      }
    }
  }, [user, profile]);

  // Persist locally and (when signed in) to the account so the look
  // follows the user across devices.
  const update = useCallback(
    (next) => {
      try {
        localStorage.setItem(THEME_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      if (user) {
        supabase
          .from("profiles")
          .upsert({ id: user.id, theme: JSON.stringify(next) })
          .then(({ error }) => {
            if (error) console.warn("theme sync:", error.message);
          });
      }
      setTheme(next);
    },
    [user]
  );

  const setMode = useCallback(
    (mode) => update({ ...theme, mode }),
    [theme, update]
  );
  const setPreset = useCallback(
    (id) => {
      const preset = PRESETS.find((p) => p.id === id) || PRESETS[0];
      // Selecting a preset also adopts its light/dark starting point,
      // but keeps any user-chosen accent + background.
      update({ ...theme, preset: id, mode: preset.mode });
    },
    [theme, update]
  );
  const setAccent = useCallback(
    (accent) => update({ ...theme, accent: accent || null }),
    [theme, update]
  );
  const setBackground = useCallback(
    (background) => update({ ...theme, background }),
    [theme, update]
  );
  const resetTheme = useCallback(() => update(DEFAULT_THEME), [update]);

  const value = useMemo(
    () => ({
      theme,
      setMode,
      setPreset,
      setAccent,
      setBackground,
      resetTheme,
    }),
    [theme, setMode, setPreset, setAccent, setBackground, resetTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
