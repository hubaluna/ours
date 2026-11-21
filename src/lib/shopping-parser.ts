import { groceryCatalogCategory } from "./grocery-catalog";
import type { GroceryCategory } from "../../supabase/functions/_shared/grocery-category";

export interface ParsedShoppingItem {
  name: string;
  quantity: number | null;
  unit: string;
  category: GroceryCategory;
}

export const UNIT_CANONICAL_MAP: Record<string, string> = {
  кг: "кг",
  kg: "кг",
  г: "г",
  гр: "г",
  "гр.": "г",
  g: "г",
  л: "л",
  l: "л",
  мл: "мл",
  ml: "мл",
  шт: "шт.",
  "шт.": "шт.",
  pcs: "шт.",
  штук: "шт.",
  штуки: "шт.",
  штука: "шт.",
  уп: "уп.",
  "уп.": "уп.",
  упак: "уп.",
  "упак.": "уп.",
  упаковка: "уп.",
  упаковки: "уп.",
  упаковок: "уп.",
  пачка: "уп.",
  пачки: "уп.",
  пачок: "уп.",
  пач: "уп.",
  "пач.": "уп.",
  пучок: "пучок",
  пучки: "пучок",
  пучків: "пучок",
  зубчик: "зубчик",
  зубчики: "зубчик",
  зубчиків: "зубчик",
  порц: "порц",
  порція: "порц",
  порції: "порц",
  порцій: "порц",
};

export function capitalizeFirst(text: string): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toLocaleUpperCase("uk") + trimmed.slice(1);
}

/**
 * Parses a single item line into structured shopping item:
 * - "яйця 10 шт" -> { name: "Яйця", quantity: 10, unit: "шт." }
 * - "сир 200 г" -> { name: "Сир", quantity: 200, unit: "г" }
 * - "молоко 1.5 л" -> { name: "Молоко", quantity: 1.5, unit: "л" }
 * - "авокадо" -> { name: "Авокадо", quantity: null, unit: defaultUnit }
 */
export function parseShoppingItemInput(
  raw: string,
  defaultUnit = "шт.",
): ParsedShoppingItem {
  const line = raw.replace(/^[-*•]\s+/, "").trim();
  if (!line) {
    return {
      name: "",
      quantity: null,
      unit: defaultUnit,
      category: "Інше",
    };
  }

  // Taste or recipe special units
  if (/за\s+смаком/i.test(line)) {
    const cleanName = line
      .replace(/за\s+смаком\.?/i, "")
      .replace(/[-—–:]\s*$/, "")
      .trim();
    const finalName = capitalizeFirst(cleanName || line);
    return {
      name: finalName,
      quantity: null,
      unit: "за смаком",
      category: groceryCatalogCategory(finalName),
    };
  }
  if (/за\s+рецептом/i.test(line)) {
    const cleanName = line
      .replace(/за\s+рецептом\.?/i, "")
      .replace(/[-—–:]\s*$/, "")
      .trim();
    const finalName = capitalizeFirst(cleanName || line);
    return {
      name: finalName,
      quantity: null,
      unit: "за рецептом",
      category: groceryCatalogCategory(finalName),
    };
  }

  // Format 1: Name then separator (dash, colon, or space) then quantity then unit
  // e.g. "яйця 10 шт", "сир 200 г", "молоко 1.5 л", "авокадо 2", "банани - 1.5 кг"
  const endMatch = line.match(
    /^(.+?)\s*(?:[-—–:]\s*|\s+)(\d+(?:[.,]\d+)?)\s*([a-zA-Zа-яА-ЯіІїЇєЄґҐ.]+)?$/,
  );
  if (endMatch) {
    const rawName = endMatch[1].trim();
    const amountStr = endMatch[2].replace(",", ".");
    const amount = Number(amountStr);
    const rawUnit = endMatch[3] ? endMatch[3].toLowerCase() : "";
    const canonicalUnit = rawUnit
      ? UNIT_CANONICAL_MAP[rawUnit] || rawUnit
      : defaultUnit;

    if (rawName && Number.isFinite(amount) && amount > 0) {
      const finalName = capitalizeFirst(rawName);
      return {
        name: finalName,
        quantity: Math.round(amount * 1000) / 1000,
        unit: canonicalUnit,
        category: groceryCatalogCategory(finalName),
      };
    }
  }

  // Format 2: Quantity then unit then name
  // e.g. "200 г сиру", "1.5 л молока", "10 шт яєць", "2 авокадо"
  const startMatch = line.match(
    /^(\d+(?:[.,]\d+)?)\s*([a-zA-Zа-яА-ЯіІїЇєЄґҐ.]+)?\s+(?:[-—–:]\s+)?(.+)$/,
  );
  if (startMatch) {
    const amountStr = startMatch[1].replace(",", ".");
    const amount = Number(amountStr);
    const potentialUnit = startMatch[2] ? startMatch[2].toLowerCase() : "";
    const isKnownUnit = Boolean(
      potentialUnit && UNIT_CANONICAL_MAP[potentialUnit],
    );

    const finalUnit = isKnownUnit
      ? UNIT_CANONICAL_MAP[potentialUnit]
      : defaultUnit;
    const finalName = capitalizeFirst(
      isKnownUnit
        ? startMatch[3].trim()
        : [startMatch[2], startMatch[3]].filter(Boolean).join(" ").trim(),
    );

    if (finalName && Number.isFinite(amount) && amount > 0) {
      return {
        name: finalName,
        quantity: Math.round(amount * 1000) / 1000,
        unit: finalUnit,
        category: groceryCatalogCategory(finalName),
      };
    }
  }

  // Format 3: Just product name without quantity
  // e.g. "авокадо"
  const cleanName = line.replace(/[;,.]$/, "").trim();
  const finalName = capitalizeFirst(cleanName);
  return {
    name: finalName,
    quantity: null,
    unit: defaultUnit,
    category: groceryCatalogCategory(finalName),
  };
}

/**
 * Splits raw batch input by newlines, semicolons, or commas,
 * while preserving decimal commas inside numbers (e.g. "молоко 1,5 л, хліб").
 */
export function splitBatchTokens(input: string): string[] {
  if (!input) return [];
  const tokens: string[] = [];
  let current = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "\n" || ch === ";") {
      const trimmed = current.trim();
      if (trimmed) tokens.push(trimmed);
      current = "";
      continue;
    }
    if (ch === ",") {
      const prev = i > 0 ? input[i - 1] : "";
      const next = i + 1 < input.length ? input[i + 1] : "";
      const isDecimalComma = /\d/.test(prev) && /\d/.test(next);
      if (!isDecimalComma) {
        const trimmed = current.trim();
        if (trimmed) tokens.push(trimmed);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  const trailing = current.trim();
  if (trailing) tokens.push(trailing);
  return tokens;
}

/**
 * Checks whether the input contains a batch separator (newline, semicolon, or non-decimal comma).
 */
export function hasBatchDelimiter(input: string): boolean {
  if (!input) return false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "\n" || ch === ";") return true;
    if (ch === ",") {
      const prev = i > 0 ? input[i - 1] : "";
      const next = i + 1 < input.length ? input[i + 1] : "";
      if (!(/\d/.test(prev) && /\d/.test(next))) return true;
    }
  }
  return false;
}

/**
 * Splits raw input by commas, semicolons, or newlines and returns parsed items.
 */
export function parseBatchShoppingInput(
  input: string,
  defaultUnit = "шт.",
): ParsedShoppingItem[] {
  if (!input.trim()) return [];
  const tokens = splitBatchTokens(input);
  return tokens
    .map((token) => parseShoppingItemInput(token, defaultUnit))
    .filter((item) => item.name.length > 0);
}

/**
 * Checks whether the input string represents a batch input (has delimiters and produces > 1 item).
 */
export function isBatchShoppingInput(input: string): boolean {
  if (!hasBatchDelimiter(input)) return false;
  const items = parseBatchShoppingInput(input);
  return items.length > 1;
}
