import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base =
    env.VITE_BASE_PATH ||
    (command === "build" && mode !== "test" ? "/Ours/" : "/");
  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "favicon.png",
          "icon-192.png",
          "icon-maskable.png",
          "apple-touch-icon.png",
        ],
        manifest: {
          name: "ours. — простір для двох",
          short_name: "ours.",
          description: "Маленькі речі, які роблять життя разом простішим",
          lang: "uk",
          theme_color: "#F7F6F3",
          background_color: "#F7F6F3",
          display: "standalone",
          start_url: base,
          scope: base,
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            {
              src: "icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icon-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/auth/, /supabase/],
          importScripts: ["push-events.js"],
          globPatterns: ["**/*.{js,css,html,png,svg,woff2}", "art/*.webp"],
          runtimeCaching: [
            {
              urlPattern: /\/recipes\/.+\.(?:webp|png|jpe?g)$/,
              handler: "CacheFirst",
              options: {
                cacheName: "ours-recipes-v1",
                expiration: {
                  maxEntries: 90,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
              },
            },
          ],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id: string) =>
            id.includes("@supabase")
              ? "supabase"
              : id.includes("/motion") || id.includes("/framer-motion")
                ? "motion"
                : id.includes("lucide-react")
                  ? "icons"
                  : undefined,
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== "true",
      watch: process.env.DISABLE_HMR === "true" ? null : {},
    },
  };
});
