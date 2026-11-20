import { buildSkarboSeedTransactions } from "./budget";
import type {
  BudgetCategory,
  BudgetMerchantRule,
  BudgetRecurringPayment,
  BudgetSettings,
  BudgetTransaction,
} from "./types";

const LOCAL_BUDGET_PREFIX = "ours-budget-local-v1:";

export type LocalBudgetState = {
  seeded: boolean;
  pendingSync: boolean;
  categories: BudgetCategory[];
  transactions: BudgetTransaction[];
  merchantRules: BudgetMerchantRule[];
  settings: BudgetSettings[];
  recurring: BudgetRecurringPayment[];
};

export function isMissingBudgetTableError(error: unknown): boolean {
  if (!error) return false;
  const obj =
    typeof error === "object" ? (error as Record<string, unknown>) : null;
  const code = String(obj?.code ?? "").toUpperCase();
  const status = Number(obj?.status ?? 0);
  const message =
    error instanceof Error
      ? error.message
      : String(obj?.message ?? obj?.details ?? error);

  if (code === "PGRST205" || code === "42P01" || status === 404) {
    return true;
  }
  // Missing column (42703) must never be treated as a missing table!
  if (code === "42703" || /column .* does not exist/i.test(message)) {
    return false;
  }
  return /budget_(?:transactions|categories|merchant_rules|settings|ingest_tokens|recurring_payments)|schema cache|relation "public\.budget_[^"]*" does not exist|table "budget_[^"]*" does not exist/i.test(
    message,
  );
}

function storageKey(coupleId: string): string {
  return `${LOCAL_BUDGET_PREFIX}${coupleId}`;
}

export function readLocalBudgetState(
  coupleId: string,
  userId: string,
): LocalBudgetState {
  const key = storageKey(coupleId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalBudgetState>;
      const categories = Array.isArray(parsed.categories)
        ? parsed.categories
        : [];
      const transactions = Array.isArray(parsed.transactions)
        ? parsed.transactions
        : [];
      const merchantRules = Array.isArray(parsed.merchantRules)
        ? parsed.merchantRules
        : [];
      const settings = Array.isArray(parsed.settings) ? parsed.settings : [];
      const recurring = Array.isArray(parsed.recurring) ? parsed.recurring : [];

      if (parsed.seeded) {
        return {
          seeded: true,
          pendingSync: Boolean(parsed.pendingSync),
          categories,
          transactions,
          merchantRules,
          settings,
          recurring,
        };
      }

      const seedRows = buildSkarboSeedTransactions(coupleId, userId);
      const existingIds = new Set(transactions.map((t) => t.id));
      const merged: LocalBudgetState = {
        seeded: true,
        pendingSync: Boolean(parsed.pendingSync),
        categories,
        transactions: [
          ...transactions,
          ...seedRows.filter((r) => !existingIds.has(r.id)),
        ],
        merchantRules,
        settings,
        recurring,
      };
      localStorage.setItem(key, JSON.stringify(merged));
      return merged;
    }
  } catch {
    /* initialize fresh local budget store */
  }

  const initial: LocalBudgetState = {
    seeded: true,
    pendingSync: false,
    categories: [],
    transactions: buildSkarboSeedTransactions(coupleId, userId),
    merchantRules: [],
    settings: [],
    recurring: [],
  };
  try {
    localStorage.setItem(key, JSON.stringify(initial));
  } catch {
    /* ignore storage quota issues */
  }
  return initial;
}

export function writeLocalBudgetState(
  coupleId: string,
  userId: string,
  updater: (prev: LocalBudgetState) => LocalBudgetState,
): LocalBudgetState {
  const current = readLocalBudgetState(coupleId, userId);
  const next = updater(current);
  try {
    localStorage.setItem(storageKey(coupleId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function peekLocalBudgetPendingSync(coupleId: string): LocalBudgetState | null {
  try {
    const raw = localStorage.getItem(storageKey(coupleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalBudgetState>;
    if (!parsed.pendingSync) return null;
    return {
      seeded: Boolean(parsed.seeded),
      pendingSync: true,
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      merchantRules: Array.isArray(parsed.merchantRules)
        ? parsed.merchantRules
        : [],
      settings: Array.isArray(parsed.settings) ? parsed.settings : [],
      recurring: Array.isArray(parsed.recurring) ? parsed.recurring : [],
    };
  } catch {
    return null;
  }
}

export function markLocalBudgetSynced(coupleId: string): void {
  try {
    const raw = localStorage.getItem(storageKey(coupleId));
    if (!raw) return;
    const parsed = JSON.parse(raw) as LocalBudgetState;
    localStorage.setItem(
      storageKey(coupleId),
      JSON.stringify({ ...parsed, pendingSync: false }),
    );
  } catch {
    /* ignore */
  }
}
