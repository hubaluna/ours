import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import {
  parseMetadata,
  parseArticleRecipe,
  tiktokRecipeCaption,
  type ImportKind,
  publicUrl,
} from "../_shared/metadata.ts";
import { enrichMovie, tiktokMetadata } from "../_shared/movie-search.ts";
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
    load: async (
      url: string,
      kind: ImportKind,
      signal: AbortSignal,
      query?: string,
    ) => {
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
      const read = (target: string) => fetchPublicPage(target, resolve, signal);
      const host = new URL(url).hostname;
      let metadata = parseMetadata("<html></html>", url, kind);
      if (kind === "movie" && query?.trim())
        return enrichMovie(metadata, read, query);
      if (kind === "recipe" && /(^|\.)tiktok\.com$/.test(host)) {
        const page = await read(url);
        metadata = parseMetadata(page.html, page.url, kind);
        return tiktokRecipeCaption(tiktokMetadata(page.html, url, metadata));
      }
      if (
        kind === "movie" &&
        /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)$/.test(host)
      ) {
        let target = url;
        if (host.endsWith("tiktok.com")) {
          try {
            const page = await read(url);
            target = page.url;
            metadata = tiktokMetadata(
              page.html,
              url,
              parseMetadata(page.html, url, kind),
            );
          } catch (error) {
            target =
              publicUrl((error as { sourceUrl?: string }).sourceUrl || "") ||
              url;
          }
        }
        const endpoint = host.includes("tiktok")
          ? "https://www.tiktok.com/oembed"
          : host.includes("vimeo")
            ? "https://vimeo.com/api/oembed.json"
            : "https://www.youtube.com/oembed";
        try {
          const value = JSON.parse(
            (
              await read(
                `${endpoint}?url=${encodeURIComponent(target)}&format=json`,
              )
            ).html,
          );
          metadata = {
            ...metadata,
            title: String(value.title || metadata.title).slice(0, 160),
            description: String(
              value.description || metadata.description,
            ).slice(0, 1000),
            image_url:
              publicUrl(value.thumbnail_url || "") || metadata.image_url,
          };
        } catch {
          /* Offer a title search if the video provider refuses access. */
        }
        return enrichMovie(metadata, read);
      }
      const page = await read(url);
      metadata = parseMetadata(page.html, page.url, kind);
      if (kind === "recipe") metadata = parseArticleRecipe(page.html, metadata);
      return kind === "movie" ? enrichMovie(metadata, read) : metadata;
    },
  }),
);
