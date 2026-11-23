import { parseMetadata, type LinkMetadata } from "../../supabase/functions/_shared/metadata";
import {
  enrichMovie,
  isGenericTikTokTitle,
  isSeriesCandidate,
  isSeriesUrl,
  movieTitleFromUrl,
  movieYearFromUrl,
  resolveTikTokUrl,
} from "../../supabase/functions/_shared/movie-search";
import { publicUrl } from "../../supabase/functions/_shared/urls";

const browserLoad = async (
  target: string,
): Promise<{ html: string; url: string }> => {
  const response = await fetch(target, {
    signal: AbortSignal.timeout(8000),
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return { html: await response.text(), url: response.url || target };
};

const escapeAttr = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

type MicrolinkPayload = {
  status?: string;
  data?: {
    title?: string | null;
    description?: string | null;
    url?: string | null;
    date?: string | null;
    image?: { url?: string | null } | null;
  };
};

async function readViaMicrolink(target: string): Promise<LinkMetadata | null> {
  try {
    const res = await browserLoad(
      `https://api.microlink.io/?url=${encodeURIComponent(target)}`,
    );
    const parsed = JSON.parse(res.html) as MicrolinkPayload;
    if (parsed.status !== "success" || !parsed.data) return null;
    const d = parsed.data;
    const resolved = publicUrl(d.url || "") || target;
    const rawTitle = String(d.title || "").trim();
    const rawDesc = String(d.description || "").trim();
    const rawImg = publicUrl(String(d.image?.url || "").trim());
    const dateYear = String(d.date || "").match(/^((?:19|20)\d{2})/)?.[1] || "";
    const jsonLd = dateYear
      ? `<script type="application/ld+json">${JSON.stringify({
          "@type": "Movie",
          name: rawTitle,
          datePublished: dateYear,
          description: rawDesc,
          ...(rawImg ? { image: rawImg } : {}),
        })}</script>`
      : "";
    const html = `<html><head><title>${escapeAttr(rawTitle)}</title><meta property="og:title" content="${escapeAttr(rawTitle)}"><meta property="og:description" content="${escapeAttr(rawDesc)}">${rawImg ? `<meta property="og:image" content="${escapeAttr(rawImg)}">` : ""}${jsonLd}</head></html>`;
    return parseMetadata(html, resolved, "movie");
  } catch {
    return null;
  }
}

/** Detect stale results from an un-updated Edge Function so client enrichment can polish them. */
export function needsClientMovieRefresh(
  payload: LinkMetadata,
  sourceUrl: string,
): boolean {
  if (/(?:дивитися|дивитись|смотреть)\s+онлайн|онлайн\s+українською/i.test(payload.title))
    return true;
  if (
    /(?:^|\s)(?:\d+(?:\s*[-–,]\s*\d+)*\s*(?:сезон|season)|(?:сезон|season)\s*\d+)(?=\s|$|[),.!?:;])/i.test(
      payload.title,
    )
  )
    return true;
  if (
    sourceUrl &&
    !payload.metadata_url &&
    !payload.description &&
    !payload.image_url &&
    !(payload.candidates?.length) &&
    movieTitleFromUrl(sourceUrl).length > 0
  )
    return true;
  const urlYear = movieYearFromUrl(sourceUrl);
  if (urlYear && !payload.metadata_url && payload.candidates?.length) {
    if (!payload.candidates.some((c) => c.year && Math.abs(c.year - urlYear) <= 1))
      return true;
  }
  return false;
}

/** Resolve movie metadata directly via CORS-friendly public APIs when Edge Function is unavailable or blocked. */
export async function resolveMovieClientSide(
  rawUrl: string,
  query?: string,
): Promise<LinkMetadata | null> {
  const cleanUrl = publicUrl(rawUrl) || "https://uk.wikipedia.org/";
  let metadata = parseMetadata("<html></html>", cleanUrl, "movie");
  const trimmedQuery = query?.trim() || "";

  if (trimmedQuery) {
    return enrichMovie(metadata, browserLoad, trimmedQuery);
  }

  let host: string;
  try {
    host = new URL(cleanUrl).hostname.toLowerCase();
  } catch {
    host = "";
  }

  if (/(?:^|\.)tiktok\.com$/.test(host)) {
    metadata = { ...metadata, provider: "TikTok" };
    const ml = await readViaMicrolink(cleanUrl);
    if (ml) {
      const canonical = resolveTikTokUrl(ml.source_url || cleanUrl);
      const validTitle = isGenericTikTokTitle(ml.title) ? "" : ml.title;
      const validDesc =
        /^TikTok PWA$|^Коротке відео\b/i.test(ml.description.trim())
          ? ""
          : ml.description;
      metadata = {
        ...metadata,
        source_url: canonical || cleanUrl,
        title: validTitle,
        description: validDesc,
        image_url: ml.image_url || metadata.image_url,
        provider: "TikTok",
      };
    }
    if (!metadata.title || !metadata.image_url) {
      try {
        const oembedRes = await browserLoad(
          `https://www.tiktok.com/oembed?url=${encodeURIComponent(metadata.source_url || cleanUrl)}`,
        );
        const value = JSON.parse(oembedRes.html) as {
          title?: string;
          description?: string;
          thumbnail_url?: string;
        };
        const rawOeTitle = String(value.title || "").trim();
        const oembedTitle = isGenericTikTokTitle(rawOeTitle) ? "" : rawOeTitle;
        const oembedDesc = String(value.description || "").trim();
        metadata = {
          ...metadata,
          title: (oembedTitle || metadata.title).slice(0, 160),
          description: (oembedDesc || oembedTitle || metadata.description).slice(0, 1000),
          image_url: publicUrl(value.thumbnail_url || "") || metadata.image_url,
        };
      } catch {
        /* TikTok video may lack oEmbed caption or block browser fetch; keep editable sheet */
      }
    }
    return enrichMovie(metadata, browserLoad);
  }

  if (/(?:^|\.)(youtube\.com|youtu\.be)$/.test(host)) {
    try {
      const oembedRes = await browserLoad(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`,
      );
      const value = JSON.parse(oembedRes.html) as {
        title?: string;
        thumbnail_url?: string;
      };
      metadata = {
        ...metadata,
        title: String(value.title || "").slice(0, 160),
        image_url: publicUrl(value.thumbnail_url || "") || metadata.image_url,
        provider: "YouTube",
      };
    } catch {
      /* ignore */
    }
    if (metadata.title) return enrichMovie(metadata, browserLoad);
  }

  const urlYear = movieYearFromUrl(cleanUrl);
  const ml = await readViaMicrolink(cleanUrl);
  if (ml && ml.title && !/^(?:Just a moment|Access denied|403|404)/i.test(ml.title)) {
    const withYear =
      urlYear && (!ml.year || ml.year !== urlYear) ? { ...ml, year: urlYear } : ml;
    return enrichMovie(withYear, browserLoad);
  }

  const guesses = movieTitleFromUrl(cleanUrl);
  const preferSeries = isSeriesUrl(cleanUrl);
  const mergedCandidates: NonNullable<LinkMetadata["candidates"]> = [];
  let firstMatched: LinkMetadata | null = null;
  for (const guess of guesses.slice(0, 3)) {
    const enriched = await enrichMovie(
      { ...metadata, title: guess, year: urlYear },
      browserLoad,
      guess,
    );
    if (enriched.metadata_url && !firstMatched) firstMatched = enriched;
    if (
      enriched.metadata_url &&
      (urlYear ||
        (preferSeries &&
          enriched.candidates?.some(
            (c) => c.url === enriched.metadata_url && isSeriesCandidate(c),
          )))
    ) {
      return enriched;
    }
    for (const c of enriched.candidates || []) {
      if (!mergedCandidates.some((existing) => existing.url === c.url)) {
        mergedCandidates.push(c);
      }
    }
  }
  if (firstMatched && mergedCandidates.length === 1) return firstMatched;
  mergedCandidates.sort((a, b) => {
    if (preferSeries) {
      const diff = Number(isSeriesCandidate(b)) - Number(isSeriesCandidate(a));
      if (diff !== 0) return diff;
    }
    return (b.year ?? 0) - (a.year ?? 0);
  });

  if (guesses.length) {
    return {
      ...metadata,
      title: guesses[0],
      year: urlYear,
      movie_query: guesses[0],
      candidates: mergedCandidates.slice(0, 5),
    };
  }

  return null;
}
