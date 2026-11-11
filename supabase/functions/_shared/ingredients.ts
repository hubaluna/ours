import { groceryCategory } from "./grocery-category.ts";
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
      category: groceryCategory(line),
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
    category: groceryCategory(match[3]),
    price: null,
    note: line,
  };
}
