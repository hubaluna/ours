import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  computeBudgetStats,
  computeSpendingPace,
  formatUAH,
  type BudgetMemberScope,
} from "../../lib/budget";
import type { BudgetTransaction } from "../../lib/types";
import { kyivDate } from "../../lib/utils";

export function BudgetSpendingPaceCard({
  transactions,
  userId,
  scope = "all",
  today = kyivDate(),
}: {
  transactions: BudgetTransaction[];
  userId: string;
  scope?: BudgetMemberScope;
  today?: string;
}) {
  const scopedTransactions = useMemo(() => {
    if (scope === "mine") return transactions.filter((t) => t.user_id === userId);
    if (scope === "partner") return transactions.filter((t) => t.user_id !== userId);
    return transactions;
  }, [transactions, scope, userId]);

  const pace = useMemo(
    () => computeSpendingPace(scopedTransactions, today, userId),
    [scopedTransactions, today, userId],
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

export function BudgetExpenseDonut({
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
  headerRight?: ReactNode;
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
