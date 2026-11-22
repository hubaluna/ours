import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AnimatePresence } from "motion/react";
import {
  Activity,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileDown,
  HelpCircle,
  Lock,
  Plus,
  Repeat,
  Repeat2,
  Search,
  Settings2,
  Smartphone,
  SquarePen,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
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
  computeSpendingPace,
  findCategoryMeta,
  formatBudgetDayHeading,
  formatUAH,
  getDueRecurringPayments,
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
import {
  buildBudgetExportCsv,
  buildBudgetExportJson,
  downloadOrShareBudgetFile,
  parseBudgetImportFile,
  type BudgetImportParseResult,
} from "../lib/budget-transfer";
import type {
  BudgetCategory,
  BudgetMerchantRule,
  BudgetRecurringPayment,
  BudgetTokenStatus,
  BudgetTransaction,
  NewBudgetRecurringPayment,
  NewBudgetTransaction,
} from "../lib/types";
import { kyivDate } from "../lib/utils";
import { Avatar, BottomSheet, Button, Field, IconButton } from "../components/ui";
import { MascotContext } from "../components/MascotContext";
import { CatMascot } from "../components/CatMascot";
import { BudgetSankeyCard } from "../components/BudgetSankey";

type HeroMetricTab = "expense" | "income" | "balance";
type ViewMode = "overview" | "analytics";
type AnalyticsChartMode = "sankey" | "donut";

export default function Budget() {
  const mascot = useContext(MascotContext);
  const {
    data,
    userId,
    pending,
    notify,
    addBudgetTransaction,
    importBudgetTransactions,
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
    addBudgetRecurring,
    updateBudgetRecurring,
    removeBudgetRecurring,
    confirmBudgetRecurring,
    skipBudgetRecurring,
  } = useApp();

  const today = kyivDate();
  const [periodPreset, setPeriodPreset] =
    useState<BudgetPeriodPreset>("all_time");
  const [customFrom, setCustomFrom] = useState(`${today.slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(today);
  const [scope, setScope] = useState<BudgetMemberScope>("all");
  const [heroTab, setHeroTab] = useState<HeroMetricTab>("balance");
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [analyticsChart, setAnalyticsChart] =
    useState<AnalyticsChartMode>("sankey");
  const [showAllExpenseCats, setShowAllExpenseCats] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [txLimit, setTxLimit] = useState(30);

  // Modals / BottomSheets
  const [txSheetOpen, setTxSheetOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<BudgetTransaction | null>(null);
  const [reviewTx, setReviewTx] = useState<BudgetTransaction | null>(null);
  const [confirmRecurring, setConfirmRecurring] =
    useState<BudgetRecurringPayment | null>(null);
  const [repeatSheetOpen, setRepeatSheetOpen] = useState(false);
  const [categorySheetKind, setCategorySheetKind] =
    useState<BudgetKind | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const opsCardRef = useRef<HTMLDivElement>(null);

  const partner = data.profiles.find((p) => p.id !== userId);
  const mySettings = data.budgetSettings.find((s) => s.user_id === userId);
  const myShareIncome = mySettings?.share_income_with_partner ?? false;

  const txDateBounds = useMemo(() => {
    let earliest = "";
    let latest = "";
    for (const tx of data.budgetTransactions) {
      if (tx.is_private && tx.user_id !== userId) continue;
      if (!tx.occurred_on) continue;
      if (!earliest || tx.occurred_on < earliest) earliest = tx.occurred_on;
      if (!latest || tx.occurred_on > latest) latest = tx.occurred_on;
    }
    return { earliest, latest };
  }, [data.budgetTransactions, userId]);

  const period = useMemo(
    () =>
      getPeriodRange(
        periodPreset,
        customFrom,
        customTo,
        today,
        txDateBounds.earliest || undefined,
        txDateBounds.latest || undefined,
      ),
    [
      periodPreset,
      customFrom,
      customTo,
      today,
      txDateBounds.earliest,
      txDateBounds.latest,
    ],
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
            (Date.parse(b.occurred_at || b.created_at) || 0) -
              (Date.parse(a.occurred_at || a.created_at) || 0) ||
            (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0),
        ),
    [data.budgetTransactions, userId],
  );

  const dueRecurring = useMemo(
    () => getDueRecurringPayments(data.budgetRecurring, today),
    [data.budgetRecurring, today],
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
            is_private: !myShareIncome,
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
      is_private: !myShareIncome,
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
      ? stats.partnerHidden
        ? "Приховано"
        : formatUAH(stats.expenseTotal)
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
            <div className="screen-title-row">
              <h1>Бюджет</h1>
              <AnimatePresence mode="wait">
                {mascot?.placement === "title" && <CatMascot placement="title" />}
              </AnimatePresence>
            </div>
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
              label="Імпорт та експорт витрат і виписок"
              onClick={() => setTransferOpen(true)}
            >
              <ArrowUpDown size={17} />
            </IconButton>
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

        {dueRecurring.length > 0 && (
          <div className="budget-review-box budget-recurring-box">
            <div className="budget-review-head">
              <span>
                <Repeat size={15} />
                <strong>Регулярні платежі ({dueRecurring.length})</strong>
              </span>
              <small>Щомісяця</small>
            </div>
            <div className="budget-review-list">
              {dueRecurring.slice(0, 4).map((item) => {
                const meta = findCategoryMeta(
                  item.category_key,
                  data.budgetCategories,
                  item.kind,
                );
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="budget-review-item"
                    onClick={() => setConfirmRecurring(item)}
                  >
                    <span className="budget-review-copy">
                      <strong>
                        {meta.emoji} {item.title}
                      </strong>
                      <small>
                        Щомісяця {item.day_of_month}-го · {meta.name}
                      </small>
                    </span>
                    <span className="budget-review-right">
                      <strong>{formatUAH(item.amount)}</strong>
                      <span className="budget-review-cta">Внести</span>
                    </span>
                  </button>
                );
              })}
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
                {stats.partnerHidden ? (
                  "Операції партнера приховані"
                ) : (
                  <>
                    Заробив{" "}
                    {stats.incomeTotal === null
                      ? "—"
                      : formatUAH(stats.incomeTotal)}{" "}
                    · Витратив {formatUAH(stats.expenseTotal)}
                  </>
                )}
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
          <>
            {(() => {
              const chartToggle = (
                <div
                  className="budget-chart-switch"
                  role="tablist"
                  aria-label="Тип графіка"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={analyticsChart === "sankey"}
                    className={analyticsChart === "sankey" ? "active" : ""}
                    onClick={() => setAnalyticsChart("sankey")}
                  >
                    Потоки
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={analyticsChart === "donut"}
                    className={analyticsChart === "donut" ? "active" : ""}
                    onClick={() => setAnalyticsChart("donut")}
                  >
                    Коло
                  </button>
                </div>
              );

              return analyticsChart === "sankey" ? (
                <BudgetSankeyCard
                  incomeRows={stats.incomeRows}
                  expenseRows={stats.expenseRows}
                  incomeTotal={stats.incomeTotal}
                  expenseTotal={stats.expenseTotal}
                  periodLabel={period.label}
                  onSelectCategory={filterByCategoryAndScroll}
                  headerRight={chartToggle}
                />
              ) : (
                <BudgetExpenseDonut
                  rows={stats.expenseRows}
                  total={stats.expenseTotal}
                  periodLabel={period.label}
                  onSelectCategory={filterByCategoryAndScroll}
                  headerRight={chartToggle}
                />
              );
            })()}
            <BudgetSpendingPaceCard
              transactions={data.budgetTransactions}
              userId={userId}
              today={today}
            />
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
                  <strong>
                    {stats.partnerHidden
                      ? "Приховано"
                      : formatUAH(stats.expenseTotal)}
                  </strong>
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
          </>
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

          {stats.partnerHidden ? (
            <div className="budget-empty-inline">
              <Lock size={16} />
              <span>Операції партнера приховані</span>
            </div>
          ) : stats.expenseRows.length === 0 ? (
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
              aria-label="Показувати мої операції партнеру"
              onClick={() => void setBudgetIncomeSharing(!myShareIncome)}
            >
              {myShareIncome ? <Eye size={13} /> : <EyeOff size={13} />}
              <span>{myShareIncome ? "Мої відкриті" : "Мої приховані"}</span>
            </button>
          </div>

          {scope === "partner" && stats.incomeTotal === null ? (
            <div className="budget-empty-inline">
              <Lock size={16} />
              <span>Операції партнера приховані</span>
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
                {stats.partnerHidden && !searchQuery && !categoryFilter ? (
                  <>
                    <Lock size={18} />
                    <span>Операції партнера приховані</span>
                  </>
                ) : (
                  <>
                    <Wallet size={18} />
                    <span>
                      {searchQuery || categoryFilter
                        ? "За цим фільтром операцій не знайдено"
                        : "Операцій за обраний період ще немає"}
                    </span>
                  </>
                )}
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
        {confirmRecurring && (
          <BudgetRecurringConfirmSheet
            item={confirmRecurring}
            customCategories={data.budgetCategories}
            busy={pending.includes(`recurring-${confirmRecurring.id}`)}
            onClose={() => setConfirmRecurring(null)}
            onConfirm={async (amount) => {
              const ok = await confirmBudgetRecurring(
                confirmRecurring,
                amount,
              );
              if (ok) {
                const remaining = dueRecurring.filter(
                  (r) => r.id !== confirmRecurring.id,
                );
                setConfirmRecurring(remaining[0] ?? null);
              }
            }}
            onSkip={async () => {
              const ok = await skipBudgetRecurring(confirmRecurring);
              if (ok) {
                const remaining = dueRecurring.filter(
                  (r) => r.id !== confirmRecurring.id,
                );
                setConfirmRecurring(remaining[0] ?? null);
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
                      is_private: !myShareIncome,
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
            onCreate={async (name, emoji, selectedKind) => {
              const ok = await addBudgetCategory({
                kind: selectedKind,
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
            recurring={data.budgetRecurring}
            pending={pending}
            notify={notify}
            onClose={() => setSettingsOpen(false)}
            onOpenTransfer={() => {
              setSettingsOpen(false);
              setTransferOpen(true);
            }}
            onToggleShareIncome={(share) => void setBudgetIncomeSharing(share)}
            onAddCategory={() => setCategorySheetKind("expense")}
            onDeleteCategory={(id) => void removeBudgetCategory(id)}
            onSaveRule={(pattern, categoryKey, kind) =>
              saveBudgetMerchantRule(pattern, categoryKey, kind)
            }
            onDeleteRule={(id) => void removeBudgetMerchantRule(id)}
            onAddRecurring={(item) => addBudgetRecurring(item)}
            onToggleRecurring={(id, active) =>
              void updateBudgetRecurring(id, { active })
            }
            onDeleteRecurring={(id) => void removeBudgetRecurring(id)}
            fetchTokenStatus={fetchBudgetIngestTokenStatus}
            rotateToken={rotateBudgetIngestToken}
            revokeToken={revokeBudgetIngestToken}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {transferOpen && (
          <BudgetTransferSheet
            userId={userId}
            transactions={data.budgetTransactions.filter(
              (tx) => !tx.is_private || tx.user_id === userId,
            )}
            customCategories={data.budgetCategories}
            expenseCategories={expenseCategories}
            incomeCategories={incomeCategories}
            merchantRules={data.budgetMerchantRules}
            defaultPrivate={!myShareIncome}
            today={today}
            busy={pending.includes("import-budget-tx")}
            notify={notify}
            onClose={() => setTransferOpen(false)}
            onImport={async (items) => {
              const count = await importBudgetTransactions(items);
              if (count > 0) setTransferOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function BudgetSpendingPaceCard({
  transactions,
  userId,
  today = kyivDate(),
}: {
  transactions: BudgetTransaction[];
  userId: string;
  today?: string;
}) {
  const pace = useMemo(
    () => computeSpendingPace(transactions, today, userId),
    [transactions, today, userId],
  );

  const maxVal = Math.max(pace.currentSpentSoFar, pace.prevSpentSameDay, 1);
  const currPct = Math.min(100, Math.round((pace.currentSpentSoFar / maxVal) * 100));
  const prevPct = Math.min(100, Math.round((pace.prevSpentSameDay / maxVal) * 100));

  const statusClass =
    pace.status === "calmer"
      ? "pace-status-calmer"
      : pace.status === "faster"
        ? "pace-status-faster"
        : "pace-status-ontrack";

  const StatusIcon =
    pace.status === "calmer"
      ? TrendingDown
      : pace.status === "faster"
        ? TrendingUp
        : Activity;

  return (
    <div className={`budget-section-card glass budget-pace-card ${statusClass}`}>
      <div className="budget-section-head">
        <div className="budget-pace-title">
          <Activity size={16} />
          <h2>Темп витрат</h2>
        </div>
        <span className={`budget-pace-badge ${statusClass}`}>
          <StatusIcon size={13} />
          <span>{pace.statusText}</span>
        </span>
      </div>

      <div className="budget-pace-body">
        <p className="budget-pace-subtitle">
          Порівняння витрат на <strong>{pace.currentDay}-те число</strong>:
        </p>

        <div className="budget-pace-metrics">
          <div className="budget-pace-col">
            <span className="budget-pace-kicker">
              Цього місяця (1–{pace.currentDay} {pace.currentMonthLabel})
            </span>
            <strong className="budget-pace-val current">
              {formatUAH(pace.currentSpentSoFar)}
            </strong>
            <div className="budget-pace-bar-track">
              <div
                className="budget-pace-bar-fill current"
                style={{ width: `${currPct}%` }}
              />
            </div>
          </div>

          <div className="budget-pace-col">
            <span className="budget-pace-kicker">
              Минулого місяця (1–{pace.currentDay} {pace.prevMonthLabel})
            </span>
            <strong className="budget-pace-val previous">
              {formatUAH(pace.prevSpentSameDay)}
            </strong>
            <div className="budget-pace-bar-track">
              <div
                className="budget-pace-bar-fill previous"
                style={{ width: `${prevPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="budget-pace-insight">
          <p>{pace.insight}</p>
          <div className="budget-pace-footer-meta">
            <span>
              Середній темп: <strong>~{formatUAH(pace.dailyAverage)}/день</strong>
            </span>
            <span>
              Прогноз на місяць: <strong>~{formatUAH(pace.projectedMonthTotal)}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BudgetExpenseDonut({
  rows,
  total,
  periodLabel,
  onSelectCategory,
  headerRight,
}: {
  rows: ReturnType<typeof computeBudgetStats>["expenseRows"];
  total: number;
  periodLabel: string;
  onSelectCategory: (key: string) => void;
  headerRight?: React.ReactNode;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const slices = useMemo(() => {
    if (total <= 0 || rows.length === 0) return [];
    const maxDirect = 7;
    const base =
      rows.length > maxDirect + 1
        ? [
            ...rows.slice(0, maxDirect),
            {
              key: "_rest",
              name: "Інше",
              emoji: "✨",
              color: "#94A3B8",
              amount: rows
                .slice(maxDirect)
                .reduce((acc, row) => acc + row.amount, 0),
              percent: rows
                .slice(maxDirect)
                .reduce((acc, row) => acc + row.percent, 0),
              count: rows
                .slice(maxDirect)
                .reduce((acc, row) => acc + row.count, 0),
            },
          ]
        : rows;

    const radius = 72;
    const strokeWidth = 15;
    const circumference = 2 * Math.PI * radius;

    if (base.length === 1) {
      return [
        {
          ...base[0],
          dashLen: circumference,
          dashOffset: 0,
          circumference,
          radius,
          strokeWidth,
        },
      ];
    }

    const gap = 2.5;
    const totalGap = base.length * gap;
    const available = Math.max(0, circumference - totalGap);

    let offset = 0;
    return base.map((row) => {
      const ratio = total > 0 ? row.amount / total : 0;
      const dashLen = Math.max(1, ratio * available);
      const dashOffset = -offset;
      const item = {
        ...row,
        dashLen,
        dashOffset,
        circumference,
        radius,
        strokeWidth,
      };
      offset += dashLen + gap;
      return item;
    });
  }, [rows, total]);

  const activeSlice =
    slices.find((slice) => slice.key === selectedKey) ?? null;

  return (
    <div className="budget-section-card glass budget-donut-card">
      <div className="budget-section-head">
        <div className="budget-sankey-title-wrap">
          <h2>Структура витрат</h2>
          <span className="budget-sankey-period">{periodLabel}</span>
        </div>
        {headerRight ?? <span className="budget-section-meta">{periodLabel}</span>}
      </div>

      {slices.length === 0 ? (
        <div className="budget-empty-inline">
          <Wallet size={18} />
          <span>За обраний період витрат немає</span>
        </div>
      ) : (
        <div className="budget-donut-layout">
          <div className="budget-donut-wrap">
            <svg
              className="budget-donut-svg"
              viewBox="0 0 200 200"
              role="img"
              aria-label={`Діаграма витрат: ${formatUAH(total)}`}
            >
              <circle
                cx="100"
                cy="100"
                r="72"
                fill="none"
                stroke="var(--glass-edge)"
                strokeWidth="15"
                opacity="0.35"
              />
              {slices.map((slice) => {
                const isSelected = activeSlice?.key === slice.key;
                const dimmed = Boolean(activeSlice && !isSelected);
                return (
                  <circle
                    key={slice.key}
                    cx="100"
                    cy="100"
                    r={slice.radius}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth={isSelected ? slice.strokeWidth + 4 : slice.strokeWidth}
                    strokeLinecap="butt"
                    strokeDasharray={`${slice.dashLen} ${slice.circumference}`}
                    strokeDashoffset={slice.dashOffset}
                    transform="rotate(-90 100 100)"
                    opacity={dimmed ? 0.28 : 1}
                    className={`budget-donut-arc${isSelected ? " is-selected" : ""}`}
                    onClick={() =>
                      setSelectedKey((prev) =>
                        prev === slice.key ? null : slice.key,
                      )
                    }
                  >
                    <title>
                      {slice.name}: {formatUAH(slice.amount)} (
                      {Math.round(slice.percent)}%)
                    </title>
                  </circle>
                );
              })}
            </svg>
            <div className="budget-donut-center">
              {activeSlice ? (
                <>
                  <span className="budget-donut-center-kicker">
                    {activeSlice.emoji} {activeSlice.name}
                  </span>
                  <strong>{formatUAH(activeSlice.amount)}</strong>
                  <small style={{ color: activeSlice.color }}>
                    {Math.round(activeSlice.percent)}% витрат
                  </small>
                </>
              ) : (
                <>
                  <span className="budget-donut-center-kicker">Витрати</span>
                  <strong>{formatUAH(total)}</strong>
                  <small>{rows.length} категорій</small>
                </>
              )}
            </div>
          </div>

          {/* Segmented Distribution Bar */}
          <div
            className="budget-dist-bar"
            role="progressbar"
            aria-label="Розподіл витрат за категоріями"
            aria-valuenow={100}
          >
            {slices.map((slice) => {
              const isSelected = activeSlice?.key === slice.key;
              const widthPct = Math.max(1.5, slice.percent);
              return (
                <div
                  key={slice.key}
                  className={`budget-dist-seg${isSelected ? " is-selected" : ""}`}
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: slice.color,
                  }}
                  title={`${slice.name}: ${Math.round(slice.percent)}% (${formatUAH(slice.amount)})`}
                  onClick={() =>
                    setSelectedKey((prev) =>
                      prev === slice.key ? null : slice.key,
                    )
                  }
                />
              );
            })}
          </div>

          <div className="budget-donut-legend" role="list">
            {slices.map((slice) => {
              const isSelected = activeSlice?.key === slice.key;
              return (
                <button
                  key={slice.key}
                  type="button"
                  role="listitem"
                  className={`budget-donut-legend-row${isSelected ? " active" : ""}`}
                  onClick={() =>
                    setSelectedKey((prev) =>
                      prev === slice.key ? null : slice.key,
                    )
                  }
                >
                  <span
                    className="budget-donut-dot"
                    style={{ backgroundColor: slice.color }}
                    aria-hidden="true"
                  />
                  <span className="budget-donut-legend-name">
                    <span aria-hidden="true">{slice.emoji}</span>
                    <span>{slice.name}</span>
                  </span>
                  <span className="budget-donut-legend-pct">
                    {Math.round(slice.percent)}%
                  </span>
                  <strong className="budget-donut-legend-val">
                    {formatUAH(slice.amount)}
                  </strong>
                </button>
              );
            })}
          </div>

          {activeSlice && activeSlice.key !== "_rest" && (
            <button
              type="button"
              className="budget-donut-jump"
              onClick={() => onSelectCategory(activeSlice.key)}
            >
              <span>
                Операції «{activeSlice.name}» ({activeSlice.count})
              </span>
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function BudgetRecurringConfirmSheet({
  item,
  customCategories,
  busy,
  onClose,
  onConfirm,
  onSkip,
}: {
  item: BudgetRecurringPayment;
  customCategories: ReturnType<typeof useApp>["data"]["budgetCategories"];
  busy: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const [amountText, setAmountText] = useState(String(item.amount));
  const meta = findCategoryMeta(item.category_key, customCategories, item.kind);

  useEffect(() => {
    setAmountText(String(item.amount));
  }, [item.id, item.amount]);

  const parsed = parseApplePayAmount(amountText);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed || parsed <= 0) return;
    await onConfirm(parsed);
  };

  return (
    <BottomSheet title="Регулярний платіж" onClose={onClose}>
      <form className="budget-review-modal" onSubmit={handleSubmit}>
        <div className="budget-review-hero">
          <span className="budget-review-merchant">
            {meta.emoji} {item.title}
          </span>
          <strong className="budget-review-amount">
            {formatUAH(parsed ?? item.amount)}
          </strong>
          <small>
            Щомісяця {item.day_of_month}-го · {meta.name} ·{" "}
            {item.kind === "income" ? "Дохід" : "Витрата"}
          </small>
        </div>

        <Field label="Сума цього місяця (₴)">
          <input
            type="text"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0"
            required
          />
        </Field>

        <div className="budget-recurring-confirm-footer">
          <Button type="submit" busy={busy} disabled={!parsed || parsed <= 0}>
            Внести операцію
          </Button>
          <Button
            type="button"
            className="secondary"
            busy={busy}
            onClick={() => void onSkip()}
          >
            Пропустити цього місяця
          </Button>
        </div>
      </form>
    </BottomSheet>
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
    initial?.is_private ?? !myShareIncome,
  );
  const [manualCategoryPicked, setManualCategoryPicked] = useState(
    Boolean(initial?.category_key),
  );
  const amountInputRef = useRef<HTMLInputElement>(null);

  const categories = kind === "income" ? incomeCategories : expenseCategories;

  const switchKind = (nextKind: BudgetKind) => {
    setKind(nextKind);
    setCategoryKey(nextKind === "income" ? "salary" : "groceries");
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
              data-autofocus={isEdit ? undefined : ""}
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

        <label className="budget-rule-remember">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          <span>Приватний запис (бачите тільки ви)</span>
        </label>

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
  onCreate: (name: string, emoji: string, selectedKind: BudgetKind) => Promise<void>;
}) {
  const [selectedKind, setSelectedKind] = useState<BudgetKind>(kind);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(kind === "income" ? "💼" : "🚬");

  const handleStickerInput = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setEmoji("");
      return;
    }
    const Segmenter = (
      Intl as unknown as {
        Segmenter?: new (
          locale?: string,
          opts?: { granularity: "grapheme" },
        ) => { segment: (input: string) => Iterable<{ segment: string }> };
      }
    ).Segmenter;
    const graphemes = Segmenter
      ? Array.from(new Segmenter("uk", { granularity: "grapheme" }).segment(trimmed), (s) => s.segment)
      : Array.from(trimmed);
    setEmoji(graphemes[graphemes.length - 1] ?? "");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreate(name.trim(), emoji.trim() || "📦", selectedKind);
  };

  return (
    <BottomSheet title="Нова категорія" onClose={onClose}>
      <form className="form budget-tx-form" onSubmit={submit}>
        <div className="budget-cat-preview" aria-live="polite">
          <span className="budget-cat-preview-sticker" aria-hidden="true">
            {emoji || "📦"}
          </span>
          <div className="budget-cat-preview-copy">
            <strong>{name.trim() || "Назва категорії"}</strong>
            <small>{selectedKind === "income" ? "Дохід" : "Витрата"}</small>
          </div>
        </div>

        <div className="segmented" role="tablist" aria-label="Тип категорії">
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
              aria-selected={selectedKind === id}
              className={selectedKind === id ? "active" : ""}
              onClick={() => {
                setSelectedKind(id);
                if (id === "income" && emoji === "🚬") setEmoji("💼");
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="budget-sticker-row">
          <Field label="Назва категорії">
            <input
              data-autofocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Напр.: Куріння, Спорт, Подарунки"
              maxLength={50}
              required
            />
          </Field>
          <Field label="Стікер">
            <input
              className="budget-sticker-input"
              value={emoji}
              onChange={(e) => handleStickerInput(e.target.value)}
              placeholder="😀"
              aria-label="Власний стікер або емодзі"
              maxLength={8}
            />
          </Field>
        </div>

        <div className="budget-emoji-grid" role="group" aria-label="Обрати стікер">
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
          <Button type="submit" busy={busy} disabled={!name.trim()}>
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
  recurring,
  pending,
  notify,
  onClose,
  onOpenTransfer,
  onToggleShareIncome,
  onAddCategory,
  onDeleteCategory,
  onSaveRule,
  onDeleteRule,
  onAddRecurring,
  onToggleRecurring,
  onDeleteRecurring,
  fetchTokenStatus,
  rotateToken,
  revokeToken,
}: {
  myShareIncome: boolean;
  customCategories: ReturnType<typeof useApp>["data"]["budgetCategories"];
  expenseCategories: ReturnType<typeof resolveBudgetCategories>;
  incomeCategories: ReturnType<typeof resolveBudgetCategories>;
  rules: ReturnType<typeof useApp>["data"]["budgetMerchantRules"];
  recurring: BudgetRecurringPayment[];
  pending: string[];
  notify: (text: string) => void;
  onClose: () => void;
  onOpenTransfer: () => void;
  onToggleShareIncome: (share: boolean) => void;
  onAddCategory: () => void;
  onDeleteCategory: (id: string) => void;
  onSaveRule: (
    pattern: string,
    categoryKey: string,
    kind: BudgetKind,
  ) => Promise<boolean>;
  onDeleteRule: (id: string) => void;
  onAddRecurring: (item: NewBudgetRecurringPayment) => Promise<boolean>;
  onToggleRecurring: (id: string, active: boolean) => void;
  onDeleteRecurring: (id: string) => void;
  fetchTokenStatus: () => Promise<BudgetTokenStatus>;
  rotateToken: () => Promise<{
    token: string;
    status: BudgetTokenStatus;
  } | null>;
  revokeToken: () => Promise<boolean>;
}) {
  const [activeTab, setActiveTab] = useState<
    "general" | "recurring" | "apple_pay" | "rules"
  >("general");
  const [guideOpen, setGuideOpen] = useState(false);
  const [tokenStatus, setTokenStatus] =
    useState<BudgetTokenStatus | null>(null);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [rulePattern, setRulePattern] = useState("");
  const [ruleCatKey, setRuleCatKey] = useState("groceries");
  const [recTitle, setRecTitle] = useState("");
  const [recAmount, setRecAmount] = useState("");
  const [recDay, setRecDay] = useState("1");
  const [recKind, setRecKind] = useState<BudgetKind>("expense");
  const [recCatKey, setRecCatKey] = useState("home");
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

  const handleAddRecurring = async (e: FormEvent) => {
    e.preventDefault();
    const amount = parseApplePayAmount(recAmount);
    const day = Math.min(31, Math.max(1, Math.round(Number(recDay) || 1)));
    if (!recTitle.trim() || !amount || amount <= 0) {
      notify("Вкажіть назву та суму регулярного платежу");
      return;
    }
    const ok = await onAddRecurring({
      title: recTitle.trim(),
      kind: recKind,
      amount,
      category_key: recCatKey,
      day_of_month: day,
    });
    if (ok) {
      setRecTitle("");
      setRecAmount("");
    }
  };

  const allCategories = [...expenseCategories, ...incomeCategories];
  const recurringCategories =
    recKind === "income" ? incomeCategories : expenseCategories;

  return (
    <BottomSheet
      title="Налаштування бюджету"
      onClose={onClose}
      guardChanges={false}
    >
      <div className="budget-settings-sheet">
        <div
          className="budget-settings-tabs"
          role="tablist"
          aria-label="Розділи налаштувань"
        >
          {(
            [
              ["general", "Основні"],
              ["recurring", "Регулярні"],
              ["apple_pay", "Apple Pay"],
              ["rules", "Правила"],
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
                <Lock size={15} /> Приватність операцій
              </h3>
              <label className="push-reminder-toggle">
                <input
                  type="checkbox"
                  checked={myShareIncome}
                  disabled={pending.includes("budget-income-sharing")}
                  onChange={(e) => onToggleShareIncome(e.target.checked)}
                />
                <span>
                  <strong>Показувати мої операції партнеру</strong>
                  <small>
                    Керує видимістю всіх ваших витрат і доходів, включно з
                    операціями по картці та Apple Pay. Якщо вимкнено — ваші
                    операції бачите лише ви.
                  </small>
                </span>
              </label>
            </section>

            <section className="budget-settings-card">
              <h3>
                <ArrowUpDown size={15} /> Дані та виписки банку
              </h3>
              <p className="settings-help">
                Експортуйте резервну копію витрат (JSON/CSV) або імпортуйте
                виписку Monobank, ПриватБанк, ПУМБ, Sense чи інший CSV-файл.
              </p>
              <Button
                type="button"
                className="secondary"
                onClick={onOpenTransfer}
              >
                <ArrowUpDown size={14} />
                Імпорт / Експорт даних
              </Button>
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

        {activeTab === "recurring" && (
          <div className="budget-settings-panel" role="tabpanel">
            <section className="budget-settings-card">
              <h3>
                <Repeat size={15} /> Регулярні платежі
                {recurring.length > 0 ? ` · ${recurring.length}` : ""}
              </h3>
              <p className="settings-help">
                У вибраний день місяця у гаманці та на головній з’явиться
                плашка-нагадування для швидкого внесення.
              </p>

              <form
                className="budget-recurring-form"
                onSubmit={handleAddRecurring}
              >
                <input
                  value={recTitle}
                  onChange={(e) => setRecTitle(e.target.value)}
                  placeholder="Назва (напр. Оренда, Інтернет)"
                  maxLength={80}
                  required
                />
                <div className="budget-recurring-row2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={recAmount}
                    onChange={(e) => setRecAmount(e.target.value)}
                    placeholder="Сума, ₴"
                    required
                  />
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={recDay}
                    onChange={(e) => setRecDay(e.target.value)}
                    placeholder="День"
                    aria-label="День місяця (1–31)"
                    title="День місяця (1–31)"
                    required
                  />
                </div>
                <div className="budget-recurring-row-selects">
                  <select
                    value={recKind}
                    aria-label="Тип платежу"
                    className="budget-select-kind"
                    onChange={(e) => {
                      const nextKind = e.target.value as BudgetKind;
                      setRecKind(nextKind);
                      setRecCatKey(
                        nextKind === "income" ? "salary" : "home",
                      );
                    }}
                  >
                    <option value="expense">Витрата</option>
                    <option value="income">Дохід</option>
                  </select>
                  <select
                    value={recCatKey}
                    aria-label="Категорія платежу"
                    className="budget-select-cat"
                    onChange={(e) => setRecCatKey(e.target.value)}
                  >
                    {recurringCategories.map((cat) => (
                      <option key={cat.key} value={cat.key}>
                        {cat.emoji} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="submit"
                  className="secondary budget-recurring-submit"
                  busy={pending.includes("add-budget-recurring")}
                >
                  + Додати платіж
                </Button>
              </form>

              {recurring.length === 0 ? (
                <p className="settings-help">
                  Поки немає регулярних платежів — додайте оренду, комунальні,
                  підписки або регулярний дохід.
                </p>
              ) : (
                <div className="budget-rules-list">
                  {recurring.map((item) => {
                    const meta = findCategoryMeta(
                      item.category_key,
                      customCategories,
                      item.kind,
                    );
                    return (
                      <div
                        className={`budget-rule-row${item.active ? "" : " is-paused"}`}
                        key={item.id}
                      >
                        <label className="budget-recurring-toggle">
                          <input
                            type="checkbox"
                            checked={item.active}
                            aria-label={`Активувати ${item.title}`}
                            onChange={(e) =>
                              onToggleRecurring(item.id, e.target.checked)
                            }
                          />
                          <div className="budget-rule-copy">
                            <strong>
                              {meta.emoji} {item.title} ·{" "}
                              {formatUAH(item.amount)}
                            </strong>
                            <small>
                              Щомісяця {item.day_of_month}-го · {meta.name}
                            </small>
                          </div>
                        </label>
                        <IconButton
                          label={`Видалити регулярний платіж ${item.title}`}
                          onClick={() => onDeleteRecurring(item.id)}
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
                <span>Як підв’язати витрати через «Команди» iPhone</span>
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
                      <b>Створіть токен угорі</b> та відкрийте в додатку{" "}
                      <b>Команди</b> автоматизацію{" "}
                      <b>Коли мені надходить сповіщення від програми → Гаманець</b>{" "}
                      <i>(або додаток банку — тоді ловляться ще й онлайн-оплати та Apple Watch)</i>.
                    </li>
                    <li>
                      <b>Додайте дію «Отримати вміст URL»</b>{" "}
                      <i>(прямо під блоком «Додати транзакцію», якщо вже є Skarbo)</i>{" "}
                      і вставте адресу:
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
                      <b>Метод і заголовок:</b> розгорніть <b>▸</b> →{" "}
                      <b>Метод: POST</b> → у <b>Заголовки</b> додайте:
                      <div className="budget-guide-kv">
                        <span>
                          Ключ: <code>Authorization</code>
                        </span>
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
                      <b>Тіло запиту → JSON</b> (поля типу <b>Текст</b>). У
                      значеннях оберіть <b>Вхідні дані команди → Тип: Сповіщення</b>:
                      <ul className="budget-guide-fields">
                        <li>
                          <code>amount</code> → <b>Сповіщення → Основний текст</b>
                        </li>
                        <li>
                          <code>merchant</code> → <b>Сповіщення → Підзаголовок</b>
                        </li>
                        <li>
                          <code>card</code> → <b>Сповіщення → Заголовок</b>
                        </li>
                      </ul>
                    </li>
                    <li>
                      <b>Збережіть автоматизацію</b> — після наступної оплати
                      через Apple Pay дані автоматично полетять в Ours.
                    </li>
                  </ol>
                  <p className="budget-guide-note">
                    Для банківських сповіщень можна також передавати весь текст
                    через <b>Сповіщення → Вміст</b>. Якщо дані не приходять —
                    перевірте слово <code>Bearer </code> перед токеном і
                    вимкніть «Питати перед запуском».
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

function BudgetTransferSheet({
  userId,
  transactions,
  customCategories,
  expenseCategories,
  incomeCategories,
  merchantRules,
  defaultPrivate,
  today,
  busy,
  notify,
  onClose,
  onImport,
}: {
  userId: string;
  transactions: BudgetTransaction[];
  customCategories: BudgetCategory[];
  expenseCategories: ReturnType<typeof resolveBudgetCategories>;
  incomeCategories: ReturnType<typeof resolveBudgetCategories>;
  merchantRules: BudgetMerchantRule[];
  defaultPrivate: boolean;
  today: string;
  busy: boolean;
  notify: (text: string) => void;
  onClose: () => void;
  onImport: (items: NewBudgetTransaction[]) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BudgetImportParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [skipTransfers, setSkipTransfers] = useState(true);
  const [includeIncomes, setIncludeIncomes] = useState(true);
  const [excludedIds, setExcludedIds] = useState<Record<string, boolean>>({});
  const [categoryOverrides, setCategoryOverrides] = useState<
    Record<string, string | null>
  >({});
  const [showAllPreview, setShowAllPreview] = useState(false);

  const handleExportJson = async () => {
    const payload = buildBudgetExportJson({
      transactions,
      customCategories,
      merchantRules,
      userId,
    });
    const result = await downloadOrShareBudgetFile({
      content: JSON.stringify(payload, null, 2),
      fileName: `ours-budget-${today}.json`,
      mimeType: "application/json;charset=utf-8",
      shareTitle: "Резервна копія бюджету ours.",
    });
    notify(
      result === "shared"
        ? `JSON-бекап готовий (${transactions.length} операцій)`
        : `Експортовано ${transactions.length} операцій у JSON`,
    );
  };

  const handleExportCsv = async () => {
    const content = buildBudgetExportCsv({
      transactions,
      customCategories,
      userId,
    });
    const result = await downloadOrShareBudgetFile({
      content,
      fileName: `ours-budget-${today}.csv`,
      mimeType: "text/csv;charset=utf-8",
      shareTitle: "Таблиця бюджету ours. (CSV)",
    });
    notify(
      result === "shared"
        ? `CSV-таблиця готова (${transactions.length} операцій)`
        : `Експортовано ${transactions.length} операцій у CSV`,
    );
  };

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    setParseError(null);
    setFileName(file.name);
    try {
      const parsed = await parseBudgetImportFile({
        file,
        existingTransactions: transactions,
        customCategories,
        merchantRules,
      });
      if (parsed.rows.length === 0) {
        setPreview(null);
        setParseError(
          "У файлі не знайдено коректних операцій. Перевірте, що це CSV-виписка або JSON-бекап ours.",
        );
        return;
      }
      setPreview(parsed);
      setSkipDuplicates(true);
      setSkipTransfers(
        parsed.format !== "ours_json" && parsed.format !== "ours_csv",
      );
      setIncludeIncomes(true);
      setExcludedIds({});
      setCategoryOverrides({});
      setShowAllPreview(false);
    } catch (err) {
      setPreview(null);
      setParseError(
        err instanceof Error ? err.message : "Не вдалося прочитати файл.",
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const previewSummary = useMemo(() => {
    if (!preview) {
      return {
        expenseCount: 0,
        incomeCount: 0,
        expenseTotal: 0,
        incomeTotal: 0,
        duplicateCount: 0,
        transferCount: 0,
      };
    }
    let expenseCount = 0;
    let incomeCount = 0;
    let expenseTotal = 0;
    let incomeTotal = 0;
    let duplicateCount = 0;
    let transferCount = 0;
    for (const r of preview.rows) {
      if (r.duplicate) duplicateCount++;
      if (r.isTransfer) transferCount++;
      if (r.kind === "income") {
        incomeCount++;
        incomeTotal += r.amount;
      } else {
        expenseCount++;
        expenseTotal += r.amount;
      }
    }
    return {
      expenseCount,
      incomeCount,
      expenseTotal: Math.round(expenseTotal * 100) / 100,
      incomeTotal: Math.round(incomeTotal * 100) / 100,
      duplicateCount,
      transferCount,
    };
  }, [preview]);

  const selectedRows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.filter((row) => {
      if (skipDuplicates && row.duplicate) return false;
      if (skipTransfers && row.isTransfer) return false;
      if (!includeIncomes && row.kind === "income") return false;
      if (excludedIds[row.tempId]) return false;
      return true;
    });
  }, [preview, skipDuplicates, skipTransfers, includeIncomes, excludedIds]);

  const displayedPreviewRows = useMemo(() => {
    if (!preview) return [];
    return showAllPreview ? preview.rows : preview.rows.slice(0, 40);
  }, [preview, showAllPreview]);

  const handleConfirmImport = async () => {
    if (selectedRows.length === 0) {
      notify("Оберіть хоча б одну операцію для імпорту");
      return;
    }
    const items: NewBudgetTransaction[] = selectedRows.map((row) => {
      const overridden =
        row.tempId in categoryOverrides
          ? categoryOverrides[row.tempId]
          : row.category_key;
      const finalCategory =
        overridden || (row.kind === "income" ? "refund" : "other");
      return {
        kind: row.kind,
        amount: row.amount,
        merchant: row.merchant,
        note: row.note,
        category_key: finalCategory,
        status: "confirmed",
        source: "manual",
        is_private:
          typeof row.is_private === "boolean"
            ? row.is_private
            : defaultPrivate,
        card_label: row.card_label,
        occurred_on: row.occurred_on || today,
        occurred_at: row.occurred_at,
      };
    });
    await onImport(items);
  };

  return (
    <BottomSheet
      title="Імпорт та експорт"
      onClose={onClose}
      guardChanges={false}
    >
      <div className="budget-transfer-sheet">
        <section className="budget-settings-card">
          <h3>
            <Download size={15} /> Експорт ваших даних
          </h3>
          <p className="settings-help">
            Збережіть усі внесені операції ({transactions.length}) у файл, щоб
            мати резервну копію або перенести дані.
          </p>
          <div className="budget-transfer-actions">
            <Button
              type="button"
              className="secondary"
              disabled={transactions.length === 0}
              onClick={() => void handleExportJson()}
            >
              <Download size={14} />
              Бекап (JSON)
            </Button>
            <Button
              type="button"
              className="secondary"
              disabled={transactions.length === 0}
              onClick={() => void handleExportCsv()}
            >
              <FileDown size={14} />
              Таблиця (CSV)
            </Button>
          </div>
        </section>

        <section className="budget-settings-card">
          <h3>
            <Upload size={15} /> Імпорт у додаток
          </h3>
          <p className="settings-help">
            Підтримуються резервні копії <strong>ours. (JSON / CSV)</strong> та
            банківські CSV-виписки{" "}
            <strong>Monobank, ПриватБанк, ПУМБ, Sense, А-Банк</strong>.
            Категорії визначаються автоматично за словником магазинів і MCC.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv,.txt,text/csv,application/json"
            className="sr-only"
            aria-label="Обрати файл для імпорту бюджету"
            onChange={(e) => void handleFileSelected(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            className={preview ? "secondary" : ""}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} />
            {preview ? "Обрати інший файл" : "Обрати файл (JSON / CSV)"}
          </Button>

          {parseError && <p className="budget-transfer-error">{parseError}</p>}

          {preview && (
            <div className="budget-import-preview">
              <div className="budget-import-summary">
                <div className="budget-import-summary-head">
                  <strong>{preview.formatLabel}</strong>
                  <small>{fileName}</small>
                </div>
                <div className="budget-import-metrics">
                  <span>
                    Витрати: <b>{previewSummary.expenseCount}</b> (
                    {formatUAH(previewSummary.expenseTotal)})
                  </span>
                  {previewSummary.incomeCount > 0 && (
                    <span>
                      Доходи: <b>{previewSummary.incomeCount}</b> (
                      {formatUAH(previewSummary.incomeTotal)})
                    </span>
                  )}
                  {previewSummary.duplicateCount > 0 && (
                    <span>
                      Дублікатів знайдено: <b>{previewSummary.duplicateCount}</b>
                    </span>
                  )}
                </div>
              </div>

              <div className="budget-import-toggles">
                {previewSummary.duplicateCount > 0 && (
                  <label className="budget-import-check">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                    />
                    <span>
                      Пропускати дублікати ({previewSummary.duplicateCount})
                    </span>
                  </label>
                )}
                {previewSummary.transferCount > 0 && (
                  <label className="budget-import-check">
                    <input
                      type="checkbox"
                      checked={skipTransfers}
                      onChange={(e) => setSkipTransfers(e.target.checked)}
                    />
                    <span>
                      Пропускати перекази між своїми ({previewSummary.transferCount})
                    </span>
                  </label>
                )}
                {previewSummary.incomeCount > 0 && (
                  <label className="budget-import-check">
                    <input
                      type="checkbox"
                      checked={includeIncomes}
                      onChange={(e) => setIncludeIncomes(e.target.checked)}
                    />
                    <span>
                      Імпортувати доходи ({previewSummary.incomeCount})
                    </span>
                  </label>
                )}
              </div>

              <div className="budget-import-list">
                {displayedPreviewRows.map((row) => {
                  const autoSkipped =
                    (skipDuplicates && row.duplicate) ||
                    (skipTransfers && row.isTransfer) ||
                    (!includeIncomes && row.kind === "income");
                  const checked = !autoSkipped && !excludedIds[row.tempId];
                  const cats =
                    row.kind === "income"
                      ? incomeCategories
                      : expenseCategories;
                  const currentCat =
                    row.tempId in categoryOverrides
                      ? categoryOverrides[row.tempId]
                      : row.category_key ?? (row.kind === "income" ? "refund" : "other");

                  return (
                    <div
                      key={row.tempId}
                      className={`budget-import-row${checked ? "" : " is-muted"}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={autoSkipped}
                        aria-label={`Включити ${row.merchant}`}
                        onChange={(e) =>
                          setExcludedIds((prev) => ({
                            ...prev,
                            [row.tempId]: !e.target.checked,
                          }))
                        }
                      />
                      <div className="budget-import-row-body">
                        <div className="budget-import-row-top">
                          <strong>{row.merchant}</strong>
                          <span
                            className={`budget-tx-amount ${
                              row.kind === "income" ? "is-income" : "is-expense"
                            }`}
                          >
                            {formatUAH(row.amount, {
                              signed: true,
                              kind: row.kind,
                            })}
                          </span>
                        </div>
                        <div className="budget-import-row-bottom">
                          <small>
                            {row.occurred_on}
                            {row.duplicate ? " · Дублікат" : ""}
                            {row.isTransfer ? " · Переказ" : ""}
                          </small>
                          <select
                            value={currentCat ?? ""}
                            aria-label={`Категорія для ${row.merchant}`}
                            onChange={(e) =>
                              setCategoryOverrides((prev) => ({
                                ...prev,
                                [row.tempId]: e.target.value,
                              }))
                            }
                          >
                            {cats.map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.emoji} {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {preview.rows.length > 40 && !showAllPreview && (
                <button
                  type="button"
                  className="budget-inline-link"
                  onClick={() => setShowAllPreview(true)}
                >
                  Показати всі ({preview.rows.length})
                </button>
              )}

              <div className="budget-sheet-sticky-actions">
                <Button
                  type="button"
                  busy={busy}
                  disabled={selectedRows.length === 0}
                  onClick={() => void handleConfirmImport()}
                >
                  Імпортувати {selectedRows.length} операцій
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </BottomSheet>
  );
}
