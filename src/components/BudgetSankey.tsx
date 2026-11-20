import { useId, useMemo, useState } from "react";
import { ArrowRight, Wallet } from "lucide-react";
import { formatUAH, type CategoryBreakdownRow } from "../lib/budget";
import {
  buildBudgetSankey,
  formatCompactUAH,
  truncateSankeyLabel,
  type SankeyNode,
} from "../lib/budget-sankey";

export function BudgetSankeyCard({
  incomeRows,
  expenseRows,
  incomeTotal,
  expenseTotal,
  periodLabel,
  onSelectCategory,
  headerRight,
}: {
  incomeRows: CategoryBreakdownRow[];
  expenseRows: CategoryBreakdownRow[];
  incomeTotal: number | null;
  expenseTotal: number;
  periodLabel: string;
  onSelectCategory: (key: string) => void;
  headerRight?: React.ReactNode;
}) {
  const uid = useId().replace(/:/g, "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      buildBudgetSankey({
        incomeRows,
        expenseRows,
        incomeTotal,
        expenseTotal,
      }),
    [incomeRows, expenseRows, incomeTotal, expenseTotal],
  );

  const allNodes = useMemo(
    () => [...layout.leftNodes, ...layout.rightNodes],
    [layout.leftNodes, layout.rightNodes],
  );

  const activeId = hoveredId ?? selectedId;
  const activeNode: SankeyNode | null = useMemo(
    () => allNodes.find((n) => n.id === activeId) ?? null,
    [allNodes, activeId],
  );
  const selectedNode: SankeyNode | null = useMemo(
    () => allNodes.find((n) => n.id === selectedId) ?? null,
    [allNodes, selectedId],
  );

  const inspectedNode = activeNode ?? selectedNode;

  const toggleNode = (nodeId: string) => {
    setSelectedId((prev) => (prev === nodeId ? null : nodeId));
  };

  return (
    <div className="budget-section-card glass budget-sankey-card">
      <div className="budget-section-head">
        <div className="budget-sankey-title-wrap">
          <h2>Грошові потоки</h2>
          <span className="budget-sankey-period">{periodLabel}</span>
        </div>
        {headerRight}
      </div>

      {layout.totalFlow <= 0 ? (
        <div className="budget-empty-inline">
          <Wallet size={20} />
          <span>Недостатньо операцій для побудови потоків</span>
        </div>
      ) : (
        <>
          <div className="budget-sankey-columns" aria-hidden="true">
            <span>{layout.incomeTotal > 0 ? "Доходи" : "Джерело"}</span>
            <span>Потік</span>
            <span>{layout.surplus > 0 ? "Розподіл" : "Витрати"}</span>
          </div>

          <div className="budget-sankey-stage">
            <svg
              className="budget-sankey-svg"
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              role="img"
              aria-label={`Діаграма грошових потоків за період ${periodLabel}`}
            >
              <defs>
                <linearGradient
                  id={`${uid}-hub`}
                  x1="0"
                  y1={layout.hub.y}
                  x2="0"
                  y2={layout.hub.y + layout.hub.height}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="var(--accent-end)" />
                  <stop offset="100%" stopColor="var(--accent)" />
                </linearGradient>
                {layout.links.map((link) => (
                  <linearGradient
                    key={link.id}
                    id={`${uid}-${link.id}`}
                    x1={link.x0}
                    y1="0"
                    x2={link.x1}
                    y2="0"
                    gradientUnits="userSpaceOnUse"
                  >
                    {link.side === "left" ? (
                      <>
                        <stop offset="0%" stopColor={link.color} stopOpacity="0.9" />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.55" />
                      </>
                    ) : (
                      <>
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.55" />
                        <stop offset="100%" stopColor={link.color} stopOpacity="0.92" />
                      </>
                    )}
                  </linearGradient>
                ))}
              </defs>

              {/* Smooth curved flow ribbons */}
              <g className="budget-sankey-links">
                {layout.links.map((link) => {
                  const isFocused = activeId === link.nodeId;
                  const isDimmed = Boolean(activeId && !isFocused);
                  return (
                    <path
                      key={link.id}
                      d={link.path}
                      fill={`url(#${uid}-${link.id})`}
                      className={`budget-sankey-ribbon${
                        isFocused ? " is-focused" : isDimmed ? " is-dimmed" : ""
                      }`}
                      onMouseEnter={() => setHoveredId(link.nodeId)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => toggleNode(link.nodeId)}
                    />
                  );
                })}
              </g>

              {/* Center cash-flow hub */}
              <g className="budget-sankey-hub">
                <rect
                  x={layout.hub.x}
                  y={layout.hub.y}
                  width={layout.hub.width}
                  height={layout.hub.height}
                  rx={5}
                  fill={`url(#${uid}-hub)`}
                />
                <text
                  x={layout.hub.x + layout.hub.width / 2}
                  y={Math.max(13, layout.hub.y - 9)}
                  textAnchor="middle"
                  className="budget-sankey-hub-amount"
                >
                  {formatCompactUAH(layout.totalFlow)}
                </text>
              </g>

              {/* Left and right node bars + crisp labels */}
              {allNodes.map((node) => {
                const isFocused = activeId === node.id;
                const isDimmed = Boolean(activeId && !isFocused);
                const isLeft = node.side === "left";
                const textX = isLeft ? node.x - 8 : node.x + node.width + 8;
                const anchor = isLeft ? "end" : "start";
                const pctLabel =
                  node.percent >= 1
                    ? `${Math.round(node.percent)}%`
                    : "<1%";

                return (
                  <g
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.name}: ${formatUAH(node.amount)} (${pctLabel})`}
                    aria-pressed={selectedId === node.id}
                    className={`budget-sankey-node${
                      isFocused ? " is-focused" : isDimmed ? " is-dimmed" : ""
                    }${node.kind === "savings" ? " is-savings" : ""}`}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => toggleNode(node.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleNode(node.id);
                      }
                    }}
                  >
                    <rect
                      x={isLeft ? 0 : node.x - 4}
                      y={Math.min(node.y, node.labelY - 15)}
                      width={isLeft ? node.x + node.width + 4 : layout.width - node.x + 4}
                      height={Math.max(node.height, 30)}
                      fill="transparent"
                    />
                    <rect
                      x={node.x}
                      y={node.y}
                      width={node.width}
                      height={node.height}
                      rx={4}
                      fill={node.color}
                      strokeDasharray={node.kind === "deficit" ? "3 2" : undefined}
                      className="budget-sankey-bar"
                    />
                    <text
                      x={textX}
                      y={node.labelY - 3}
                      textAnchor={anchor}
                      className="budget-sankey-label-name"
                    >
                      {truncateSankeyLabel(
                        node.emoji && node.emoji !== "•••"
                          ? `${node.emoji} ${node.name}`
                          : node.name,
                        15,
                      )}
                    </text>
                    <text
                      x={textX}
                      y={node.labelY + 11}
                      textAnchor={anchor}
                      className="budget-sankey-label-meta"
                    >
                      {formatCompactUAH(node.amount)} · {pctLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Interactive detail inspector OR clean 3-metric flow summary */}
          {inspectedNode ? (
            <div className="budget-sankey-inspector" role="status">
              <div className="budget-sankey-inspector-main">
                <span
                  className="budget-sankey-inspector-dot"
                  style={{ backgroundColor: inspectedNode.color }}
                  aria-hidden="true"
                />
                <div className="budget-sankey-inspector-copy">
                  <strong>
                    {inspectedNode.emoji !== "•••" ? `${inspectedNode.emoji} ` : ""}
                    {inspectedNode.name}
                  </strong>
                  <small>
                    {formatUAH(inspectedNode.amount)} ·{" "}
                    {inspectedNode.percent >= 1
                      ? `${Math.round(inspectedNode.percent)}%`
                      : "<1%"}{" "}
                    потоку
                    {inspectedNode.count > 0
                      ? ` · ${inspectedNode.count} опер.`
                      : ""}
                  </small>
                </div>
              </div>
              {inspectedNode.categoryKey && (
                <button
                  type="button"
                  className="budget-sankey-jump"
                  onClick={() => onSelectCategory(inspectedNode.categoryKey!)}
                >
                  <span>Операції</span>
                  <ArrowRight size={13} />
                </button>
              )}
            </div>
          ) : (
            <div className="budget-sankey-summary">
              <div className="budget-sankey-stat">
                <span>Доходи</span>
                <strong className="is-income">
                  {layout.incomeHidden
                    ? "Приховано"
                    : formatUAH(layout.incomeTotal)}
                </strong>
              </div>
              <div className="budget-sankey-stat">
                <span>Витрати</span>
                <strong>{formatUAH(layout.expenseTotal)}</strong>
              </div>
              <div className="budget-sankey-stat">
                <span>
                  {layout.deficit > 0
                    ? "Із заощаджень"
                    : layout.savingsRate !== null && layout.surplus > 0
                      ? `Залишок · ${layout.savingsRate}%`
                      : "Заощаджено"}
                </span>
                <strong
                  className={
                    layout.surplus > 0
                      ? "is-income"
                      : layout.deficit > 0
                        ? "is-deficit"
                        : ""
                  }
                >
                  {layout.incomeHidden
                    ? "—"
                    : layout.deficit > 0
                      ? `−${formatUAH(layout.deficit)}`
                      : formatUAH(layout.surplus)}
                </strong>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
