import { describe, expect, it } from "vitest";
import {
  INITIAL_BUDGET_SEED,
  SKARBO_EXPENSE_CATEGORIES,
  SKARBO_INCOME_CATEGORIES,
  autoCategorizeMerchant,
  buildSkarboSeedTransactions,
  computeBudgetStats,
  computeSpendingPace,
  formatBudgetDayHeading,
  formatUAH,
  generateBudgetIngestToken,
  getDueRecurringPayments,
  getPeriodRange,
  getPreviousYearMonth,
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
  buildBudgetExportCsv,
  buildBudgetExportJson,
  parseBudgetImportContent,
} from "../src/lib/budget-transfer";
import {
  buildBudgetSankey,
  formatCompactUAH,
} from "../src/lib/budget-sankey";
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

  it("recognizes expanded Ukrainian and international merchants across all categories", () => {
    const cases: Array<[string, string]> = [
      // Clothes (including New Yorker spellings & hyphenated terminals)
      ["NEW YORKER KYIV", "clothes"],
      ["NEW-YORKER LAVINA", "clothes"],
      ["Нью Йоркер", "clothes"],
      ["Нюйоркер", "clothes"],
      ["LC Waikiki Ocean Plaza", "clothes"],
      ["Pull & Bear Kyiv", "clothes"],
      ["H & M River Mall", "clothes"],
      ["Decathlon Kyiv", "clothes"],
      ["Megasport", "clothes"],
      ["Pandora Kyiv", "clothes"],
      ["Intimissimi", "clothes"],
      ["Vsi Svoi", "clothes"],
      ["MustHave Store", "clothes"],
      // Smoking / vape / tobacco / hookah
      ["Табакерка Київ", "smoking"],
      ["FORTUNA TABAK #12", "smoking"],
      ["Сигарний дім Фортуна", "smoking"],
      ["Vape Shop Kyiv", "smoking"],
      ["VapeMarket UA", "smoking"],
      ["DR.SMOKE", "smoking"],
      ["Smoke-House", "smoking"],
      ["Кальянчик", "smoking"],
      ["Dymok Hookah", "smoking"],
      ["Lost Mary Pod", "smoking"],
      ["Chaser Salt", "smoking"],
      ["VELO Snus", "smoking"],
      ["Тютюновий кіоск", "smoking"],
      // Other categories & collision checks
      ["Близенько Львів", "groceries"],
      ["Biedronka Warszawa", "groceries"],
      ["М'ясомаркет", "groceries"],
      ["Ябко Київ", "home"],
      ["Foxtrot", "home"],
      ["ДТЕК Київські електромережі", "home"],
      ["Брокард", "household_chem"],
      ["Аврора Мультимаркет", "household_chem"],
      ["Аптека Доброго Дня", "health"],
      ["Ескулаб", "health"],
      ["Frisor Barbershop", "haircut"],
      ["G.Bar Kyiv", "haircut"],
      ["Takava Coffee", "drinks"],
      ["Море Пива", "drinks"],
      ["Реберня Львів", "restaurants"],
      ["Wolt Delivery", "restaurants"],
      ["Orlen Station", "fuel"],
      ["EcoFactor EV", "fuel"],
      ["Уклон Таксі", "car"],
      ["Автомийка Самообслуговування", "car"],
      ["UNIP Parking", "parking"],
      ["Буковель", "travel"],
      ["WizzAir", "travel"],
      ["Украфлора", "flowers"],
      ["Pethouse.ua", "pets"],
      ["Чудо Острів", "kids"],
      ["Apollo Next", "entertainment"],
      ["Книгарня Є", "entertainment"],
      ["Claude AI", "subscriptions"],
      ["Binance", "currency"],
      ["Оплата частинами", "credit_card"],
      ["єОселя", "mortgage"],
    ];

    for (const [merchant, expected] of cases) {
      expect(
        autoCategorizeMerchant(merchant, [], "expense"),
        `Expected "${merchant}" -> "${expected}"`,
      ).toEqual({
        category_key: expected,
        matched_by: "dictionary",
      });
    }

    expect(autoCategorizeMerchant("Нацкешбек", [], "income")).toEqual({
      category_key: "refund",
      matched_by: "dictionary",
    });
    expect(autoCategorizeMerchant("Upwork Payout", [], "income")).toEqual({
      category_key: "salary",
      matched_by: "dictionary",
    });
  });

  it("computes dynamic period ranges, UAH formatting, and day headings", () => {
    expect(
      getPeriodRange("all_time", "", "", "2026-11-17", "2026-08-01"),
    ).toMatchObject({
      from: "2026-08-01",
      to: "2026-11-17",
    });
    expect(getPeriodRange("all_time", "", "", "2026-11-17")).toMatchObject({
      from: "2000-01-01",
      to: "2026-11-17",
      label: "Весь час",
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

  it("keeps INITIAL_BUDGET_SEED free of personal totals and uses sample demo data", () => {
    expect(INITIAL_BUDGET_SEED.expenses).toHaveLength(0);
    expect(INITIAL_BUDGET_SEED.incomes).toHaveLength(0);
    expect(buildSkarboSeedTransactions(DEMO_COUPLE, DEMO_USER)).toEqual([]);

    const demo = createDemo();
    const range = getPeriodRange("all_time", "", "");
    const stats = computeBudgetStats({
      transactions: demo.budgetTransactions,
      customCategories: demo.budgetCategories,
      budgetSettings: demo.budgetSettings,
      scope: "all",
      userId: DEMO_USER,
      from: range.from,
      to: range.to,
    });

    expect(stats.expenseTotal).toBe(960);
    expect(stats.incomeTotal).toBe(24000);
    expect(stats.balance).toBe(23040);
    expect(stats.expenseRows[0]).toMatchObject({
      key: "groceries",
      name: "Продукти",
      emoji: "🥑",
      color: "#22C55E",
      amount: 640,
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

    const sampleTxs: BudgetTransaction[] = [
      ["groceries", 4200, "Сільпо", "2026-11-10"],
      ["restaurants", 2800, "Кав'ярня", "2026-11-11"],
      ["fuel", 2100, "OKKO", "2026-11-12"],
      ["clothes", 1650, "New Yorker", "2026-11-13"],
      ["home", 1200, "Епіцентр", "2026-11-14"],
      ["health", 800, "Аптека", "2026-11-15"],
      ["entertainment", 450, "Multiplex", "2026-11-16"],
    ].map(([cat, amt, merch, dt], i) => ({
      id: `pdf-tx-${i}`,
      couple_id: DEMO_COUPLE,
      user_id: DEMO_USER,
      kind: "expense" as const,
      amount: Number(amt),
      merchant: String(merch),
      note: "",
      category_key: String(cat),
      status: "confirmed" as const,
      source: "manual" as const,
      is_private: false,
      occurred_on: String(dt),
      occurred_at: `${dt}T12:00:00Z`,
      created_at: `${dt}T12:00:00Z`,
    }));
    sampleTxs.push({
      id: "pdf-inc-1",
      couple_id: DEMO_COUPLE,
      user_id: DEMO_USER,
      kind: "income",
      amount: 25000,
      merchant: "Зарплата",
      note: "",
      category_key: "salary",
      status: "confirmed",
      source: "manual",
      is_private: false,
      occurred_on: "2026-11-05",
      occurred_at: "2026-11-05T12:00:00Z",
      created_at: "2026-11-05T12:00:00Z",
    });

    const range = getPeriodRange("all_time", "", "", "2026-11-17", "2026-08-01");
    const stats = computeBudgetStats({
      transactions: sampleTxs,
      customCategories: [],
      budgetSettings: [],
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
        {
          ...sampleTxs[0],
          id: "extra-aug",
          card_label: "Skarbo",
          occurred_on: "2026-08-10",
        },
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

  it("computes spending pace comparing current month to previous month up to the same day", () => {
    expect(getPreviousYearMonth("2026-11")).toBe("2026-10");
    expect(getPreviousYearMonth("2026-01")).toBe("2025-12");

    const txs: BudgetTransaction[] = [
      // Current month (Nov 2026): Nov 5, Nov 12 (today is Nov 20) -> total 3000
      {
        id: "tx-1",
        couple_id: "c1",
        user_id: "u1",
        kind: "expense",
        amount: 1000,
        merchant: "Сільпо",
        note: "",
        category_key: "groceries",
        status: "confirmed",
        source: "manual",
        is_private: false,
        occurred_on: "2026-11-05",
        occurred_at: "2026-11-05T10:00:00Z",
        created_at: "2026-11-05T10:00:00Z",
      },
      {
        id: "tx-2",
        couple_id: "c1",
        user_id: "u1",
        kind: "expense",
        amount: 2000,
        merchant: "Comfy",
        note: "",
        category_key: "home",
        status: "confirmed",
        source: "manual",
        is_private: false,
        occurred_on: "2026-11-12",
        occurred_at: "2026-11-12T10:00:00Z",
        created_at: "2026-11-12T10:00:00Z",
      },
      // Previous month (Oct 2026): Oct 8 -> 4000 (up to Oct 20)
      {
        id: "tx-3",
        couple_id: "c1",
        user_id: "u1",
        kind: "expense",
        amount: 4000,
        merchant: "Епіцентр",
        note: "",
        category_key: "home",
        status: "confirmed",
        source: "manual",
        is_private: false,
        occurred_on: "2026-10-08",
        occurred_at: "2026-10-08T10:00:00Z",
        created_at: "2026-10-08T10:00:00Z",
      },
      // Previous month after 20th: Oct 25 -> 5000 (should NOT count in same-day comparison)
      {
        id: "tx-4",
        couple_id: "c1",
        user_id: "u1",
        kind: "expense",
        amount: 5000,
        merchant: "Rozetka",
        note: "",
        category_key: "home",
        status: "confirmed",
        source: "manual",
        is_private: false,
        occurred_on: "2026-10-25",
        occurred_at: "2026-10-25T10:00:00Z",
        created_at: "2026-10-25T10:00:00Z",
      },
    ];

    const pace = computeSpendingPace(txs, "2026-11-20");
    expect(pace.currentDay).toBe(20);
    expect(pace.currentSpentSoFar).toBe(3000);
    expect(pace.prevSpentSameDay).toBe(4000);
    expect(pace.diff).toBe(-1000);
    expect(pace.percentChange).toBe(-25);
    expect(pace.status).toBe("calmer");
    expect(pace.statusText).toContain("−25%");
    expect(pace.dailyAverage).toBe(150); // 3000 / 20
    expect(pace.projectedMonthTotal).toBe(4500); // 150 * 30 days in Nov
  });

  it("builds balanced Sankey cash-flow layouts for surplus, deficit, hidden income, and category tail grouping", () => {
    expect(formatCompactUAH(8450)).toBe("8 450 ₴");
    expect(formatCompactUAH(24500)).toBe("24,5 тис. ₴");
    expect(formatCompactUAH(1250000)).toBe("1,25 млн ₴");

    const incomeRows = [
      { key: "salary", name: "Зарплата", emoji: "💼", color: "#22C55E", amount: 60000, percent: 80, count: 2 },
      { key: "freelance", name: "Фріланс", emoji: "💻", color: "#10B981", amount: 15000, percent: 20, count: 1 },
    ];
    const expenseRows = [
      { key: "home", name: "Житло", emoji: "🏠", color: "#3B82F6", amount: 18000, percent: 40, count: 1 },
      { key: "groceries", name: "Продукти", emoji: "🛒", color: "#F97316", amount: 12000, percent: 26.7, count: 9 },
      { key: "restaurants", name: "Кафе", emoji: "☕", color: "#EC4899", amount: 5000, percent: 11.1, count: 6 },
      { key: "transport", name: "Транспорт", emoji: "🚕", color: "#8B5CF6", amount: 3000, percent: 6.7, count: 4 },
      { key: "health", name: "Здоров'я", emoji: "💊", color: "#14B8A6", amount: 2500, percent: 5.6, count: 2 },
      { key: "fun", name: "Дозвілля", emoji: "🎬", color: "#EAB308", amount: 2000, percent: 4.4, count: 2 },
      { key: "clothes", name: "Одяг", emoji: "👕", color: "#6366F1", amount: 1500, percent: 3.3, count: 1 },
      { key: "gifts", name: "Подарунки", emoji: "🎁", color: "#F43F5E", amount: 1000, percent: 2.2, count: 1 },
    ];

    // 1. Surplus period: income (75 000) > expense (45 000) => 30 000 savings at top of right column + grouped tail
    const surplusLayout = buildBudgetSankey({
      incomeRows,
      expenseRows,
      incomeTotal: 75000,
      expenseTotal: 45000,
    });
    expect(surplusLayout.totalFlow).toBe(75000);
    expect(surplusLayout.surplus).toBe(30000);
    expect(surplusLayout.deficit).toBe(0);
    expect(surplusLayout.savingsRate).toBe(40);
    expect(surplusLayout.rightNodes[0].kind).toBe("savings");
    expect(surplusLayout.rightNodes[0].amount).toBe(30000);
    const tailNode = surplusLayout.rightNodes[surplusLayout.rightNodes.length - 1];
    expect(tailNode.kind).toBe("other_expense");
    expect(tailNode.amount).toBe(4500); // 2000 + 1500 + 1000
    const leftSum = surplusLayout.leftNodes.reduce((s, n) => s + n.amount, 0);
    const rightSum = surplusLayout.rightNodes.reduce((s, n) => s + n.amount, 0);
    expect(leftSum).toBe(75000);
    expect(rightSum).toBe(75000);
    expect(surplusLayout.links).toHaveLength(
      surplusLayout.leftNodes.length + surplusLayout.rightNodes.length,
    );

    // 2. Deficit period: expenses (45 000) > income (30 000) => 15 000 "Із заощаджень" on left
    const deficitLayout = buildBudgetSankey({
      incomeRows: [{ ...incomeRows[0], amount: 30000, percent: 100 }],
      expenseRows: expenseRows.slice(0, 3),
      incomeTotal: 30000,
      expenseTotal: 45000,
    });
    expect(deficitLayout.totalFlow).toBe(45000);
    expect(deficitLayout.surplus).toBe(0);
    expect(deficitLayout.deficit).toBe(15000);
    expect(deficitLayout.leftNodes.some((n) => n.kind === "deficit" && n.amount === 15000)).toBe(true);

    // 3. Hidden partner income: single clean neutral source node on left
    const hiddenLayout = buildBudgetSankey({
      incomeRows: [],
      expenseRows: expenseRows.slice(0, 2),
      incomeTotal: null,
      expenseTotal: 30000,
    });
    expect(hiddenLayout.incomeHidden).toBe(true);
    expect(hiddenLayout.leftNodes).toHaveLength(1);
    expect(hiddenLayout.leftNodes[0].kind).toBe("neutral_source");
    expect(hiddenLayout.leftNodes[0].name).toBe("Дохід приховано");
    expect(hiddenLayout.totalFlow).toBe(30000);
  });

  it("exports and re-imports ours. JSON & CSV backups with deduplication", () => {
    const existing: BudgetTransaction[] = [
      {
        id: "tx-exp-1",
        couple_id: DEMO_COUPLE,
        user_id: DEMO_USER,
        kind: "expense",
        amount: 540.5,
        merchant: "New Yorker",
        note: "Футболка",
        category_key: "clothes",
        status: "confirmed",
        source: "manual",
        is_private: false,
        card_label: "Monobank",
        occurred_on: "2026-11-10",
        occurred_at: "2026-11-10T12:00:00.000Z",
        created_at: "2026-11-10T12:00:00.000Z",
      },
      {
        id: "tx-inc-1",
        couple_id: DEMO_COUPLE,
        user_id: DEMO_USER,
        kind: "income",
        amount: 18500,
        merchant: "Зарплата",
        note: "Аванс",
        category_key: "salary",
        status: "confirmed",
        source: "manual",
        is_private: true,
        card_label: "",
        occurred_on: "2026-11-05",
        occurred_at: "2026-11-05T10:00:00.000Z",
        created_at: "2026-11-05T10:00:00.000Z",
      },
    ];

    const jsonPayload = buildBudgetExportJson({
      transactions: existing,
      customCategories: [],
      merchantRules: [],
      userId: DEMO_USER,
    });
    const jsonText = JSON.stringify(jsonPayload);
    const jsonPreviewFresh = parseBudgetImportContent({
      text: jsonText,
      fileName: "ours-budget.json",
      existingTransactions: [],
      customCategories: [],
      merchantRules: [],
    });
    expect(jsonPreviewFresh.format).toBe("ours_json");
    expect(jsonPreviewFresh.rows).toHaveLength(2);
    expect(jsonPreviewFresh.rows.filter((r) => r.duplicate)).toHaveLength(0);

    const jsonPreviewDup = parseBudgetImportContent({
      text: jsonText,
      fileName: "ours-budget.json",
      existingTransactions: existing,
      customCategories: [],
      merchantRules: [],
    });
    expect(jsonPreviewDup.rows.filter((r) => r.duplicate)).toHaveLength(2);

    const csvText = buildBudgetExportCsv({
      transactions: existing,
      customCategories: [],
      userId: DEMO_USER,
    });
    expect(csvText.startsWith("\uFEFF")).toBe(true);
    const csvPreview = parseBudgetImportContent({
      text: csvText,
      fileName: "ours-budget.csv",
      existingTransactions: [],
      customCategories: [],
      merchantRules: [],
    });
    expect(csvPreview.format).toBe("ours_csv");
    expect(csvPreview.rows).toHaveLength(2);
    expect(csvPreview.rows.find((r) => r.merchant === "New Yorker")?.category_key).toBe(
      "clothes",
    );
  });

  it("imports Monobank and PrivatBank CSV statements with merchant dictionary and MCC fallback", () => {
    const monoCsv = [
      "Дата i час операції,Деталі операції,MCC,Сума в валюті картки (UAH),Сума в валюті операції,Валюта",
      "18.11.2026 14:22:10,NEW YORKER LAVINA,5651,-1299.00,-1299.00,UAH",
      "18.11.2026 16:05:00,ФOP NONAME KIOSK,5993,-245.50,-245.50,UAH",
      "19.11.2026 09:00:00,Нацкешбек,6012,350.00,350.00,UAH",
    ].join("\n");

    const monoPreview = parseBudgetImportContent({
      text: monoCsv,
      fileName: "mono-statement.csv",
      existingTransactions: [],
      customCategories: [],
      merchantRules: [],
    });
    expect(monoPreview.format).toBe("monobank_csv");
    expect(monoPreview.rows).toHaveLength(3);
    expect(monoPreview.rows[0]).toMatchObject({
      kind: "expense",
      amount: 1299,
      category_key: "clothes",
      occurred_on: "2026-11-18",
      card_label: "Monobank",
    });
    expect(monoPreview.rows[1]).toMatchObject({
      kind: "expense",
      amount: 245.5,
      category_key: "smoking",
      categorizedBy: "mcc",
    });
    expect(monoPreview.rows[2]).toMatchObject({
      kind: "income",
      amount: 350,
      category_key: "refund",
    });

    const privatCsv = [
      "Виписка по картці ПриватБанк",
      "Дата;Час;Категорія;Картка;Опис операції;Сума в валюті картки;Валюта картки",
      "17.11.2026;19:15;Продукти харчування;5168****1234;Сільпо Київ;-812,40;UAH",
      "17.11.2026;20:00;Медицина;5168****1234;ФОП Петренко;-1 500,00;UAH",
    ].join("\n");

    const privatPreview = parseBudgetImportContent({
      text: privatCsv,
      fileName: "privat.csv",
      existingTransactions: [],
      customCategories: [],
      merchantRules: [],
    });
    expect(privatPreview.format).toBe("privatbank_csv");
    expect(privatPreview.rows).toHaveLength(2);
    expect(privatPreview.rows[0]).toMatchObject({
      kind: "expense",
      amount: 812.4,
      category_key: "groceries",
      occurred_on: "2026-11-17",
    });
    expect(privatPreview.rows[1]).toMatchObject({
      kind: "expense",
      amount: 1500,
      category_key: "health",
      categorizedBy: "bank_category",
    });
  });
});
