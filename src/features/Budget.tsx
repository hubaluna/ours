import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence } from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  FileDown,
  HelpCircle,
  Lock,
  Plus,
  Repeat2,
  Search,
  Settings2,
  Smartphone,
  SquarePen,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useApp } from "../hooks/AppContext";
import {
  CUSTOM_CATEGORY_EMOJIS,
  SKARBO_SEED_NOTE,
  autoCategorizeMerchant,
  budgetIngestUrl,
  computeBudgetStats,
  findCategoryMeta,
  formatBudgetDayHeading,
  formatUAH,
  getPeriodRange,
  normalizeCategoryKey,
  parseApplePayAmount,
  resolveBudgetCategories,
  suggestRulePattern,
  type BudgetKind,
  type BudgetMemberScope,
  type BudgetPeriodPreset,
} from "../lib/budget";
import { exportBudgetPdfReport } from "../lib/budget-pdf";
import type {
  BudgetTokenStatus,
  BudgetTransaction,
} from "../lib/types";
import { kyivDate } from "../lib/utils";
import { Avatar, BottomSheet, Button, Field, IconButton } from "../components/ui";

type HeroMetricTab = "expense" | "income" | "balance";
type ViewMode = "overview" | "analytics";

export default function Budget() {
  const {
    data,
    userId,
    pending,
    notify,
    addBudgetTransaction,
    updateBudgetTransaction,
    removeBudgetTransaction,
    categorizeBudgetTransaction,
    addBudgetCategory,
    removeBudgetCategory,
    saveBudgetMerchantRule,
    removeBudgetMerchantRule,
    setBudgetIncomeSharing,
    fetchBudgetIngestTokenStatus,
    rotateBudgetIngestToken,
    revokeBudgetIngestToken,
  } = useApp();

  const today = kyivDate();
  const [periodPreset, setPeriodPreset] =
    useState<BudgetPeriodPreset>("all_time");
  const [customFrom, setCustomFrom] = useState("2026-08-01");
  const [customTo, setCustomTo] = useState(today);
  const [scope, setScope] = useState<BudgetMemberScope>("all");
  const [heroTab, setHeroTab] = useState<HeroMetricTab>("balance");
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [showAllExpenseCats, setShowAllExpenseCats] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [txLimit, setTxLimit] = useState(30);

  // Modals / BottomSheets
  const [txSheetOpen, setTxSheetOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<BudgetTransaction | null>(null);
  const [reviewTx, setReviewTx] = useState<BudgetTransaction | null>(null);
  const [repeatSheetOpen, setRepeatSheetOpen] = useState(false);
  const [categorySheetKind, setCategorySheetKind] =
    useState<BudgetKind | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const opsCardRef = useRef<HTMLDivElement>(null);

  const partner = data.profiles.find((p) => p.id !== userId);
  const mySettings = data.budgetSettings.find((s) => s.user_id === userId);
  const myShareIncome = mySettings?.share_income_with_partner ?? false;

  const period = useMemo(
    () => getPeriodRange(periodPreset, customFrom, customTo, today),
    [periodPreset, customFrom, customTo, today],
  );

  const stats = useMemo(
    () =>
      computeBudgetStats({
        transactions: data.budgetTransactions,
        customCategories: data.budgetCategories,
        budgetSettings: data.budgetSettings,
        scope,
        userId,
        from: period.from,
        to: period.to,
      }),
    [
      data.budgetTransactions,
      data.budgetCategories,
      data.budgetSettings,
      scope,
      userId,
      period.from,
      period.to,
    ],
  );

  const needsReviewTxs = useMemo(
    () =>
      data.budgetTransactions
        .filter(
          (tx) =>
            tx.status === "needs_review" &&
            (!tx.is_private || tx.user_id === userId),
        )
        .sort(
          (a, b) =>
            b.occurred_on.localeCompare(a.occurred_on) ||
            b.occurred_at.localeCompare(a.occurred_at),
        ),
    [data.budgetTransactions, userId],
  );

  const expenseCategories = useMemo(
    () => resolveBudgetCategories(data.budgetCategories, "expense"),
    [data.budgetCategories],
  );
  const incomeCategories = useMemo(
    () => resolveBudgetCategories(data.budgetCategories, "income"),
    [data.budgetCategories],
  );

  const visibleOperations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stats.filteredTransactions.filter((tx) => {
      if (categoryFilter) {
        const txKey = normalizeCategoryKey(tx.category_key, tx.kind);
        if (txKey !== categoryFilter) return false;
      }
      if (q) {
        const meta = findCategoryMeta(
          tx.status === "needs_review" ? null : tx.category_key,
          data.budgetCategories,
          tx.kind,
        );
        const hay = `${tx.merchant} ${tx.note} ${meta.name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [stats.filteredTransactions, categoryFilter, searchQuery, data.budgetCategories]);

  const displayedOperations = useMemo(
    () => visibleOperations.slice(0, txLimit),
    [visibleOperations, txLimit],
  );

  const frequentTemplates = useMemo(() => {
    const seen = new Map<string, { tx: BudgetTransaction; count: number }>();
    const sorted = [...data.budgetTransactions]
      .filter((tx) => tx.status === "confirmed" && (!tx.is_private || tx.user_id === userId))
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    for (const tx of sorted) {
      const key = `${tx.kind}:${tx.merchant.toLowerCase()}:${tx.amount}:${tx.category_key ?? ""}`;
      const existing = seen.get(key);
      if (existing) existing.count += 1;
      else seen.set(key, { tx, count: 1 });
    }
    return [...seen.values()]
      .sort((a, b) => b.count - a.count || b.tx.occurred_at.localeCompare(a.tx.occurred_at))
      .slice(0, 8)
      .map((entry) => entry.tx);
  }, [data.budgetTransactions, userId]);

  const handleExportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const scopeLabel =
        scope === "mine"
          ? "Тільки мої"
          : scope === "partner"
            ? partner?.name || "Партнера"
            : "Разом";
      const generatedAtLabel = new Intl.DateTimeFormat("uk-UA", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Kyiv",
      }).format(new Date());
      const result = await exportBudgetPdfReport({
        periodLabel: period.label,
        periodFrom: period.from,
        periodTo: period.to,
        scopeLabel,
        generatedAtLabel,
        expenseTotal: stats.expenseTotal,
        incomeTotal: stats.incomeTotal,
        balance: stats.balance,
        savingsRate: stats.savingsRate,
        expenseRows: stats.expenseRows,
        incomeRows: stats.incomeRows,
        transactions: stats.filteredTransactions,
      });
      notify(
        result === "shared"
          ? "PDF-звіт готовий до збереження"
          : "PDF-звіт завантажено",
      );
    } catch {
      notify("Не вдалося сформувати PDF-звіт");
    } finally {
      setExportingPdf(false);
    }
  };

  const openNewTransaction = (preset?: Partial<BudgetTransaction>) => {
    const defaultKind: BudgetKind =
      preset?.kind ?? (heroTab === "income" ? "income" : "expense");
    setEditingTx(
      preset
        ? ({
            id: "",
            couple_id: "",
            user_id: userId,
            kind: defaultKind,
            amount: preset.amount ?? 0,
            merchant: preset.merchant ?? "",
            note: preset.note ?? "",
            category_key: preset.category_key ?? null,
            status: "confirmed",
            source: "manual",
            is_private: defaultKind === "income" ? !myShareIncome : false,
            card_label: "",
            occurred_on: today,
            occurred_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          } as BudgetTransaction)
        : null,
    );
    setTxSheetOpen(true);
  };

  const handleRepeatTemplate = async (tpl: BudgetTransaction) => {
    const ok = await addBudgetTransaction({
      kind: tpl.kind,
      amount: tpl.amount,
      merchant: tpl.merchant,
      note: tpl.note,
      category_key: tpl.category_key,
      status: "confirmed",
      source: "manual",
      is_private: tpl.kind === "income" ? !myShareIncome : false,
      occurred_on: today,
    });
    if (ok) setRepeatSheetOpen(false);
  };

  const filterByCategoryAndScroll = (key: string) => {
    setCategoryFilter((prev) => (prev === key ? null : key));
    setViewMode("overview");
    setTxLimit(30);
    setTimeout(() => {
      opsCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const maxExpenseRow = stats.expenseRows[0]?.amount ?? 0;
  const maxIncomeRow = stats.incomeRows[0]?.amount ?? 0;
  const visibleExpenseRows =
    viewMode === "analytics" || showAllExpenseCats
      ? stats.expenseRows
      : stats.expenseRows.slice(0, 5);

  const heroTitle =
    heroTab === "expense"
      ? "Витрачено"
      : heroTab === "income"
        ? "Зароблено"
        : "Залишилось з доходу";

  const heroAmountText =
    heroTab === "expense"
      ? formatUAH(stats.expenseTotal)
      : heroTab === "income"
        ? stats.incomeTotal === null
          ? "Приховано"
          : formatUAH(stats.incomeTotal)
        : stats.balance === null
          ? "—"
          : formatUAH(stats.balance);

  const heroAmountPrefix =
    heroTab === "balance" && stats.balance !== null && stats.balance > 0
      ? "≈ "
      : "";

  return (
    <section className="screen budget-screen">
      <div className="budget-scroll">
        <div className="budget-top-bar">
          <div className="budget-top-title">
            <h1>Бюджет</h1>
            <span>{period.label}</span>
          </div>
          <div className="budget-top-actions">
            <button
              type="button"
              className="budget-pill-btn"
              disabled={exportingPdf}
              aria-label="Експортувати PDF-звіт"
              onClick={() => void handleExportPdf()}
            >
              <FileDown size={15} />
              <span>PDF</span>
            </button>
            <IconButton
              label="Налаштування бюджету та Apple Pay"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={18} />
            </IconButton>
          </div>
        </div>

        <div className="budget-period-chips" role="tablist" aria-label="Період">
          {(
            [
              ["all_time", "Весь час"],
              ["this_month", "Цей місяць"],
              ["prev_month", "Минулий"],
              ["custom", "Період"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={periodPreset === id}
              className={`budget-period-chip ${periodPreset === id ? "active" : ""}`}
              onClick={() => setPeriodPreset(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {periodPreset === "custom" && (
          <div className="budget-custom-dates">
            <label>
              <span>Від</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label>
              <span>До</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </div>
        )}

        {needsReviewTxs.length > 0 && (
          <div className="budget-review-box">
            <div className="budget-review-head">
              <span>
                <HelpCircle size={15} />
                <strong>Потребують категорії ({needsReviewTxs.length})</strong>
              </span>
              <small>Apple Pay</small>
            </div>
            <div className="budget-review-list">
              {needsReviewTxs.slice(0, 3).map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  className="budget-review-item"
                  onClick={() => setReviewTx(tx)}
                >
                  <span className="budget-review-copy">
                    <strong>{tx.merchant || "Apple Pay"}</strong>
                    <small>
                      {formatBudgetDayHeading(tx.occurred_on, today)}
                      {tx.card_label ? ` · ${tx.card_label}` : ""}
                    </small>
                  </span>
                  <span className="budget-review-right">
                    <strong>{formatUAH(tx.amount)}</strong>
                    <span className="budget-review-cta">Обрати</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="budget-hero-card glass">
          <div className="budget-hero-tabs" role="tablist">
            {(
              [
                ["expense", "Витрати"],
                ["income", "Доходи"],
                ["balance", "Залишилось"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={heroTab === id}
                className={heroTab === id ? "active" : ""}
                onClick={() => setHeroTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="budget-hero-body">
            <span className="budget-hero-caption">{heroTitle}</span>
            <strong
              className={`budget-hero-value ${
                heroTab === "balance" && stats.balance !== null && stats.balance < 0
                  ? "is-negative"
                  : ""
              }`}
            >
              {heroAmountPrefix}
              {heroAmountText}
            </strong>
            <div className="budget-hero-sub">
              <span>
                Заробив{" "}
                {stats.incomeTotal === null ? "—" : formatUAH(stats.incomeTotal)} ·
                Витратив {formatUAH(stats.expenseTotal)}
              </span>
              {stats.savingsRate !== null && (
                <span className="budget-hero-rate">
                  Норма заощаджень {stats.savingsRate}%
                </span>
              )}
            </div>
          </div>

          <div className="budget-scope-bar" role="tablist" aria-label="Учасник">
            {(
              [
                ["all", "Разом"],
                ["mine", "Мої"],
                ["partner", partner?.name || "Партнера"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={scope === id}
                className={scope === id ? "active" : ""}
                onClick={() => setScope(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="segmented budget-view-switch" role="tablist">
          {(
            [
              ["overview", "Список"],
              ["analytics", "Аналітика"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={viewMode === id}
              className={viewMode === id ? "active" : ""}
              onClick={() => setViewMode(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {viewMode === "analytics" && (
          <div className="budget-section-card glass">
            <div className="budget-section-head">
              <h2>Баланс періоду</h2>
              <span className="budget-section-meta">
                {stats.savingsRate !== null ? `Заощаджено ${stats.savingsRate}%` : "UAH"}
              </span>
            </div>
            <div className="budget-ratio-grid">
              <div className="budget-ratio-row">
                <div>
                  <span>Доходи</span>
                  <strong className="is-income">
                    {stats.incomeTotal === null
                      ? "Приховано"
                      : formatUAH(stats.incomeTotal)}
                  </strong>
                </div>
                <div className="budget-skarbo-track">
                  <div
                    className="budget-skarbo-fill"
                    style={{
                      width: `${
                        stats.incomeTotal && stats.incomeTotal > 0
                          ? Math.min(
                              100,
                              (stats.incomeTotal /
                                Math.max(stats.incomeTotal, stats.expenseTotal, 1)) *
                                100,
                            )
                          : 0
                      }%`,
                      backgroundColor: "#22C55E",
                    }}
                  />
                </div>
              </div>
              <div className="budget-ratio-row">
                <div>
                  <span>Витрати</span>
                  <strong>{formatUAH(stats.expenseTotal)}</strong>
                </div>
                <div className="budget-skarbo-track">
                  <div
                    className="budget-skarbo-fill"
                    style={{
                      width: `${
                        stats.expenseTotal > 0
                          ? Math.min(
                              100,
                              (stats.expenseTotal /
                                Math.max(stats.incomeTotal ?? 0, stats.expenseTotal, 1)) *
                                100,
                            )
                          : 0
                      }%`,
                      backgroundColor: "#EF4444",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Card 1: За категоріями */}
        <div className="budget-section-card glass">
          <div className="budget-section-head">
            <h2>За категоріями</h2>
            <button
              type="button"
              className="budget-inline-link"
              onClick={() => setCategorySheetKind("expense")}
            >
              + Категорія
            </button>
          </div>

          {stats.expenseRows.length === 0 ? (
            <div className="budget-empty-inline">
              <Wallet size={20} />
              <span>За обраний період витрат немає</span>
            </div>
          ) : (
            <>
              <div className="budget-skarbo-cat-list">
                {visibleExpenseRows.map((row) => {
                  const barPct =
                    maxExpenseRow > 0
                      ? Math.max(3, (row.amount / maxExpenseRow) * 100)
                      : 0;
                  const active = categoryFilter === row.key;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      className={`budget-skarbo-cat-row ${active ? "active" : ""}`}
                      onClick={() => filterByCategoryAndScroll(row.key)}
                    >
                      <div className="budget-skarbo-cat-top">
                        <span className="budget-skarbo-cat-name">
                          <span aria-hidden="true">{row.emoji}</span>
                          <span>{row.name}</span>
                          {viewMode === "analytics" && (
                            <small>{Math.round(row.percent)}%</small>
                          )}
                        </span>
                        <span className="budget-skarbo-cat-right">
                          <strong>{formatUAH(row.amount)}</strong>
                          <ChevronRight size={14} className="budget-row-chevron" />
                        </span>
                      </div>
                      <div className="budget-skarbo-track" aria-hidden="true">
                        <div
                          className="budget-skarbo-fill"
                          style={{
                            width: `${barPct}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {viewMode === "overview" && stats.expenseRows.length > 5 && (
                <button
                  type="button"
                  className="budget-expand-btn"
                  onClick={() => setShowAllExpenseCats((v) => !v)}
                  aria-expanded={showAllExpenseCats}
                >
                  {showAllExpenseCats ? (
                    <>
                      <span>Згорнути</span>
                      <ChevronUp size={15} />
                    </>
                  ) : (
                    <>
                      <span>Показати всі {stats.expenseRows.length}</span>
                      <ChevronDown size={15} />
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* Card 2: Доходи */}
        <div className="budget-section-card glass">
          <div className="budget-section-head">
            <h2>Доходи</h2>
            <button
              type="button"
              className="budget-privacy-chip"
              onClick={() => void setBudgetIncomeSharing(!myShareIncome)}
            >
              {myShareIncome ? <Eye size={13} /> : <EyeOff size={13} />}
              <span>{myShareIncome ? "Спільні" : "Тільки мої"}</span>
            </button>
          </div>

          {scope === "partner" && stats.incomeTotal === null ? (
            <div className="budget-empty-inline">
              <Lock size={16} />
              <span>Доходи партнера приховані</span>
            </div>
          ) : stats.incomeRows.length === 0 ? (
            <div className="budget-empty-inline">
              <span>За обраний період доходів немає</span>
            </div>
          ) : (
            <div className="budget-skarbo-cat-list">
              {stats.incomeRows.map((row) => {
                const barPct =
                  maxIncomeRow > 0
                    ? Math.max(4, (row.amount / maxIncomeRow) * 100)
                    : 0;
                const active = categoryFilter === row.key;
                return (
                  <button
                    key={row.key}
                    type="button"
                    className={`budget-skarbo-cat-row ${active ? "active" : ""}`}
                    onClick={() => filterByCategoryAndScroll(row.key)}
                  >
                    <div className="budget-skarbo-cat-top">
                      <span className="budget-skarbo-cat-name">
                        <span aria-hidden="true">{row.emoji}</span>
                        <span>{row.name}</span>
                      </span>
                      <span className="budget-skarbo-cat-right">
                        <strong className="is-income">
                          +{formatUAH(row.amount)}
                        </strong>
                        <ChevronRight size={14} className="budget-row-chevron" />
                      </span>
                    </div>
                    <div className="budget-skarbo-track" aria-hidden="true">
                      <div
                        className="budget-skarbo-fill"
                        style={{
                          width: `${barPct}%`,
                          backgroundColor: row.color,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Card 3: Операції */}
        {viewMode === "overview" && (
          <div className="budget-section-card glass" ref={opsCardRef}>
            <div className="budget-section-head">
              <h2>Операції · {visibleOperations.length}</h2>
              <div className="budget-ops-head-actions">
                {frequentTemplates.length > 0 && (
                  <button
                    type="button"
                    className="budget-icon-mini"
                    aria-label="Повторити операцію"
                    onClick={() => setRepeatSheetOpen(true)}
                  >
                    <Repeat2 size={16} />
                  </button>
                )}
                <button
                  type="button"
                  className={`budget-icon-mini ${searchOpen ? "active" : ""}`}
                  aria-label="Пошук операцій"
                  onClick={() => {
                    setSearchOpen((v) => !v);
                    if (searchOpen) setSearchQuery("");
                  }}
                >
                  <Search size={16} />
                </button>
              </div>
            </div>

            {searchOpen && (
              <div className="budget-search-box">
                <Search size={15} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Пошук за назвою або категорією..."
                  aria-label="Пошук за назвою або категорією"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Очистити пошук"
                    onClick={() => setSearchQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            {categoryFilter && (
              <div className="budget-filter-bar">
                <button
                  type="button"
                  className="budget-filter-tag"
                  onClick={() => setCategoryFilter(null)}
                >
                  <span>
                    {findCategoryMeta(categoryFilter, data.budgetCategories).emoji}{" "}
                    {findCategoryMeta(categoryFilter, data.budgetCategories).name}
                  </span>
                  <X size={13} />
                </button>
              </div>
            )}

            {displayedOperations.length === 0 ? (
              <div className="budget-empty-inline">
                <Wallet size={18} />
                <span>
                  {searchQuery || categoryFilter
                    ? "За цим фільтром операцій не знайдено"
                    : "Операцій за обраний період ще немає"}
                </span>
              </div>
            ) : (
              <>
                <div className="budget-skarbo-tx-list">
                  {displayedOperations.map((tx) => {
                    const meta = findCategoryMeta(
                      tx.status === "needs_review" ? null : tx.category_key,
                      data.budgetCategories,
                      tx.kind,
                    );
                    const actor = data.profiles.find((p) => p.id === tx.user_id);
                    return (
                      <button
                        key={tx.id}
                        type="button"
                        className={`budget-skarbo-tx-row ${
                          tx.status === "needs_review" ? "is-pending" : ""
                        }`}
                        onClick={() => {
                          if (tx.status === "needs_review") {
                            setReviewTx(tx);
                          } else {
                            setEditingTx(tx);
                            setTxSheetOpen(true);
                          }
                        }}
                      >
                        <span
                          className="budget-skarbo-tx-tile"
                          aria-hidden="true"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${meta.color} 18%, transparent)`,
                            borderColor: `color-mix(in srgb, ${meta.color} 32%, transparent)`,
                          }}
                        >
                          {meta.emoji}
                        </span>
                        <span className="budget-tx-body">
                          <strong>
                            {tx.merchant || meta.name}
                            {tx.is_private && (
                              <Lock
                                size={12}
                                className="budget-lock-icon"
                                aria-label="Приватний запис"
                              />
                            )}
                          </strong>
                          <small>
                            {tx.note === SKARBO_SEED_NOTE || tx.card_label === "Skarbo"
                              ? "серп.–лист. 2026"
                              : formatBudgetDayHeading(tx.occurred_on, today)}{" "}
                            · {meta.name}
                            {tx.source === "apple_pay" ? " · Apple Pay" : ""}
                          </small>
                        </span>
                        <span className="budget-tx-right">
                          <strong
                            className={`budget-tx-amount ${
                              tx.kind === "income" ? "is-income" : "is-expense"
                            }`}
                          >
                            {formatUAH(tx.amount, {
                              signed: true,
                              kind: tx.kind,
                            })}
                          </strong>
                          {actor && data.profiles.length > 1 && (
                            <Avatar
                              name={actor.name}
                              path={actor.avatar_path}
                              size="small"
                            />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {visibleOperations.length > displayedOperations.length && (
                  <button
                    type="button"
                    className="budget-expand-btn"
                    onClick={() => setTxLimit((prev) => prev + 50)}
                  >
                    <span>
                      Показати ще{" "}
                      {Math.min(50, visibleOperations.length - displayedOperations.length)}
                    </span>
                    <ChevronDown size={15} />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Prominent persistent bottom CTA above nav bar */}
      <div className="budget-floating-cta-wrap">
        <button
          type="button"
          className="budget-floating-cta"
          onClick={() => openNewTransaction()}
        >
          <SquarePen size={17} />
          <span>Додати операцію</span>
        </button>
      </div>

      <AnimatePresence>
        {reviewTx && (
          <BudgetReviewSheet
            tx={reviewTx}
            categories={
              reviewTx.kind === "income" ? incomeCategories : expenseCategories
            }
            busy={pending.includes(`categorize-${reviewTx.id}`)}
            onClose={() => setReviewTx(null)}
            onCategorize={async (categoryKey, saveRule, rulePattern) => {
              const ok = await categorizeBudgetTransaction(
                reviewTx.id,
                categoryKey,
                saveRule,
                rulePattern,
              );
              if (ok) {
                const remaining = needsReviewTxs.filter(
                  (item) => item.id !== reviewTx.id,
                );
                setReviewTx(remaining[0] ?? null);
              }
            }}
            onEditFull={() => {
              const tx = reviewTx;
              setReviewTx(null);
              setEditingTx(tx);
              setTxSheetOpen(true);
            }}
            onDelete={async () => {
              const id = reviewTx.id;
              if (await removeBudgetTransaction(id)) {
                setReviewTx(null);
              }
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {txSheetOpen && (
          <BudgetTxSheet
            initial={editingTx}
            today={today}
            myShareIncome={myShareIncome}
            expenseCategories={expenseCategories}
            incomeCategories={incomeCategories}
            rules={data.budgetMerchantRules}
            busy={
              pending.includes("add-budget-tx") ||
              (editingTx?.id ? pending.includes(`budget-tx-${editingTx.id}`) : false)
            }
            notify={notify}
            onClose={() => {
              setTxSheetOpen(false);
              setEditingTx(null);
            }}
            onOpenNewCategory={(kind) => setCategorySheetKind(kind)}
            onSave={async (payload) => {
              if (editingTx?.id) {
                const ok = await updateBudgetTransaction(editingTx.id, {
                  kind: payload.kind,
                  amount: payload.amount,
                  merchant: payload.merchant,
                  note: payload.note ?? "",
                  category_key: payload.category_key,
                  status: payload.category_key ? "confirmed" : "needs_review",
                  is_private: payload.is_private ?? false,
                  occurred_on: payload.occurred_on,
                });
                if (ok) {
                  setTxSheetOpen(false);
                  setEditingTx(null);
                }
              } else {
                const ok = await addBudgetTransaction(payload);
                if (ok) {
                  if (
                    payload.occurred_on < period.from ||
                    payload.occurred_on > period.to
                  ) {
                    setPeriodPreset("all_time");
                  }
                  setTxSheetOpen(false);
                  setEditingTx(null);
                }
              }
            }}
            onRepeat={
              editingTx?.id
                ? async () => {
                    await addBudgetTransaction({
                      kind: editingTx.kind,
                      amount: editingTx.amount,
                      merchant: editingTx.merchant,
                      note: editingTx.note,
                      category_key: editingTx.category_key,
                      status: "confirmed",
                      source: "manual",
                      is_private:
                        editingTx.kind === "income" ? !myShareIncome : false,
                      occurred_on: today,
                    });
                    setTxSheetOpen(false);
                    setEditingTx(null);
                  }
                : undefined
            }
            onDelete={
              editingTx?.id
                ? async () => {
                    if (await removeBudgetTransaction(editingTx.id)) {
                      setTxSheetOpen(false);
                      setEditingTx(null);
                    }
                  }
                : undefined
            }
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {repeatSheetOpen && (
          <BottomSheet
            title="Повторити операцію"
            onClose={() => setRepeatSheetOpen(false)}
          >
            <div className="budget-repeat-list">
              {frequentTemplates.map((tpl) => {
                const meta = findCategoryMeta(
                  tpl.category_key,
                  data.budgetCategories,
                  tpl.kind,
                );
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    className="budget-skarbo-tx-row"
                    onClick={() => void handleRepeatTemplate(tpl)}
                  >
                    <span
                      className="budget-skarbo-tx-tile"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${meta.color} 18%, transparent)`,
                      }}
                    >
                      {meta.emoji}
                    </span>
                    <span className="budget-tx-body">
                      <strong>{tpl.merchant || meta.name}</strong>
                      <small>{meta.name}</small>
                    </span>
                    <strong
                      className={`budget-tx-amount ${
                        tpl.kind === "income" ? "is-income" : "is-expense"
                      }`}
                    >
                      {formatUAH(tpl.amount, { signed: true, kind: tpl.kind })}
                    </strong>
                  </button>
                );
              })}
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {categorySheetKind && (
          <BudgetCategorySheet
            kind={categorySheetKind}
            busy={pending.includes("add-budget-cat")}
            onClose={() => setCategorySheetKind(null)}
            onCreate={async (name, emoji) => {
              const ok = await addBudgetCategory({
                kind: categorySheetKind,
                name,
                emoji,
              });
              if (ok) setCategorySheetKind(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {settingsOpen && (
          <BudgetSettingsSheet
            myShareIncome={myShareIncome}
            customCategories={data.budgetCategories}
            expenseCategories={expenseCategories}
            incomeCategories={incomeCategories}
            rules={data.budgetMerchantRules}
            pending={pending}
            notify={notify}
            onClose={() => setSettingsOpen(false)}
            onToggleShareIncome={(share) => void setBudgetIncomeSharing(share)}
            onAddCategory={() => setCategorySheetKind("expense")}
            onDeleteCategory={(id) => void removeBudgetCategory(id)}
            onSaveRule={(pattern, categoryKey, kind) =>
              saveBudgetMerchantRule(pattern, categoryKey, kind)
            }
            onDeleteRule={(id) => void removeBudgetMerchantRule(id)}
            fetchTokenStatus={fetchBudgetIngestTokenStatus}
            rotateToken={rotateBudgetIngestToken}
            revokeToken={revokeBudgetIngestToken}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

export function BudgetReviewSheet({
  tx,
  categories,
  busy,
  onClose,
  onCategorize,
  onEditFull,
  onDelete,
}: {
  tx: BudgetTransaction;
  categories: ReturnType<typeof resolveBudgetCategories>;
  busy: boolean;
  onClose: () => void;
  onCategorize: (
    categoryKey: string,
    saveRule: boolean,
    rulePattern: string,
  ) => Promise<void>;
  onEditFull?: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [saveRule, setSaveRule] = useState(true);
  const [pattern, setPattern] = useState(() =>
    suggestRulePattern(tx.merchant || ""),
  );

  useEffect(() => {
    setPattern(suggestRulePattern(tx.merchant || ""));
    setSaveRule(true);
  }, [tx.id, tx.merchant]);

  return (
    <BottomSheet title="Оберіть категорію" onClose={onClose}>
      <div className="budget-review-modal">
        <div className="budget-review-hero">
          <div className="budget-review-amount">{formatUAH(tx.amount)}</div>
          <div className="budget-review-merchant">
            {tx.merchant || "Оплата Apple Pay"}
          </div>
          <small>
            {formatBudgetDayHeading(tx.occurred_on)}
            {tx.card_label ? ` · ${tx.card_label}` : ""}
          </small>
        </div>

        <label className="budget-rule-remember">
          <input
            type="checkbox"
            checked={saveRule}
            onChange={(e) => setSaveRule(e.target.checked)}
          />
          <span>Запам’ятати продавця для автовибору</span>
        </label>

        {saveRule && (
          <Field label="Шаблон продавця для правила">
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              maxLength={120}
              placeholder="Напр.: FOP IVANOV"
            />
          </Field>
        )}

        <div className="budget-cat-grid">
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              disabled={busy}
              className="budget-cat-tile"
              onClick={() => void onCategorize(cat.key, saveRule, pattern)}
            >
              <span
                className="budget-cat-tile-dot"
                style={{ backgroundColor: cat.color }}
                aria-hidden="true"
              />
              <span className="budget-cat-tile-emoji">{cat.emoji}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>

        {(onEditFull || onDelete) && (
          <div className="budget-review-footer">
            {onEditFull && (
              <Button type="button" className="ghost" onClick={onEditFull}>
                Змінити деталі
              </Button>
            )}
            {onDelete && (
              <Button
                type="button"
                className="danger ghost"
                onClick={() => void onDelete()}
              >
                <Trash2 size={15} />
                Видалити
              </Button>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function BudgetTxSheet({
  initial,
  today,
  myShareIncome,
  expenseCategories,
  incomeCategories,
  rules,
  busy,
  notify,
  onClose,
  onOpenNewCategory,
  onSave,
  onRepeat,
  onDelete,
}: {
  initial: BudgetTransaction | null;
  today: string;
  myShareIncome: boolean;
  expenseCategories: ReturnType<typeof resolveBudgetCategories>;
  incomeCategories: ReturnType<typeof resolveBudgetCategories>;
  rules: ReturnType<typeof useApp>["data"]["budgetMerchantRules"];
  busy: boolean;
  notify: (msg: string) => void;
  onClose: () => void;
  onOpenNewCategory: (kind: BudgetKind) => void;
  onSave: (payload: {
    kind: BudgetKind;
    amount: number;
    merchant: string;
    note: string;
    category_key: string | null;
    is_private: boolean;
    occurred_on: string;
  }) => Promise<void>;
  onRepeat?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const isEdit = Boolean(initial?.id);
  const [kind, setKind] = useState<BudgetKind>(initial?.kind ?? "expense");
  const [amountStr, setAmountStr] = useState(
    initial && initial.amount > 0 ? String(initial.amount).replace(".", ",") : "",
  );
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [occurredOn, setOccurredOn] = useState(initial?.occurred_on ?? today);
  const [categoryKey, setCategoryKey] = useState<string>(() =>
    normalizeCategoryKey(
      initial?.category_key ??
        ((initial?.kind ?? "expense") === "income" ? "salary" : "groceries"),
      initial?.kind ?? "expense",
    ),
  );
  const [isPrivate, setIsPrivate] = useState(
    initial?.is_private ??
      ((initial?.kind ?? "expense") === "income" ? !myShareIncome : false),
  );
  const [manualCategoryPicked, setManualCategoryPicked] = useState(
    Boolean(initial?.category_key),
  );
  const amountInputRef = useRef<HTMLInputElement>(null);

  const categories = kind === "income" ? incomeCategories : expenseCategories;

  const switchKind = (nextKind: BudgetKind) => {
    setKind(nextKind);
    setCategoryKey(nextKind === "income" ? "salary" : "groceries");
    setIsPrivate(nextKind === "income" ? !myShareIncome : false);
    setManualCategoryPicked(false);
  };

  const handleMerchantChange = (val: string) => {
    setMerchant(val);
    if (!manualCategoryPicked && val.trim().length >= 2) {
      const match = autoCategorizeMerchant(val, rules, kind);
      if (match.category_key) {
        setCategoryKey(match.category_key);
      }
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseApplePayAmount(amountStr);
    if (!parsed) {
      notify("Введіть суму більше 0 ₴");
      amountInputRef.current?.focus();
      return;
    }
    const chosenCat = categories.find((c) => c.key === categoryKey);
    const cleanMerchant =
      merchant.trim() || chosenCat?.name || (kind === "income" ? "Дохід" : "Витрата");
    await onSave({
      kind,
      amount: parsed,
      merchant: cleanMerchant,
      note: note.trim(),
      category_key: categoryKey,
      is_private: isPrivate,
      occurred_on: occurredOn || today,
    });
  };

  return (
    <BottomSheet
      title={isEdit ? "Редагувати операцію" : "Нова операція"}
      onClose={onClose}
    >
      <form className="form budget-tx-form" onSubmit={submit} noValidate>
        <div className="segmented" role="tablist">
          {(
            [
              ["expense", "Витрата"],
              ["income", "Дохід"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={kind === id}
              className={kind === id ? "active" : ""}
              onClick={() => switchKind(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <Field label="Сума (₴)">
          <div className="budget-amount-input-wrap">
            <input
              ref={amountInputRef}
              data-autofocus
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
            />
            <span>₴</span>
          </div>
        </Field>

        <div className="budget-cat-picker-head">
          <span>Категорія</span>
          <button
            type="button"
            className="budget-inline-link"
            onClick={() => onOpenNewCategory(kind)}
          >
            + Власна
          </button>
        </div>
        <div className="budget-cat-grid is-compact">
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              className={`budget-cat-tile ${
                categoryKey === cat.key ? "active" : ""
              }`}
              onClick={() => {
                setCategoryKey(cat.key);
                setManualCategoryPicked(true);
              }}
            >
              <span className="budget-cat-tile-emoji">{cat.emoji}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>

        <Field label={kind === "income" ? "Джерело (необов’язково)" : "Де або на що (необов’язково)"}>
          <input
            value={merchant}
            onChange={(e) => handleMerchantChange(e.target.value)}
            placeholder={
              kind === "income"
                ? "Напр.: Зарплата, Фриланс"
                : "Напр.: Сільпо, Fora, Кава"
            }
            maxLength={160}
          />
        </Field>

        <div className="budget-form-row">
          <Field label="Дата">
            <input
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
            />
          </Field>
          <Field label="Нотатка">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Коментар"
              maxLength={500}
            />
          </Field>
        </div>

        {kind === "income" && (
          <label className="budget-rule-remember">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            <span>Приватний запис (бачите тільки ви)</span>
          </label>
        )}

        <div className="budget-sheet-sticky-actions">
          <Button type="submit" busy={busy}>
            {isEdit ? "Зберегти зміни" : "Додати операцію"}
          </Button>
          {(onRepeat || onDelete) && (
            <div className="budget-sheet-secondary-actions">
              {onRepeat && (
                <Button
                  type="button"
                  className="secondary"
                  onClick={() => void onRepeat()}
                >
                  <Repeat2 size={15} />
                  Повторити
                </Button>
              )}
              {onDelete && (
                <Button
                  type="button"
                  className="danger ghost"
                  onClick={() => void onDelete()}
                >
                  <Trash2 size={15} />
                  Видалити
                </Button>
              )}
            </div>
          )}
        </div>
      </form>
    </BottomSheet>
  );
}

function BudgetCategorySheet({
  kind,
  busy,
  onClose,
  onCreate,
}: {
  kind: BudgetKind;
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string, emoji: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(kind === "income" ? "💼" : "🥑");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreate(name.trim(), emoji);
  };

  return (
    <BottomSheet
      title={
        kind === "income" ? "Нова категорія доходів" : "Нова категорія витрат"
      }
      onClose={onClose}
    >
      <form className="form" onSubmit={submit}>
        <Field label="Назва">
          <input
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Напр.: Подарунки, Спорт, Посилки"
            maxLength={50}
            required
          />
        </Field>
        <div className="budget-emoji-grid">
          {CUSTOM_CATEGORY_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              className={`budget-emoji-btn ${emoji === em ? "active" : ""}`}
              onClick={() => setEmoji(em)}
            >
              {em}
            </button>
          ))}
        </div>
        <div className="budget-sheet-sticky-actions">
          <Button type="submit" busy={busy}>
            Створити категорію
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}

function BudgetSettingsSheet({
  myShareIncome,
  customCategories,
  expenseCategories,
  incomeCategories,
  rules,
  pending,
  notify,
  onClose,
  onToggleShareIncome,
  onAddCategory,
  onDeleteCategory,
  onSaveRule,
  onDeleteRule,
  fetchTokenStatus,
  rotateToken,
  revokeToken,
}: {
  myShareIncome: boolean;
  customCategories: ReturnType<typeof useApp>["data"]["budgetCategories"];
  expenseCategories: ReturnType<typeof resolveBudgetCategories>;
  incomeCategories: ReturnType<typeof resolveBudgetCategories>;
  rules: ReturnType<typeof useApp>["data"]["budgetMerchantRules"];
  pending: string[];
  notify: (text: string) => void;
  onClose: () => void;
  onToggleShareIncome: (share: boolean) => void;
  onAddCategory: () => void;
  onDeleteCategory: (id: string) => void;
  onSaveRule: (
    pattern: string,
    categoryKey: string,
    kind: BudgetKind,
  ) => Promise<boolean>;
  onDeleteRule: (id: string) => void;
  fetchTokenStatus: () => Promise<BudgetTokenStatus>;
  rotateToken: () => Promise<{
    token: string;
    status: BudgetTokenStatus;
  } | null>;
  revokeToken: () => Promise<boolean>;
}) {
  const [activeTab, setActiveTab] = useState<"general" | "apple_pay" | "rules">(
    "general",
  );
  const [guideOpen, setGuideOpen] = useState(false);
  const [tokenStatus, setTokenStatus] =
    useState<BudgetTokenStatus | null>(null);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [rulePattern, setRulePattern] = useState("");
  const [ruleCatKey, setRuleCatKey] = useState("groceries");
  const ingestUrl = budgetIngestUrl();

  useEffect(() => {
    let alive = true;
    void fetchTokenStatus()
      .then((status) => {
        if (alive) setTokenStatus(status);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fetchTokenStatus]);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} скопійовано`);
    } catch {
      notify("Не вдалося скопіювати автоматично");
    }
  };

  const handleGenerateToken = async () => {
    const res = await rotateToken();
    if (res) {
      setRevealedToken(res.token);
      setTokenStatus(res.status);
    }
  };

  const handleRevokeToken = async () => {
    if (await revokeToken()) {
      setRevealedToken(null);
      setTokenStatus({
        has_token: false,
        token_hint: "",
        last_used_at: null,
        created_at: null,
      });
    }
  };

  const handleAddRule = async (e: FormEvent) => {
    e.preventDefault();
    if (!rulePattern.trim()) return;
    if (await onSaveRule(rulePattern, ruleCatKey, "expense")) {
      setRulePattern("");
    }
  };

  const allCategories = [...expenseCategories, ...incomeCategories];

  return (
    <BottomSheet title="Налаштування бюджету" onClose={onClose}>
      <div className="budget-settings-sheet">
        <div
          className="segmented budget-view-switch"
          role="tablist"
          aria-label="Розділи налаштувань"
        >
          {(
            [
              ["general", "Основні"],
              ["apple_pay", "Apple Pay"],
              [
                "rules",
                rules.length > 0 ? `Правила · ${rules.length}` : "Правила",
              ],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              className={activeTab === id ? "active" : ""}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "general" && (
          <div className="budget-settings-panel" role="tabpanel">
            <section className="budget-settings-card">
              <h3>
                <Lock size={15} /> Приватність доходів
              </h3>
              <label className="push-reminder-toggle">
                <input
                  type="checkbox"
                  checked={myShareIncome}
                  disabled={pending.includes("budget-income-sharing")}
                  onChange={(e) => onToggleShareIncome(e.target.checked)}
                />
                <span>
                  <strong>Показувати мої доходи партнеру</strong>
                  <small>
                    За замовчуванням доходи бачите лише ви. Витрати завжди
                    спільні.
                  </small>
                </span>
              </label>
            </section>

            <section className="budget-settings-card">
              <div className="budget-cat-picker-head">
                <h3>Власні категорії</h3>
                <button
                  type="button"
                  className="budget-inline-link"
                  onClick={onAddCategory}
                >
                  + Додати
                </button>
              </div>
              {customCategories.length === 0 ? (
                <p className="settings-help">
                  Поки використовуються стандартні категорії. Ви можете додати
                  власні у будь-який момент.
                </p>
              ) : (
                <div className="budget-rules-list">
                  {customCategories.map((cat) => {
                    const meta = allCategories.find(
                      (c) => c.customId === cat.id,
                    );
                    return (
                      <div className="budget-rule-row" key={cat.id}>
                        <div className="budget-rule-copy">
                          <strong>
                            {meta?.emoji ?? cat.emoji} {cat.name}
                          </strong>
                          <small>
                            {cat.kind === "income" ? "Дохід" : "Витрата"}
                          </small>
                        </div>
                        <IconButton
                          label={`Видалити категорію ${cat.name}`}
                          onClick={() => onDeleteCategory(cat.id)}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === "apple_pay" && (
          <div className="budget-settings-panel" role="tabpanel">
            <section className="budget-settings-card">
              <h3>
                <Smartphone size={15} /> Apple Pay · Команди iPhone
              </h3>
              <p className="settings-help">
                Після оплати Apple Pay iPhone може сам надсилати суму й
                продавця в Ours.
              </p>

              <div className="budget-token-box">
                <div className="budget-token-status">
                  <span>Статус токена:</span>
                  <strong>
                    {tokenStatus?.has_token
                      ? `Активний (••••${tokenStatus.token_hint})`
                      : "Не створено"}
                  </strong>
                </div>
                {tokenStatus?.has_token && (
                  <div className="budget-token-status">
                    <span>Останній запит:</span>
                    <strong>
                      {tokenStatus.last_used_at
                        ? new Intl.DateTimeFormat("uk-UA", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Europe/Kyiv",
                          }).format(new Date(tokenStatus.last_used_at))
                        : "Ще не надходило"}
                    </strong>
                  </div>
                )}
                <div className="budget-token-actions">
                  <Button
                    type="button"
                    busy={pending.includes("rotate-budget-token")}
                    onClick={() => void handleGenerateToken()}
                  >
                    {tokenStatus?.has_token
                      ? "Оновити токен"
                      : "Створити токен"}
                  </Button>
                  {tokenStatus?.has_token && (
                    <Button
                      type="button"
                      className="danger ghost"
                      busy={pending.includes("revoke-budget-token")}
                      onClick={() => void handleRevokeToken()}
                    >
                      Відкликати
                    </Button>
                  )}
                </div>
              </div>

              {revealedToken && (
                <div className="budget-secret-reveal">
                  <small>
                    Збережіть токен зараз — він показується один раз:
                  </small>
                  <div className="budget-copy-row">
                    <code>{revealedToken}</code>
                    <Button
                      type="button"
                      className="secondary"
                      onClick={() => void copyText(revealedToken, "Токен")}
                    >
                      <Copy size={14} />
                      Копіювати
                    </Button>
                  </div>
                </div>
              )}

              <button
                type="button"
                className="budget-guide-toggle"
                aria-expanded={guideOpen}
                onClick={() => setGuideOpen((v) => !v)}
              >
                <span>Покрокова інструкція для iPhone («Команди»)</span>
                {guideOpen ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>

              {guideOpen && (
                <div className="budget-shortcut-guide">
                  <ol>
                    <li>
                      <b>Згенеруйте токен угорі</b> (кнопка «Створити» / «Оновити токен») і не закривайте це вікно, щоб зручно скопіювати дані.
                    </li>
                    <li>
                      <b>Створіть автоматизацію:</b> на iPhone відкрийте додаток{" "}
                      <b>Команди</b> (Shortcuts) → вкладка <b>Автоматизація</b>{" "}
                      → <b>+</b> → <b>Транзакція</b> (Transaction). Оберіть потрібні картки, увімкніть{" "}
                      <b>Запускати негайно</b> (Run Immediately) → <b>Далі</b> →{" "}
                      <b>Нова порожня автоматизація</b>.
                    </li>
                    <li>
                      <b>Додайте дію «Отримати вміст URL»</b> (Get Contents of URL) і вставте посилання:
                      <div className="budget-copy-row">
                        <code>{ingestUrl}</code>
                        <Button
                          type="button"
                          className="ghost"
                          onClick={() => void copyText(ingestUrl, "URL")}
                        >
                          <Copy size={14} />
                        </Button>
                      </div>
                    </li>
                    <li>
                      <b>Метод і заголовок:</b> розгорніть стрілку <b>▸</b> біля URL → оберіть{" "}
                      <b>Метод: POST</b> → у блоці <b>Заголовки</b> (Headers) додайте рядок:
                      <div className="budget-guide-kv">
                        <span>Ключ: <code>Authorization</code></span>
                        <span>
                          Текст:{" "}
                          <code>
                            {revealedToken
                              ? `Bearer ${revealedToken}`
                              : "Bearer ВАШ_ТОКЕН"}
                          </code>
                        </span>
                      </div>
                      {revealedToken && (
                        <div className="budget-copy-row">
                          <code>{`Bearer ${revealedToken}`}</code>
                          <Button
                            type="button"
                            className="ghost"
                            onClick={() =>
                              void copyText(
                                `Bearer ${revealedToken}`,
                                "Заголовок Authorization",
                              )
                            }
                          >
                            <Copy size={14} />
                          </Button>
                        </div>
                      )}
                    </li>
                    <li>
                      <b>Тіло запиту (JSON):</b> оберіть <b>Тіло запиту</b> →{" "}
                      <b>JSON</b> і додайте поля типу <b>Текст</b>, обравши в значеннях змінні з{" "}
                      <b>Вводу команди</b> (Shortcut Input):
                      <ul className="budget-guide-fields">
                        <li>
                          <code>amount</code> → <b>Сума</b> <i>(Amount)</i>
                        </li>
                        <li>
                          <code>merchant</code> → <b>Продавець</b> <i>(Merchant)</i>
                        </li>
                        <li>
                          <code>card</code> → <b>Картка</b> <i>(Card or Pass, за бажанням)</i>
                        </li>
                      </ul>
                    </li>
                  </ol>
                  <p className="budget-guide-note">
                    Якщо оплата не підтягнулась: перевірте, що в заголовку є слово{" "}
                    <code>Bearer </code> перед токеном, а після <b>Транзакція</b> увімкнено{" "}
                    <b>Запускати негайно</b> (для оплат з Apple Watch тригер на iPhone інколи не спрацьовує).
                  </p>
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === "rules" && (
          <div className="budget-settings-panel" role="tabpanel">
            <section className="budget-settings-card">
              <h3>
                <Plus size={15} /> Правила «Продавець → Категорія»
              </h3>
              <form className="budget-rule-add" onSubmit={handleAddRule}>
                <input
                  value={rulePattern}
                  onChange={(e) => setRulePattern(e.target.value)}
                  placeholder="Продавець (напр. FOP IVANOV)"
                  maxLength={120}
                />
                <select
                  value={ruleCatKey}
                  onChange={(e) => setRuleCatKey(e.target.value)}
                >
                  {expenseCategories.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.emoji} {cat.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="submit"
                  className="secondary"
                  busy={pending.includes("save-budget-rule")}
                >
                  Додати
                </Button>
              </form>

              {rules.length === 0 ? (
                <p className="settings-help">
                  Правил ще немає — вони створюються самі, коли ви обираєте
                  категорію для оплати Apple Pay.
                </p>
              ) : (
                <div className="budget-rules-list">
                  {rules.map((rule) => {
                    const meta = findCategoryMeta(
                      rule.category_key,
                      customCategories,
                      rule.kind,
                    );
                    return (
                      <div className="budget-rule-row" key={rule.id}>
                        <div className="budget-rule-copy">
                          <strong>{rule.merchant_pattern}</strong>
                          <small>
                            {meta.emoji} {meta.name}
                          </small>
                        </div>
                        <IconButton
                          label={`Видалити правило ${rule.merchant_pattern}`}
                          onClick={() => onDeleteRule(rule.id)}
                        >
                          <X size={15} />
                        </IconButton>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
