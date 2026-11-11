import { parseHTML } from "linkedom";
export type ImportKind = "movie" | "wish" | "recipe";
export type LinkMetadata = {
  instructions?: string[];
  metadata_url?: string;
  candidates?: MovieCandidate[];
  movie_query?: string;
  source_url: string;
  title: string;
  description: string;
  image_url: string;
  year: number | null;
  genres: string[];
  price: number | null;
  currency: string;
  ingredients: string[];
  provider: string;
};
export type MovieCandidate = {
  title: string;
  url: string;
  image_url: string;
  description: string;
  year: number | null;
  genres: string[];
};
export { publicUrl } from "./urls.ts";
import { publicUrl } from "./urls.ts";
const clean = (value: unknown, max = 1000): string => {
  if (typeof value !== "string") return "";
  return parseHTML(`<html><body>${value.slice(0, 12000)}</body></html>`)
    .document.body.textContent.replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
};
function nodes(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 8 || !value || typeof value !== "object") return [];
  if (Array.isArray(value))
    return value.slice(0, 100).flatMap((v) => nodes(v, depth + 1));
  const o = value as Record<string, unknown>;
  return [
    o,
    ...Object.values(o)
      .slice(0, 50)
      .flatMap((v) => nodes(v, depth + 1)),
  ].slice(0, 500);
}
const types = (o: Record<string, unknown>) =>
  [o["@type"]]
    .flat()
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.split("/").pop()!.toLowerCase());
function imageValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return imageValue(value[0]);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return imageValue(o.url || o.contentUrl);
  }
  return "";
}
export function parseMetadata(
  html: string,
  source: string,
  kind: ImportKind,
): LinkMetadata {
  if (html.length > 1_500_000) throw new Error("Сторінка завелика.");
  const source_url = publicUrl(source);
  if (!source_url) throw new Error("Додайте повне HTTPS-посилання.");
  const { document } = parseHTML(html);
  const meta = (key: string) => {
    for (const el of document.querySelectorAll("meta"))
      if (
        (
          el.getAttribute("property") ||
          el.getAttribute("name") ||
          ""
        ).toLowerCase() === key
      )
        return el.getAttribute("content") || "";
    return "";
  };
  const structured: Record<string, unknown>[] = [];
  for (const script of Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  ).slice(0, 20)) {
    const text = script.textContent || "";
    if (text.length > 250000) continue;
    try {
      structured.push(...nodes(JSON.parse(text)));
    } catch {
      /* malformed JSON-LD falls back to OG */
    }
  }
  const desired =
    kind === "movie"
      ? ["movie", "tvseries", "videoobject"]
      : kind === "recipe"
        ? ["recipe"]
        : ["product"];
  const item =
    structured.find((o) => types(o).some((t) => desired.includes(t))) ?? {};
  const offer =
    nodes(item.offers).find(
      (o) => o.price !== undefined || o.lowPrice !== undefined,
    ) ?? {};
  const number = Number(
    offer.price ?? offer.lowPrice ?? meta("product:price:amount"),
  );
  const currency = clean(
    offer.priceCurrency || meta("product:price:currency"),
    8,
  ).toUpperCase();
  const rawTitle = clean(
    item.name ||
      item.headline ||
      meta("og:title") ||
      meta("twitter:title") ||
      document.querySelector("title")?.textContent ||
      "",
    160,
  );
  const quotedTitle =
    kind === "movie" ? rawTitle.match(/[«“"]([^»”"]+)[»”"]/) : null;
  const yearMatch =
    String(item.datePublished || "").match(/^(\d{4})/) ||
    (kind === "movie" ? rawTitle.match(/[»”"]\s*((?:19|20)\d{2})\b/) : null);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const genres = [item.genre || []]
    .flat()
    .filter((s): s is string => typeof s === "string")
    .map((s) => clean(s, 60))
    .filter(Boolean)
    .slice(0, 8);
  const ingredients = [item.recipeIngredient || []]
    .flat()
    .filter((s): s is string => typeof s === "string")
    .map((s) => clean(s, 240))
    .filter(Boolean)
    .slice(0, 80);
  const instructions = nodes(item.recipeInstructions)
    .filter((o) => types(o).includes("howtostep") || typeof o.text === "string")
    .map((o) => clean(o.text, 2000))
    .filter(Boolean)
    .slice(0, 60);
  if (!instructions.length) {
    for (const step of [item.recipeInstructions || []].flat())
      if (typeof step === "string")
        instructions.push(
          ...step
            .split(/\n+/)
            .map((s) => clean(s, 2000))
            .filter(Boolean)
            .slice(0, 60),
        );
  }
  return {
    source_url,
    title: quotedTitle?.[1] || rawTitle,
    description: clean(
      item.description ||
        meta("og:description") ||
        meta("description") ||
        meta("twitter:description"),
    ),
    image_url: publicUrl(
      imageValue(item.image || item.thumbnailUrl) ||
        meta("og:image") ||
        meta("twitter:image") ||
        document.querySelector('img[itemprop="image"]')?.getAttribute("src") ||
        "",
      source_url,
    ),
    year: year && year >= 1888 && year <= 2200 ? year : null,
    genres,
    price:
      Number.isFinite(number) &&
      number >= 0 &&
      number < 100000000 &&
      String(offer.price ?? offer.lowPrice ?? meta("product:price:amount")) !==
        ""
        ? number
        : null,
    currency,
    ingredients,
    ...(kind === "recipe" ? { instructions } : {}),
    provider: new URL(source_url).hostname.replace(/^www\./, ""),
  };
}

/** Read ordinary article sections only when recipe JSON-LD was absent. */
export function parseArticleRecipe(
  html: string,
  metadata: LinkMetadata,
): LinkMetadata {
  if (metadata.ingredients.length && metadata.instructions?.length)
    return metadata;
  const { document } = parseHTML(html);
  const headings = Array.from(document.querySelectorAll("h2, h3"));
  const findSection = (pattern: RegExp, ingredientList = false) => {
    const heading = headings.find((item) =>
      pattern.test(item.textContent || ""),
    );
    if (!heading?.parentElement) return [];
    const content = Array.from(
      heading.parentElement.querySelectorAll("h2, h3, li, p"),
    );
    const index = content.indexOf(heading);
    if (index < 0) return [];
    const section = content
      .slice(index + 1)
      .slice(
        0,
        content
          .slice(index + 1)
          .findIndex((node) => /^H[23]$/.test(node.tagName)) < 0
          ? undefined
          : content
              .slice(index + 1)
              .findIndex((node) => /^H[23]$/.test(node.tagName)),
      );
    const useList =
      ingredientList && section.some((node) => node.tagName === "LI");
    const values: string[] = [];
    for (const node of section) {
      if (/^H[23]$/.test(node.tagName)) break;
      if (useList && node.tagName !== "LI") continue;
      if (node.tagName === "LI" || node.tagName === "P") {
        if (node.tagName === "P" && node.querySelector("a.read-also")) {
          for (const anchor of node.querySelectorAll("a")) anchor.remove();
        }
        const text = clean(node.textContent, 2000);
        if (text && !/^(?:Читайте також|Відео дня)/i.test(text))
          values.push(text);
      }
    }
    return values;
  };
  const ingredients = metadata.ingredients.length
    ? metadata.ingredients
    : findSection(/^(?:інгредієнти|що потрібно|продукти)(?:\s|$)/i, true).slice(
        0,
        80,
      );
  const instructions = metadata.instructions?.length
    ? metadata.instructions
    : findSection(
        /^(?:процес приготування|спосіб приготування|приготування|як готувати)(?:\s|$)/i,
      ).slice(0, 60);
  return { ...metadata, ingredients, instructions };
}

/** Extract only explicitly labeled ingredients from a public TikTok caption. */
export function tiktokRecipeCaption(metadata: LinkMetadata): LinkMetadata {
  const caption = metadata.description;
  const heading = caption.match(
    /(?:^|\s)(?:інгредієнти|ingredients)\s*[:：]\s*/i,
  );
  if (!heading) return metadata;
  const tail = caption
    .slice(heading.index! + heading[0].length)
    .split(
      /\s+(?:смачного|спосіб приготування|приготування|кроки)(?:\s|$)|\s+#/i,
    )[0];
  const amount =
    /\d+(?:[.,]\d+)?(?:\/\d+)?\s*(?:шт\.?|штук|ст\.?\s*л\.?|ч\.?\s*л\.?|гр\.?|г|кг|мл|л|уп\.?)/giu;
  const ingredients: string[] = [];
  let end = 0;
  for (const match of tail.matchAll(amount)) {
    let name = tail.slice(end, match.index).trim();
    name = name
      .replace(/^(?:з\s+гіркою|без\s+гірки)\s+/i, "")
      .replace(/[;,]+$/, "")
      .trim();
    if (name) ingredients.push(`${name} — ${match[0].trim()}`);
    end = match.index! + match[0].length;
  }
  const beforeIngredients = caption.slice(0, heading.index).trim();
  const title = beforeIngredients
    .split(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)[0]
    .trim();
  return {
    ...metadata,
    title: title.slice(0, 160) || metadata.title,
    ingredients: ingredients.slice(0, 80),
    instructions: [],
  };
}
export { parseIngredient } from "./ingredients.ts";
export function parsePasted(
  text: string,
  source: string,
  kind: ImportKind,
): LinkMetadata {
  if (/<(?:html|meta|script|title|body)\b/i.test(text))
    return parseMetadata(text, source, kind);
  const lines = text
    .split("\n")
    .map((s) => s.trim().replace(/^[•*]\s*/, ""))
    .filter(Boolean);
  return {
    source_url: publicUrl(source),
    title:
      kind === "recipe"
        ? "Інгредієнти з рецепта"
        : lines[0]?.slice(0, 160) || "",
    description:
      kind === "recipe" ? "" : lines.slice(1).join(" ").slice(0, 1000),
    image_url: "",
    year: null,
    genres: [],
    price: null,
    currency: "",
    ingredients: kind === "recipe" ? lines.slice(0, 80) : [],
    provider: "Вставлений текст",
  };
}
