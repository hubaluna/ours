import type { CategoryBreakdownRow } from "./budget";

export type SankeySide = "left" | "right";

export type SankeyNodeKind =
  | "income"
  | "deficit"
  | "savings"
  | "expense"
  | "other_income"
  | "other_expense"
  | "neutral_source";

export type SankeyNode = {
  id: string;
  categoryKey: string | null;
  side: SankeySide;
  kind: SankeyNodeKind;
  name: string;
  emoji: string;
  color: string;
  amount: number;
  percent: number;
  count: number;
  x: number;
  y: number;
  width: number;
  height: number;
  labelY: number;
};

export type SankeyLink = {
  id: string;
  nodeId: string;
  side: SankeySide;
  color: string;
  amount: number;
  percent: number;
  path: string;
  x0: number;
  x1: number;
};

export type BudgetSankeyLayout = {
  width: number;
  height: number;
  totalFlow: number;
  incomeTotal: number;
  expenseTotal: number;
  surplus: number;
  deficit: number;
  savingsRate: number | null;
  incomeHidden: boolean;
  hub: {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
  };
  leftNodes: SankeyNode[];
  rightNodes: SankeyNode[];
  links: SankeyLink[];
};

const VIEW_WIDTH = 520;
const LEFT_BAR_X = 142;
const NODE_BAR_W = 10;
const HUB_BAR_X = 254;
const HUB_BAR_W = 12;
const RIGHT_BAR_X = 368;
const PAD_TOP = 24;
const PAD_BOTTOM = 18;
const MIN_NODE_PITCH = 38;
const NODE_GAP = 10;
const MIN_BAR_H = 12;

export function formatCompactUAH(value: number): string {
  const abs = Math.abs(Math.round(value * 100) / 100);
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const str = m.toFixed(m >= 10 ? 1 : 2).replace(/\.?0+$/, "").replace(".", ",");
    return `${str} млн ₴`;
  }
  if (abs >= 10_000) {
    const k = abs / 1_000;
    const str = k.toFixed(k >= 100 ? 0 : 1).replace(/\.0$/, "").replace(".", ",");
    return `${str} тис. ₴`;
  }
  return `${new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: 0,
  })
    .format(Math.round(abs))
    .replace(/\u00a0/g, " ")} ₴`;
}

export function truncateSankeyLabel(text: string, maxChars = 15): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

type RawNode = {
  id: string;
  categoryKey: string | null;
  kind: SankeyNodeKind;
  name: string;
  emoji: string;
  color: string;
  amount: number;
  count: number;
};

function groupTail(
  rows: CategoryBreakdownRow[],
  maxItems: number,
  tailKind: "other_income" | "other_expense",
  tailLabel: string,
): RawNode[] {
  const positive = rows.filter((r) => r.amount > 0);
  if (positive.length <= maxItems) {
    return positive.map((r) => ({
      id: `${tailKind === "other_income" ? "in" : "ex"}:${r.key}`,
      categoryKey: r.key,
      kind: tailKind === "other_income" ? "income" : "expense",
      name: r.name,
      emoji: r.emoji,
      color: r.color,
      amount: r.amount,
      count: r.count,
    }));
  }

  const head = positive.slice(0, maxItems - 1);
  const tail = positive.slice(maxItems - 1);
  const tailAmount =
    Math.round(tail.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  const tailCount = tail.reduce((s, r) => s + r.count, 0);

  return [
    ...head.map((r) => ({
      id: `${tailKind === "other_income" ? "in" : "ex"}:${r.key}`,
      categoryKey: r.key,
      kind: (tailKind === "other_income" ? "income" : "expense") as SankeyNodeKind,
      name: r.name,
      emoji: r.emoji,
      color: r.color,
      amount: r.amount,
      count: r.count,
    })),
    {
      id: tailKind,
      categoryKey: null,
      kind: tailKind,
      name: `${tailLabel} (${tail.length})`,
      emoji: "•••",
      color: tailKind === "other_income" ? "#34D399" : "#94A3B8",
      amount: tailAmount,
      count: tailCount,
    },
  ];
}

function buildRibbonPath(
  x0: number,
  y0Top: number,
  y0Bottom: number,
  x1: number,
  y1Top: number,
  y1Bottom: number,
): string {
  const cx = (x0 + x1) / 2;
  return [
    `M ${x0.toFixed(1)} ${y0Top.toFixed(1)}`,
    `C ${cx.toFixed(1)} ${y0Top.toFixed(1)}, ${cx.toFixed(1)} ${y1Top.toFixed(1)}, ${x1.toFixed(1)} ${y1Top.toFixed(1)}`,
    `L ${x1.toFixed(1)} ${y1Bottom.toFixed(1)}`,
    `C ${cx.toFixed(1)} ${y1Bottom.toFixed(1)}, ${cx.toFixed(1)} ${y0Bottom.toFixed(1)}, ${x0.toFixed(1)} ${y0Bottom.toFixed(1)}`,
    "Z",
  ].join(" ");
}

function resolveLabelPositions(
  nodes: Array<{ y: number; height: number }>,
  minY: number,
  maxY: number,
  minGap: number,
): number[] {
  if (!nodes.length) return [];
  const ys = nodes.map((n) => n.y + n.height / 2);
  // Push downward to resolve collisions
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] - ys[i - 1] < minGap) {
      ys[i] = ys[i - 1] + minGap;
    }
  }
  // If last overflows maxY, shift upward gracefully
  const overflow = ys[ys.length - 1] - maxY;
  if (overflow > 0) {
    ys[ys.length - 1] -= overflow;
    for (let i = ys.length - 2; i >= 0; i--) {
      if (ys[i + 1] - ys[i] < minGap) {
        ys[i] = ys[i + 1] - minGap;
      }
    }
  }
  // Clamp top
  if (ys[0] < minY) {
    const shift = minY - ys[0];
    for (let i = 0; i < ys.length; i++) ys[i] += shift;
  }
  return ys;
}

function layoutColumn(
  rawNodes: RawNode[],
  side: SankeySide,
  barX: number,
  totalFlow: number,
  canvasHeight: number,
): SankeyNode[] {
  if (!rawNodes.length || totalFlow <= 0) return [];
  const available = canvasHeight - PAD_TOP - PAD_BOTTOM;
  const totalGaps = Math.max(0, rawNodes.length - 1) * NODE_GAP;
  const maxBarsBudget = Math.max(rawNodes.length * MIN_BAR_H, available - totalGaps);

  // First compute proportional heights, then enforce minimum height for readability
  const rawHeights = rawNodes.map((n) => (n.amount / totalFlow) * maxBarsBudget);
  const clamped = rawHeights.map((h) => Math.max(MIN_BAR_H, h));
  const clampedSum = clamped.reduce((s, h) => s + h, 0);

  let heights = clamped;
  if (clampedSum > maxBarsBudget && clampedSum > 0) {
    const excess = clampedSum - maxBarsBudget;
    const shrinkable = clamped.reduce((s, h) => s + Math.max(0, h - MIN_BAR_H), 0);
    if (shrinkable > 0) {
      heights = clamped.map((h) => {
        const room = Math.max(0, h - MIN_BAR_H);
        return h - (room / shrinkable) * Math.min(excess, shrinkable);
      });
    } else {
      const scale = maxBarsBudget / clampedSum;
      heights = clamped.map((h) => h * scale);
    }
  }

  const stackTotal = heights.reduce((s, h) => s + h, 0) + totalGaps;
  let cursorY = PAD_TOP + Math.max(0, (available - stackTotal) / 2);

  const positioned = rawNodes.map((raw, idx) => {
    const h = heights[idx];
    const y = cursorY;
    cursorY += h + NODE_GAP;
    return {
      ...raw,
      side,
      percent: totalFlow > 0 ? (raw.amount / totalFlow) * 100 : 0,
      x: barX,
      y,
      width: NODE_BAR_W,
      height: h,
      labelY: y + h / 2,
    };
  });

  const labelYs = resolveLabelPositions(
    positioned,
    PAD_TOP + 13,
    canvasHeight - PAD_BOTTOM - 13,
    33,
  );
  return positioned.map((node, i) => ({ ...node, labelY: labelYs[i] }));
}

export function buildBudgetSankey(params: {
  incomeRows: CategoryBreakdownRow[];
  expenseRows: CategoryBreakdownRow[];
  incomeTotal: number | null;
  expenseTotal: number;
  maxExpenseNodes?: number;
  maxIncomeNodes?: number;
}): BudgetSankeyLayout {
  const {
    incomeRows,
    expenseRows,
    incomeTotal,
    expenseTotal,
    maxExpenseNodes = 7,
    maxIncomeNodes = 4,
  } = params;

  const incomeHidden = incomeTotal === null;
  const safeIncome = Math.max(0, Math.round((incomeTotal ?? 0) * 100) / 100);
  const safeExpense = Math.max(0, Math.round(expenseTotal * 100) / 100);
  const totalFlow = Math.max(safeIncome, safeExpense);

  const surplus =
    !incomeHidden && safeIncome > safeExpense
      ? Math.round((safeIncome - safeExpense) * 100) / 100
      : 0;
  const deficit =
    !incomeHidden && safeIncome > 0 && safeExpense > safeIncome
      ? Math.round((safeExpense - safeIncome) * 100) / 100
      : 0;
  const savingsRate =
    !incomeHidden && safeIncome > 0
      ? Math.round(((safeIncome - safeExpense) / safeIncome) * 100)
      : null;

  if (totalFlow <= 0) {
    return {
      width: VIEW_WIDTH,
      height: 200,
      totalFlow: 0,
      incomeTotal: safeIncome,
      expenseTotal: safeExpense,
      surplus: 0,
      deficit: 0,
      savingsRate: null,
      incomeHidden,
      hub: {
        x: HUB_BAR_X,
        y: 40,
        width: HUB_BAR_W,
        height: 120,
        label: "Потік",
      },
      leftNodes: [],
      rightNodes: [],
      links: [],
    };
  }

  // Build left column (income sources + optional deficit coverage)
  let rawLeft: RawNode[];
  if (safeIncome > 0 && incomeRows.length > 0) {
    rawLeft = groupTail(incomeRows, maxIncomeNodes, "other_income", "Інші");
    if (deficit > 0) {
      rawLeft.push({
        id: "deficit",
        categoryKey: null,
        kind: "deficit",
        name: "Із заощаджень",
        emoji: "🪙",
        color: "#F59E0B",
        amount: deficit,
        count: 0,
      });
    }
  } else {
    // Expenses-only period or hidden partner income: single clean source flowing into categories
    rawLeft = [
      {
        id: "source-neutral",
        categoryKey: null,
        kind: "neutral_source",
        name: incomeHidden ? "Дохід приховано" : "Бюджет періоду",
        emoji: incomeHidden ? "🔒" : "💳",
        color: "#64748B",
        amount: Math.max(safeExpense, safeIncome),
        count: 0,
      },
    ];
  }

  // Build right column (Monarch style: Savings at top if surplus, then top expenses)
  const rawRight: RawNode[] = [];
  if (surplus > 0) {
    rawRight.push({
      id: "savings",
      categoryKey: null,
      kind: "savings",
      name: "Заощадження",
      emoji: "🌿",
      color: "#22C55E",
      amount: surplus,
      count: 0,
    });
  }
  const expenseCapacity = surplus > 0 ? Math.max(4, maxExpenseNodes - 1) : maxExpenseNodes;
  if (safeExpense > 0 && expenseRows.length > 0) {
    rawRight.push(
      ...groupTail(expenseRows, expenseCapacity, "other_expense", "Інші"),
    );
  }

  const maxCount = Math.max(rawLeft.length, rawRight.length, 2);
  const canvasHeight = Math.max(264, maxCount * MIN_NODE_PITCH + PAD_TOP + PAD_BOTTOM + 8);

  const leftNodes = layoutColumn(rawLeft, "left", LEFT_BAR_X, totalFlow, canvasHeight);
  const rightNodes = layoutColumn(rawRight, "right", RIGHT_BAR_X, totalFlow, canvasHeight);

  // Center hub bar sits neatly centered, spanning ~74% of usable height
  const usable = canvasHeight - PAD_TOP - PAD_BOTTOM;
  const hubHeight = Math.max(120, Math.round(usable * 0.76));
  const hubY = PAD_TOP + (usable - hubHeight) / 2;

  const links: SankeyLink[] = [];

  // Left-to-hub ribbons (partition hub's left edge strictly proportionally)
  let leftHubCursor = hubY;
  for (const node of leftNodes) {
    const shareH = (node.amount / totalFlow) * hubHeight;
    const targetTop = leftHubCursor;
    const targetBottom = leftHubCursor + Math.max(2, shareH);
    leftHubCursor += shareH;

    const x0 = node.x + node.width;
    const x1 = HUB_BAR_X;
    links.push({
      id: `link-${node.id}`,
      nodeId: node.id,
      side: "left",
      color: node.color,
      amount: node.amount,
      percent: node.percent,
      x0,
      x1,
      path: buildRibbonPath(
        x0,
        node.y,
        node.y + node.height,
        x1,
        targetTop,
        Math.min(hubY + hubHeight, targetBottom),
      ),
    });
  }

  // Hub-to-right ribbons (partition hub's right edge strictly proportionally)
  let rightHubCursor = hubY;
  for (const node of rightNodes) {
    const shareH = (node.amount / totalFlow) * hubHeight;
    const sourceTop = rightHubCursor;
    const sourceBottom = rightHubCursor + Math.max(2, shareH);
    rightHubCursor += shareH;

    const x0 = HUB_BAR_X + HUB_BAR_W;
    const x1 = node.x;
    links.push({
      id: `link-${node.id}`,
      nodeId: node.id,
      side: "right",
      color: node.color,
      amount: node.amount,
      percent: node.percent,
      x0,
      x1,
      path: buildRibbonPath(
        x0,
        sourceTop,
        Math.min(hubY + hubHeight, sourceBottom),
        x1,
        node.y,
        node.y + node.height,
      ),
    });
  }

  return {
    width: VIEW_WIDTH,
    height: canvasHeight,
    totalFlow,
    incomeTotal: safeIncome,
    expenseTotal: safeExpense,
    surplus,
    deficit,
    savingsRate,
    incomeHidden,
    hub: {
      x: HUB_BAR_X,
      y: hubY,
      width: HUB_BAR_W,
      height: hubHeight,
      label: safeIncome > 0 ? "Бюджет" : "Витрати",
    },
    leftNodes,
    rightNodes,
    links,
  };
}
