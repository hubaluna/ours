import {
  ALL_DEFAULT_BUDGET_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  INITIAL_BUDGET_SEED,
  LEGACY_CATEGORY_MAP,
  SKARBO_EXPENSE_CATEGORIES,
  SKARBO_INCOME_CATEGORIES,
  autoCategorizeMerchant,
  categorizeMerchantFromDictionary,
  matchMerchantRule,
  normalizeCategoryKey,
  normalizeMerchantName,
  parseApplePayAmount,
  suggestRulePattern,
  type BudgetKind,
  type DefaultBudgetCategory,
  type MerchantRuleLike,
} from "../../supabase/functions/_shared/budget-categorizer";
import type {
  BudgetCategory,
  BudgetRecurringPayment,
  BudgetSettings,
  BudgetTransaction,
} from "./types";
import { kyivDate } from "./utils";
import publicConfig from "./public-config.json";

export {
  ALL_DEFAULT_BUDGET_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  INITIAL_BUDGET_SEED,
  LEGACY_CATEGORY_MAP,
  SKARBO_EXPENSE_CATEGORIES,
  SKARBO_INCOME_CATEGORIES,
  autoCategorizeMerchant,
  categorizeMerchantFromDictionary,
  matchMerchantRule,
  normalizeCategoryKey,
  normalizeMerchantName,
  parseApplePayAmount,
  suggestRulePattern,
  type BudgetKind,
  type DefaultBudgetCategory,
  type MerchantRuleLike,
};

export type BudgetPeriodPreset = "all_time" | "this_month" | "prev_month" | "custom";
export type BudgetMemberScope = "all" | "mine" | "partner";

export type CategoryMeta = {
  key: string;
  kind: BudgetKind;
  name: string;
  emoji: string;
  color: string;
  isCustom: boolean;
  customId?: string;
};

export type CategoryBreakdownRow = {
  key: string;
  name: string;
  emoji: string;
  color: string;
  amount: number;
  percent: number;
  count: number;
};

const CUSTOM_CATEGORY_PALETTE = [
  "#22C55E",
  "#4B83F2",
  "#F59E0B",
  "#A855F7",
  "#14B8A6",
  "#EC4899",
  "#6366F1",
  "#38BDF8",
] as const;

export const CUSTOM_CATEGORY_EMOJIS = [
  "🚬",
  "🥑",
  "☕",
  "🍽️",
  "🥤",
  "🍷",
  "🧳",
  "✈️",
  "🏠",
  "🏡",
  "⚡",
  "📱",
  "⛽",
  "🚗",
  "🚕",
  "🅿️",
  "💊",
  "🩺",
  "🐾",
  "👕",
  "🛍️",
  "🌸",
  "💅",
  "✂️",
  "🏋️",
  "📚",
  "💻",
  "🎮",
  "🎵",
  "🎬",
  "🔄",
  "🧴",
  "🧸",
  "🎁",
  "💼",
  "📦",
] as const;

export function customCategoryKey(id: string): string {
  return `custom:${id}`;
}

export function resolveBudgetCategories(
  customCategories: BudgetCategory[],
  kind?: BudgetKind,
): CategoryMeta[] {
  const defaults = (
    kind === "expense"
      ? DEFAULT_EXPENSE_CATEGORIES
      : kind === "income"
        ? DEFAULT_INCOME_CATEGORIES
        : ALL_DEFAULT_BUDGET_CATEGORIES
  ).map<CategoryMeta>((cat) => ({
    key: cat.key,
    kind: cat.kind,
    name: cat.name,
    emoji: cat.emoji,
    color: cat.color,
    isCustom: false,
  }));

  const customs = customCategories
    .filter((cat) => !kind || cat.kind === kind)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "uk"))
    .map<CategoryMeta>((cat, idx) => ({
      key: customCategoryKey(cat.id),
      kind: cat.kind,
      name: cat.name,
      emoji: cat.emoji || "📦",
      color: CUSTOM_CATEGORY_PALETTE[idx % CUSTOM_CATEGORY_PALETTE.length],
      isCustom: true,
      customId: cat.id,
    }));

  if (kind) {
    // Keep "Інше" at the end of expense picker after custom categories.
    const fallbackKey = kind === "income" ? "refund" : "other";
    const mainDefaults = defaults.filter((c) => c.key !== fallbackKey);
    const tailDefaults = defaults.filter((c) => c.key === fallbackKey);
    return [...mainDefaults, ...customs, ...tailDefaults];
  }

  return [...defaults, ...customs];
}

export function findCategoryMeta(
  categoryKey: string | null | undefined,
  customCategories: BudgetCategory[],
  kind?: BudgetKind,
): CategoryMeta {
  if (!categoryKey) {
    return {
      key: "uncategorized",
      kind: kind ?? "expense",
      name: "Без категорії",
      emoji: "❓",
      color: "#9CA3AF",
      isCustom: false,
    };
  }
  const normalizedKey = normalizeCategoryKey(categoryKey, kind);
  const resolved = resolveBudgetCategories(customCategories);
  const found =
    resolved.find((cat) => cat.key === normalizedKey) ??
    resolved.find((cat) => cat.key === categoryKey);
  if (found) return found;
  return {
    key: normalizedKey,
    kind: kind ?? "expense",
    name: kind === "income" ? "Повернення" : "Інше",
    emoji: kind === "income" ? "↩️" : "📦",
    color: kind === "income" ? "#A855F7" : "#D1D5DB",
    isCustom: false,
  };
}

function monthBounds(year: number, monthIndex0: number): {
  from: string;
  to: string;
  label: string;
} {
  const start = new Date(Date.UTC(year, monthIndex0, 1, 12, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex0 + 1, 0, 12, 0, 0));
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  const rawLabel = new Intl.DateTimeFormat("uk-UA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(start)
    .replace(/\s*р\.?$/i, "")
    .trim();
  const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
  return { from, to, label };
}

export function getPeriodRange(
  preset: BudgetPeriodPreset,
  customFrom: string,
  customTo: string,
  today = kyivDate(),
): { from: string; to: string; label: string } {
  const [yStr, mStr] = today.split("-");
  const year = Number(yStr) || 2026;
  const month0 = (Number(mStr) || 1) - 1;

  if (preset === "all_time") {
    const from =
      today < INITIAL_BUDGET_SEED.periodStart
        ? today
        : INITIAL_BUDGET_SEED.periodStart;
    const to =
      today >= INITIAL_BUDGET_SEED.periodEnd
        ? today
        : INITIAL_BUDGET_SEED.periodEnd;
    return {
      from,
      to,
      label: "Весь час · з 1 серп. 2026",
    };
  }
  if (preset === "this_month") {
    return monthBounds(year, month0);
  }
  if (preset === "prev_month") {
    const prevDate = new Date(Date.UTC(year, month0 - 1, 1, 12, 0, 0));
    return monthBounds(prevDate.getUTCFullYear(), prevDate.getUTCMonth());
  }

  const from = /^\d{4}-\d{2}-\d{2}$/.test(customFrom)
    ? customFrom
    : INITIAL_BUDGET_SEED.periodStart;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(customTo) ? customTo : today;
  const [start, end] = from <= to ? [from, to] : [to, from];
  const fmt = new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const label = `${fmt.format(new Date(`${start}T12:00:00Z`))} — ${fmt.format(new Date(`${end}T12:00:00Z`))}`;
  return { from: start, to: end, label };
}

export function formatUAH(
  value: number,
  opts?: { signed?: boolean; kind?: BudgetKind },
): string {
  const abs = Math.abs(Math.round(value * 100) / 100);
  const hasCents = Math.round(abs * 100) % 100 !== 0;
  const formatted = new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })
    .format(abs)
    .replace(/\u00a0/g, " ");

  if (opts?.signed) {
    if (opts.kind === "income") return `+${formatted} ₴`;
    if (opts.kind === "expense") return `−${formatted} ₴`;
    if (value < 0) return `−${formatted} ₴`;
    if (value > 0) return `+${formatted} ₴`;
  } else if (value < 0) {
    return `−${formatted} ₴`;
  }
  return `${formatted} ₴`;
}

export function formatBudgetDayHeading(
  dateStr: string,
  today = kyivDate(),
): string {
  if (dateStr === today) return "Сьогодні";
  const todayDate = new Date(`${today}T12:00:00Z`);
  const yesterdayDate = new Date(todayDate.getTime() - 86_400_000);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);
  if (dateStr === yesterday) return "Вчора";

  const target = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(target.getTime())) return dateStr;
  const sameYear = target.getUTCFullYear() === todayDate.getUTCFullYear();
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  })
    .format(target)
    .replace(/\s*р\.?$/i, "")
    .trim();
}

export function computeBudgetStats(params: {
  transactions: BudgetTransaction[];
  customCategories: BudgetCategory[];
  budgetSettings: BudgetSettings[];
  scope: BudgetMemberScope;
  userId: string;
  from: string;
  to: string;
}): {
  filteredTransactions: BudgetTransaction[];
  expenseTotal: number;
  incomeTotal: number | null;
  balance: number | null;
  savingsRate: number | null;
  expenseRows: CategoryBreakdownRow[];
  incomeRows: CategoryBreakdownRow[];
  partnerSharesIncome: boolean;
} {
  const {
    transactions,
    customCategories,
    budgetSettings,
    scope,
    userId,
    from,
    to,
  } = params;

  const partnerSetting = budgetSettings.find((s) => s.user_id !== userId);
  const partnerSharesIncome = partnerSetting?.share_income_with_partner ?? false;

  const visibleInPeriod = transactions.filter((tx) => {
    if (tx.occurred_on < from || tx.occurred_on > to) return false;
    if (tx.is_private && tx.user_id !== userId) return false;
    if (scope === "mine") return tx.user_id === userId;
    if (scope === "partner") return tx.user_id !== userId;
    return true;
  });

  const buildRows = (kind: BudgetKind) => {
    const txs = visibleInPeriod.filter((tx) => tx.kind === kind);
    const total =
      Math.round(txs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0) * 100) /
      100;
    const grouped = new Map<string, { amount: number; count: number }>();

    for (const tx of txs) {
      const key = normalizeCategoryKey(tx.category_key, kind);
      const cur = grouped.get(key) ?? { amount: 0, count: 0 };
      cur.amount = Math.round((cur.amount + Number(tx.amount || 0)) * 100) / 100;
      cur.count += 1;
      grouped.set(key, cur);
    }

    const rows: CategoryBreakdownRow[] = [];
    for (const [key, data] of grouped.entries()) {
      const meta = findCategoryMeta(key, customCategories, kind);
      rows.push({
        key: meta.key,
        name: meta.name,
        emoji: meta.emoji,
        color: meta.color,
        amount: data.amount,
        percent: total > 0 ? (data.amount / total) * 100 : 0,
        count: data.count,
      });
    }
    rows.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "uk"));
    return { total, rows };
  };

  const expense = buildRows("expense");
  const income = buildRows("income");

  const hidePartnerIncome =
    scope === "partner" && !partnerSharesIncome && income.total === 0;
  const incomeTotal = hidePartnerIncome ? null : income.total;
  const balance =
    incomeTotal === null
      ? null
      : Math.round((incomeTotal - expense.total) * 100) / 100;
  const savingsRate =
    incomeTotal !== null && incomeTotal > 0
      ? Math.round(((incomeTotal - expense.total) / incomeTotal) * 100)
      : null;

  return {
    filteredTransactions: visibleInPeriod.sort((a, b) => {
      const dateDiff = b.occurred_on.localeCompare(a.occurred_on);
      if (dateDiff !== 0) return dateDiff;
      const timeA = Date.parse(a.occurred_at || a.created_at) || 0;
      const timeB = Date.parse(b.occurred_at || b.created_at) || 0;
      if (timeB !== timeA) return timeB - timeA;
      const createA = Date.parse(a.created_at) || 0;
      const createB = Date.parse(b.created_at) || 0;
      return createB - createA;
    }),
    expenseTotal: expense.total,
    incomeTotal,
    balance,
    savingsRate,
    expenseRows: expense.rows,
    incomeRows: income.rows,
    partnerSharesIncome,
  };
}

/**
 * Produces a deterministic RFC-4122-shaped UUID from any string seed so repeated
 * initial seed upserts into Supabase (`onConflict: "id", ignoreDuplicates: true`)
 * never create duplicate historical rows.
 */
export function deterministicSeedUuid(seedKey: string): string {
  const hashChunk = (seed: string, salt: number): number => {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  const h1 = hashChunk(seedKey, 1).toString(16).padStart(8, "0");
  const h2 = hashChunk(seedKey, 2).toString(16).padStart(8, "0");
  const h3 = hashChunk(seedKey, 3).toString(16).padStart(8, "0");
  const h4 = hashChunk(seedKey, 4).toString(16).padStart(8, "0");
  const hex = (h1 + h2 + h3 + h4).slice(0, 32).split("");
  // Set version 4 and RFC 4122 variant bits
  hex[12] = "4";
  const variantNibble = (parseInt(hex[16], 16) & 0x3) | 0x8;
  hex[16] = variantNibble.toString(16);
  const raw = hex.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20, 32)}`;
}

export const SKARBO_SEED_NOTE = "Імпорт зі Skarbo (серпень–листопад 2026)";

export function buildSkarboSeedTransactions(
  coupleId: string,
  userId: string,
  now = new Date().toISOString(),
): BudgetTransaction[] {
  const rows: BudgetTransaction[] = [];
  const baseDate = INITIAL_BUDGET_SEED.periodStart;

  INITIAL_BUDGET_SEED.expenses.forEach((entry, index) => {
    const meta = findCategoryMeta(entry.categoryId, [], "expense");
    const ts = `${baseDate}T12:${String(59 - Math.min(index, 59)).padStart(2, "0")}:00.000Z`;
    rows.push({
      id: deterministicSeedUuid(`skarbo-v1:${coupleId}:expense:${entry.categoryId}`),
      couple_id: coupleId,
      user_id: userId,
      kind: "expense",
      amount: entry.amount,
      merchant: meta.name,
      note: entry.note,
      category_key: entry.categoryId,
      status: "confirmed",
      source: "manual",
      is_private: false,
      card_label: "Skarbo",
      occurred_on: baseDate,
      occurred_at: ts,
      created_at: now,
      updated_at: now,
    });
  });

  INITIAL_BUDGET_SEED.incomes.forEach((entry, index) => {
    const meta = findCategoryMeta(entry.categoryId, [], "income");
    const ts = `${baseDate}T11:${String(59 - index).padStart(2, "0")}:00.000Z`;
    rows.push({
      id: deterministicSeedUuid(`skarbo-v1:${coupleId}:income:${entry.categoryId}`),
      couple_id: coupleId,
      user_id: userId,
      kind: "income",
      amount: entry.amount,
      merchant: meta.name,
      note: entry.note,
      category_key: entry.categoryId,
      status: "confirmed",
      source: "manual",
      is_private: false,
      card_label: "Skarbo",
      occurred_on: baseDate,
      occurred_at: ts,
      created_at: now,
      updated_at: now,
    });
  });

  return rows;
}

export function generateBudgetIngestToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function budgetIngestUrl(): string {
  const base = (
    (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
    publicConfig.supabaseUrl
  )?.trim();
  if (!base || base.includes("YOUR_PROJECT")) {
    return "https://<your-project>.supabase.co/functions/v1/expense-ingest";
  }
  return `${base.replace(/\/+$/, "")}/functions/v1/expense-ingest`;
}

export function getRecurringDueDate(
  dayOfMonth: number,
  yearMonth: string,
): string {
  const ym = yearMonth.slice(0, 7);
  const [yStr, mStr] = ym.split("-");
  const year = Number(yStr) || 2026;
  const month = Number(mStr) || 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const clampedDay = Math.max(1, Math.min(Math.round(dayOfMonth), daysInMonth));
  return `${ym}-${String(clampedDay).padStart(2, "0")}`;
}

export function getDueRecurringPayments(
  items: BudgetRecurringPayment[],
  today = kyivDate(),
): BudgetRecurringPayment[] {
  const yearMonth = today.slice(0, 7);
  return items
    .filter((item) => {
      if (!item.active) return false;
      if (item.last_confirmed_month === yearMonth) return false;
      if (item.last_skipped_month === yearMonth) return false;
      const dueDate = getRecurringDueDate(item.day_of_month, yearMonth);
      return today >= dueDate;
    })
    .sort((a, b) => a.day_of_month - b.day_of_month || a.title.localeCompare(b.title, "uk"));
}
