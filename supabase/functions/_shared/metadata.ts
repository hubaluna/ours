import { parseHTML } from "linkedom";
export type ImportKind = "movie" | "wish" | "recipe";
export type LinkMetadata = {
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
  const yearMatch = String(item.datePublished || "").match(/^(\d{4})/);
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
  return {
    source_url,
    title: clean(
      item.name ||
        item.headline ||
        meta("og:title") ||
        meta("twitter:title") ||
        document.querySelector("title")?.textContent ||
        "",
      160,
    ),
    description: clean(
      item.description ||
        meta("og:description") ||
        meta("description") ||
        meta("twitter:description"),
    ),
    image_url: publicUrl(
      imageValue(item.image || item.thumbnailUrl) ||
        meta("og:image") ||
        meta("twitter:image"),
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
    provider: new URL(source_url).hostname.replace(/^www\./, ""),
  };
}
export function parseIngredient(line: string) {
  const fractions: Record<string, string> = {
    "½": "1/2",
    "¼": "1/4",
    "¾": "3/4",
    "⅓": "1/3",
    "⅔": "2/3",
  };
  const normalized = line
    .replace(
      /[½¼¾⅓⅔]/g,
      (c, index, text) =>
        (index > 0 && /\d/.test(text[index - 1]) ? " " : "") + fractions[c],
    )
    .trim();
  const match =
    normalized.match(
      /^(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(кг|kg|г|g|л|l|мл|ml|шт\.?|pcs|cups?|tbsp|tsp|ст\.?\s*л\.?|ч\.?\s*л\.?)?\s+(.+)$/i,
    ) ??
    normalized
      .match(
        /^(.+?)\s*[-—–:]\s*(\d+(?:[.,]\d+)?)\s*(кг|kg|г|g|л|l|мл|ml|шт\.?|pcs)?$/i,
      )
      ?.map((v, i, a) =>
        i === 1 ? a[2] : i === 2 ? a[3] || "" : i === 3 ? a[1] : v,
      );
  if (!match)
    return {
      name: line.trim().slice(0, 160),
      quantity: 1,
      unit: "шт.",
      category: "Інше",
      price: null,
      note: line,
    };
  const amount = match[1]
    .replace(",", ".")
    .split(/\s+/)
    .reduce((sum, v) => {
      const parts = v.split("/").map(Number);
      return (
        sum + (parts.length === 2 && parts[1] ? parts[0] / parts[1] : parts[0])
      );
    }, 0);
  const unit =
    (
      {
        kg: "кг",
        g: "г",
        l: "л",
        ml: "мл",
        pcs: "шт.",
        шт: "шт.",
        "шт.": "шт.",
      } as Record<string, string>
    )[(match[2] || "").toLowerCase()] ||
    match[2] ||
    "шт.";
  const supported = ["кг", "г", "л", "мл", "шт."].includes(unit);
  return {
    name: (supported ? match[3] : line).trim().slice(0, 160),
    quantity:
      supported && Number.isFinite(amount) && amount > 0 && amount < 1000000
        ? Math.round(amount * 1000) / 1000
        : 1,
    unit: supported ? unit : "шт.",
    category: "Інше",
    price: null,
    note: line,
  };
}
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
