import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// VitePWA adds a "service worker": a small script the browser keeps that
// stores a copy of the app, so it still opens with no internet at all.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Tether",
        short_name: "Tether",
        description: "Helping separated families find each other",
        theme_color: "#1f5f8b",
        background_color: "#f6f5f1",
        display: "standalone",
        icons: [{ src: "favicon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    }),
  ],
});
