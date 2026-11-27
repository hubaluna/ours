import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import {
  parseMetadata,
  parseArticleRecipe,
  tiktokRecipeCaption,
  type ImportKind,
  publicUrl,
} from "../_shared/metadata.ts";
import {
  enrichMovie,
  isSeriesCandidate,
  isSeriesUrl,
  movieTitleFromUrl,
  movieYearFromUrl,
  resolveTikTokUrl,
  tiktokMetadata,
} from "../_shared/movie-search.ts";
import { fetchPublicPage } from "../_shared/fetch-page.ts";
import { createPreviewHandler } from "../_shared/preview-handler.ts";
import {
  hasGeminiKey,
  parseRecipeTextWithGemini,
  refineMovieWithGemini,
} from "../_shared/gemini.ts";
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
      const enhanceMovieWithAi = async (
        current: typeof metadata,
        rawUrl: string,
      ) => {
        if (!hasGeminiKey()) return current;
        if (current.metadata_url && current.description && current.year) {
          return current;
        }
        const ai = await refineMovieWithGemini({
          url: rawUrl,
          title: current.title,
          description: current.description,
          provider: current.provider,
          signal,
        });
        if (!ai?.title) return current;
        const enriched = await enrichMovie(
          {
            ...current,
            title: ai.title,
            year: current.year ?? ai.year,
            description: current.description || ai.synopsis_uk,
          },
          read,
          ai.title,
        );
        return {
          ...enriched,
          year: enriched.year ?? ai.year,
          description: enriched.description || ai.synopsis_uk || current.description,
        };
      };
      const enhanceRecipeWithAi = async (
        current: typeof metadata,
        rawText?: string,
      ) => {
        if (!hasGeminiKey() || current.ingredients.length > 0) return current;
        const sourceText = (rawText || current.description || current.title).trim();
        if (sourceText.length < 15) return current;
        const ai = await parseRecipeTextWithGemini({
          title: current.title,
          text: sourceText,
          signal,
        });
        if (!ai || !ai.ingredients.length) return current;
        return {
          ...current,
          title: ai.title || current.title,
          ingredients: ai.ingredients,
          description: ai.instructions.length
            ? ai.instructions.join("\n")
            : current.description,
        };
      };
      const host = new URL(url).hostname;
      let metadata = parseMetadata("<html></html>", url, kind);
      if (kind === "movie" && query?.trim())
        return enrichMovie(metadata, read, query);
      if (kind === "recipe" && /(^|\.)tiktok\.com$/.test(host)) {
        try {
          const page = await read(url);
          const target = resolveTikTokUrl(page.url, page.html) || page.url;
          metadata = parseMetadata(page.html, target, kind);
          const parsed = tiktokRecipeCaption(
            tiktokMetadata(page.html, target, metadata),
          );
          return enhanceRecipeWithAi(parsed);
        } catch (error) {
          const target = resolveTikTokUrl(
            (error as { sourceUrl?: string }).sourceUrl || url,
          );
          if (target) {
            const value = JSON.parse(
              (
                await read(
                  `https://www.tiktok.com/oembed?url=${encodeURIComponent(target)}`,
                )
              ).html,
            );
            const title = String(value.title || "").trim();
            const parsed = tiktokRecipeCaption({
              ...metadata,
              source_url: target,
              title: title.slice(0, 160) || metadata.title,
              description: String(value.description || title).slice(0, 1000),
              image_url: publicUrl(value.thumbnail_url || "") || metadata.image_url,
              provider: "TikTok",
            });
            return enhanceRecipeWithAi(parsed);
          }
          throw error;
        }
      }
      if (
        kind === "movie" &&
        /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)$/.test(host)
      ) {
        let target = url;
        if (host.endsWith("tiktok.com")) {
          try {
            const page = await read(url);
            target = resolveTikTokUrl(page.url, page.html) || page.url;
            metadata = tiktokMetadata(
              page.html,
              target,
              parseMetadata(page.html, target, kind),
            );
          } catch (error) {
            target =
              resolveTikTokUrl(
                (error as { sourceUrl?: string }).sourceUrl || url,
              ) || url;
            metadata = { ...metadata, source_url: target, provider: "TikTok" };
          }
        }
        const endpoint = host.includes("tiktok")
          ? "https://www.tiktok.com/oembed"
          : host.includes("vimeo")
            ? "https://vimeo.com/api/oembed.json"
            : "https://www.youtube.com/oembed";
        const oembedQuery = host.includes("tiktok")
          ? `${endpoint}?url=${encodeURIComponent(target)}`
          : `${endpoint}?url=${encodeURIComponent(target)}&format=json`;
        try {
          const value = JSON.parse((await read(oembedQuery)).html);
          const oembedTitle = String(value.title || "").trim();
          const oembedDesc = String(value.description || "").trim();
          metadata = {
            ...metadata,
            source_url: target || metadata.source_url,
            title: (oembedTitle || metadata.title).slice(0, 160),
            description: (
              oembedDesc ||
              metadata.description ||
              oembedTitle
            ).slice(0, 1000),
            image_url:
              publicUrl(value.thumbnail_url || "") || metadata.image_url,
            provider: host.includes("tiktok") ? "TikTok" : metadata.provider,
          };
        } catch {
          /* Offer a title search if the video provider refuses access. */
        }
        const enriched = await enrichMovie(metadata, read);
        return enhanceMovieWithAi(enriched, target || url);
      }
      if (kind === "movie") {
        try {
          const page = await read(url);
          metadata = parseMetadata(page.html, page.url, kind);
          const enriched = await enrichMovie(metadata, read);
          return enhanceMovieWithAi(enriched, page.url || url);
        } catch {
          const guesses = movieTitleFromUrl(url);
          const urlYear = movieYearFromUrl(url);
          const preferSeries = isSeriesUrl(url);
          const merged: NonNullable<typeof metadata.candidates> = [];
          let firstMatched: typeof metadata | null = null;
          for (const guess of guesses.slice(0, 3)) {
            const enriched = await enrichMovie(
              { ...metadata, title: guess, year: urlYear },
              read,
              guess,
            );
            if (enriched.metadata_url && !firstMatched) firstMatched = enriched;
            if (
              enriched.metadata_url &&
              (urlYear ||
                (preferSeries &&
                  enriched.candidates?.some(
                    (c) =>
                      c.url === enriched.metadata_url && isSeriesCandidate(c),
                  )))
            ) {
              return enriched;
            }
            for (const item of enriched.candidates || []) {
              if (!merged.some((existing) => existing.url === item.url))
                merged.push(item);
            }
          }
          if (firstMatched && merged.length === 1) return firstMatched;
          merged.sort((a, b) => {
            if (preferSeries) {
              const diff =
                Number(isSeriesCandidate(b)) - Number(isSeriesCandidate(a));
              if (diff !== 0) return diff;
            }
            return (b.year ?? 0) - (a.year ?? 0);
          });
          return {
            ...metadata,
            title: guesses[0] || "",
            year: urlYear,
            movie_query: guesses[0] || "",
            candidates: merged.slice(0, 5),
          };
        }
      }
      const page = await read(url);
      metadata = parseMetadata(page.html, page.url, kind);
      if (kind === "recipe") {
        metadata = parseArticleRecipe(page.html, metadata);
        metadata = await enhanceRecipeWithAi(metadata);
      }
      return metadata;
    },
  }),
);
