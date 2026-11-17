export type ShareTargetDestination = "wish" | "menu" | "shopping" | "movie";

/**
 * Extracts the first https?:// URL from Web Share Target parameters (url, text, or title).
 * Mobile applications (TikTok, Instagram, Telegram, browsers) often put the link inside 'text'.
 */
export function extractShareTargetUrl(search: string): string | null {
  if (!search) return null;
  const cleanSearch = search.startsWith("?") ? search.slice(1) : search;
  if (!cleanSearch) return null;

  try {
    const params = new URLSearchParams(cleanSearch);
    const rawUrl = params.get("url") || "";
    const rawText = params.get("text") || "";
    const rawTitle = params.get("title") || "";

    const candidates = [rawUrl, rawText, rawTitle].filter(Boolean);
    for (const candidate of candidates) {
      const match = candidate.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i);
      if (match) {
        // Strip trailing punctuation attached during text selection / sharing
        return match[0].replace(/[)\]}>.,!?;:»"'…]+$/, "");
      }
    }
  } catch {
    // Return null if malformed search query
  }

  return null;
}

/**
 * Automatically predicts the most likely destination for a shared URL:
 * - TikTok / culinary sites / recipe keywords -> "menu" (Recipe/Menu)
 * - IMDb, TMDB, Megogo, Sweet.tv, streaming sites -> "movie" (Movies)
 * - Online stores, marketplaces, e-commerce, or fallback -> "wish" (Wishes)
 */
export function detectShareTarget(url: string): ShareTargetDestination {
  if (!url) return "wish";
  let lower = url.toLowerCase();
  try {
    const parsed = new URL(url);
    lower = (parsed.hostname + parsed.pathname).toLowerCase();
  } catch {
    // If not a full URL, fallback to lowercased raw string
  }

  // 1. Movie / cinema domains or path keywords
  if (
    /(?:imdb\.com|themoviedb\.org|tmdb\.org|megogo\.net|sweet\.tv|netflix\.com|kinobaza|kinoafisha|letterboxd\.com|rottentomatoes\.com|trailers?\b|kino-teatr|tvmaze\.com)/i.test(
      lower,
    ) ||
    /\b(?:movie|film|trailer|cinema)\b/i.test(lower)
  ) {
    return "movie";
  }

  // 2. Culinary / recipe / food domains or path keywords (e.g. TikTok, cooking sites)
  if (
    /(?:tiktok\.com|klopotenko\.com|shuba\.life|allrecipes\.com|smachno\.ua|cookpad\.com|tasty\.co|bbcgoodfood\.com|foodnetwork\.com)/i.test(
      lower,
    ) ||
    /\b(?:recipes?|retsept|recept|kulinaria|cooking|dish)\b/i.test(lower)
  ) {
    return "menu";
  }

  // 3. Internet shops / Wishlist domains (Rozetka, Prom, etc.) or default
  return "wish";
}
