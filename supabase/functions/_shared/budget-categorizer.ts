export type BudgetKind = "expense" | "income";

export const SKARBO_EXPENSE_CATEGORIES = [
  { id: "groceries", name: "Продукти", emoji: "🥑", color: "#22C55E" },
  { id: "travel", name: "Подорожі", emoji: "🧳", color: "#B88E56" },
  { id: "mortgage", name: "Іпотека", emoji: "🏠", color: "#4B83F2" },
  { id: "other", name: "Інше", emoji: "📦", color: "#D1D5DB" },
  { id: "fuel", name: "Паливо", emoji: "⛽", color: "#EF4444" },
  { id: "restaurants", name: "Ресторани", emoji: "🍽️", color: "#F59E0B" },
  { id: "currency", name: "Валюта", emoji: "💱", color: "#84CC16" },
  { id: "credit_card", name: "Кредитка", emoji: "🏷️", color: "#14B8A6" },
  { id: "clothes", name: "Одяг", emoji: "👕", color: "#A855F7" },
  { id: "home", name: "Дім", emoji: "🏡", color: "#FACC15" },
  { id: "flowers", name: "Квіти", emoji: "🌸", color: "#818CF8" },
  { id: "parking", name: "Парковка", emoji: "🅿️", color: "#FB923C" },
  { id: "car", name: "Авто", emoji: "🚗", color: "#9CA3AF" },
  { id: "haircut", name: "Стрижка", emoji: "✂️", color: "#EC4899" },
  { id: "subscriptions", name: "Підписки", emoji: "🔄", color: "#6366F1" },
  { id: "household_chem", name: "Побутова хімія", emoji: "🧴", color: "#2DD4BF" },
  { id: "health", name: "Здоров'я", emoji: "💊", color: "#F43F5E" },
  { id: "drinks", name: "Напої", emoji: "🥤", color: "#38BDF8" },
  { id: "pets", name: "Домашні улюбленці", emoji: "🐾", color: "#A16207" },
  { id: "kids", name: "Діти", emoji: "🧸", color: "#FBBF24" },
  { id: "entertainment", name: "Розваги", emoji: "🎬", color: "#FB7185" },
  { id: "smoking", name: "Куріння", emoji: "🚬", color: "#64748B" },
] as const;

export const SKARBO_INCOME_CATEGORIES = [
  { id: "salary", name: "Зарплата", emoji: "💼", color: "#22C55E" },
  { id: "refund", name: "Повернення", emoji: "↩️", color: "#A855F7" },
] as const;

export const INITIAL_BUDGET_SEED = {
  periodStart: "2026-08-01",
  periodEnd: "2026-11-17",
  currency: "UAH",
  expenses: [
    { categoryId: "groceries", amount: 71577.83, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "travel", amount: 55000.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "mortgage", amount: 35000.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "other", amount: 34242.92, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "fuel", amount: 28727.82, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "restaurants", amount: 27343.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "currency", amount: 20000.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "credit_card", amount: 13500.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "clothes", amount: 10465.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "home", amount: 9938.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "flowers", amount: 6080.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "parking", amount: 4800.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "car", amount: 2366.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "haircut", amount: 2100.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "subscriptions", amount: 1650.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "household_chem", amount: 1420.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "health", amount: 1280.2, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "drinks", amount: 940.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "pets", amount: 780.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "kids", amount: 560.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "entertainment", amount: 436.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
  ],
  incomes: [
    { categoryId: "salary", amount: 352042.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
    { categoryId: "refund", amount: 27820.0, note: "Імпорт зі Skarbo (серпень–листопад 2026)" },
  ],
} as const;

export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  other_expense: "other",
  coffee: "restaurants",
  auto: "fuel",
  taxi: "car",
  luna: "pets",
  leisure: "entertainment",
  other_income: "refund",
  freelance: "salary",
  gifts: "refund",
};

export function normalizeCategoryKey(
  key: string | null | undefined,
  kind: BudgetKind = "expense",
): string {
  if (!key) return kind === "income" ? "refund" : "other";
  return LEGACY_CATEGORY_MAP[key] ?? key;
}

export type DefaultBudgetCategory = {
  key: string;
  kind: BudgetKind;
  name: string;
  emoji: string;
  color: string;
  keywords: string[];
};

const EXPENSE_KEYWORDS: Record<string, string[]> = {
  groceries: [
    "silpo",
    "сільпо",
    "atb",
    "атб",
    "novus",
    "новус",
    "fora",
    "фора",
    "varus",
    "варус",
    "auchan",
    "ашан",
    "metro",
    "метро",
    "fozzy",
    "фоззі",
    "velmart",
    "велмарт",
    "mega market",
    "megamarket",
    "rukavychka",
    "рукавичка",
    "tavria",
    "таврія",
    "eko market",
    "еко маркет",
    "thrash",
    "траш",
    "goodwine",
    "wine time",
    "winetime",
    "roshen",
    "рошен",
    "galia baluvana",
    "галя балувана",
    "myaso",
    "м'ясо",
    "bakery",
    "пекарня",
    "milk",
    "молоко",
    "supermarket",
    "market",
    "product",
    "продукт",
  ],
  travel: [
    "booking",
    "букінг",
    "airbnb",
    "ryanair",
    "wizz",
    "skyup",
    "lufthansa",
    "lot",
    "hotel",
    "готель",
    "hostel",
    "хостел",
    "resort",
    "duty free",
    "airport",
    "аеропорт",
    "авіа",
    "подорож",
    "тур",
    "ukrzaliznytsia",
    "укрзалізниця",
    "intercity",
    "flixbus",
  ],
  mortgage: ["іпотека", "mortgage", "єоселя", "eoselia", "кредит житло"],
  fuel: [
    "okko",
    "окко",
    "wog",
    "вог",
    "socar",
    "сокар",
    "upg",
    "klo",
    "кло",
    "brsm",
    "брсм",
    "ukrnafta",
    "укрнафта",
    "anp",
    "shell",
    "шелл",
    "amic",
    "амік",
    "glusco",
    "azs",
    "азс",
    "пальне",
    "паливо",
    "бензин",
    "дизель",
  ],
  restaurants: [
    "diletant",
    "дилетант",
    "dubler",
    "дублер",
    "puzata hata",
    "пузата хата",
    "mcdonald",
    "макдональд",
    "kfc",
    "кфс",
    "burger",
    "бургер",
    "sushi",
    "суші",
    "pizza",
    "піца",
    "glovo",
    "глово",
    "bolt food",
    "cafe",
    "кафе",
    "bistro",
    "бістро",
    "restoran",
    "ресторан",
    "milk bar",
    "kompot",
    "компот",
    "chernomorka",
    "чорноморка",
    "shashlyk",
    "lviv croissants",
    "львівські круасани",
  ],
  currency: ["валюта", "обмін", "exchange", "currency", "wise", "revolut"],
  credit_card: ["кредитка", "credit card", "погашення кредиту", "кредитний ліміт"],
  clothes: [
    "zara",
    "зара",
    "bershka",
    "pull&bear",
    "stradivarius",
    "massimo",
    "reserved",
    "mohito",
    "sinsay",
    "cropp",
    "intertop",
    "інтертоп",
    "nike",
    "adidas",
    "puma",
    "new balance",
    "uniqlo",
    "h&m",
    "kasta",
    "answear",
    "milanomarket",
    "одяг",
    "взуття",
  ],
  home: [
    "epicentr",
    "epitsentr",
    "епіцентр",
    "jysk",
    "юск",
    "ikea",
    "ікеа",
    "leroy",
    "леруа",
    "nova poshta",
    "нова пошта",
    "novaposhta",
    "ukrposhta",
    "укрпошта",
    "комунал",
    "yasno",
    "ясно",
    "kyivstar",
    "київстар",
    "vodafone",
    "водафон",
    "lifecell",
    "лайфсел",
    "інтернет",
    "оренда",
    "rent",
    "дім",
    "rozetka",
    "розетка",
    "comfy",
    "комфі",
  ],
  flowers: ["квіти", "flower", "buket", "букет", "lorashen", "flora", "флора"],
  parking: ["parking", "паркінг", "парковка", "kyiv digital", "київ цифровий"],
  car: [
    "uklon",
    "уклон",
    "bolt",
    "болт",
    "uber",
    "убер",
    "taxi",
    "таксі",
    "sto",
    "сто",
    "autoservice",
    "автосервіс",
    "мийка",
    "carwash",
    "шиномонтаж",
    "авто",
  ],
  haircut: ["стрижка", "barber", "барбер", "перукарня", "салон краси", "hair", "manicure"],
  subscriptions: [
    "apple.com/bill",
    "apple bill",
    "icloud",
    "app store",
    "netflix",
    "spotify",
    "youtube",
    "google play",
    "megogo",
    "мегого",
    "sweet.tv",
    "patreon",
    "chatgpt",
    "підписк",
  ],
  household_chem: [
    "eva",
    "єва",
    "prostor",
    "простор",
    "watsons",
    "ватсонс",
    "aurora",
    "avrora",
    "аврора",
    "побутова хімія",
    "brocard",
    "makeup",
  ],
  health: [
    "apteka",
    "аптека",
    "anc",
    "анц",
    "podorozhnyk",
    "подорожник",
    "911",
    "bazhayemo",
    "бажаємо здоров",
    "dobrobut",
    "добробут",
    "synevo",
    "сінево",
    "dila",
    "діла",
    "invitro",
    "medikom",
    "медіком",
    "oberig",
    "оберіг",
    "stomat",
    "стомат",
    "dental",
    "clinic",
    "клініка",
    "pharma",
    "фарма",
    "лікар",
    "аналіз",
  ],
  drinks: [
    "idealist",
    "ідеаліст",
    "aroma kava",
    "арома кава",
    "francua",
    "франсуа",
    "coffee",
    "kava",
    "кава",
    "кав'ярня",
    "starbucks",
    "bar",
    "бар",
    "pub",
    "паб",
    "напої",
    "tea",
    "чай",
    "matcha",
  ],
  pets: [
    "masterzoo",
    "майстерзу",
    "e-zoo",
    "ezoo",
    "pethome",
    "zoobonus",
    "зообонус",
    "zoolux",
    "зоолюкс",
    "zoo",
    "зоо",
    "vet",
    "вет",
    "ветеринар",
    "groom",
    "грумінг",
    "луна",
    "корм",
    "кіт",
    "киця",
  ],
  kids: ["дитячий світ", "antoshka", "антошка", "будинок іграшок", "pampers", "діти", "іграшк"],
  entertainment: [
    "steam",
    "playstation",
    "xbox",
    "multiplex",
    "мультиплекс",
    "planeta kino",
    "планета кіно",
    "oskar",
    "кіно",
    "театр",
    "музей",
    "концерт",
    "concert",
    "karabas",
    "concert.ua",
    "yakaboo",
    "книгарня",
    "sportlife",
    "спортлайф",
    "gym",
    "фітнес",
  ],
  smoking: [
    "iqos",
    "glo",
    "vape",
    "вейп",
    "elfbar",
    "elf bar",
    "ploom",
    "heets",
    "terea",
    "tobacco",
    "табак",
    "тютюн",
    "сигарет",
    "кальян",
    "hookah",
    "smoke",
    "курін",
  ],
  other: [],
};

const INCOME_KEYWORDS: Record<string, string[]> = {
  salary: ["зарплата", "salary", "аванс", "виплата", "фриланс", "freelance", "фоп", "upwork"],
  refund: ["повернення", "refund", "кешбек", "cashback", "бонус", "подарунок", "відсотки"],
};

export const DEFAULT_EXPENSE_CATEGORIES: DefaultBudgetCategory[] =
  SKARBO_EXPENSE_CATEGORIES.map((cat) => ({
    key: cat.id,
    kind: "expense",
    name: cat.name,
    emoji: cat.emoji,
    color: cat.color,
    keywords: EXPENSE_KEYWORDS[cat.id] ?? [],
  }));

export const DEFAULT_INCOME_CATEGORIES: DefaultBudgetCategory[] =
  SKARBO_INCOME_CATEGORIES.map((cat) => ({
    key: cat.id,
    kind: "income",
    name: cat.name,
    emoji: cat.emoji,
    color: cat.color,
    keywords: INCOME_KEYWORDS[cat.id] ?? [],
  }));

export const ALL_DEFAULT_BUDGET_CATEGORIES: DefaultBudgetCategory[] = [
  ...DEFAULT_EXPENSE_CATEGORIES,
  ...DEFAULT_INCOME_CATEGORIES,
];

export type MerchantRuleLike = {
  merchant_pattern: string;
  normalized_pattern?: string;
  category_key: string;
  kind?: BudgetKind;
};

export function normalizeMerchantName(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’'`"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function suggestRulePattern(raw: string): string {
  const cleaned = raw
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const stripped = cleaned
    .replace(/\s+(?:UA|UKR|KYIV|LVIV|ODESA|DNIPRO|KHARKIV)$/i, "")
    .replace(/(?:\s*[-#*/]\s*\d{2,})+$/g, "")
    .replace(/\s+#\d+$/g, "")
    .trim();
  return (stripped || cleaned).slice(0, 100);
}

export function parseApplePayAmount(raw: unknown): number | null {
  if (typeof raw === "number") {
    const abs = Math.abs(raw);
    if (!Number.isFinite(abs) || abs <= 0 || abs >= 100_000_000) return null;
    return Math.round(abs * 100) / 100;
  }
  if (typeof raw !== "string") return null;
  let text = raw
    .normalize("NFKC")
    .replace(/[\u00a0\u202f\u2007\u200b]/g, " ")
    .replace(/(?:uah|грн|usd|eur|pln|zł|gbp|₴|\$|€|£)/gi, "")
    .replace(/[^\d.,+\-\s]/g, "")
    .trim();
  if (!text) return null;
  text = text.replace(/\s+/g, "");
  while (text.startsWith("-") || text.startsWith("+")) {
    text = text.slice(1);
  }
  if (!text) return null;

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  let normalized = text;
  if (hasComma && hasDot) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      normalized = text.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = text.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = text.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = `${parts[0]}.${parts[1]}`;
    } else {
      normalized = text.replace(/,/g, "");
    }
  }
  const value = Math.abs(Number(normalized));
  if (!Number.isFinite(value) || value <= 0 || value >= 100_000_000) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

export function matchMerchantRule(
  merchant: string,
  rules: MerchantRuleLike[],
  kind: BudgetKind = "expense",
): MerchantRuleLike | null {
  const norm = normalizeMerchantName(merchant);
  if (!norm) return null;

  const filtered = rules.filter((r) => !r.kind || r.kind === kind);
  let bestMatch: { rule: MerchantRuleLike; score: number } | null = null;

  for (const rule of filtered) {
    const pattern = normalizeMerchantName(
      rule.normalized_pattern || rule.merchant_pattern,
    );
    if (!pattern) continue;
    if (norm === pattern) {
      const score = 10_000 + pattern.length;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { rule, score };
      }
      continue;
    }
    if (norm.includes(pattern) || pattern.includes(norm)) {
      const score = Math.min(norm.length, pattern.length);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { rule, score };
      }
    }
  }

  return bestMatch?.rule ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesDictionaryKeyword(normMerchant: string, kwNorm: string): boolean {
  if (!kwNorm) return false;
  if (kwNorm.length <= 5) {
    const re = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegExp(kwNorm)}(?=$|[^\\p{L}\\p{N}])`,
      "u",
    );
    return re.test(normMerchant);
  }
  return normMerchant.includes(kwNorm);
}

export function categorizeMerchantFromDictionary(
  merchant: string,
  kind: BudgetKind = "expense",
): string | null {
  const norm = normalizeMerchantName(merchant);
  if (!norm) return null;
  const list =
    kind === "income"
      ? DEFAULT_INCOME_CATEGORIES
      : DEFAULT_EXPENSE_CATEGORIES;

  let best: { key: string; len: number } | null = null;
  for (const cat of list) {
    for (const kw of cat.keywords) {
      const kwNorm = normalizeMerchantName(kw);
      if (matchesDictionaryKeyword(norm, kwNorm)) {
        if (!best || kwNorm.length > best.len) {
          best = { key: cat.key, len: kwNorm.length };
        }
      }
    }
  }
  return best?.key ?? null;
}

export function autoCategorizeMerchant(
  merchant: string,
  rules: MerchantRuleLike[],
  kind: BudgetKind = "expense",
): {
  category_key: string | null;
  matched_by: "rule" | "dictionary" | "none";
} {
  const ruleMatch = matchMerchantRule(merchant, rules, kind);
  if (ruleMatch) {
    return {
      category_key: normalizeCategoryKey(ruleMatch.category_key, kind),
      matched_by: "rule",
    };
  }
  const dictMatch = categorizeMerchantFromDictionary(merchant, kind);
  if (dictMatch) {
    return { category_key: dictMatch, matched_by: "dictionary" };
  }
  return { category_key: null, matched_by: "none" };
}
