import { buildPdfFromJpegPages } from "./budget-pdf";
import { formatUAH } from "./budget";
import type { Wish } from "./types";
import { kyivDate } from "./utils";
import { getWishCleanNote, getWishOccasion } from "./wishes";

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        if (lines.length === maxLines) {
          lines[maxLines - 1] = fitText(
            ctx,
            `${lines[maxLines - 1]} ${word}`,
            maxWidth,
          );
          return lines;
        }
      }
      current = fitText(ctx, word, maxWidth);
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

function loadImageForCanvas(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => resolve(null), 3500);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

function drawRoundedImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

export async function generateWishesPdfBlob(
  wishes: Wish[],
  resolvedImages: Record<string, string>,
  ownerName?: string,
): Promise<Blob> {
  const width = 1240;
  const height = 1754;
  const margin = 76;
  const contentWidth = width - margin * 2;
  const font =
    'e-Ukraine, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  const loadedImages = await Promise.all(
    wishes.map((w) => {
      const url = resolvedImages[w.id] || w.image_url || "";
      return loadImageForCanvas(url);
    }),
  );

  const pages: HTMLCanvasElement[] = [];
  const createPage = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D недоступний");
    }
    ctx.fillStyle = "#FAF9F5";
    ctx.fillRect(0, 0, width, height);
    pages.push(canvas);
    return ctx;
  };

  let ctx = createPage();
  let y = 86;

  // Header
  ctx.fillStyle = "#385E43";
  ctx.font = `700 38px ${font}`;
  ctx.fillText("ours.", margin, y);

  ctx.fillStyle = "#536359";
  ctx.font = `400 19px ${font}`;
  ctx.textAlign = "right";
  const dateLabel = new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Kyiv",
  }).format(new Date());
  ctx.fillText(dateLabel, width - margin, y - 6);
  ctx.textAlign = "left";

  y += 46;
  ctx.fillStyle = "#1E2D24";
  ctx.font = `600 32px ${font}`;
  ctx.fillText(
    ownerName ? `Список бажань · ${ownerName}` : "Список бажань",
    margin,
    y,
  );

  y += 30;
  ctx.fillStyle = "#536359";
  ctx.font = `400 19px ${font}`;
  const totalBudget = wishes.reduce((sum, w) => sum + (Number(w.price) || 0), 0);
  const subtitle =
    totalBudget > 0
      ? `Обрано бажань: ${wishes.length} · Орієнтовно: ${formatUAH(totalBudget)}`
      : `Обрано бажань: ${wishes.length}`;
  ctx.fillText(subtitle, margin, y);

  y += 36;

  const cardH = 228;
  const gap = 20;

  wishes.forEach((wish, idx) => {
    if (y + cardH > height - 104) {
      ctx = createPage();
      y = 86;
    }

    // Card surface
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#DDE4DD";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(margin, y, contentWidth, cardH, 22);
    ctx.fill();
    ctx.stroke();

    // Thumbnail area
    const imgSize = 180;
    const imgX = margin + 24;
    const imgY = y + 24;
    const img = loadedImages[idx];
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      try {
        drawRoundedImageCover(ctx, img, imgX, imgY, imgSize, imgSize, 16);
      } catch {
        ctx.fillStyle = "#EEF2ED";
        ctx.beginPath();
        ctx.roundRect(imgX, imgY, imgSize, imgSize, 16);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "#EEF2ED";
      ctx.beginPath();
      ctx.roundRect(imgX, imgY, imgSize, imgSize, 16);
      ctx.fill();
      ctx.fillStyle = "#385E43";
      ctx.font = `600 44px ${font}`;
      ctx.textAlign = "center";
      ctx.fillText(
        (wish.name.trim()[0] || "★").toUpperCase(),
        imgX + imgSize / 2,
        imgY + imgSize / 2 + 16,
      );
      ctx.textAlign = "left";
    }

    const textX = imgX + imgSize + 28;
    const textW = contentWidth - imgSize - 76;

    // Priority + price row
    ctx.fillStyle = "#385E43";
    ctx.font = `600 16px ${font}`;
    const occasion = getWishOccasion(wish);
    const cleanNote = getWishCleanNote(wish);
    const metaLabel = [
      wish.priority || "Бажання",
      occasion ? `Свято: ${occasion}` : "",
      wish.fulfilled ? "Виконано" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    ctx.fillText(metaLabel.toUpperCase(), textX, y + 48);

    if (wish.price) {
      ctx.textAlign = "right";
      ctx.fillStyle = "#1E2D24";
      ctx.font = `700 24px ${font}`;
      ctx.fillText(formatUAH(wish.price), margin + contentWidth - 26, y + 52);
      ctx.textAlign = "left";
    }

    // Wish name
    ctx.fillStyle = "#1E2D24";
    ctx.font = `600 25px ${font}`;
    ctx.fillText(fitText(ctx, wish.name, textW), textX, y + 88);

    let lineY = y + 118;

    // Size / variant
    if (wish.size?.trim()) {
      ctx.fillStyle = "#385E43";
      ctx.font = `500 18px ${font}`;
      ctx.fillText(
        fitText(ctx, `Розмір / варіант: ${wish.size.trim()}`, textW),
        textX,
        lineY,
      );
      lineY += 28;
    }

    // Note
    if (cleanNote?.trim()) {
      ctx.fillStyle = "#536359";
      ctx.font = `400 17px ${font}`;
      const noteLines = wrapLines(ctx, cleanNote.trim(), textW, 2);
      noteLines.forEach((line) => {
        ctx.fillText(line, textX, lineY);
        lineY += 24;
      });
    }

    // URL
    if (wish.url?.trim()) {
      ctx.fillStyle = "#385E43";
      ctx.font = `400 16px ${font}`;
      const cleanUrl = wish.url.trim().replace(/^https?:\/\/(www\.)?/i, "");
      ctx.fillText(fitText(ctx, cleanUrl, textW), textX, y + cardH - 24);
    }

    y += cardH + gap;
  });

  // Footers
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
    pCtx.fillText("ours. · Список бажань", margin, height - 42);
    pCtx.textAlign = "right";
    pCtx.fillText(
      `Стор. ${idx + 1} з ${pages.length}`,
      width - margin,
      height - 42,
    );
    pCtx.textAlign = "left";
  });

  const jpegPages = await Promise.all(
    pages.map(
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

export async function exportWishesPdf(
  wishes: Wish[],
  resolvedImages: Record<string, string>,
  ownerName?: string,
): Promise<"shared" | "downloaded"> {
  const blob = await generateWishesPdfBlob(wishes, resolvedImages, ownerName);
  const fileName = `ours-wishes-${kyivDate()}.pdf`;
  const file = new File([blob], fileName, { type: "application/pdf" });

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title: "ours. · Список бажань",
        files: [file],
      });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "shared";
      }
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
