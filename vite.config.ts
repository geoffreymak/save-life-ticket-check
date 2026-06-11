import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Save Life — Billetterie",
        short_name: "Save Life",
        description:
          "Génération et vérification sécurisée des billets de la Journée Caritative Save Life.",
        lang: "fr",
        theme_color: "#B11116",
        background_color: "#EDE3D2",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        id: "/",
        shortcuts: [
          {
            name: "Scanner",
            short_name: "Scanner",
            description: "Ouvrir directement la vérification des billets.",
            url: "/verification",
            icons: [
              { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
            ],
          },
        ],
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "index.html",
      },
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallback: "index.html",
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
});
