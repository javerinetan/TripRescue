import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The workspace path contains a colon, which Vite otherwise parses as a
    // URL separator. Keep the server loopback-only and retain the API proxy.
    fs: { strict: false },
    proxy: { "/api": "http://localhost:8787" },
  },
});

