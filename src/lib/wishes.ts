import type { Wish } from "./types";

export const COMMON_OCCASIONS = [
  "День народження",
  "Новий рік",
  "Річниця",
  "День закоханих",
  "Миколай",
] as const;

export type CommonOccasion = (typeof COMMON_OCCASIONS)[number];

const OCCASION_PATTERN = /^\s*\[(?:Свято|Привід):\s*([^\]]+)\]\s*/i;

/**
 * Extracts occasion tag from wish note, e.g. "[Свято: День народження] Розмір М"
 */
export function parseWishOccasion(note?: string | null): {
  occasion: string | null;
  cleanNote: string;
} {
  if (!note || typeof note !== "string") {
    return { occasion: null, cleanNote: "" };
  }
  const match = note.match(OCCASION_PATTERN);
  if (match) {
    const occasion = match[1].trim();
    const cleanNote = note.slice(match[0].length).trim();
    return { occasion: occasion || null, cleanNote };
  }
  return { occasion: null, cleanNote: note.trim() };
}

/**
 * Packs occasion and user note back into the single standard note string.
 */
export function buildWishNote(
  occasion: string | null | undefined,
  cleanNote: string,
): string {
  const trimmedClean = cleanNote.trim();
  const trimmedOccasion = occasion?.trim();
  if (!trimmedOccasion) {
    return trimmedClean;
  }
  return trimmedClean
    ? `[Свято: ${trimmedOccasion}] ${trimmedClean}`
    : `[Свято: ${trimmedOccasion}]`;
}

/**
 * Returns occasion for a wish or null if none.
 */
export function getWishOccasion(wish?: { note?: string | null }): string | null {
  return parseWishOccasion(wish?.note).occasion;
}

/**
 * Returns clean note without the occasion prefix tag.
 */
export function getWishCleanNote(wish?: { note?: string | null }): string {
  return parseWishOccasion(wish?.note).cleanNote;
}

/**
 * Extracts all unique occasions currently present across given wishes.
 */
export function extractUniqueOccasions(wishes: Wish[]): string[] {
  const set = new Set<string>();
  for (const wish of wishes) {
    const occ = getWishOccasion(wish);
    if (occ) set.add(occ);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "uk"));
}
