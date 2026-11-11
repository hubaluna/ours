import { parseHTML } from "linkedom";
import { publicUrl } from "./urls.ts";
import type { LinkMetadata, MovieCandidate } from "./metadata.ts";
type PageLoader = (url: string) => Promise<{ html: string; url: string }>;
export function tiktokMetadata(
  html: string,
  source: string,
  seed: LinkMetadata,
): LinkMetadata {
  const { document } = parseHTML(html);
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
      const item = visit(JSON.parse(script.textContent || ""));
      if (item) {
        const video = item.video as { cover?: string; originCover?: string };
        return {
          ...seed,
          source_url: source,
          title: String(item.desc).slice(0, 160),
          description: String(item.desc).slice(0, 1000),
          image_url:
            publicUrl(video.cover || video.originCover || "") || seed.image_url,
          provider: "TikTok",
        };
      }
    } catch {
      /* Ignore scripts without public video metadata. */
    }
  }
  return seed;
}
export function movieSearchTerms(text: string): string {
  const quoted = text.match(/[«“"]([^»”"]{2,100})[»”"]/);
  const named = text.match(
    /(?:назва(?: фільму)?|фільм називається|movie name|film name)\s*[:—–-]?\s*([^\n#|]{2,120})/i,
  );
  return (named?.[1] || quoted?.[1] || text)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/#\S+/g, "")
    .replace(
      /\b(?:official|final|teaser|trailer|movie|film|review|netflix|hd|4k|tiktok)\b|офіційний|трейлер|огляд|фільм(?:у|ом)?/gi,
      " ",
    )
    .split(/\s[|–—-]\s|\n/)[0]
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
const normalized = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
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
    /фільм|кіностріч|анімаційн|серіал|\bfilm\b|\bmovie\b|\btelevision series\b/i,
  );
  const person = definition.search(
    /актор|актрис|режисер|сценарист|компані|company|actor|actress|director|screenwriter/i,
  );
  return media >= 0 && (person < 0 || media < person);
}
export async function movieCandidates(
  query: string,
  load: PageLoader,
): Promise<MovieCandidate[]> {
  const found: MovieCandidate[] = [];
  for (const language of ["uk", "en"]) {
    if (found.length >= 3) break;
    const api = new URL(`https://${language}.wikipedia.org/w/api.php`);
    for (const [key, value] of Object.entries({
      action: "query",
      format: "json",
      formatversion: "2",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "0",
      gsrlimit: "5",
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
        if (found.some((c) => normalized(c.title) === normalized(title)))
          continue;
        found.push({
          title: filmTitle(title),
          url: `https://${language}.wikipedia.org/?curid=${Number(page.pageid)}`,
          image_url: publicUrl(
            page.original?.source || page.thumbnail?.source || "",
          ),
          description: text.slice(0, 1800),
          year:
            Number(
              (text.slice(0, 1200).match(/\b((?:19|20)\d{2})\b/) || [])[1],
            ) || null,
          genres: [
            ["Драма", /драм|drama/i],
            ["Комедія", /комед|comedy/i],
            ["Трилер", /трилер|thriller/i],
            ["Кримінальний", /кримінал|crime/i],
            ["Фантастика", /науково.фантаст|science.fiction/i],
            ["Пригоди", /пригод|adventure/i],
            ["Анімація", /анімац|animated/i],
          ]
            .filter(([, pattern]) =>
              (pattern as RegExp).test(
                (page.categories || [])
                  .map((c: { title: string }) => c.title)
                  .join(" "),
              ),
            )
            .map(([label]) => String(label)),
        });
      }
    } catch {
      /* A blocked language endpoint must not discard source metadata. */
    }
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
          found.push({
            title: filmTitle(String(page.title || query)),
            url: source,
            image_url: publicUrl(
              page.originalimage?.source || page.thumbnail?.source || "",
            ),
            description: text.slice(0, 1800),
            year:
              Number(
                (text.slice(0, 1200).match(/\b((?:19|20)\d{2})\b/) || [])[1],
              ) || null,
            genres: [],
          });
          break;
        } catch {
          /* Search and summary endpoints have independent availability. */
        }
      }
    }
  }
  return found.slice(0, 5);
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
  if (
    !query &&
    /^(?:TikTok(?:\s*[-–|].*)?|Make Your Day)$/i.test(metadata.title.trim())
  )
    return {
      ...metadata,
      title: "",
      description: "",
      image_url: "",
      provider: "TikTok",
      movie_query: "",
      candidates: [],
    };
  const terms = movieSearchTerms(query || metadata.title);
  if (terms.length < 2) return metadata;
  const candidates = await movieCandidates(terms, load);
  if (!candidates.length)
    return { ...metadata, movie_query: terms, candidates: [] };
  const exact = candidates.filter(
    (c) => normalized(c.title) === normalized(terms),
  );
  const match =
    (metadata.year ? exact.find((c) => c.year === metadata.year) : undefined) ??
    exact.find((c) => !metadata.year || !c.year || c.year === metadata.year);
  if (!match) return { ...metadata, movie_query: terms, candidates };
  return {
    ...metadata,
    title: match.title,
    description: await moviePlot(match, load),
    image_url: match.image_url || metadata.image_url,
    year: match.year ?? metadata.year,
    genres: match.genres.length ? match.genres : metadata.genres,
    metadata_url: match.url,
    provider: "Wikipedia · " + metadata.provider,
    movie_query: terms,
    candidates,
  };
}
