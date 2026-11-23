import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

function readPublicSupabaseUrl(): string {
  try {
    const raw = readFileSync(
      resolve(process.cwd(), "src/lib/public-config.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as { supabaseUrl?: string };
    return parsed.supabaseUrl || "";
  } catch {
    return "";
  }
}

function oursBuildVersionPlugin(buildId: string) {
  const payload = JSON.stringify({ buildId });
  return {
    name: "ours-build-version",
    configureServer(server: {
      middlewares: {
        use: (
          path: string,
          handler: (
            req: import("node:http").IncomingMessage,
            res: import("node:http").ServerResponse,
          ) => void,
        ) => void;
      };
    }) {
      server.middlewares.use("/version.json", (_req, res) => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(payload);
      });
    },
    generateBundle(this: {
      emitFile: (file: { type: "asset"; fileName: string; source: string }) => void;
    }) {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: payload,
      });
    },
  };
}

function devLinkPreviewPlugin(supabaseUrl: string) {
  return {
    name: "ours-dev-link-preview-proxy",
    configureServer(server: {
      middlewares: {
        use: (
          path: string,
          handler: (
            req: import("node:http").IncomingMessage,
            res: import("node:http").ServerResponse,
          ) => void,
        ) => void;
      };
    }) {
      if (!supabaseUrl) return;
      server.middlewares.use("/__ours_link_preview", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          void (async () => {
            try {
              const body = Buffer.concat(chunks).toString("utf-8");
              const headers: Record<string, string> = {
                "Content-Type": "application/json",
                Origin: "https://hubaluna.github.io",
              };
              const apikey = req.headers.apikey;
              if (typeof apikey === "string" && apikey) {
                headers.apikey = apikey;
              }
              const auth = req.headers.authorization;
              if (typeof auth === "string" && auth) {
                headers.Authorization = auth;
              }
              const upstream = await fetch(
                `${supabaseUrl}/functions/v1/link-preview`,
                {
                  method: "POST",
                  headers,
                  body,
                },
              );
              const text = await upstream.text();
              res.statusCode = upstream.status;
              res.setHeader(
                "Content-Type",
                upstream.headers.get("content-type") || "application/json",
              );
              res.end(text);
            } catch {
              res.statusCode = 502;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "PROXY_FAILED" }));
            }
          })();
        });
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base =
    env.VITE_BASE_PATH ||
    (command === "build" && mode !== "test" ? "/ours/" : "/");
  const envSupabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseUrl =
    envSupabaseUrl && !/YOUR_PROJECT/i.test(envSupabaseUrl)
      ? envSupabaseUrl
      : readPublicSupabaseUrl();
  const buildId =
    env.GITHUB_SHA?.slice(0, 12) || new Date().toISOString();
  return {
    base,
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
      react(),
      tailwindcss(),
      oursBuildVersionPlugin(buildId),
      devLinkPreviewPlugin(supabaseUrl),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "favicon.png",
          "icon-192.png",
          "icon-512.png",
          "icon-maskable.png",
          "apple-touch-icon.png",
        ],
        manifest: {
          id: base,
          name: "ours. — простір для двох",
          short_name: "ours.",
          description: "Маленькі речі, які роблять життя разом простішим",
          lang: "uk",
          theme_color: "#F7F6F3",
          background_color: "#F7F6F3",
          display: "standalone",
          start_url: base,
          scope: base,
          share_target: {
            action: base,
            method: "GET",
            enctype: "application/x-www-form-urlencoded",
            params: {
              title: "title",
              text: "text",
              url: "url",
            },
          },
          icons: [
            {
              src: "icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
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
          navigateFallbackDenylist: [/^\/auth/, /supabase/, /version\.json/],
          importScripts: ["push-events.js"],
          globPatterns: ["**/*.{js,css,html,png,svg,woff2}", "art/*.webp"],
          globIgnores: ["version.json"],
          runtimeCaching: [
            {
              urlPattern: /\/recipes\/.+\.(?:webp|png|jpe?g)$/,
              handler: "CacheFirst",
              options: {
                cacheName: "ours-recipes-v1",
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 60 * 24 * 60 * 60,
                },
              },
            },
            {
              urlPattern:
                /^https:\/\/(?:image\.tmdb\.org\/t\/p\/|upload\.wikimedia\.org\/|static\.tvmaze\.com\/uploads\/images\/|m\.media-amazon\.com\/images\/|i\.ytimg\.com\/).+/,
              handler: "CacheFirst",
              options: {
                cacheName: "ours-media-posters-v1",
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
              },
            },
            {
              urlPattern: ({ request, url }) =>
                request.destination === "image" &&
                url.origin !== self.location.origin &&
                !url.pathname.includes("/storage/v1/object/") &&
                !url.search.includes("token="),
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "ours-external-images-v1",
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 150,
                  maxAgeSeconds: 14 * 24 * 60 * 60,
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
          manualChunks: (id: string) => {
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("/motion") || id.includes("/framer-motion"))
              return "motion";
            if (id.includes("lucide-react")) return "icons";
            if (
              id.includes("/data/ours-goods-uk") ||
              id.includes("/data/ours-recipes")
            )
              return "catalogs";
            return undefined;
          },
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
