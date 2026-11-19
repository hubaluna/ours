import { formatBudgetDayHeading, formatUAH, type CategoryBreakdownRow } from "./budget";
import type { BudgetTransaction } from "./types";

export type BudgetPdfInput = {
  periodLabel: string;
  periodFrom?: string;
  periodTo?: string;
  scopeLabel: string;
  generatedAtLabel: string;
  expenseTotal: number;
  incomeTotal: number | null;
  balance: number | null;
  savingsRate?: number | null;
  expenseRows: CategoryBreakdownRow[];
  incomeRows: CategoryBreakdownRow[];
  transactions?: BudgetTransaction[];
};

export type PdfDonutSlice = {
  key: string;
  name: string;
  emoji: string;
  color: string;
  amount: number;
  percent: number;
  startAngle: number;
  endAngle: number;
};

export type PdfTimelineBar = {
  label: string;
  expense: number;
  income: number;
};

export type PdfAnalyticsData = {
  donutSlices: PdfDonutSlice[];
  timelineMode: "monthly" | "daily" | "top_categories";
  timelineBars: PdfTimelineBar[];
  topCategory: CategoryBreakdownRow | null;
  top3SharePercent: number;
  dailyAverage: number | null;
  txCount: number;
  notableTransactions: BudgetTransaction[];
};

export function preparePdfAnalyticsData(input: BudgetPdfInput): PdfAnalyticsData {
  const topLimit = 6;
  const rows = input.expenseRows.filter((r) => r.amount > 0);
  const total = input.expenseTotal > 0
    ? input.expenseTotal
    : rows.reduce((s, r) => s + r.amount, 0);

  let groupedSlices: Array<{
    key: string;
    name: string;
    emoji: string;
    color: string;
    amount: number;
    percent: number;
  }> = [];

  if (rows.length <= topLimit) {
    groupedSlices = rows.map((r) => ({
      key: r.key,
      name: r.name,
      emoji: r.emoji,
      color: r.color,
      amount: r.amount,
      percent: total > 0 ? (r.amount / total) * 100 : 0,
    }));
  } else {
    const head = rows.slice(0, topLimit - 1);
    const tail = rows.slice(topLimit - 1);
    const tailAmount = Math.round(tail.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    groupedSlices = [
      ...head.map((r) => ({
        key: r.key,
        name: r.name,
        emoji: r.emoji,
        color: r.color,
        amount: r.amount,
        percent: total > 0 ? (r.amount / total) * 100 : 0,
      })),
      {
        key: "_rest",
        name: `Інше (${tail.length})`,
        emoji: "📦",
        color: "#9CA3AF",
        amount: tailAmount,
        percent: total > 0 ? (tailAmount / total) * 100 : 0,
      },
    ];
  }

  let cursor = -Math.PI / 2;
  const donutSlices: PdfDonutSlice[] = groupedSlices.map((item, idx) => {
    const sweep =
      idx === groupedSlices.length - 1
        ? Math.PI * 1.5 - cursor
        : total > 0
          ? (item.amount / total) * Math.PI * 2
          : 0;
    const slice: PdfDonutSlice = {
      ...item,
      startAngle: cursor,
      endAngle: cursor + Math.max(0, sweep),
    };
    cursor += Math.max(0, sweep);
    return slice;
  });

  const txs = input.transactions ?? [];
  const monthBuckets = new Map<string, { expense: number; income: number }>();
  const dayBuckets = new Map<string, { expense: number; income: number }>();

  for (const tx of txs) {
    const monthKey = tx.occurred_on.slice(0, 7);
    const m = monthBuckets.get(monthKey) ?? { expense: 0, income: 0 };
    const d = dayBuckets.get(tx.occurred_on) ?? { expense: 0, income: 0 };
    const amt = Number(tx.amount || 0);
    if (tx.kind === "expense") {
      m.expense += amt;
      d.expense += amt;
    } else if (input.incomeTotal !== null) {
      m.income += amt;
      d.income += amt;
    }
    monthBuckets.set(monthKey, m);
    dayBuckets.set(tx.occurred_on, d);
  }

  let timelineMode: PdfAnalyticsData["timelineMode"] = "top_categories";
  let timelineBars: PdfTimelineBar[] = [];

  if (monthBuckets.size >= 2) {
    timelineMode = "monthly";
    const sortedMonths = [...monthBuckets.keys()].sort().slice(-8);
    const fmt = new Intl.DateTimeFormat("uk-UA", { month: "short", timeZone: "UTC" });
    timelineBars = sortedMonths.map((ym) => {
      const b = monthBuckets.get(ym)!;
      const raw = fmt.format(new Date(`${ym}-01T12:00:00Z`)).replace(/\.$/, "");
      return {
        label: raw.charAt(0).toUpperCase() + raw.slice(1),
        expense: Math.round(b.expense * 100) / 100,
        income: Math.round(b.income * 100) / 100,
      };
    });
  } else if (dayBuckets.size >= 2) {
    timelineMode = "daily";
    const sortedDays = [...dayBuckets.keys()].sort().slice(-10);
    timelineBars = sortedDays.map((day) => {
      const b = dayBuckets.get(day)!;
      const [, m, d] = day.split("-");
      return {
        label: `${d}.${m}`,
        expense: Math.round(b.expense * 100) / 100,
        income: Math.round(b.income * 100) / 100,
      };
    });
  }

  let dailyAverage: number | null = null;
  if (input.periodFrom && input.periodTo && total > 0) {
    const startMs = Date.parse(`${input.periodFrom}T12:00:00Z`);
    const endMs = Date.parse(`${input.periodTo}T12:00:00Z`);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      const days = Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1);
      dailyAverage = Math.round((total / days) * 100) / 100;
    }
  }

  const top3SharePercent =
    total > 0
      ? Math.round(
          (rows.slice(0, 3).reduce((s, r) => s + r.amount, 0) / total) * 100,
        )
      : 0;

  const txCount = txs.length
    ? txs.length
    : [...input.expenseRows, ...input.incomeRows].reduce((s, r) => s + r.count, 0);

  const notableTransactions = [...txs]
    .filter((tx) => tx.card_label !== "Skarbo" && tx.kind === "expense")
    .sort((a, b) => b.amount - a.amount || b.occurred_on.localeCompare(a.occurred_on))
    .slice(0, 8);

  return {
    donutSlices,
    timelineMode,
    timelineBars,
    topCategory: rows[0] ?? null,
    top3SharePercent,
    dailyAverage,
    txCount,
    notableTransactions,
  };
}

/**
 * Wraps one or more JPEG page images into a valid single- or multi-page PDF 1.4 binary.
 * Rendering via Canvas ensures crisp Ukrainian typography, emoji, and ₴ glyph support
 * without bundling megabytes of custom PDF font files.
 */
export function buildPdfFromJpegPages(
  pages: { width: number; height: number; jpeg: Uint8Array }[],
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [0];

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const pushStr = (text: string) => pushBytes(encoder.encode(text));

  pushStr("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

  const pageCount = pages.length;
  const kidsRefs = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");

  const startObj = (id: number) => {
    offsets[id] = offset;
    pushStr(`${id} 0 obj\n`);
  };

  startObj(1);
  pushStr("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  startObj(2);
  pushStr(`<< /Type /Pages /Kids [${kidsRefs}] /Count ${pageCount} >>\nendobj\n`);

  // A4 in PDF points: 595.28 x 841.89
  const pdfW = 595.28;
  const pdfH = 841.89;

  pages.forEach((page, i) => {
    const pageId = 3 + i * 3;
    const contentId = 4 + i * 3;
    const imageId = 5 + i * 3;
    const streamCmd = `q\n${pdfW.toFixed(2)} 0 0 ${pdfH.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
    const streamBytes = encoder.encode(streamCmd);

    startObj(pageId);
    pushStr(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfW.toFixed(2)} ${pdfH.toFixed(2)}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );

    startObj(contentId);
    pushStr(`<< /Length ${streamBytes.length} >>\nstream\n`);
    pushBytes(streamBytes);
    pushStr("\nendstream\nendobj\n");

    startObj(imageId);
    pushStr(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
    );
    pushBytes(page.jpeg);
    pushStr("\nendstream\nendobj\n");
  });

  const xrefOffset = offset;
  const totalObjects = 2 + pageCount * 3;
  pushStr(`xref\n0 ${totalObjects + 1}\n`);
  pushStr("0000000000 65535 f \n");
  for (let id = 1; id <= totalObjects; id++) {
    pushStr(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  pushStr(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  const out = new Uint8Array(offset);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function formatCompactAxis(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".0", "")}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

function renderReportPages(input: BudgetPdfInput): HTMLCanvasElement[] {
  const width = 1240; // A4 @ ~150 DPI
  const height = 1754;
  const margin = 80;
  const contentWidth = width - margin * 2;
  const font = 'e-Ukraine, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const analytics = preparePdfAnalyticsData(input);

  const pages: HTMLCanvasElement[] = [];
  const createPage = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#FAF9F5";
    ctx.fillRect(0, 0, width, height);
    pages.push(canvas);
    return ctx;
  };

  let ctx = createPage();
  let y = 86;

  // Header
  ctx.fillStyle = "#385E43";
  ctx.font = `700 40px ${font}`;
  ctx.fillText("ours.", margin, y);

  ctx.fillStyle = "#536359";
  ctx.font = `400 20px ${font}`;
  ctx.textAlign = "right";
  ctx.fillText(input.generatedAtLabel, width - margin, y - 6);
  ctx.textAlign = "left";

  y += 46;
  ctx.fillStyle = "#1E2D24";
  ctx.font = `600 32px ${font}`;
  ctx.fillText(fitText(ctx, `Фінансовий звіт · ${input.periodLabel}`, contentWidth), margin, y);

  y += 32;
  ctx.fillStyle = "#536359";
  ctx.font = `400 20px ${font}`;
  const ratePart =
    typeof input.savingsRate === "number"
      ? ` · Норма заощаджень: ${input.savingsRate}%`
      : "";
  ctx.fillText(
    `Учасник: ${input.scopeLabel} · Валюта: UAH (₴)${ratePart}`,
    margin,
    y,
  );

  // KPI Summary strip (3 columns)
  y += 30;
  const cardH = 122;
  const colW = (contentWidth - 32) / 3;
  const summaryItems = [
    {
      label: "Витрати",
      value: formatUAH(input.expenseTotal),
      color: "#1E2D24",
      accent: "#EF4444",
    },
    {
      label: "Доходи",
      value: input.incomeTotal === null ? "Приховано" : formatUAH(input.incomeTotal),
      color: input.incomeTotal === null ? "#536359" : "#2B4E35",
      accent: "#22C55E",
    },
    {
      label: "Залишок",
      value: input.balance === null ? "—" : formatUAH(input.balance),
      color:
        input.balance === null
          ? "#536359"
          : input.balance < 0
            ? "#B2483B"
            : "#2B4E35",
      accent: input.balance !== null && input.balance < 0 ? "#B2483B" : "#385E43",
    },
  ];

  summaryItems.forEach((item, idx) => {
    const x = margin + idx * (colW + 16);
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#DDE4DD";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, colW, cardH, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = item.accent;
    ctx.beginPath();
    ctx.roundRect(x + 22, y + 22, 6, 22, 3);
    ctx.fill();

    ctx.fillStyle = "#536359";
    ctx.font = `500 19px ${font}`;
    ctx.fillText(item.label, x + 38, y + 40);

    ctx.fillStyle = item.color;
    ctx.font = `700 30px ${font}`;
    ctx.fillText(fitText(ctx, item.value, colW - 44), x + 22, y + 90);
  });

  y += cardH + 26;

  // Card 1: Donut chart ("Структура витрат") + Legend
  const donutCardH = 420;
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#DDE4DD";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(margin, y, contentWidth, donutCardH, 24);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#1E2D24";
  ctx.font = `600 24px ${font}`;
  ctx.fillText("Структура витрат за категоріями", margin + 30, y + 46);

  ctx.fillStyle = "#536359";
  ctx.font = `400 18px ${font}`;
  ctx.textAlign = "right";
  ctx.fillText(`${input.expenseRows.length} категорій`, width - margin - 30, y + 46);
  ctx.textAlign = "left";

  if (analytics.donutSlices.length === 0) {
    ctx.fillStyle = "#536359";
    ctx.font = `400 21px ${font}`;
    ctx.fillText("За обраний період витрат не зафіксовано", margin + 30, y + 210);
  } else {
    const cx = margin + 198;
    const cy = y + 236;
    const outerR = 136;
    const innerR = 78;

    analytics.donutSlices.forEach((slice) => {
      const span = slice.endAngle - slice.startAngle;
      if (span <= 0.004) return;
      const gap = analytics.donutSlices.length > 1 ? Math.min(0.025, span * 0.14) : 0;
      const a0 = slice.startAngle + gap / 2;
      const a1 = slice.endAngle - gap / 2;
      if (a1 <= a0) return;

      ctx.beginPath();
      ctx.arc(cx, cy, outerR, a0, a1);
      ctx.arc(cx, cy, innerR, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = slice.color || "#385E43";
      ctx.fill();
    });

    // Center summary text inside donut
    ctx.textAlign = "center";
    ctx.fillStyle = "#536359";
    ctx.font = `500 15px ${font}`;
    ctx.fillText("Всього витрат", cx, cy - 10);
    ctx.fillStyle = "#1E2D24";
    ctx.font = `700 21px ${font}`;
    ctx.fillText(fitText(ctx, formatUAH(input.expenseTotal), innerR * 1.72), cx, cy + 18);
    ctx.textAlign = "left";

    // Right-hand Donut Legend
    const legX = margin + 390;
    const legW = contentWidth - 420;
    const rowStep = 52;
    analytics.donutSlices.forEach((slice, idx) => {
      const ry = y + 92 + idx * rowStep;
      ctx.fillStyle = slice.color || "#385E43";
      ctx.beginPath();
      ctx.roundRect(legX, ry + 8, 12, 24, 6);
      ctx.fill();

      ctx.fillStyle = "#1E2D24";
      ctx.font = `500 20px ${font}`;
      ctx.fillText(
        fitText(ctx, `${slice.emoji}  ${slice.name}`, legW - 225),
        legX + 24,
        ry + 27,
      );

      ctx.textAlign = "right";
      ctx.fillStyle = "#536359";
      ctx.font = `500 18px ${font}`;
      ctx.fillText(`${slice.percent.toFixed(1)}%`, legX + legW - 148, ry + 27);

      ctx.fillStyle = "#1E2D24";
      ctx.font = `600 20px ${font}`;
      ctx.fillText(formatUAH(slice.amount), legX + legW, ry + 27);
      ctx.textAlign = "left";

      if (idx < analytics.donutSlices.length - 1) {
        ctx.strokeStyle = "#EEF2ED";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(legX, ry + 45);
        ctx.lineTo(legX + legW, ry + 45);
        ctx.stroke();
      }
    });
  }

  y += donutCardH + 24;

  // Card 2: Two side-by-side cards — Ratio Comparison & Key Insights
  const midCardH = 264;
  const halfW = (contentWidth - 20) / 2;

  // Left: Balance Flow ("Доходи vs Витрати")
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#DDE4DD";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(margin, y, halfW, midCardH, 22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#1E2D24";
  ctx.font = `600 22px ${font}`;
  ctx.fillText("Співвідношення потоків", margin + 26, y + 42);

  const flowMax = Math.max(input.expenseTotal, input.incomeTotal ?? 0, 1);
  const trackW = halfW - 52;

  // Income bar
  ctx.fillStyle = "#536359";
  ctx.font = `500 18px ${font}`;
  ctx.fillText("Доходи", margin + 26, y + 88);
  ctx.textAlign = "right";
  ctx.fillStyle = input.incomeTotal === null ? "#536359" : "#22A653";
  ctx.font = `600 19px ${font}`;
  ctx.fillText(
    input.incomeTotal === null ? "Приховано" : formatUAH(input.incomeTotal),
    margin + halfW - 26,
    y + 88,
  );
  ctx.textAlign = "left";

  ctx.fillStyle = "#EEF2ED";
  ctx.beginPath();
  ctx.roundRect(margin + 26, y + 102, trackW, 14, 7);
  ctx.fill();
  if (input.incomeTotal && input.incomeTotal > 0) {
    ctx.fillStyle = "#22C55E";
    ctx.beginPath();
    ctx.roundRect(
      margin + 26,
      y + 102,
      Math.max(14, (input.incomeTotal / flowMax) * trackW),
      14,
      7,
    );
    ctx.fill();
  }

  // Expense bar
  ctx.fillStyle = "#536359";
  ctx.font = `500 18px ${font}`;
  ctx.fillText("Витрати", margin + 26, y + 154);
  ctx.textAlign = "right";
  ctx.fillStyle = "#1E2D24";
  ctx.font = `600 19px ${font}`;
  ctx.fillText(formatUAH(input.expenseTotal), margin + halfW - 26, y + 154);
  ctx.textAlign = "left";

  ctx.fillStyle = "#EEF2ED";
  ctx.beginPath();
  ctx.roundRect(margin + 26, y + 168, trackW, 14, 7);
  ctx.fill();
  if (input.expenseTotal > 0) {
    ctx.fillStyle = "#EF4444";
    ctx.beginPath();
    ctx.roundRect(
      margin + 26,
      y + 168,
      Math.max(14, (input.expenseTotal / flowMax) * trackW),
      14,
      7,
    );
    ctx.fill();
  }

  // Bottom pill inside Balance Flow card
  const statusBg =
    input.balance === null
      ? "#EEF2ED"
      : input.balance >= 0
        ? "#EAF5EC"
        : "#FBECE9";
  const statusFg =
    input.balance === null
      ? "#536359"
      : input.balance >= 0
        ? "#2B4E35"
        : "#B2483B";
  ctx.fillStyle = statusBg;
  ctx.beginPath();
  ctx.roundRect(margin + 26, y + 202, trackW, 40, 12);
  ctx.fill();
  ctx.fillStyle = statusFg;
  ctx.font = `600 17px ${font}`;
  const statusLine =
    input.balance === null
      ? "Доходи партнера приховані"
      : input.balance >= 0
        ? `Чистий плюс: +${formatUAH(input.balance)}${typeof input.savingsRate === "number" ? ` (${input.savingsRate}%)` : ""}`
        : `Перевитрата за період: ${formatUAH(input.balance)}`;
  ctx.fillText(fitText(ctx, statusLine, trackW - 24), margin + 40, y + 228);

  // Right: Key Insights ("Головне за період")
  const rightX = margin + halfW + 20;
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#DDE4DD";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(rightX, y, halfW, midCardH, 22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#1E2D24";
  ctx.font = `600 22px ${font}`;
  ctx.fillText("Ключова аналітика", rightX + 26, y + 42);

  const insights: Array<[string, string]> = [
    [
      "Найбільша стаття",
      analytics.topCategory
        ? `${analytics.topCategory.emoji} ${analytics.topCategory.name} · ${Math.round(analytics.topCategory.percent)}%`
        : "—",
    ],
    ["Частка Топ-3 категорій", `${analytics.top3SharePercent}% усіх витрат`],
    [
      "У середньому на день",
      analytics.dailyAverage !== null ? formatUAH(analytics.dailyAverage) : "—",
    ],
    ["Усього записів", `${analytics.txCount}`],
  ];

  insights.forEach(([k, v], idx) => {
    const iy = y + 84 + idx * 44;
    ctx.fillStyle = "#536359";
    ctx.font = `400 17px ${font}`;
    ctx.fillText(k, rightX + 26, iy);

    ctx.textAlign = "right";
    ctx.fillStyle = "#1E2D24";
    ctx.font = `600 18px ${font}`;
    ctx.fillText(fitText(ctx, v, halfW - 210), rightX + halfW - 26, iy);
    ctx.textAlign = "left";

    if (idx < insights.length - 1) {
      ctx.strokeStyle = "#EEF2ED";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rightX + 26, iy + 14);
      ctx.lineTo(rightX + halfW - 26, iy + 14);
      ctx.stroke();
    }
  });

  y += midCardH + 24;

  // Card 3: Timeline Bar Chart OR Top Categories Horizontal Bar Chart
  const chartCardH = Math.max(360, height - y - 92);
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#DDE4DD";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(margin, y, contentWidth, chartCardH, 24);
  ctx.fill();
  ctx.stroke();

  if (analytics.timelineBars.length >= 2) {
    const isMonthly = analytics.timelineMode === "monthly";
    ctx.fillStyle = "#1E2D24";
    ctx.font = `600 22px ${font}`;
    ctx.fillText(
      isMonthly ? "Динаміка по місяцях" : "Динаміка витрат по днях",
      margin + 30,
      y + 44,
    );

    // Legend dots top-right
    ctx.textAlign = "right";
    ctx.font = `500 16px ${font}`;
    ctx.fillStyle = "#536359";
    ctx.fillText("Витрати", width - margin - 30, y + 42);
    ctx.fillStyle = "#EF4444";
    ctx.beginPath();
    ctx.arc(width - margin - 108, y + 36, 6, 0, Math.PI * 2);
    ctx.fill();

    if (input.incomeTotal !== null) {
      ctx.fillStyle = "#536359";
      ctx.fillText("Доходи", width - margin - 134, y + 42);
      ctx.fillStyle = "#22C55E";
      ctx.beginPath();
      ctx.arc(width - margin - 208, y + 36, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = "left";

    const plotX = margin + 92;
    const plotY = y + 84;
    const plotW = contentWidth - 122;
    const plotH = chartCardH - 150;
    const maxBarVal = Math.max(
      1,
      ...analytics.timelineBars.flatMap((b) => [b.expense, b.income]),
    );

    // Horizontal dashed gridlines
    const steps = 4;
    for (let s = 0; s <= steps; s++) {
      const gy = plotY + plotH - (plotH * s) / steps;
      ctx.strokeStyle = s === 0 ? "#D4DDD5" : "#EEF2ED";
      ctx.lineWidth = s === 0 ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(plotX, gy);
      ctx.lineTo(plotX + plotW, gy);
      ctx.stroke();

      const axisVal = (maxBarVal * s) / steps;
      ctx.fillStyle = "#6C7A71";
      ctx.font = `400 15px ${font}`;
      ctx.textAlign = "right";
      ctx.fillText(formatCompactAxis(axisVal), plotX - 12, gy + 5);
    }
    ctx.textAlign = "left";

    const slotW = plotW / analytics.timelineBars.length;
    const showIncome = input.incomeTotal !== null;
    analytics.timelineBars.forEach((bar, idx) => {
      const centerX = plotX + slotW * (idx + 0.5);
      const barW = showIncome
        ? Math.min(34, Math.max(14, slotW * 0.28))
        : Math.min(46, Math.max(18, slotW * 0.44));
      const gap = showIncome ? 6 : 0;

      if (showIncome) {
        const incH = bar.income > 0 ? Math.max(8, (bar.income / maxBarVal) * plotH) : 0;
        const expH = bar.expense > 0 ? Math.max(8, (bar.expense / maxBarVal) * plotH) : 0;
        if (incH > 0) {
          ctx.fillStyle = "#22C55E";
          ctx.beginPath();
          ctx.roundRect(centerX - barW - gap / 2, plotY + plotH - incH, barW, incH, [6, 6, 0, 0]);
          ctx.fill();
        }
        if (expH > 0) {
          ctx.fillStyle = "#EF4444";
          ctx.beginPath();
          ctx.roundRect(centerX + gap / 2, plotY + plotH - expH, barW, expH, [6, 6, 0, 0]);
          ctx.fill();
        }
      } else {
        const expH = bar.expense > 0 ? Math.max(8, (bar.expense / maxBarVal) * plotH) : 0;
        if (expH > 0) {
          ctx.fillStyle = "#385E43";
          ctx.beginPath();
          ctx.roundRect(centerX - barW / 2, plotY + plotH - expH, barW, expH, [8, 8, 0, 0]);
          ctx.fill();
        }
      }

      ctx.fillStyle = "#536359";
      ctx.font = `500 16px ${font}`;
      ctx.textAlign = "center";
      ctx.fillText(bar.label, centerX, plotY + plotH + 28);
    });
    ctx.textAlign = "left";
  } else {
    ctx.fillStyle = "#1E2D24";
    ctx.font = `600 22px ${font}`;
    ctx.fillText("Топ категорій витрат", margin + 30, y + 44);

    ctx.fillStyle = "#536359";
    ctx.font = `400 17px ${font}`;
    ctx.textAlign = "right";
    ctx.fillText("Пропорційно до найбільшої статті", width - margin - 30, y + 44);
    ctx.textAlign = "left";

    const topRows = input.expenseRows.slice(0, 7);
    const maxRowAmount = Math.max(1, topRows[0]?.amount ?? 1);
    const barAreaX = margin + 270;
    const barAreaW = contentWidth - 460;
    const stepH = Math.min(48, (chartCardH - 96) / Math.max(1, topRows.length));

    topRows.forEach((row, idx) => {
      const ry = y + 78 + idx * stepH;
      ctx.fillStyle = "#1E2D24";
      ctx.font = `500 18px ${font}`;
      ctx.fillText(fitText(ctx, `${row.emoji}  ${row.name}`, 230), margin + 30, ry + 24);

      ctx.fillStyle = "#EEF2ED";
      ctx.beginPath();
      ctx.roundRect(barAreaX, ry + 11, barAreaW, 14, 7);
      ctx.fill();

      const fillW = Math.max(10, (row.amount / maxRowAmount) * barAreaW);
      ctx.fillStyle = row.color || "#385E43";
      ctx.beginPath();
      ctx.roundRect(barAreaX, ry + 11, fillW, 14, 7);
      ctx.fill();

      ctx.textAlign = "right";
      ctx.fillStyle = "#1E2D24";
      ctx.font = `600 18px ${font}`;
      ctx.fillText(formatUAH(row.amount), width - margin - 92, ry + 24);

      ctx.fillStyle = "#536359";
      ctx.font = `400 16px ${font}`;
      ctx.fillText(`${row.percent.toFixed(1)}%`, width - margin - 30, ry + 24);
      ctx.textAlign = "left";
    });
  }

  // Page 2+: Detailed breakdown tables + notable transactions
  ctx = createPage();
  y = 90;

  const ensureSpace = (needed: number) => {
    if (y + needed <= height - 104) return;
    ctx = createPage();
    y = 90;
  };

  const drawTable = (
    title: string,
    rows: CategoryBreakdownRow[],
    total: number,
  ) => {
    ensureSpace(150);
    ctx.fillStyle = "#1E2D24";
    ctx.font = `600 26px ${font}`;
    ctx.fillText(title, margin, y);
    y += 22;

    const rowH = 56;
    ctx.fillStyle = "#EEF2ED";
    ctx.beginPath();
    ctx.roundRect(margin, y, contentWidth, 44, 12);
    ctx.fill();

    ctx.fillStyle = "#536359";
    ctx.font = `500 17px ${font}`;
    ctx.fillText("Категорія", margin + 20, y + 28);
    ctx.fillText("Частка", margin + 470, y + 28);
    ctx.textAlign = "right";
    ctx.fillText("Операцій", width - margin - 265, y + 28);
    ctx.fillText("%", width - margin - 175, y + 28);
    ctx.fillText("Сума", width - margin - 20, y + 28);
    ctx.textAlign = "left";
    y += 52;

    if (!rows.length) {
      ctx.fillStyle = "#536359";
      ctx.font = `400 20px ${font}`;
      ctx.fillText("Немає записів за обраний період", margin + 20, y + 30);
      y += 64;
      return;
    }

    const maxAmount = Math.max(1, rows[0]?.amount ?? 1);
    rows.forEach((row) => {
      ensureSpace(rowH + 10);
      ctx.fillStyle = row.color || "#385E43";
      ctx.beginPath();
      ctx.arc(margin + 22, y + 27, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#1E2D24";
      ctx.font = `500 20px ${font}`;
      ctx.fillText(fitText(ctx, `${row.emoji}  ${row.name}`, 405), margin + 40, y + 34);

      // Inline mini proportion bar
      ctx.fillStyle = "#EEF2ED";
      ctx.beginPath();
      ctx.roundRect(margin + 470, y + 22, 165, 10, 5);
      ctx.fill();
      ctx.fillStyle = row.color || "#385E43";
      ctx.beginPath();
      ctx.roundRect(
        margin + 470,
        y + 22,
        Math.max(8, (row.amount / maxAmount) * 165),
        10,
        5,
      );
      ctx.fill();

      ctx.textAlign = "right";
      ctx.fillStyle = "#536359";
      ctx.font = `400 19px ${font}`;
      ctx.fillText(String(row.count), width - margin - 265, y + 34);
      ctx.fillText(`${row.percent.toFixed(1)}%`, width - margin - 175, y + 34);

      ctx.fillStyle = "#1E2D24";
      ctx.font = `600 20px ${font}`;
      ctx.fillText(formatUAH(row.amount), width - margin - 20, y + 34);
      ctx.textAlign = "left";

      ctx.strokeStyle = "#E7ECE7";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(margin + 16, y + rowH);
      ctx.lineTo(width - margin - 16, y + rowH);
      ctx.stroke();

      y += rowH;
    });

    ensureSpace(64);
    ctx.fillStyle = "#385E43";
    ctx.font = `600 21px ${font}`;
    ctx.fillText("Разом", margin + 20, y + 36);
    ctx.textAlign = "right";
    ctx.fillText("100%", width - margin - 175, y + 36);
    ctx.fillText(formatUAH(total), width - margin - 20, y + 36);
    ctx.textAlign = "left";
    y += 72;
  };

  drawTable("Деталізація витрат за категоріями", input.expenseRows, input.expenseTotal);

  if (input.incomeTotal !== null && input.incomeRows.length > 0) {
    drawTable("Деталізація доходів за категоріями", input.incomeRows, input.incomeTotal);
  }

  if (analytics.notableTransactions.length > 0) {
    ensureSpace(160);
    ctx.fillStyle = "#1E2D24";
    ctx.font = `600 26px ${font}`;
    ctx.fillText("Найбільші окремі витрати періоду", margin, y);
    y += 22;

    ctx.fillStyle = "#EEF2ED";
    ctx.beginPath();
    ctx.roundRect(margin, y, contentWidth, 44, 12);
    ctx.fill();

    ctx.fillStyle = "#536359";
    ctx.font = `500 17px ${font}`;
    ctx.fillText("Продавець / опис", margin + 20, y + 28);
    ctx.fillText("Дата", margin + 620, y + 28);
    ctx.textAlign = "right";
    ctx.fillText("Сума", width - margin - 20, y + 28);
    ctx.textAlign = "left";
    y += 52;

    analytics.notableTransactions.forEach((tx) => {
      ensureSpace(58);
      ctx.fillStyle = "#1E2D24";
      ctx.font = `500 20px ${font}`;
      ctx.fillText(
        fitText(ctx, tx.merchant || tx.note || "Витрата", 560),
        margin + 20,
        y + 32,
      );

      ctx.fillStyle = "#536359";
      ctx.font = `400 18px ${font}`;
      ctx.fillText(formatBudgetDayHeading(tx.occurred_on), margin + 620, y + 32);

      ctx.textAlign = "right";
      ctx.fillStyle = "#1E2D24";
      ctx.font = `600 20px ${font}`;
      ctx.fillText(formatUAH(tx.amount), width - margin - 20, y + 32);
      ctx.textAlign = "left";

      ctx.strokeStyle = "#E7ECE7";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(margin + 16, y + 52);
      ctx.lineTo(width - margin - 16, y + 52);
      ctx.stroke();

      y += 52;
    });
  }

  // Footers on every page
  pages.forEach((canvas, idx) => {
    const pCtx = canvas.getContext("2d")!;
    pCtx.strokeStyle = "#E5EAE5";
    pCtx.lineWidth = 1.5;
    pCtx.beginPath();
    pCtx.moveTo(margin, height - 72);
    pCtx.lineTo(width - margin, height - 72);
    pCtx.stroke();

    pCtx.fillStyle = "#6C7A71";
    pCtx.font = `400 16px ${font}`;
    pCtx.fillText(`ours. · ${input.periodLabel}`, margin, height - 42);
    pCtx.textAlign = "right";
    pCtx.fillText(`Стор. ${idx + 1} з ${pages.length}`, width - margin, height - 42);
    pCtx.textAlign = "left";
  });

  return pages;
}

export async function generateBudgetPdfBlob(
  input: BudgetPdfInput,
): Promise<Blob> {
  const canvases = renderReportPages(input);
  const jpegPages = await Promise.all(
    canvases.map(
      (canvas) =>
        new Promise<{ width: number; height: number; jpeg: Uint8Array }>(
          (resolve, reject) => {
            canvas.toBlob(
              async (blob) => {
                if (!blob) {
                  reject(new Error("Не вдалося сформувати PDF"));
                  return;
                }
                const buffer = await blob.arrayBuffer();
                resolve({
                  width: canvas.width,
                  height: canvas.height,
                  jpeg: new Uint8Array(buffer),
                });
              },
              "image/jpeg",
              0.92,
            );
          },
        ),
    ),
  );
  const pdfBytes = buildPdfFromJpegPages(jpegPages);
  return new Blob([pdfBytes.slice().buffer as ArrayBuffer], {
    type: "application/pdf",
  });
}

export async function exportBudgetPdfReport(
  input: BudgetPdfInput,
): Promise<"shared" | "downloaded"> {
  const blob = await generateBudgetPdfBlob(input);
  const safeName = input.periodLabel
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const fileName = `ours-budget-${safeName || "zvit"}.pdf`;
  const file = new File([blob], fileName, { type: "application/pdf" });

  // On iOS Safari / PWA standalone, Web Share with files opens the native Apple Share Sheet
  // ("Зберегти у Файли", Telegram, Mail, etc.).
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title: `ours. · Звіт за ${input.periodLabel}`,
        files: [file],
      });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "shared";
      }
      // Fall through to standard download if share fails
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}

