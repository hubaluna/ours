import { parseHTML } from "linkedom";
import { movieSynopsis } from "./movie-synopsis.ts";
import { publicUrl } from "./urls.ts";
import type { LinkMetadata, MovieCandidate } from "./metadata.ts";
type PageLoader = (url: string) => Promise<{ html: string; url: string }>;
const cleanTikTokVideoUrl = (candidate: string): string => {
  const safe = publicUrl(candidate);
  if (!safe) return "";
  try {
    const parsed = new URL(safe);
    if (/(?:^|\.)tiktok\.com$/i.test(parsed.hostname)) {
      const videoPath = parsed.pathname.match(/^(\/@[^/]+\/video\/\d+)/i)?.[1];
      if (videoPath) return `https://www.tiktok.com${videoPath}`;
    }
    return safe;
  } catch {
    return safe;
  }
};
export function resolveTikTokUrl(source: string, html = ""): string {
  const direct = cleanTikTokVideoUrl(source);
  if (/^https:\/\/www\.tiktok\.com\/@[^/]+\/video\/\d+$/i.test(direct))
    return direct;
  if (html) {
    const { document } = parseHTML(html);
    const candidates = [
      document.querySelector('link[rel="canonical"]')?.getAttribute("href") ||
        "",
      document
        .querySelector('meta[property="og:url"]')
        ?.getAttribute("content") || "",
      ...(html.match(
        /https:\/\/(?:www\.|m\.)?tiktok\.com\/@[^/\s"'<>\\]+\/video\/\d+/gi,
      ) || []),
    ];
    for (const candidate of candidates) {
      const cleaned = cleanTikTokVideoUrl(candidate);
      if (/^https:\/\/www\.tiktok\.com\/@[^/]+\/video\/\d+$/i.test(cleaned))
        return cleaned;
    }
  }
  return direct || publicUrl(source);
}
export function tiktokMetadata(
  html: string,
  source: string,
  seed: LinkMetadata,
): LinkMetadata {
  const { document } = parseHTML(html);
  const fromItem = (item: Record<string, unknown>): LinkMetadata => {
    const rawDesc =
      typeof item.desc === "string" && item.desc.trim()
        ? item.desc.trim()
        : Array.isArray(item.contents)
          ? item.contents
              .map((entry) =>
                entry && typeof entry === "object" && typeof (entry as { desc?: unknown }).desc === "string"
                  ? (entry as { desc: string }).desc.trim()
                  : "",
              )
              .filter(Boolean)
              .join(" ")
              .trim()
          : "";
    const video = (item.video || {}) as { cover?: string; originCover?: string };
    return {
      ...seed,
      source_url: source,
      title: rawDesc.slice(0, 160),
      description: rawDesc.slice(0, 1000),
      image_url:
        publicUrl(video.cover || video.originCover || "") || seed.image_url,
      provider: "TikTok",
    };
  };
  let count = 0;
  const visit = (
    value: unknown,
    depth = 0,
  ): Record<string, unknown> | undefined => {
    if (!value || typeof value !== "object" || depth > 10 || ++count > 2000)
      return;
    const object = value as Record<string, unknown>;
    if (typeof object.desc === "string" && object.desc.trim() && object.video)
      return object;
    for (const child of Object.values(object).slice(0, 100)) {
      const result = visit(child, depth + 1);
      if (result) return result;
    }
  };
  for (const script of document.querySelectorAll(
    "script#__UNIVERSAL_DATA_FOR_REHYDRATION__,script#SIGI_STATE",
  )) {
    try {
      const parsed = JSON.parse(script.textContent || "") as {
        __DEFAULT_SCOPE__?: {
          "webapp.video-detail"?: {
            itemInfo?: { itemStruct?: Record<string, unknown> };
          };
        };
      };
      const direct = parsed?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
      if (direct && typeof direct === "object") return fromItem(direct);
      const item = visit(parsed);
      if (item) return fromItem(item);
    } catch {
      /* Ignore scripts without public video metadata. */
    }
  }
  return seed;
}

export function isGenericTikTokTitle(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return (
    /^(?:TikTok(?:\s*[-–|].*)?|Make Your Day|TikTok PWA)$/i.test(trimmed) ||
    /\(@[^)]+\)\s+(?:on|на)\s+TikTok$/i.test(trimmed) ||
    /\s+(?:on|на)\s+TikTok$/i.test(trimmed) ||
    /^Відео користувача\b/i.test(trimmed) ||
    /^Коротке відео\b/i.test(trimmed)
  );
}

const TRANSLIT_MAP: [RegExp, string][] = [
  [/shch/g, "щ"],
  [/zh/g, "ж"],
  [/kh/g, "х"],
  [/ts/g, "ц"],
  [/ch/g, "ч"],
  [/sh/g, "ш"],
  [/yu|iu/g, "ю"],
  [/ya|ia/g, "я"],
  [/ye|ie/g, "є"],
  [/yi/g, "ї"],
  [/iy\b/g, "ий"],
  [/yj\b/g, "ий"],
  [/a/g, "а"],
  [/b/g, "б"],
  [/v/g, "в"],
  [/g/g, "г"],
  [/h/g, "г"],
  [/d/g, "д"],
  [/e/g, "е"],
  [/z/g, "з"],
  [/y/g, "и"],
  [/i/g, "і"],
  [/k/g, "к"],
  [/l/g, "л"],
  [/m/g, "м"],
  [/n/g, "н"],
  [/o/g, "о"],
  [/p/g, "п"],
  [/r/g, "р"],
  [/s/g, "с"],
  [/t/g, "т"],
  [/u/g, "у"],
  [/f/g, "ф"],
  [/j/g, "й"],
];

function translitLatinToCyrillic(slug: string): string {
  let out = slug.toLowerCase();
  for (const [pattern, cyrillic] of TRANSLIT_MAP) out = out.replace(pattern, cyrillic);
  return out;
}

/**
 * Ukrainian DLE streaming sites (uakino, uaserials, etc.) often transliterate both `і` and `и`
 * as `i` and drop soft signs (`ь`) in reflexive verb endings (`-лось`, `-лась`, `-лись`, `-тись`).
 */
function translitUkDleVariant(slug: string): string {
  const pre = slug
    .toLowerCase()
    .replace(/([bcdfghjklmnpqrstvwxz])i(?=[bcdfghjklmnpqrstvwxz])/g, "$1и")
    .replace(/(?:shch|sh|zh|ch)i/g, (m) => `${m.slice(0, -1)}и`);
  let out = translitLatinToCyrillic(pre);
  out = out.replace(/([а-яіїєґ]{2})(лос|лас|лис|тис)(?=\s|$)/gi, "$1$2ь");
  return out;
}

function capitalizeFirst(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "";
}

const SLUG_SEASON_SUFFIX =
  /[-_]+(?:\d+(?:[-_]+\d+)*[-_]+)?(?:sezon|season|сезон)(?:[-_]+\d+(?:[-_]+\d+)*)?$/i;

/** Detect whether a streaming URL explicitly points to a TV series or season page. */
export function isSeriesUrl(url: string): boolean {
  try {
    const path = decodeURIComponent(new URL(url).pathname).toLowerCase();
    return (
      /(?:^|\/)(?:seriesss|serials?|series|tv[-_]?series|miniseries|multserials?|anime[-_]?serials?)(?:\/|$)/i.test(
        path,
      ) ||
      /(?:[-_/])(?:\d+(?:[-_]\d+)*[-_])?(?:sezon|season|сезон)(?:[-_]\d+)?(?:\.html?|\/|$)/i.test(
        path,
      )
    );
  } catch {
    return false;
  }
}

/** Extract a 4-digit release year suffix from a movie URL slug (e.g. 12861-nichna-zmina-2025.html -> 2025). */
export function movieYearFromUrl(url: string): number | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .map((s) => decodeURIComponent(s).trim())
      .filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i]
        .replace(/\.(?:html?|php|aspx?)$/i, "")
        .replace(SLUG_SEASON_SUFFIX, "");
      const yearMatch = seg.match(/[-_]((?:19|20)\d{2})$/);
      if (yearMatch) {
        const y = Number(yearMatch[1]);
        if (y >= 1920 && y <= 2035) return y;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Guess candidate film/series titles from streaming or wiki URL slugs when scraping fails. */
export function movieTitleFromUrl(url: string): string[] {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (
      /(?:^|\.)(tiktok\.com|youtu\.be|youtube\.com|vimeo\.com|instagram\.com|facebook\.com|x\.com|twitter\.com)$/i.test(
        host,
      )
    )
      return [];
    const generic =
      /^(?:filmy|films?|movies?|seriesss|serials?|series|tv|watch|video|genre[-_a-z]*|category|catalog|titles?|wiki|index|ua|en|ru)$/i;
    const segments = parsed.pathname
      .split("/")
      .map((s) => decodeURIComponent(s).trim())
      .filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      let seg = segments[i]
        .replace(/\.(?:html?|php|aspx?)$/i, "")
        .replace(/^\d+[-_]+/, "")
        .replace(/[-_]+(?:19|20)\d{2}$/, "")
        .replace(SLUG_SEASON_SUFFIX, "")
        .replace(/[-_]+\d+$/, "")
        .trim();
      if (!seg || /^tt\d+$/i.test(seg) || /^\d+$/.test(seg) || generic.test(seg))
        continue;
      seg = seg
        .replace(/\([^)]*\)/g, " ")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (seg.length < 2) continue;
      if (/^[a-z0-9\s']+$/i.test(seg)) {
        const cyr = capitalizeFirst(translitLatinToCyrillic(seg));
        const hasDleUkCue =
          /(?:shch|sh|zh|ch)i/i.test(seg) ||
          /[a-z]{2}(?:los|las|lis|tis)(?:\s|$)/i.test(seg);
        const dleCyr = hasDleUkCue
          ? capitalizeFirst(translitUkDleVariant(seg))
          : "";
        const yVariant = /i$/i.test(seg) ? seg.replace(/i$/i, "y") : "";
        return [...new Set([dleCyr, cyr, yVariant, seg])].filter(
          (s) => s.length >= 2,
        );
      }
      return [capitalizeFirst(seg)];
    }
    return [];
  } catch {
    return [];
  }
}

export function movieSearchTerms(text: string): string {
  const quoted = text.match(/[«“"]([^»”"]{2,100})[»”"]/);
  const named = text.match(
    /(?:назва(?: фільму)?|фільм називається|movie name|film name)\s*[:—–-]?\s*([^\n#|]{2,120})/i,
  );
  const raw = (named?.[1] || quoted?.[1] || text)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/#\S+/g, "")
    .replace(/\s+(?:дивитися|дивитись|смотреть)\s+онлайн[\s\S]*$/i, "")
    .replace(/\s+онлайн\s+українською[\s\S]*$/i, "")
    .replace(/\s+українською\s+онлайн[\s\S]*$/i, "")
    .replace(
      /\s+(?:\d+(?:\s*[-–,]\s*\d+)*(?:-?[йя])?\s+(?:сезон|season)|(?:сезон|season)\s+\d+(?:\s*[-–,]\s*\d+)*)(?=\s|$|[),.!?:;])/gi,
      " ",
    )
    .replace(
      /\b(?:official|final|teaser|trailer|movie|film|review|netflix|hd|4k|tiktok|uakino|uafix|uaflix|hdrezka|eneyida)\b|офіційний|трейлер|огляд|безкоштовно|українською|онлайн|дивитис[яь]|серіал(?:у|ом)?|мультфільм(?:у|ом)?|фільм(?:у|ом)?/gi,
      " ",
    )
    .split(/\s[|–—-]\s|\s\/\s|\n/)[0]
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return raw;
}
const normalized = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const stripLeadingParticle = (value: string) => {
  const stripped = value.replace(/^(?:[ійувзо]|the|a|an)\s+/i, "");
  return stripped.length >= 4 ? stripped : value;
};
const titlesMatch = (a: string, b: string) => {
  const na = normalized(a);
  const nb = normalized(b);
  return (
    Boolean(na && nb) &&
    (na === nb || stripLeadingParticle(na) === stripLeadingParticle(nb))
  );
};
/** Detect whether a movie candidate represents a TV series / miniseries rather than a feature film. */
export function isSeriesCandidate(candidate: MovieCandidate): boolean {
  if (candidate.url.includes("tvmaze.com")) return true;
  const intro = candidate.description.slice(0, 320);
  return /серіал|телесеріал|мінісеріал|ситком|\btelevision series\b|\bminiseries\b|\bsitcom\b/i.test(
    intro,
  );
}
const filmTitle = (value: string) =>
  value.replace(
    /\s*\((?:[^)]*(?:фільм|film|серіал|series)[^)]*|\d{4})\)$/i,
    "",
  );
function isFilmPage(title: string, text: string): boolean {
  if (/\((?:[^)]*(?:фільм|film|серіал|series)[^)]*)\)$/i.test(title))
    return true;
  const definition = (
    text.includes("—") ? text.slice(text.indexOf("—") + 1) : text
  )
    .split("\n")[0]
    .slice(0, 350);
  const media = definition.search(
    /фільм|кіностріч|анімаційн|серіал|телесеріал|мінісеріал|мультфільм|кінокомеді|ситком|\bfilm\b|\bmovie\b|\btelevision series\b|\bminiseries\b|\bsitcom\b/i,
  );
  const person = definition.search(
    /актор|актрис|режисер|сценарист|компані|company|actor|actress|director|screenwriter/i,
  );
  return media >= 0 && (person < 0 || media < person);
}
const stripHtmlText = (raw: string) =>
  raw
    ? parseHTML(`<html><body>${raw.slice(0, 8000)}</body></html>`)
        .document.body.textContent.replace(/\s+/g, " ")
        .trim()
    : "";
const genreLabels = (genres: string[]): string[] => {
  const joined = genres.join(" ");
  return [
    ["Драма", /драм|drama/i],
    ["Комедія", /комед|comedy/i],
    ["Трилер", /трилер|thriller/i],
    ["Детектив", /детектив|mystery|detective/i],
    ["Кримінальний", /кримінал|crime/i],
    ["Фантастика", /науково.фантаст|science.fiction|sci-fi|fantasy/i],
    ["Пригоди", /пригод|adventure/i],
    ["Анімація", /анімац|animated|animation/i],
  ]
    .filter(([, pattern]) => (pattern as RegExp).test(joined))
    .map(([label]) => String(label));
};
const extractYear = (title: string, text: string): number | null =>
  Number(
    (title.match(/\b((?:19|20)\d{2})\b/) ||
      text.slice(0, 1200).match(/\b((?:19|20)\d{2})\b/) ||
      [])[1],
  ) || null;
const sameYear = (candidateYear: number | null, targetYear: number | null | undefined) =>
  !targetYear || !candidateYear || Math.abs(candidateYear - targetYear) <= 1;

function buildFuzzyWikiQuery(term: string): string {
  const words = term.trim().split(/\s+/).filter(Boolean);
  let changed = false;
  const fuzzy = words.map((word) => {
    if (word.length >= 4 && !word.endsWith("~")) {
      changed = true;
      return `${word}~`;
    }
    return word;
  });
  return changed ? fuzzy.join(" ") : "";
}

export async function movieCandidates(
  query: string,
  load: PageLoader,
  year?: number | null,
): Promise<MovieCandidate[]> {
  const found: MovieCandidate[] = [];
  const pushCandidate = (candidate: MovieCandidate) => {
    if (!candidate.title || !candidate.url) return;
    if (
      found.some(
        (c) =>
          c.url === candidate.url ||
          (normalized(c.title) === normalized(candidate.title) &&
            c.year === candidate.year),
      )
    )
      return;
    found.push(candidate);
  };
  const searchWikipedia = async (language: "uk" | "en", term: string) => {
    const api = new URL(`https://${language}.wikipedia.org/w/api.php`);
    for (const [key, value] of Object.entries({
      action: "query",
      format: "json",
      formatversion: "2",
      origin: "*",
      generator: "search",
      gsrsearch: term,
      gsrnamespace: "0",
      gsrlimit: "10",
      prop: "extracts|pageimages|categories|pageprops",
      exintro: "1",
      explaintext: "1",
      exchars: "1800",
      piprop: "original|thumbnail",
      pithumbsize: "700",
      cllimit: "20",
    }))
      api.searchParams.set(key, value);
    try {
      const data = JSON.parse((await load(api.href)).html);
      for (const page of (data.query?.pages || []).sort(
        (a: { index: number }, b: { index: number }) => a.index - b.index,
      )) {
        const text = String(page.extract || ""),
          title = String(page.title || "");
        if (
          page.pageprops?.disambiguation !== undefined ||
          !isFilmPage(title, text)
        )
          continue;
        const categoryTitles = (page.categories || []).map(
          (c: { title: string }) => c.title,
        );
        const extractedGenres = genreLabels(categoryTitles);
        pushCandidate({
          title: filmTitle(title),
          url: `https://${language}.wikipedia.org/?curid=${Number(page.pageid)}`,
          image_url: publicUrl(
            page.thumbnail?.source || page.original?.source || "",
          ),
          description: text.slice(0, 1800),
          year: extractYear(title, text),
          genres: extractedGenres.length
            ? extractedGenres
            : genreLabels([text.slice(0, 320)]),
        });
      }
    } catch {
      /* A blocked language endpoint must not discard source metadata. */
    }
  };

  const hasLatin = /[a-z]/i.test(query);
  const languages: ("uk" | "en")[] = hasLatin ? ["en", "uk"] : ["uk", "en"];
  for (const language of languages) {
    if (language === "en" && !hasLatin && found.some((c) => sameYear(c.year, year)))
      continue;
    if (year) await searchWikipedia(language, `${query} ${year}`);
    if (!found.some((c) => sameYear(c.year, year)))
      await searchWikipedia(language, query);
    // Fuzzy CirrusSearch fallback catches missing soft signs or DLE `і`↔`и` mismatches when exact search returns 0 hits.
    if (!found.length && language === "uk" && !hasLatin) {
      const fuzzy = buildFuzzyWikiQuery(query);
      if (fuzzy) await searchWikipedia(language, fuzzy);
      if (!found.length && /[а-яіїєґ]і[а-яіїєґ]/i.test(query)) {
        const ySwap = query.replace(/([а-яіїєґ])і(?=[а-яіїєґ])/gi, "$1и");
        if (ySwap !== query) {
          await searchWikipedia(language, ySwap);
          if (!found.length) {
            const fuzzySwap = buildFuzzyWikiQuery(ySwap);
            if (fuzzySwap) await searchWikipedia(language, fuzzySwap);
          }
        }
      }
    }
    if (language === "en" && hasLatin && found.length < 2)
      await searchWikipedia(language, `${query} film`);
    if (!found.length) {
      for (const suffix of ["", " (фільм)"]) {
        if (language === "en" && suffix) continue;
        try {
          const endpoint = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent((query + suffix).replace(/ /g, "_"))}`;
          const page = JSON.parse((await load(endpoint)).html);
          const text = String(page.extract || "");
          if (
            page.type === "disambiguation" ||
            !isFilmPage(String(page.title || query), text)
          )
            continue;
          const source = publicUrl(page.content_urls?.desktop?.page || "");
          if (!source) continue;
          pushCandidate({
            title: filmTitle(String(page.title || query)),
            url: source,
            image_url: publicUrl(
              page.thumbnail?.source || page.originalimage?.source || "",
            ),
            description: text.slice(0, 1800),
            year: extractYear(String(page.title || ""), text),
            genres: genreLabels([text.slice(0, 320)]),
          });
          break;
        } catch {
          /* Search and summary endpoints have independent availability. */
        }
      }
    }
  }

  // Wikidata connects Ukrainian titles (e.g. Нічна зміна 2025) with international articles.
  if (
    found.length < 2 ||
    (year && !found.some((c) => c.year && Math.abs(c.year - year) <= 1))
  ) {
    try {
      const wdUrl = new URL("https://www.wikidata.org/w/api.php");
      for (const [k, v] of Object.entries({
        action: "wbsearchentities",
        search: query,
        language: hasLatin ? "en" : "uk",
        uselang: "uk",
        format: "json",
        origin: "*",
        limit: "6",
      }))
        wdUrl.searchParams.set(k, v);
      const wd = JSON.parse((await load(wdUrl.href)).html) as {
        search?: { id: string; label?: string; description?: string }[];
      };
      const mediaHits = (wd.search || []).filter((item) => {
        const desc = String(item.description || "");
        if (!/фільм|кіностріч|серіал|телесеріал|film|movie|television series|miniseries/i.test(desc))
          return false;
        if (year) {
          const descYear = Number((desc.match(/\b((?:19|20)\d{2})\b/) || [])[1]) || null;
          if (descYear && Math.abs(descYear - year) > 1) return false;
        }
        return true;
      });
      if (mediaHits.length) {
        const ids = mediaHits.slice(0, 2).map((h) => h.id).join("|");
        const entUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(ids)}&props=labels|descriptions|claims|sitelinks&languages=uk|en&format=json&origin=*`;
        const entData = JSON.parse((await load(entUrl)).html) as {
          entities?: Record<string, {
            id?: string;
            labels?: Record<string, { value?: string }>;
            descriptions?: Record<string, { value?: string }>;
            sitelinks?: Record<string, { title?: string }>;
            claims?: { P577?: { mainsnak?: { datavalue?: { value?: { time?: string } } } }[] };
          }>;
        };
        for (const hit of mediaHits.slice(0, 2)) {
          const ent = entData.entities?.[hit.id];
          if (!ent) continue;
          const timeStr = ent.claims?.P577?.[0]?.mainsnak?.datavalue?.value?.time || "";
          const entYear =
            Number((timeStr.match(/\+?((?:19|20)\d{2})/) || [])[1]) ||
            Number((String(hit.description || "").match(/\b((?:19|20)\d{2})\b/) || [])[1]) ||
            null;
          const ukTitle = ent.sitelinks?.ukwiki?.title;
          const enTitle = ent.sitelinks?.enwiki?.title;
          const wikiSite: ["uk" | "en", string] | null = ukTitle
            ? ["uk", ukTitle]
            : enTitle
              ? ["en", enTitle]
              : null;
          if (wikiSite) {
            try {
              const summaryRes = JSON.parse(
                (
                  await load(
                    `https://${wikiSite[0]}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiSite[1].replace(/ /g, "_"))}`,
                  )
                ).html,
              );
              const source = publicUrl(summaryRes.content_urls?.desktop?.page || "");
              if (source) {
                pushCandidate({
                  title: filmTitle(String(summaryRes.title || ent.labels?.uk?.value || ent.labels?.en?.value || query)),
                  url: source,
                  image_url: publicUrl(
                    summaryRes.thumbnail?.source || summaryRes.originalimage?.source || "",
                  ),
                  description: String(summaryRes.extract || hit.description || "").slice(0, 1800),
                  year: entYear ?? extractYear(String(summaryRes.title || ""), String(summaryRes.extract || "")),
                  genres: [],
                });
                continue;
              }
            } catch {
              /* fall through to direct Wikidata entry */
            }
          }
          pushCandidate({
            title: String(ent.labels?.uk?.value || ent.labels?.en?.value || hit.label || query),
            url: `https://www.wikidata.org/wiki/${encodeURIComponent(hit.id)}`,
            image_url: "",
            description: String(ent.descriptions?.uk?.value || ent.descriptions?.en?.value || hit.description || ""),
            year: entYear,
            genres: [],
          });
        }
      }
    } catch {
      /* Optional fallback endpoint. */
    }
  }

  if (found.length < 2 || (year && !found.some((c) => c.year === year))) {
    try {
      const tvmaze = JSON.parse(
        (
          await load(
            `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`,
          )
        ).html,
      );
      if (Array.isArray(tvmaze)) {
        for (const row of tvmaze.slice(0, 5)) {
          const show = row?.show;
          const title = String(show?.name || "").trim();
          const source = publicUrl(String(show?.url || ""));
          if (!title || !source) continue;
          pushCandidate({
            title,
            url: source,
            image_url: publicUrl(
              show?.image?.medium || show?.image?.original || "",
            ),
            description: stripHtmlText(String(show?.summary || "")).slice(
              0,
              1800,
            ),
            year:
              Number(String(show?.premiered || "").slice(0, 4)) || null,
            genres: Array.isArray(show?.genres)
              ? genreLabels(show.genres.map(String))
              : [],
          });
        }
      }
    } catch {
      /* Optional fallback endpoint. */
    }
  }
  if (found.length < 2 || (year && !found.some((c) => c.year === year))) {
    for (const country of hasLatin ? ["ua", "us"] : ["ua"]) {
      if (found.length >= 4 && (!year || found.some((c) => c.year === year))) break;
      try {
        const itunes = JSON.parse(
          (
            await load(
              `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=movie&entity=movie&limit=5&country=${country}`,
            )
          ).html,
        );
        if (Array.isArray(itunes?.results)) {
          for (const item of itunes.results) {
            const title = String(item?.trackName || "").trim();
            const source = publicUrl(String(item?.trackViewUrl || ""));
            if (!title || !source) continue;
            const art = String(item?.artworkUrl100 || "").replace(
              "100x100bb",
              "600x600bb",
            );
            pushCandidate({
              title,
              url: source,
              image_url: publicUrl(art),
              description: String(
                item?.longDescription || item?.shortDescription || "",
              ).slice(0, 1800),
              year:
                Number(String(item?.releaseDate || "").slice(0, 4)) || null,
              genres: item?.primaryGenreName
                ? genreLabels([String(item.primaryGenreName)])
                : [],
            });
          }
        }
      } catch {
        /* Optional fallback endpoint. */
      }
    }
  }
  return found.slice(0, 6);
}
export async function moviePlot(
  candidate: MovieCandidate,
  load: PageLoader,
): Promise<string> {
  const source = new URL(candidate.url),
    pageid = source.searchParams.get("curid");
  const title = source.pathname.startsWith("/wiki/")
    ? decodeURIComponent(source.pathname.slice(6)).replace(/_/g, " ")
    : "";
  if (!pageid && !title) return candidate.description;
  const page: Record<string, string> = pageid ? { pageid } : { page: title };
  const api = new URL("/w/api.php", source.origin);
  api.search = new URLSearchParams({
    action: "parse",
    ...page,
    prop: "sections",
    format: "json",
    origin: "*",
  }).toString();
  try {
    const sections =
      JSON.parse((await load(api.href)).html).parse?.sections || [];
    const plot = sections.find((s: { line: string }) =>
      /^(сюжет|plot|synopsis)$/i.test(s.line),
    );
    if (!plot) return candidate.description;
    api.search = new URLSearchParams({
      action: "parse",
      ...page,
      prop: "text",
      section: String(plot.index),
      format: "json",
      origin: "*",
    }).toString();
    const html = JSON.parse((await load(api.href)).html).parse?.text?.["*"];
    if (typeof html !== "string") return candidate.description;
    const { document } = parseHTML(`<html><body>${html}</body></html>`);
    for (const element of document.querySelectorAll(
      "sup,.mw-editsection,script,style",
    ))
      element.remove();
    return (
      Array.from(document.querySelectorAll("p"))
        .map((p) => p.textContent.trim())
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 2000) || candidate.description
    );
  } catch {
    return candidate.description;
  }
}
export async function enrichMovie(
  metadata: LinkMetadata,
  load: PageLoader,
  query?: string,
): Promise<LinkMetadata> {
  metadata = { ...metadata, description: movieSynopsis(metadata.description) };
  const sourceHost = (() => {
    try {
      return new URL(metadata.source_url).hostname;
    } catch {
      return "";
    }
  })();
  const isTikTok = /(?:^|\.)tiktok\.com$/i.test(sourceHost);
  if (
    !query &&
    ((isTikTok && !metadata.title.trim()) ||
      isGenericTikTokTitle(metadata.title))
  )
    return {
      ...metadata,
      title: "",
      description: "",
      image_url: metadata.image_url,
      provider: "TikTok",
      movie_query: "",
      candidates: [],
    };
  const effectiveYear =
    metadata.year ?? movieYearFromUrl(metadata.source_url);
  if (effectiveYear && !metadata.year) {
    metadata = { ...metadata, year: effectiveYear };
  }
  const terms = movieSearchTerms(query || metadata.title);
  const altTerms =
    !query && metadata.alternate_title
      ? movieSearchTerms(metadata.alternate_title)
      : "";
  if (terms.length < 2 && altTerms.length < 2) return metadata;
  const searchList = [...new Set([terms, altTerms].filter((t) => t.length >= 2))];
  const merged: MovieCandidate[] = [];
  for (const term of searchList) {
    const items = await movieCandidates(term, load, effectiveYear);
    for (const item of items) {
      if (
        !merged.some(
          (c) =>
            c.url === item.url ||
            (normalized(c.title) === normalized(item.title) &&
              c.year === item.year),
        )
      )
        merged.push(item);
    }
    if (
      effectiveYear &&
      merged.some(
        (c) =>
          searchList.some((t) => normalized(c.title) === normalized(t)) &&
          c.year === effectiveYear,
      )
    )
      break;
  }
  // When release year is known from the link or page, filter out completely wrong decades (e.g. 1982/1990 for a 2025 film).
  const preferSeries = isSeriesUrl(metadata.source_url);
  const yearFiltered = effectiveYear
    ? merged.filter((c) => !c.year || Math.abs(c.year - effectiveYear) <= 1)
    : merged;
  const ranked = preferSeries
    ? [
        ...yearFiltered.filter((c) => isSeriesCandidate(c)),
        ...yearFiltered.filter((c) => !isSeriesCandidate(c)),
      ]
    : yearFiltered;
  const candidates = ranked.slice(0, 5);
  if (!candidates.length)
    return { ...metadata, movie_query: terms || altTerms, candidates: [] };
  const exact = candidates.filter((c) =>
    searchList.some((t) => titlesMatch(c.title, t)),
  );
  const match =
    (effectiveYear && preferSeries
      ? exact.find((c) => c.year === effectiveYear && isSeriesCandidate(c))
      : undefined) ??
    (effectiveYear ? exact.find((c) => c.year === effectiveYear) : undefined) ??
    (preferSeries ? exact.find((c) => isSeriesCandidate(c)) : undefined) ??
    exact.find(
      (c) => !effectiveYear || !c.year || Math.abs(c.year - effectiveYear) <= 1,
    );
  if (!match)
    return { ...metadata, movie_query: terms || altTerms, candidates };
  const fetchedPlot = movieSynopsis(await moviePlot(match, load));
  const keepUkrainianDesc =
    metadata.description.length >= 60 &&
    !/^(?:дивитися|дивитись|смотреть)(?:\s|$)/i.test(metadata.description) &&
    /[а-яіїєґ]/i.test(metadata.description) &&
    !/[а-яіїєґ]/i.test(fetchedPlot);
  const badge = match.url.includes("wikipedia.org")
    ? "Wikipedia"
    : match.url.includes("wikidata.org")
      ? "Wikidata"
      : match.url.includes("tvmaze.com")
        ? "TVMaze"
        : "Apple TV";
  return {
    ...metadata,
    title:
      altTerms &&
      normalized(match.title) === normalized(altTerms) &&
      metadata.title &&
      /[а-яіїєґ]/i.test(metadata.title)
        ? metadata.title
        : match.title,
    description: keepUkrainianDesc
      ? metadata.description
      : fetchedPlot || metadata.description,
    image_url: match.image_url || metadata.image_url,
    year: match.year ?? effectiveYear,
    genres: match.genres.length ? match.genres : metadata.genres,
    metadata_url: match.url,
    provider: `${badge} · ${metadata.provider}`,
    movie_query: terms || altTerms,
    candidates,
  };
}
