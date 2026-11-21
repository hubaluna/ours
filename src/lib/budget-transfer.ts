import {
  autoCategorizeMerchant,
  findCategoryMeta,
  normalizeCategoryKey,
  normalizeMerchantName,
  parseApplePayAmount,
  resolveBudgetCategories,
  type BudgetKind,
  type MerchantRuleLike,
} from "./budget";
import type {
  BudgetCategory,
  BudgetMerchantRule,
  BudgetTransaction,
  BudgetTransactionSource,
  BudgetTransactionStatus,
} from "./types";
import { kyivDate } from "./utils";

export const MAX_BUDGET_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_BUDGET_IMPORT_ROWS = 5000;

export type BudgetImportFormat =
  | "ours_json"
  | "ours_csv"
  | "monobank_csv"
  | "privatbank_csv"
  | "bank_csv";

export type BudgetImportFormatMeta = {
  id: BudgetImportFormat;
  label: string;
};

export const BUDGET_IMPORT_FORMAT_LABELS: Record<BudgetImportFormat, string> = {
  ours_json: "Резервна копія ours. (JSON)",
  ours_csv: "Таблиця ours. (CSV)",
  monobank_csv: "Виписка Monobank (CSV)",
  privatbank_csv: "Виписка ПриватБанк (CSV)",
  bank_csv: "Банківська виписка / CSV",
};

export type BudgetBackupTransaction = {
  id?: string;
  kind: BudgetKind;
  amount: number;
  merchant: string;
  note: string;
  category_key: string | null;
  category_name?: string;
  status?: BudgetTransactionStatus;
  source?: BudgetTransactionSource;
  is_private?: boolean;
  card_label?: string;
  occurred_on: string;
  occurred_at?: string;
};

export type BudgetBackupPayload = {
  format: "ours-budget-backup";
  version: 1;
  exportedAt: string;
  transactions: BudgetBackupTransaction[];
  categories: Array<{
    id: string;
    kind: BudgetKind;
    name: string;
    emoji: string;
    sort_order: number;
  }>;
  merchantRules: Array<{
    merchant_pattern: string;
    category_key: string;
    kind: BudgetKind;
  }>;
};

export type ParsedBudgetImportRow = {
  tempId: string;
  originalId?: string;
  kind: BudgetKind;
  amount: number;
  merchant: string;
  note: string;
  category_key: string;
  status: BudgetTransactionStatus;
  source: BudgetTransactionSource;
  is_private?: boolean;
  card_label: string;
  occurred_on: string;
  occurred_at: string;
  mcc?: string;
  duplicate: boolean;
  isTransfer: boolean;
  categorizedBy: "backup" | "rule" | "dictionary" | "mcc" | "bank_category" | "fallback";
};

export type BudgetImportParseResult = {
  format: BudgetImportFormat;
  formatLabel: string;
  rows: ParsedBudgetImportRow[];
  merchantRules: Array<{
    merchant_pattern: string;
    category_key: string;
    kind: BudgetKind;
  }>;
  skippedInvalid: number;
  truncated: boolean;
};

const MCC_CATEGORY_MAP: Record<string, string> = {
  // Groceries & food stores
  "5411": "groceries",
  "5422": "groceries",
  "5441": "groceries",
  "5451": "groceries",
  "5462": "groceries",
  "5499": "groceries",
  // Restaurants, cafes, fast food, bars
  "5811": "restaurants",
  "5812": "restaurants",
  "5813": "drinks",
  "5814": "restaurants",
  // Drinks & liquor
  "5921": "drinks",
  // Fuel & gas stations
  "5541": "fuel",
  "5542": "fuel",
  "5983": "fuel",
  // Auto, taxi, car services, tolls
  "4121": "car",
  "5511": "car",
  "5521": "car",
  "5531": "car",
  "5532": "car",
  "5533": "car",
  "7531": "car",
  "7534": "car",
  "7535": "car",
  "7538": "car",
  "7542": "car",
  // Parking
  "7523": "parking",
  // Health & pharmacies
  "5912": "health",
  "8011": "health",
  "8021": "health",
  "8031": "health",
  "8041": "health",
  "8042": "health",
  "8043": "health",
  "8049": "health",
  "8062": "health",
  "8071": "health",
  "8099": "health",
  // Clothes & shoes
  "5611": "clothes",
  "5621": "clothes",
  "5631": "clothes",
  "5651": "clothes",
  "5655": "clothes",
  "5661": "clothes",
  "5681": "clothes",
  "5691": "clothes",
  "5699": "clothes",
  "5948": "clothes",
  // Kids
  "5641": "kids",
  "5945": "kids",
  "8351": "kids",
  // Flowers
  "5992": "flowers",
  // Smoking / tobacco / vape
  "5993": "smoking",
  // Pets
  "5995": "pets",
  "0742": "pets",
  // Haircut & beauty salons
  "7230": "haircut",
  "7298": "haircut",
  // Household chemistry & cosmetics
  "5977": "household_chem",
  "5300": "household_chem",
  // Home, hardware, furniture, utilities
  "4900": "home",
  "5200": "home",
  "5211": "home",
  "5231": "home",
  "5251": "home",
  "5261": "home",
  "5712": "home",
  "5713": "home",
  "5714": "home",
  "5718": "home",
  "5719": "home",
  "5722": "home",
  "5732": "home",
  // Travel, airlines, rail, hotels
  "3000": "travel",
  "4111": "travel",
  "4112": "travel",
  "4131": "travel",
  "4411": "travel",
  "4511": "travel",
  "4722": "travel",
  "7011": "travel",
  "7512": "travel",
  // Subscriptions, telecom, digital services
  "4812": "subscriptions",
  "4814": "subscriptions",
  "4816": "subscriptions",
  "4899": "subscriptions",
  "5734": "subscriptions",
  "5815": "subscriptions",
  "5816": "subscriptions",
  "5817": "subscriptions",
  "5818": "subscriptions",
  // Entertainment, cinema, sports, books
  "5941": "entertainment",
  "5942": "entertainment",
  "7832": "entertainment",
  "7911": "entertainment",
  "7922": "entertainment",
  "7929": "entertainment",
  "7933": "entertainment",
  "7941": "entertainment",
  "7991": "entertainment",
  "7996": "entertainment",
  "7997": "entertainment",
  "7999": "entertainment",
  // Currency exchange
  "6051": "currency",
};

const BANK_CATEGORY_HINTS: Array<{ match: RegExp; key: string }> = [
  { match: /продукт|супермаркет|grocer|food|їжа/i, key: "groceries" },
  { match: /кафе|ресторан|фастфуд|dining|restaurant|кав['’]?ярн/i, key: "restaurants" },
  { match: /азс|палив|бензин|fuel|gas/i, key: "fuel" },
  { match: /аптек|медиц|здоров|лікар|health|pharm/i, key: "health" },
  { match: /одяг|взутт|cloth|fashion|apparel/i, key: "clothes" },
  { match: /подорож|готел|авіа|залізн|укрзаліз|travel|hotel|flight/i, key: "travel" },
  { match: /таксі|авто|транспорт|car|auto|taxi/i, key: "car" },
  { match: /парков|parking/i, key: "parking" },
  { match: /квіт|flower|florist/i, key: "flowers" },
  { match: /тютюн|курін|вейп|tobacco|smoke|vape/i, key: "smoking" },
  { match: /тварин|зоо|вет|pet/i, key: "pets" },
  { match: /діт|дитяч|іграшк|kid|child|toy/i, key: "kids" },
  { match: /краса|стрижк|барбер|салон|beauty|salon/i, key: "haircut" },
  { match: /побут.*хім|косметик|drogerie|household/i, key: "household_chem" },
  { match: /дім|комунал|ремонт|мебл|буд|home|utilit/i, key: "home" },
  { match: /підписк|зв['’]?язок|інтернет|телеком|subscr|telecom|digital/i, key: "subscriptions" },
  { match: /розваг|кіно|спорт|книг|дозвілл|entertain|cinema|sport/i, key: "entertainment" },
  { match: /напої|алкогол|бар|drink|alcohol/i, key: "drinks" },
  { match: /валют|обмін|currency|exchange/i, key: "currency" },
  { match: /іпотек|mortgage/i, key: "mortgage" },
  { match: /кредит|credit/i, key: "credit_card" },
  { match: /зарплат|salary|дохід|виплат/i, key: "salary" },
  { match: /повернен|кешбек|cashback|refund/i, key: "refund" },
];

const INTERNAL_TRANSFER_PATTERNS = [
  /переказ\s+(між\s+своїми|на\s+свою|зі\s+своєї)/i,
  /перевод\s+(между\s+своими|на\s+свою|со\s+своей)/i,
  /з\s+(білої|чорної|валютної|євро|доларової)\s+картк/i,
  /на\s+(білу|чорну|валютну|євро|доларову)\s+картк/i,
  /(на|з)\s+банк[уи]\b/i,
  /поповнення\s+(банки|своєї\s+картки)/i,
  /зняття\s+з\s+банки/i,
  /transfer\s+between\s+own/i,
  /own\s+card\s+transfer/i,
];

function isLikelyInternalTransfer(merchant: string, note: string): boolean {
  const combined = `${merchant} ${note}`.trim();
  if (!combined) return false;
  return INTERNAL_TRANSFER_PATTERNS.some((re) => re.test(combined));
}

function escapeCsvCell(value: string, protectFormula = true): string {
  let text = String(value ?? "");
  if (protectFormula && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildBudgetExportJson(params: {
  transactions: BudgetTransaction[];
  customCategories: BudgetCategory[];
  merchantRules: BudgetMerchantRule[];
  userId: string;
}): BudgetBackupPayload {
  const visibleTxs = params.transactions
    .filter((tx) => !tx.is_private || tx.user_id === params.userId)
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));

  return {
    format: "ours-budget-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions: visibleTxs.map((tx) => {
      const meta = findCategoryMeta(
        tx.category_key,
        params.customCategories,
        tx.kind,
      );
      return {
        id: tx.id,
        kind: tx.kind,
        amount: Number(tx.amount),
        merchant: tx.merchant,
        note: tx.note ?? "",
        category_key: tx.category_key,
        category_name: meta.name,
        status: tx.status,
        source: tx.source,
        is_private: tx.is_private,
        card_label: tx.card_label ?? "",
        occurred_on: tx.occurred_on,
        occurred_at: tx.occurred_at,
      };
    }),
    categories: params.customCategories.map((cat) => ({
      id: cat.id,
      kind: cat.kind,
      name: cat.name,
      emoji: cat.emoji,
      sort_order: cat.sort_order,
    })),
    merchantRules: params.merchantRules.map((rule) => ({
      merchant_pattern: rule.merchant_pattern,
      category_key: rule.category_key,
      kind: rule.kind,
    })),
  };
}

export function buildBudgetExportCsv(params: {
  transactions: BudgetTransaction[];
  customCategories: BudgetCategory[];
  userId: string;
}): string {
  const visibleTxs = params.transactions
    .filter((tx) => !tx.is_private || tx.user_id === params.userId)
    .sort(
      (a, b) =>
        b.occurred_on.localeCompare(a.occurred_on) ||
        (b.occurred_at || "").localeCompare(a.occurred_at || ""),
    );

  const header = [
    "Дата",
    "Час",
    "Тип",
    "Сума",
    "Категорія",
    "Код категорії",
    "Продавець",
    "Примітка",
    "Картка",
    "Приватна",
  ];

  const lines = [header.join(",")];
  for (const tx of visibleTxs) {
    const meta = findCategoryMeta(
      tx.category_key,
      params.customCategories,
      tx.kind,
    );
    const timePart =
      tx.occurred_at && tx.occurred_at.includes("T")
        ? tx.occurred_at.slice(11, 19)
        : "12:00:00";
    const signedAmount =
      tx.kind === "expense"
        ? `-${Math.abs(Number(tx.amount)).toFixed(2)}`
        : Math.abs(Number(tx.amount)).toFixed(2);
    const row = [
      escapeCsvCell(tx.occurred_on, false),
      escapeCsvCell(timePart, false),
      escapeCsvCell(tx.kind === "income" ? "Дохід" : "Витрата", false),
      escapeCsvCell(signedAmount, false),
      escapeCsvCell(meta.name, true),
      escapeCsvCell(tx.category_key ?? "", true),
      escapeCsvCell(tx.merchant, true),
      escapeCsvCell(tx.note ?? "", true),
      escapeCsvCell(tx.card_label ?? "", true),
      escapeCsvCell(tx.is_private ? "Так" : "Ні", false),
    ];
    lines.push(row.join(","));
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function downloadOrShareBudgetFile(params: {
  content: string;
  fileName: string;
  mimeType: string;
  shareTitle: string;
}): Promise<"shared" | "downloaded"> {
  const blob = new Blob([params.content], { type: params.mimeType });
  const file = new File([blob], params.fileName, { type: params.mimeType });

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title: params.shareTitle,
        files: [file],
      });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "shared";
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = params.fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}

export function decodeImportBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      text = new TextDecoder("windows-1251").decode(bytes);
    } catch {
      text = new TextDecoder("utf-8").decode(bytes);
    }
  }
  return text.replace(/^\uFEFF/, "");
}

function detectDelimiter(sampleLines: string[]): string {
  const candidates = [";", ",", "\t"];
  let bestDelim = ",";
  let bestScore = -1;

  for (const delim of candidates) {
    let score = 0;
    for (const line of sampleLines) {
      let inQuotes = false;
      let count = 0;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') inQuotes = !inQuotes;
        else if (!inQuotes && ch === delim) count++;
      }
      if (count > 0) score += count;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDelim = delim;
    }
  }
  return bestDelim;
}

export function parseCsvTable(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const sampleLines = normalized
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(0, 6);
  if (sampleLines.length === 0) return [];

  const delimiter = detectDelimiter(sampleLines);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) {
    rows.push(row);
  }
  return rows;
}

function parseFlexibleDate(
  dateRaw: string,
  timeRaw?: string,
): { occurred_on: string; occurred_at: string } | null {
  const combined = `${dateRaw ?? ""} ${timeRaw ?? ""}`.trim();
  if (!combined) return null;

  // ISO: YYYY-MM-DD[T| ]HH:mm[:ss]
  const isoMatch = combined.match(
    /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const occurred_on = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const hh = isoMatch[4] ? String(Math.min(23, Number(isoMatch[4]))).padStart(2, "0") : "12";
      const mm = isoMatch[5] ? String(Math.min(59, Number(isoMatch[5]))).padStart(2, "0") : "00";
      const ss = isoMatch[6] ? String(Math.min(59, Number(isoMatch[6]))).padStart(2, "0") : "00";
      return {
        occurred_on,
        occurred_at: `${occurred_on}T${hh}:${mm}:${ss}.000Z`,
      };
    }
  }

  // European / Ukrainian: DD.MM.YYYY [HH:mm[:ss]] or DD/MM/YYYY
  const euMatch = combined.match(
    /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (euMatch) {
    const day = Number(euMatch[1]);
    const month = Number(euMatch[2]);
    let year = Number(euMatch[3]);
    if (year < 100) year += 2000;
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const occurred_on = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const hh = euMatch[4] ? String(Math.min(23, Number(euMatch[4]))).padStart(2, "0") : "12";
      const mm = euMatch[5] ? String(Math.min(59, Number(euMatch[5]))).padStart(2, "0") : "00";
      const ss = euMatch[6] ? String(Math.min(59, Number(euMatch[6]))).padStart(2, "0") : "00";
      return {
        occurred_on,
        occurred_at: `${occurred_on}T${hh}:${mm}:${ss}.000Z`,
      };
    }
  }

  return null;
}

function parseSignedAmount(raw: unknown): { signed: number; abs: number } | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw === 0) return null;
    const rounded = Math.round(raw * 100) / 100;
    const abs = Math.abs(rounded);
    if (abs <= 0 || abs >= 100_000_000) return null;
    return { signed: rounded, abs };
  }
  const str = String(raw ?? "").trim();
  if (!str) return null;
  const isNeg = /^[\s]*[-−–]/.test(str) || /\(.*\)/.test(str);
  const absVal = parseApplePayAmount(str.replace(/^[-−–+\s]+/, ""));
  if (absVal === null || absVal <= 0 || absVal >= 100_000_000) return null;
  const abs = Math.round(absVal * 100) / 100;
  return { signed: isNeg ? -abs : abs, abs };
}

function makeTxFingerprint(
  occurredOn: string,
  kind: BudgetKind,
  amount: number,
  merchant: string,
): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const normMerchant = normalizeMerchantName(merchant).slice(0, 64);
  return `${occurredOn}|${kind}|${cents}|${normMerchant}`;
}

function makeMinuteFingerprint(
  occurredAt: string,
  kind: BudgetKind,
  amount: number,
): string | null {
  if (!occurredAt || occurredAt.length < 16) return null;
  const cents = Math.round(Math.abs(amount) * 100);
  return `${occurredAt.slice(0, 16)}|${kind}|${cents}`;
}

function buildCategoryResolver(customCategories: BudgetCategory[]) {
  const all = resolveBudgetCategories(customCategories);
  const validKeys = new Set(all.map((c) => c.key));
  const byName = new Map<string, string>();
  for (const cat of all) {
    byName.set(cat.name.toLowerCase().trim(), cat.key);
  }
  return { validKeys, byName };
}

function resolveImportCategory(params: {
  explicitKey?: string | null;
  explicitName?: string | null;
  merchant: string;
  mcc?: string;
  kind: BudgetKind;
  rules: MerchantRuleLike[];
  validKeys: Set<string>;
  byName: Map<string, string>;
}): { category_key: string; categorizedBy: ParsedBudgetImportRow["categorizedBy"] } {
  const { explicitKey, explicitName, merchant, mcc, kind, rules, validKeys, byName } =
    params;

  if (explicitKey) {
    const trimmed = explicitKey.trim();
    if (validKeys.has(trimmed)) {
      return { category_key: trimmed, categorizedBy: "backup" };
    }
    const normalized = normalizeCategoryKey(trimmed, kind);
    if (validKeys.has(normalized) && normalized !== (kind === "income" ? "refund" : "other")) {
      return { category_key: normalized, categorizedBy: "backup" };
    }
  }

  if (explicitName) {
    const exactByName = byName.get(explicitName.toLowerCase().trim());
    if (exactByName) {
      return { category_key: exactByName, categorizedBy: "backup" };
    }
  }

  const auto = autoCategorizeMerchant(merchant, rules, kind);
  if (auto.category_key && auto.matched_by === "rule") {
    return {
      category_key: normalizeCategoryKey(auto.category_key, kind),
      categorizedBy: "rule",
    };
  }
  if (auto.category_key && auto.matched_by === "dictionary") {
    return {
      category_key: normalizeCategoryKey(auto.category_key, kind),
      categorizedBy: "dictionary",
    };
  }

  if (kind === "expense" && mcc) {
    const cleanMcc = mcc.replace(/\D/g, "").slice(0, 4);
    const mccHit = MCC_CATEGORY_MAP[cleanMcc];
    if (mccHit) {
      return { category_key: mccHit, categorizedBy: "mcc" };
    }
  }

  if (explicitName) {
    for (const hint of BANK_CATEGORY_HINTS) {
      if (hint.match.test(explicitName)) {
        if (kind === "income" && hint.key !== "salary" && hint.key !== "refund") {
          continue;
        }
        return { category_key: hint.key, categorizedBy: "bank_category" };
      }
    }
  }

  return {
    category_key: kind === "income" ? "refund" : "other",
    categorizedBy: "fallback",
  };
}

function stripCsvFormulaQuote(value: string): string {
  return value.startsWith("'") && /^'[=+\-@]/.test(value)
    ? value.slice(1)
    : value;
}

export function parseBudgetImportContent(params: {
  text: string;
  fileName?: string;
  existingTransactions: BudgetTransaction[];
  customCategories: BudgetCategory[];
  merchantRules: MerchantRuleLike[];
}): BudgetImportParseResult {
  const { text, existingTransactions, customCategories, merchantRules } = params;
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    throw new Error("Файл порожній.");
  }

  const existingIds = new Set(existingTransactions.map((tx) => tx.id));
  const existingFingerprints = new Set(
    existingTransactions.map((tx) =>
      makeTxFingerprint(tx.occurred_on, tx.kind, tx.amount, tx.merchant),
    ),
  );
  const existingMinutePrints = new Set<string>();
  for (const tx of existingTransactions) {
    // Only use minute precision when timestamp has non-default time (not 12:00:00 placeholder)
    if (tx.occurred_at && !tx.occurred_at.includes("T12:00:00")) {
      const fp = makeMinuteFingerprint(tx.occurred_at, tx.kind, tx.amount);
      if (fp) existingMinutePrints.add(fp);
    }
  }

  const { validKeys, byName } = buildCategoryResolver(customCategories);

  // 1. Try JSON backup format first
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("Не вдалося прочитати JSON-файл. Перевірте формат файлу.");
    }

    const rawObj =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    const rawList = Array.isArray(parsed)
      ? parsed
      : Array.isArray(rawObj?.transactions)
        ? rawObj.transactions
        : Array.isArray(rawObj?.budgetTransactions)
          ? rawObj.budgetTransactions
          : Array.isArray((rawObj?.data as Record<string, unknown> | undefined)?.budgetTransactions)
            ? ((rawObj?.data as Record<string, unknown>).budgetTransactions as unknown[])
            : null;

    if (!rawList) {
      throw new Error("У JSON-файлі не знайдено списку транзакцій.");
    }

    const truncated = rawList.length > MAX_BUDGET_IMPORT_ROWS;
    const slice = rawList.slice(0, MAX_BUDGET_IMPORT_ROWS);
    const rows: ParsedBudgetImportRow[] = [];
    let skippedInvalid = 0;

    slice.forEach((item, idx) => {
      if (!item || typeof item !== "object") {
        skippedInvalid++;
        return;
      }
      const rec = item as Record<string, unknown>;
      const amountParsed = parseSignedAmount(rec.amount);
      if (!amountParsed) {
        skippedInvalid++;
        return;
      }
      const rawKind = String(rec.kind ?? "").toLowerCase();
      const kind: BudgetKind =
        rawKind === "income" || rawKind === "дохід"
          ? "income"
          : rawKind === "expense" || rawKind === "витрата"
            ? "expense"
            : amountParsed.signed > 0 && rawKind === ""
              ? "expense"
              : "expense";

      const dateParsed = parseFlexibleDate(
        String(rec.occurred_on ?? rec.date ?? rec.occurred_at ?? ""),
      ) ?? {
        occurred_on: kyivDate(),
        occurred_at: new Date().toISOString(),
      };
      const occurred_at =
        typeof rec.occurred_at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(rec.occurred_at)
          ? rec.occurred_at
          : dateParsed.occurred_at;

      const merchant = String(rec.merchant ?? rec.title ?? rec.name ?? "")
        .trim()
        .slice(0, 160);
      const note = String(rec.note ?? rec.comment ?? "").trim().slice(0, 500);
      const card_label = String(rec.card_label ?? rec.card ?? "").trim().slice(0, 60);

      const resolved = resolveImportCategory({
        explicitKey: typeof rec.category_key === "string" ? rec.category_key : null,
        explicitName: typeof rec.category_name === "string" ? rec.category_name : null,
        merchant: merchant || note,
        kind,
        rules: merchantRules,
        validKeys,
        byName,
      });

      const finalMerchant =
        merchant ||
        findCategoryMeta(resolved.category_key, customCategories, kind).name;
      const originalId =
        typeof rec.id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          rec.id,
        )
          ? rec.id
          : undefined;

      const fp = makeTxFingerprint(
        dateParsed.occurred_on,
        kind,
        amountParsed.abs,
        finalMerchant,
      );
      const duplicate =
        (originalId ? existingIds.has(originalId) : false) ||
        existingFingerprints.has(fp);

      rows.push({
        tempId: `imp-${idx}`,
        originalId,
        kind,
        amount: amountParsed.abs,
        merchant: finalMerchant,
        note,
        category_key: resolved.category_key,
        status: rec.status === "needs_review" ? "needs_review" : "confirmed",
        source: rec.source === "apple_pay" ? "apple_pay" : "manual",
        is_private:
          typeof rec.is_private === "boolean" ? rec.is_private : undefined,
        card_label,
        occurred_on: dateParsed.occurred_on,
        occurred_at,
        duplicate,
        isTransfer: isLikelyInternalTransfer(finalMerchant, note),
        categorizedBy: resolved.categorizedBy,
      });
    });

    const rawRules = Array.isArray(rawObj?.merchantRules)
      ? rawObj.merchantRules
      : Array.isArray(rawObj?.budgetMerchantRules)
        ? rawObj.budgetMerchantRules
        : [];
    const importedRules = rawRules
      .filter(
        (r): r is { merchant_pattern: string; category_key: string; kind?: string } =>
          Boolean(
            r &&
              typeof r === "object" &&
              typeof (r as Record<string, unknown>).merchant_pattern === "string" &&
              typeof (r as Record<string, unknown>).category_key === "string",
          ),
      )
      .map((r) => ({
        merchant_pattern: r.merchant_pattern.trim().slice(0, 120),
        category_key: normalizeCategoryKey(
          r.category_key,
          r.kind === "income" ? "income" : "expense",
        ),
        kind: (r.kind === "income" ? "income" : "expense") as BudgetKind,
      }))
      .filter((r) => r.merchant_pattern.length > 0);

    return {
      format: "ours_json",
      formatLabel: BUDGET_IMPORT_FORMAT_LABELS.ours_json,
      rows,
      merchantRules: importedRules,
      skippedInvalid,
      truncated,
    };
  }

  // 2. Parse CSV (Monobank, PrivatBank, ours. CSV, or generic bank CSV)
  const table = parseCsvTable(trimmed);
  if (table.length < 2) {
    throw new Error("У CSV-файлі замало рядків. Потрібні заголовки та хоча б одна операція.");
  }

  // Find header row (some bank exports put 1-2 metadata lines before the actual header)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, table.length); i++) {
    const joined = table[i].join(" ").toLowerCase();
    if (
      /(дата|date)/.test(joined) &&
      /(сума|amount|деталі|опис|продавець|description|merchant|категорія)/.test(joined)
    ) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = table[headerRowIdx].map((h) =>
    h.toLowerCase().replace(/\s+/g, " ").trim(),
  );
  const headerJoined = headers.join(" | ");

  const findCol = (patterns: RegExp[]): number => {
    for (const pattern of patterns) {
      const idx = headers.findIndex((h) => pattern.test(h));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  let format: BudgetImportFormat = "bank_csv";
  if (
    headers.some((h) => /код категорії/.test(h)) &&
    headers.some((h) => /продавець/.test(h))
  ) {
    format = "ours_csv";
  } else if (
    /дата [iі] час операції|date and time/.test(headerJoined) &&
    /mcc|деталі операції|сума в валюті картки/.test(headerJoined)
  ) {
    format = "monobank_csv";
  } else if (
    headers.some((h) => /^картка$|^card$/.test(h)) &&
    headers.some((h) => /опис операції|призначення/.test(h))
  ) {
    format = "privatbank_csv";
  }

  const dateCol = findCol([
    /дата [iі] час/,
    /date and time/,
    /^дата/,
    /^date/,
    /час операції/,
  ]);
  const timeCol = findCol([/^час$/, /^time$/]);
  const amountCol = findCol([
    /сума в валюті картки/,
    /card currency amount/,
    /сума операції/,
    /^сума/,
    /^amount/,
    /витрат|дебет/,
  ]);
  const merchantCol = findCol([
    /^продавець$/,
    /деталі операції/,
    /опис операції/,
    /контрагент/,
    /призначення/,
    /merchant/,
    /description/,
    /опис/,
    /деталі/,
    /назва/,
  ]);
  const noteCol = findCol([/^примітка$/, /коментар/, /^note$/, /comment/]);
  const catKeyCol = findCol([/^код категорії$/, /^category_key$/]);
  const catNameCol = findCol([/^категорія$/, /^category$/]);
  const kindCol = findCol([/^тип$/, /^kind$/, /^type$/]);
  const mccCol = findCol([/^mcc$/, /мсс/]);
  const cardCol = findCol([/^картка$/, /^card$/, /рахунок/]);
  const privateCol = findCol([/^приватна$/, /^private$/]);

  if (dateCol === -1 || amountCol === -1) {
    throw new Error(
      "Не вдалося розпізнати колонки «Дата» та «Сума» у CSV. Спробуйте виписку Monobank, ПриватБанку або експорт із ours.",
    );
  }

  const dataRows = table.slice(headerRowIdx + 1);
  const truncated = dataRows.length > MAX_BUDGET_IMPORT_ROWS;
  const limitedRows = dataRows.slice(0, MAX_BUDGET_IMPORT_ROWS);

  const rows: ParsedBudgetImportRow[] = [];
  let skippedInvalid = 0;

  limitedRows.forEach((cols, idx) => {
    const rawDate = cols[dateCol] ?? "";
    const rawTime = timeCol !== -1 ? cols[timeCol] ?? "" : "";
    const parsedDate = parseFlexibleDate(rawDate, rawTime);
    const parsedAmount = parseSignedAmount(cols[amountCol] ?? "");
    if (!parsedDate || !parsedAmount) {
      skippedInvalid++;
      return;
    }

    const rawKind = kindCol !== -1 ? (cols[kindCol] ?? "").toLowerCase().trim() : "";
    let kind: BudgetKind;
    if (/дохід|income|поповн|зарах|credit/.test(rawKind)) {
      kind = "income";
    } else if (/витрат|expense|списан|debit/.test(rawKind)) {
      kind = "expense";
    } else {
      // Standard bank statements: negative = expense, positive = income
      kind = parsedAmount.signed < 0 ? "expense" : "income";
    }

    const rawMerchant =
      merchantCol !== -1 ? stripCsvFormulaQuote(cols[merchantCol] ?? "") : "";
    const rawNote = noteCol !== -1 ? stripCsvFormulaQuote(cols[noteCol] ?? "") : "";
    const rawCatKey =
      catKeyCol !== -1 ? stripCsvFormulaQuote(cols[catKeyCol] ?? "") : "";
    const rawCatName =
      catNameCol !== -1 ? stripCsvFormulaQuote(cols[catNameCol] ?? "") : "";
    const rawMcc = mccCol !== -1 ? (cols[mccCol] ?? "").trim() : "";
    const rawCard = cardCol !== -1 ? stripCsvFormulaQuote(cols[cardCol] ?? "") : "";
    const rawPrivate =
      privateCol !== -1 ? (cols[privateCol] ?? "").toLowerCase().trim() : "";

    const defaultCardLabel =
      format === "monobank_csv"
        ? "Monobank"
        : format === "privatbank_csv"
          ? "ПриватБанк"
          : "";
    const card_label = (rawCard || defaultCardLabel).trim().slice(0, 60);

    const resolved = resolveImportCategory({
      explicitKey: rawCatKey || null,
      explicitName: rawCatName || null,
      merchant: rawMerchant || rawNote,
      mcc: rawMcc || undefined,
      kind,
      rules: merchantRules,
      validKeys,
      byName,
    });

    const cleanMerchant =
      rawMerchant.trim().slice(0, 160) ||
      findCategoryMeta(resolved.category_key, customCategories, kind).name;
    const cleanNote = rawNote.trim().slice(0, 500);

    const fp = makeTxFingerprint(
      parsedDate.occurred_on,
      kind,
      parsedAmount.abs,
      cleanMerchant,
    );
    const minFp = !parsedDate.occurred_at.includes("T12:00:00")
      ? makeMinuteFingerprint(parsedDate.occurred_at, kind, parsedAmount.abs)
      : null;
    const duplicate =
      existingFingerprints.has(fp) ||
      (minFp !== null && existingMinutePrints.has(minFp));

    rows.push({
      tempId: `csv-${idx}`,
      kind,
      amount: parsedAmount.abs,
      merchant: cleanMerchant,
      note: cleanNote,
      category_key: resolved.category_key,
      status: "confirmed",
      source: "manual",
      is_private:
        rawPrivate === "так" || rawPrivate === "true" || rawPrivate === "1"
          ? true
          : rawPrivate === "ні" || rawPrivate === "false" || rawPrivate === "0"
            ? false
            : undefined,
      card_label,
      occurred_on: parsedDate.occurred_on,
      occurred_at: parsedDate.occurred_at,
      mcc: rawMcc || undefined,
      duplicate,
      isTransfer: isLikelyInternalTransfer(cleanMerchant, cleanNote),
      categorizedBy: resolved.categorizedBy,
    });
  });

  return {
    format,
    formatLabel: BUDGET_IMPORT_FORMAT_LABELS[format],
    rows,
    merchantRules: [],
    skippedInvalid,
    truncated,
  };
}

export async function parseBudgetImportFile(params: {
  file: File;
  existingTransactions: BudgetTransaction[];
  customCategories: BudgetCategory[];
  merchantRules: MerchantRuleLike[];
}): Promise<BudgetImportParseResult> {
  const { file } = params;
  if (file.size === 0) {
    throw new Error("Обраний файл порожній.");
  }
  if (file.size > MAX_BUDGET_IMPORT_FILE_BYTES) {
    throw new Error("Файл завеликий (максимум 10 МБ).");
  }
  const buffer = await file.arrayBuffer();
  const text = decodeImportBytes(buffer);
  return parseBudgetImportContent({
    text,
    fileName: file.name,
    existingTransactions: params.existingTransactions,
    customCategories: params.customCategories,
    merchantRules: params.merchantRules,
  });
}
