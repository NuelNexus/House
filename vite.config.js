import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Forward /api calls to the local NewsAPI proxy (npm run proxy)
      "/api": "http://localhost:8787",
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy libraries into stable cacheable chunks so the
        // app shell loads fast and repeat visits hit the cache.
        manualChunks: {
          react: ["react", "react-dom"],
          supabase: ["@supabase/supabase-js"],
          three: ["three"],
          gsap: ["gsap"],
          // The map only appears on the party-posting form — keep it out
          // of the app shell so first load stays fast.
          leaflet: ["leaflet"],
        },
      },
    },
  },
});
