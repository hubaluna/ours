import catalog from "../data/ours-goods-uk.json";
import {
  groceryCategory,
  type GroceryCategory,
} from "../../supabase/functions/_shared/grocery-category";

type CatalogItem = (typeof catalog.items)[number];
type CatalogIntent = (typeof catalog.categoryIntents)[number];

const categoryMap: Record<string, GroceryCategory> = {
  vegetables: "Овочі та фрукти",
  fruits: "Овочі та фрукти",
  berries: "Овочі та фрукти",
  greens: "Овочі та фрукти",
  mushrooms: "Овочі та фрукти",
  meat: "М’ясо, риба та яйця",
  poultry: "М’ясо, риба та яйця",
  "fish-seafood": "М’ясо, риба та яйця",
  "sausages-deli": "М’ясо, риба та яйця",
  dairy: "Молочне",
  eggs: "М’ясо, риба та яйця",
  "grains-legumes": "Крупи, макарони та бакалія",
  "pasta-flour": "Крупи, макарони та бакалія",
  "bread-bakery": "Хліб і випічка",
  baking: "Крупи, макарони та бакалія",
  "oils-fats": "Крупи, макарони та бакалія",
  sauces: "Консервація й соуси",
  spices: "Крупи, макарони та бакалія",
  "canned-pickled": "Консервація й соуси",
  frozen: "Заморожене",
  "ready-meals": "Інше",
  "nuts-dried-fruit": "Снеки",
  snacks: "Снеки",
  sweets: "Солодощі",
  "coffee-tea": "Напої",
  drinks: "Напої",
  alcohol: "Напої",
  cleaning: "Побутове й гігієна",
  laundry: "Побутове й гігієна",
  dishwashing: "Побутове й гігієна",
  paper: "Побутове й гігієна",
  hygiene: "Побутове й гігієна",
  dental: "Побутове й гігієна",
  beauty: "Побутове й гігієна",
  health: "Побутове й гігієна",
  baby: "Побутове й гігієна",
  pets: "Побутове й гігієна",
  kitchen: "Побутове й гігієна",
  household: "Побутове й гігієна",
  electronics: "Інше",
  stationery: "Інше",
  auto: "Інше",
  "clothing-textiles": "Інше",
  garden: "Інше",
  repair: "Інше",
};

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("uk")
    .replace(/[’'`ʼ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
const stem = (value: string) =>
  normalize(value)
    .split(" ")
    .map((word) =>
      word.length > 4
        ? word.replace(
            /(?:ами|ями|ого|ому|ими|ою|ею|ах|ях|ів|їв|ей|ям|ам|ом|ем|а|я|у|ю|і|и|е|о)$/u,
            "",
          )
        : word,
    )
    .join(" ");

const nameIndex = new Map<string, CatalogItem>();
const aliasIndex = new Map<string, CatalogItem[]>();
for (const item of catalog.items) {
  nameIndex.set(normalize(item.name), item);
  for (const alias of item.aliases) {
    const key = normalize(alias);
    const entries = aliasIndex.get(key) ?? [];
    if (!entries.some((entry) => entry.id === item.id)) entries.push(item);
    aliasIndex.set(key, entries);
  }
}

const withoutQuantity = (value: string) =>
  normalize(value).replace(
    /^(?:\d+(?:[.,]\d+)?(?:\/\d+)?|\d+\/\d+|[¼½¾])\s+(?:кг|гр?|г|мл|л|шт|штук|зубчик|уп|пак|банка|пляшка|(?:ст|ч)\s*л)\s+/u,
    "",
  );

const boundaryContains = (haystack: string, needle: string) =>
  haystack === needle ||
  haystack.startsWith(`${needle} `) ||
  haystack.endsWith(` ${needle}`) ||
  haystack.includes(` ${needle} `);

function embeddedProducts(query: string): CatalogItem[] {
  const text = withoutQuantity(query);
  const stemmedText = stem(text);
  const matches: Array<{ item: CatalogItem; length: number }> = [];
  for (const item of catalog.items) {
    const names = [item.name, ...item.aliases].map(stem).filter(Boolean);
    const length = Math.max(
      0,
      ...names
        .filter((name) => boundaryContains(stemmedText, name))
        .map((name) => name.length),
    );
    if (length) matches.push({ item, length });
  }
  const longest = Math.max(0, ...matches.map(({ length }) => length));
  return matches
    .filter(({ length }) => length === longest)
    .map(({ item }) => item);
}

export function matchGroceryProducts(query: string): CatalogItem[] {
  const key = withoutQuantity(query);
  if (!key) return [];
  const exactName = nameIndex.get(key);
  if (exactName) return [exactName];
  const exactAliases = aliasIndex.get(key);
  if (exactAliases?.length) return exactAliases;
  return embeddedProducts(query);
}

function intentCategory(query: string): GroceryCategory | null {
  const text = normalize(query);
  const intents = catalog.categoryIntents
    .flatMap((intent: CatalogIntent) =>
      intent.queries.map((phrase) => ({ intent, phrase: normalize(phrase) })),
    )
    .filter(({ phrase }) => phrase && boundaryContains(text, phrase))
    .sort((a, b) => b.phrase.length - a.phrase.length);
  const categories = intents[0]?.intent.categoryIds ?? [];
  return categories.length === 1 ? (categoryMap[categories[0]] ?? null) : null;
}

export function groceryCatalogCategory(name: string): GroceryCategory {
  const matches = matchGroceryProducts(name);
  const matchedCategories = new Set(
    matches.map((item) => categoryMap[item.categoryId]).filter(Boolean),
  );
  if (matchedCategories.size === 1) return [...matchedCategories][0];
  return intentCategory(name) ?? groceryCategory(name);
}

export function groceryCatalogMatches(query: string, limit = 5): CatalogItem[] {
  const text = stem(withoutQuantity(query));
  if (!text) return [];
  const exact = matchGroceryProducts(query);
  const tokens = text.split(" ");
  const ranked = catalog.items
    .filter((item) => {
      const values = [item.name, ...item.aliases].map(stem);
      return values.some((value) =>
        tokens.every((token) => value.includes(token)),
      );
    })
    .sort((a, b) => {
      const aName = stem(a.name),
        bName = stem(b.name);
      return (
        Number(!aName.startsWith(text)) - Number(!bName.startsWith(text)) ||
        aName.localeCompare(bName, "uk")
      );
    });
  const combined = [...exact, ...ranked];
  return [...new Map(combined.map((item) => [item.id, item])).values()].slice(
    0,
    limit,
  );
}

export const groceryCatalogStats = {
  products: catalog.items.length,
  categories: catalog.categories.length,
  aliases: catalog.items.reduce(
    (count, item) => count + item.aliases.length,
    0,
  ),
};

export const groceryCatalogCategoryCoverage = Object.keys(categoryMap);
