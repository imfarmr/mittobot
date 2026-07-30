import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// 0.0.0.0 is a bind address, not a reliable client destination. Use loopback
// for the local bot; set VITE_BOT_API_URL for a remote API.
const API_TARGET = process.env.VITE_BOT_API_URL || "http://127.0.0.1:3432";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: {
      // Proxy API requests to the bot's backend — avoids CORS issues in dev
      "/api": { target: API_TARGET, changeOrigin: true },
      "/login": { target: API_TARGET, changeOrigin: true },
    },
  },
});
