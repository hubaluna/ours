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
  getDueRecurringPayments,
  getPeriodRange,
  getRecurringDueDate,
  parseApplePayAmount,
  resolveBudgetCategories,
  suggestRulePattern,
} from "../src/lib/budget";
import {
  buildPdfFromJpegPages,
  preparePdfAnalyticsData,
} from "../src/lib/budget-pdf";
import {
  isMissingBudgetTableError,
  markLocalBudgetSynced,
  peekLocalBudgetPendingSync,
  readLocalBudgetState,
  writeLocalBudgetState,
} from "../src/lib/budget-local";
import {
  applyBudgetQueue,
  enqueueBudgetOp,
  readBudgetQueue,
  writeBudgetQueue,
  type BudgetQueueOp,
} from "../src/lib/budget-queue";
import { DEMO_COUPLE, DEMO_USER, createDemo } from "../src/lib/demo";
import type {
  BudgetCategory,
  BudgetMerchantRule,
  BudgetRecurringPayment,
  BudgetSettings,
  BudgetTransaction,
} from "../src/lib/types";

describe("budget module", () => {
  it("exposes exact Skarbo expense & income categories with colors", () => {
    expect(SKARBO_EXPENSE_CATEGORIES).toHaveLength(22);
    expect(SKARBO_INCOME_CATEGORIES).toHaveLength(2);
    expect(SKARBO_EXPENSE_CATEGORIES.some((c) => c.id === "smoking" && c.name === "Куріння")).toBe(true);
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
    expect(parseApplePayAmount(-450)).toBe(450);
    expect(parseApplePayAmount("-450,00 ₴")).toBe(450);
    expect(parseApplePayAmount("1\u202f250.50 UAH")).toBe(1250.5);
    expect(parseApplePayAmount("1 250.50 UAH")).toBe(1250.5);
    expect(parseApplePayAmount("1,250.50 грн")).toBe(1250.5);
    expect(parseApplePayAmount("45.99 $")).toBe(45.99);
    expect(parseApplePayAmount("30,50 €")).toBe(30.5);
    expect(parseApplePayAmount("120 zł")).toBe(120);
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

    expect(autoCategorizeMerchant("IQOS Space Kyiv", rules, "expense")).toEqual({
      category_key: "smoking",
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
    const chartData = preparePdfAnalyticsData({
      periodLabel: range.label,
      periodFrom: range.from,
      periodTo: range.to,
      scopeLabel: "Разом",
      generatedAtLabel: "17 лист. 2026",
      expenseTotal: stats.expenseTotal,
      incomeTotal: stats.incomeTotal,
      balance: stats.balance,
      savingsRate: stats.savingsRate,
      expenseRows: stats.expenseRows,
      incomeRows: stats.incomeRows,
      transactions: stats.filteredTransactions,
    });
    expect(chartData.donutSlices).toHaveLength(6);
    expect(chartData.donutSlices[5].key).toBe("_rest");
    expect(chartData.donutSlices[0].startAngle).toBeCloseTo(-Math.PI / 2, 5);
    expect(chartData.donutSlices[5].endAngle).toBeCloseTo(Math.PI * 1.5, 5);
    expect(chartData.topCategory?.key).toBe("groceries");
    expect(chartData.dailyAverage).toBeGreaterThan(0);

    const multiMonth = preparePdfAnalyticsData({
      periodLabel: range.label,
      periodFrom: "2026-08-01",
      periodTo: "2026-11-17",
      scopeLabel: "Разом",
      generatedAtLabel: "17 лист. 2026",
      expenseTotal: 1500,
      incomeTotal: 5000,
      balance: 3500,
      expenseRows: stats.expenseRows.slice(0, 3),
      incomeRows: stats.incomeRows,
      transactions: [
        ...demo.budgetTransactions.slice(0, 2),
        {
          id: "extra-nov",
          couple_id: DEMO_COUPLE,
          user_id: DEMO_USER,
          kind: "expense",
          amount: 450,
          merchant: "Сільпо",
          note: "",
          category_key: "groceries",
          status: "confirmed",
          source: "apple_pay",
          is_private: false,
          occurred_on: "2026-11-15",
          occurred_at: "2026-11-15T12:00:00Z",
          created_at: "2026-11-15T12:00:00Z",
        },
      ],
    });
    expect(multiMonth.timelineMode).toBe("monthly");
    expect(multiMonth.timelineBars).toHaveLength(2);
    expect(multiMonth.notableTransactions[0].id).toBe("extra-nov");
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
      expect(
        isMissingBudgetTableError({
          code: "42703",
          message: "column budget_settings.id does not exist",
        }),
      ).toBe(false);

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

  it("computes clamped recurring payment due dates and filters due items per month", () => {
    expect(getRecurringDueDate(31, "2026-02-15")).toBe("2026-02-28");
    expect(getRecurringDueDate(31, "2028-02-15")).toBe("2028-02-29");
    expect(getRecurringDueDate(10, "2026-11-19")).toBe("2026-11-10");

    const base: BudgetRecurringPayment = {
      id: "rec-1",
      couple_id: "c1",
      created_by: "u1",
      title: "Оренда",
      kind: "expense",
      amount: 15000,
      category_key: "home",
      day_of_month: 10,
      active: true,
      last_confirmed_month: null,
      last_skipped_month: null,
      created_at: "2026-10-01T00:00:00Z",
    };

    const items: BudgetRecurringPayment[] = [
      base, // due on 10th -> due on 19th
      { ...base, id: "rec-2", title: "Інтернет", day_of_month: 25 }, // future
      { ...base, id: "rec-3", title: "Оплачено", last_confirmed_month: "2026-11" }, // confirmed
      { ...base, id: "rec-4", title: "Пропущено", last_skipped_month: "2026-11" }, // skipped
      { ...base, id: "rec-5", title: "На паузі", active: false }, // inactive
      { ...base, id: "rec-6", title: "Мобільний", day_of_month: 5, last_confirmed_month: "2026-10" }, // due again in Nov
    ];

    const due = getDueRecurringPayments(items, "2026-11-19");
    expect(due.map((i) => i.id)).toEqual(["rec-6", "rec-1"]);
  });

  it("coalesces offline budget queue operations cleanly", () => {
    const store = new Map<string, string>();
    const prevStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      },
    });

    try {
      const scope = "c1:u1";
      writeBudgetQueue(scope, []);
      const tx1: BudgetTransaction = {
        id: "offline-1",
        couple_id: "c1",
        user_id: "u1",
        kind: "expense",
        amount: 250,
        merchant: "Кава",
        note: "",
        category_key: "restaurants",
        status: "confirmed",
        source: "manual",
        is_private: false,
        occurred_on: "2026-11-19",
        occurred_at: "2026-11-19T09:00:00Z",
        created_at: "2026-11-19T09:00:00Z",
      };
      let q: BudgetQueueOp[] = [];
      q = enqueueBudgetOp(q, {
        op: "add",
        item: tx1,
        queuedAt: "2026-11-19T09:00:00Z",
      });
      q = enqueueBudgetOp(q, {
        op: "update",
        id: "offline-1",
        patch: { amount: 300, merchant: "Кава та круасан" },
        queuedAt: "2026-11-19T09:01:00Z",
      });
      writeBudgetQueue(scope, q);
      expect(readBudgetQueue(scope)).toHaveLength(1);

      const applied = applyBudgetQueue([], readBudgetQueue(scope));
      expect(applied).toHaveLength(1);
      expect(applied[0].amount).toBe(300);
      expect(applied[0].merchant).toBe("Кава та круасан");

      // Removing a locally-added unsynced transaction cancels it completely
      q = enqueueBudgetOp(q, {
        op: "remove",
        id: "offline-1",
        queuedAt: "2026-11-19T09:02:00Z",
      });
      writeBudgetQueue(scope, q);
      expect(readBudgetQueue(scope)).toHaveLength(0);
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: prevStorage,
      });
    }
  });
});
