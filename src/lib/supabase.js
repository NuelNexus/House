import { createClient } from "@supabase/supabase-js";

// Accept both the classic anon key name and the newer
// publishable-key name — same value either way.
const url = import.meta.env.VITE_SUPABASE_URL;
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn(
    "Supabase env vars missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) to .env"
  );
}

export const supabase = createClient(url || "https://placeholder.supabase.co", key || "placeholder");
