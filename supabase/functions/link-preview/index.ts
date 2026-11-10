import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import {
  parseMetadata,
  type ImportKind,
  publicUrl,
} from "../_shared/metadata.ts";
import { fetchPublicPage } from "../_shared/fetch-page.ts";
import { createPreviewHandler } from "../_shared/preview-handler.ts";
const origins = (
  Deno.env.get("ALLOWED_ORIGINS") || "https://hubaluna.github.io"
)
  .split(",")
  .map((s) => s.trim());
Deno.serve(
  createPreviewHandler({
    origins,
    authorize: async (authorization) => {
      const client = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {
          global: { headers: { Authorization: authorization } },
          auth: { persistSession: false },
        },
      );
      const {
        data: { user },
        error,
      } = await client.auth.getUser();
      if (error || !user) return 401;
      const membership = await client.rpc("current_couple");
      if (membership.error || !membership.data) return 403;
      const budget = await client.rpc("consume_link_import");
      if (budget.error || !budget.data) return 429;
      return 200;
    },
    load: async (url: string, kind: ImportKind, signal: AbortSignal) => {
      const resolve = async (host: string) => {
        const results = await Promise.allSettled([
          Deno.resolveDns(host, "A", { signal }),
          Deno.resolveDns(host, "AAAA", { signal }),
        ]);
        if (signal.aborted) throw new Error("TIMEOUT");
        return results.flatMap((r) =>
          r.status === "fulfilled" ? r.value : [],
        );
      };
      const host = new URL(url).hostname;
      if (
        kind === "movie" &&
        /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(host)
      ) {
        const endpoint = host.includes("vimeo")
          ? "https://vimeo.com/api/oembed.json"
          : "https://www.youtube.com/oembed";
        try {
          const embedded = await fetchPublicPage(
            `${endpoint}?url=${encodeURIComponent(url)}&format=json`,
            resolve,
            signal,
          );
          const value = JSON.parse(embedded.html);
          return {
            ...parseMetadata("<html></html>", url, "movie"),
            title: String(value.title || "").slice(0, 160),
            description: String(value.description || "").slice(0, 1000),
            image_url: publicUrl(value.thumbnail_url || ""),
          };
        } catch {
          /* Only actual metadata, never a guessed year or genre. */
        }
      }
      const page = await fetchPublicPage(url, resolve, signal);
      return parseMetadata(page.html, page.url, kind);
    },
  }),
);
