import { describe, expect, it } from "vitest";
import {
  INITIAL_BUDGET_SEED,
  SKARBO_EXPENSE_CATEGORIES,
  SKARBO_INCOME_CATEGORIES,
  autoCategorizeMerchant,
  buildSkarboSeedTransactions,
  computeBudgetStats,
  formatBudgetDayHeading,
  formatUAH,
  generateBudgetIngestToken,
  getPeriodRange,
  parseApplePayAmount,
  resolveBudgetCategories,
  suggestRulePattern,
} from "../src/lib/budget";
import { buildPdfFromJpegPages } from "../src/lib/budget-pdf";
import {
  isMissingBudgetTableError,
  markLocalBudgetSynced,
  peekLocalBudgetPendingSync,
  readLocalBudgetState,
  writeLocalBudgetState,
} from "../src/lib/budget-local";
import { DEMO_COUPLE, DEMO_USER, createDemo } from "../src/lib/demo";
import type {
  BudgetCategory,
  BudgetMerchantRule,
  BudgetSettings,
  BudgetTransaction,
} from "../src/lib/types";

describe("budget module", () => {
  it("exposes exact Skarbo expense & income categories with colors", () => {
    expect(SKARBO_EXPENSE_CATEGORIES).toHaveLength(21);
    expect(SKARBO_INCOME_CATEGORIES).toHaveLength(2);
    expect(SKARBO_EXPENSE_CATEGORIES[0]).toEqual({
      id: "groceries",
      name: "Продукти",
      emoji: "🥑",
      color: "#22C55E",
    });
    expect(SKARBO_INCOME_CATEGORIES.map((c) => c.id)).toEqual([
      "salary",
      "refund",
    ]);
  });

  it("parses Apple Pay and manual amounts in Ukrainian and international formats", () => {
    expect(parseApplePayAmount(450)).toBe(450);
    expect(parseApplePayAmount("-450,00 ₴")).toBe(450);
    expect(parseApplePayAmount("1 250.50 UAH")).toBe(1250.5);
    expect(parseApplePayAmount("1,250.50 грн")).toBe(1250.5);
    expect(parseApplePayAmount("0")).toBeNull();
    expect(parseApplePayAmount("")).toBeNull();
  });

  it("prioritizes couple merchant rules over built-in dictionary and maps onto Skarbo categories", () => {
    const rules: Pick<
      BudgetMerchantRule,
      "merchant_pattern" | "normalized_pattern" | "category_key" | "kind"
    >[] = [
      {
        merchant_pattern: "FOP IVANOV",
        normalized_pattern: "fop ivanov",
        category_key: "restaurants",
        kind: "expense",
      },
    ];

    expect(autoCategorizeMerchant("FOP IVANOV #12", rules, "expense")).toEqual({
      category_key: "restaurants",
      matched_by: "rule",
    });

    expect(autoCategorizeMerchant("Сільпо 145 Київ", rules, "expense")).toEqual({
      category_key: "groceries",
      matched_by: "dictionary",
    });

    expect(autoCategorizeMerchant("OKKO AZS", rules, "expense")).toEqual({
      category_key: "fuel",
      matched_by: "dictionary",
    });

    expect(autoCategorizeMerchant("MasterZoo Kyiv", rules, "expense")).toEqual({
      category_key: "pets",
      matched_by: "dictionary",
    });

    expect(autoCategorizeMerchant("UNKNOWN STORE XYZ", rules, "expense")).toEqual({
      category_key: null,
      matched_by: "none",
    });

    expect(suggestRulePattern("FOP IVANOV - 4521 KYIV")).toBe("FOP IVANOV");
  });

  it("computes period ranges including all_time from Aug 2026, UAH formatting, and day headings", () => {
    expect(getPeriodRange("all_time", "", "", "2026-11-17")).toMatchObject({
      from: "2026-08-01",
      to: "2026-11-17",
    });
    expect(getPeriodRange("this_month", "", "", "2026-11-17")).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(getPeriodRange("prev_month", "", "", "2026-01-15")).toMatchObject({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(formatUAH(450, { signed: true, kind: "expense" })).toBe("−450 ₴");
    expect(formatUAH(25000, { signed: true, kind: "income" })).toBe("+25 000 ₴");
    expect(formatBudgetDayHeading("2026-11-17", "2026-11-17")).toBe("Сьогодні");
    expect(formatBudgetDayHeading("2026-11-16", "2026-11-17")).toBe("Вчора");
  });

  it("builds deterministic INITIAL_BUDGET_SEED matching exact Skarbo totals without duplication", () => {
    const first = buildSkarboSeedTransactions(DEMO_COUPLE, DEMO_USER);
    const second = buildSkarboSeedTransactions(DEMO_COUPLE, DEMO_USER);
    expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id));
    expect(first).toHaveLength(
      INITIAL_BUDGET_SEED.expenses.length + INITIAL_BUDGET_SEED.incomes.length,
    );

    const demo = createDemo();
    const range = getPeriodRange("all_time", "", "", "2026-11-17");
    const stats = computeBudgetStats({
      transactions: demo.budgetTransactions,
      customCategories: demo.budgetCategories,
      budgetSettings: demo.budgetSettings,
      scope: "all",
      userId: DEMO_USER,
      from: range.from,
      to: range.to,
    });

    expect(stats.expenseTotal).toBe(328206.77);
    expect(stats.incomeTotal).toBe(379862);
    expect(stats.balance).toBe(51655.23);
    expect(stats.savingsRate).toBe(14);
    expect(stats.expenseRows[0]).toMatchObject({
      key: "groceries",
      name: "Продукти",
      emoji: "🥑",
      color: "#22C55E",
      amount: 71577.83,
    });
  });

  it("enforces income privacy, normalizes legacy keys, and merges custom categories into breakdown", () => {
    const customCategories: BudgetCategory[] = [
      {
        id: "cat-1",
        couple_id: "c1",
        kind: "expense",
        name: "Кав'ярні на Подолі",
        emoji: "🥐",
        sort_order: 10,
        created_by: "u1",
        created_at: "2026-11-01T00:00:00Z",
      },
    ];
    const resolved = resolveBudgetCategories(customCategories, "expense");
    expect(resolved.some((c) => c.key === "custom:cat-1")).toBe(true);
    expect(resolved[resolved.length - 1].key).toBe("other");

    const txs: BudgetTransaction[] = [
      {
        id: "1",
        couple_id: "c1",
        user_id: "u1",
        kind: "expense",
        amount: 300,
        merchant: "Сільпо",
        note: "",
        category_key: "groceries",
        status: "confirmed",
        source: "apple_pay",
        is_private: false,
        occurred_on: "2026-11-10",
        occurred_at: "2026-11-10T10:00:00Z",
        created_at: "2026-11-10T10:00:00Z",
      },
      {
        id: "2",
        couple_id: "c1",
        user_id: "u2",
        kind: "income",
        amount: 50000,
        merchant: "Зарплата",
        note: "",
        category_key: "salary",
        status: "confirmed",
        source: "manual",
        is_private: true,
        occurred_on: "2026-11-05",
        occurred_at: "2026-11-05T10:00:00Z",
        created_at: "2026-11-05T10:00:00Z",
      },
    ];
    const settings: BudgetSettings[] = [
      { user_id: "u2", couple_id: "c1", share_income_with_partner: false },
    ];

    const allStats = computeBudgetStats({
      transactions: txs,
      customCategories,
      budgetSettings: settings,
      scope: "all",
      userId: "u1",
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(allStats.expenseTotal).toBe(300);
    expect(allStats.incomeTotal).toBe(0);
    expect(allStats.balance).toBe(-300);

    const partnerStats = computeBudgetStats({
      transactions: txs,
      customCategories,
      budgetSettings: settings,
      scope: "partner",
      userId: "u1",
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(partnerStats.incomeTotal).toBeNull();
    expect(partnerStats.balance).toBeNull();
  });

  it("generates valid 43-char Apple Pay ingest tokens and valid PDF 1.4 binaries", () => {
    const token = generateBudgetIngestToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const pdf = buildPdfFromJpegPages([
      { width: 1240, height: 1754, jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
    ]);
    const header = new TextDecoder().decode(pdf.slice(0, 8));
    const tail = new TextDecoder().decode(pdf.slice(-8));
    expect(header).toBe("%PDF-1.4");
    expect(tail).toContain("%%EOF");
  });

  it("handles missing Supabase budget tables with idempotent local fallback and pendingSync", () => {
    const store = new Map<string, string>();
    const prevStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        clear: () => store.clear(),
      },
    });

    try {
      expect(
        isMissingBudgetTableError({
          code: "PGRST205",
          message:
            "Could not find the table 'public.budget_transactions' in the schema cache",
        }),
      ).toBe(true);
      expect(isMissingBudgetTableError({ code: "42P01" })).toBe(true);
      expect(isMissingBudgetTableError({ status: 404 })).toBe(true);
      expect(isMissingBudgetTableError(new Error("network timeout"))).toBe(
        false,
      );

      const firstLoad = readLocalBudgetState("couple-x", "user-1");
      const secondLoad = readLocalBudgetState("couple-x", "user-1");
      const expectedSeedCount =
        INITIAL_BUDGET_SEED.expenses.length + INITIAL_BUDGET_SEED.incomes.length;
      expect(firstLoad.seeded).toBe(true);
      expect(firstLoad.transactions).toHaveLength(expectedSeedCount);
      expect(secondLoad.transactions).toHaveLength(expectedSeedCount);
      expect(peekLocalBudgetPendingSync("couple-x")).toBeNull();

      const customTx: BudgetTransaction = {
        id: "manual-1",
        couple_id: "couple-x",
        user_id: "user-1",
        kind: "expense",
        amount: 320,
        merchant: "Кав'ярня",
        note: "",
        category_key: "restaurants",
        status: "confirmed",
        source: "manual",
        is_private: false,
        occurred_on: "2026-11-17",
        occurred_at: "2026-11-17T12:00:00Z",
        created_at: "2026-11-17T12:00:00Z",
      };

      writeLocalBudgetState("couple-x", "user-1", (prev) => ({
        ...prev,
        pendingSync: true,
        transactions: [customTx, ...prev.transactions],
      }));

      const reloaded = readLocalBudgetState("couple-x", "user-1");
      expect(reloaded.transactions).toHaveLength(expectedSeedCount + 1);
      expect(reloaded.transactions[0].id).toBe("manual-1");

      const pending = peekLocalBudgetPendingSync("couple-x");
      expect(pending?.pendingSync).toBe(true);
      expect(pending?.transactions).toHaveLength(expectedSeedCount + 1);

      markLocalBudgetSynced("couple-x");
      expect(peekLocalBudgetPendingSync("couple-x")).toBeNull();
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: prevStorage,
      });
    }
  });
});
