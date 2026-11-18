import { formatUAH, type CategoryBreakdownRow } from "./budget";

export type BudgetPdfInput = {
  periodLabel: string;
  scopeLabel: string;
  generatedAtLabel: string;
  expenseTotal: number;
  incomeTotal: number | null;
  balance: number | null;
  savingsRate?: number | null;
  expenseRows: CategoryBreakdownRow[];
  incomeRows: CategoryBreakdownRow[];
};

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
  // Object IDs:
  // 1: Catalog
  // 2: Pages
  // For each page i (0..pageCount-1):
  //   pageObjId = 3 + i * 3
  //   contentObjId = 4 + i * 3
  //   imageObjId = 5 + i * 3
  const kidsRefs = pages
    .map((_, i) => `${3 + i * 3} 0 R`)
    .join(" ");

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

function renderReportPages(input: BudgetPdfInput): HTMLCanvasElement[] {
  const width = 1240; // A4 @ ~150 DPI
  const height = 1754;
  const margin = 84;
  const contentWidth = width - margin * 2;
  const font = 'e-Ukraine, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

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
  let y = 90;

  // Header
  ctx.fillStyle = "#385E43";
  ctx.font = `600 42px ${font}`;
  ctx.fillText("ours.", margin, y);

  ctx.fillStyle = "#536359";
  ctx.font = `400 22px ${font}`;
  ctx.textAlign = "right";
  ctx.fillText(input.generatedAtLabel, width - margin, y - 6);
  ctx.textAlign = "left";

  y += 48;
  ctx.fillStyle = "#1E2D24";
  ctx.font = `600 34px ${font}`;
  ctx.fillText(`Фінансовий звіт · ${input.periodLabel}`, margin, y);

  y += 34;
  ctx.fillStyle = "#536359";
  ctx.font = `400 22px ${font}`;
  const ratePart =
    typeof input.savingsRate === "number"
      ? ` · Норма заощаджень: ${input.savingsRate}%`
      : "";
  ctx.fillText(
    `Учасник: ${input.scopeLabel} · Валюта: UAH (₴)${ratePart}`,
    margin,
    y,
  );

  // Summary strip (3 columns)
  y += 36;
  const cardH = 126;
  const colW = (contentWidth - 32) / 3;
  const summaryItems = [
    { label: "Витрати", value: formatUAH(input.expenseTotal), color: "#1E2D24" },
    {
      label: "Доходи",
      value: input.incomeTotal === null ? "Приховано" : formatUAH(input.incomeTotal),
      color: input.incomeTotal === null ? "#536359" : "#2B4E35",
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

    ctx.fillStyle = "#536359";
    ctx.font = `500 20px ${font}`;
    ctx.fillText(item.label, x + 24, y + 44);

    ctx.fillStyle = item.color;
    ctx.font = `600 32px ${font}`;
    ctx.fillText(item.value, x + 24, y + 92);
  });

  y += cardH + 54;

  const ensureSpace = (needed: number) => {
    if (y + needed <= height - 96) return;
    ctx = createPage();
    y = 90;
  };

  const drawTable = (
    title: string,
    rows: CategoryBreakdownRow[],
    total: number,
  ) => {
    ensureSpace(140);
    ctx.fillStyle = "#1E2D24";
    ctx.font = `600 26px ${font}`;
    ctx.fillText(title, margin, y);
    y += 22;

    // Table header
    const rowH = 58;
    ctx.fillStyle = "#EEF2ED";
    ctx.beginPath();
    ctx.roundRect(margin, y, contentWidth, 46, 12);
    ctx.fill();

    ctx.fillStyle = "#536359";
    ctx.font = `500 18px ${font}`;
    ctx.fillText("Категорія", margin + 20, y + 29);
    ctx.textAlign = "right";
    ctx.fillText("Операцій", width - margin - 270, y + 29);
    ctx.fillText("Частка", width - margin - 155, y + 29);
    ctx.fillText("Сума", width - margin - 20, y + 29);
    ctx.textAlign = "left";
    y += 54;

    if (!rows.length) {
      ctx.fillStyle = "#536359";
      ctx.font = `400 20px ${font}`;
      ctx.fillText("Немає записів за обраний період", margin + 20, y + 32);
      y += 66;
      return;
    }

    rows.forEach((row) => {
      ensureSpace(rowH + 10);
      ctx.fillStyle = row.color || "#385E43";
      ctx.beginPath();
      ctx.arc(margin + 24, y + 27, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#1E2D24";
      ctx.font = `500 21px ${font}`;
      ctx.fillText(`${row.emoji}  ${row.name}`, margin + 40, y + 34);

      ctx.textAlign = "right";
      ctx.fillStyle = "#536359";
      ctx.font = `400 20px ${font}`;
      ctx.fillText(String(row.count), width - margin - 270, y + 34);
      ctx.fillText(`${row.percent.toFixed(1)}%`, width - margin - 155, y + 34);

      ctx.fillStyle = "#1E2D24";
      ctx.font = `600 21px ${font}`;
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
    ctx.font = `600 22px ${font}`;
    ctx.fillText("Разом", margin + 20, y + 38);
    ctx.textAlign = "right";
    ctx.fillText("100%", width - margin - 155, y + 38);
    ctx.fillText(formatUAH(total), width - margin - 20, y + 38);
    ctx.textAlign = "left";
    y += 74;
  };

  drawTable("Витрати за категоріями", input.expenseRows, input.expenseTotal);

  if (input.incomeTotal !== null && input.incomeRows.length > 0) {
    drawTable("Доходи за категоріями", input.incomeRows, input.incomeTotal);
  }

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
