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
          appwrite: ["appwrite"],
          three: ["three"],
          gsap: ["gsap"],
        },
      },
    },
  },
});
