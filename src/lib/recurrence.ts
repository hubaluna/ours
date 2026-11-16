import { addDays, differenceDays } from "./plant-care";

export type Recurrence = "none" | "weekly" | "monthly" | "yearly";

export const recurrenceOptions: Array<{ value: Recurrence; label: string }> = [
  { value: "none", label: "Одноразово" },
  { value: "weekly", label: "Щотижня" },
  { value: "monthly", label: "Щомісяця" },
  { value: "yearly", label: "Щороку" },
];

export function normalizeRecurrence(value?: string | null): Recurrence {
  if (value === "weekly" || value === "monthly" || value === "yearly") {
    return value;
  }
  return "none";
}

export function recurrenceLabel(value?: string | null): string {
  const mode = normalizeRecurrence(value);
  if (mode === "weekly") return "Щотижня";
  if (mode === "monthly") return "Щомісяця";
  if (mode === "yearly") return "Щороку";
  return "";
}

function parseYmd(value: string): [number, number, number] {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return [y, m, d];
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function eventOccursOn(
  event: { date: string; recurrence?: string | null },
  targetDate: string,
): boolean {
  const start = event.date.slice(0, 10);
  const target = targetDate.slice(0, 10);
  if (target < start) return false;
  const mode = normalizeRecurrence(event.recurrence);
  if (mode === "none") return target === start;
  if (mode === "weekly") {
    return differenceDays(start, target) % 7 === 0;
  }
  const [, sm, sd] = parseYmd(start);
  const [ty, tm, td] = parseYmd(target);
  if (mode === "monthly") {
    const expectedDay = Math.min(sd, daysInMonth(ty, tm));
    return td === expectedDay;
  }
  const expectedDay = Math.min(sd, daysInMonth(ty, sm));
  return tm === sm && td === expectedDay;
}

export function nextOccurrence(
  event: { date: string; recurrence?: string | null },
  fromDate: string,
): string | null {
  const start = event.date.slice(0, 10);
  const from = fromDate.slice(0, 10);
  if (from <= start) return start;
  const mode = normalizeRecurrence(event.recurrence);
  if (mode === "none") return null;
  if (mode === "weekly") {
    const diff = differenceDays(start, from);
    const weeks = Math.ceil(diff / 7);
    return addDays(start, weeks * 7);
  }
  const [sy, sm, sd] = parseYmd(start);
  const [fy, fm] = parseYmd(from);
  if (mode === "monthly") {
    let totalMonths = fy * 12 + (fm - 1);
    const startMonths = sy * 12 + (sm - 1);
    if (totalMonths < startMonths) totalMonths = startMonths;
    for (let step = 0; step < 2; step++) {
      const mIndex = totalMonths + step;
      const year = Math.floor(mIndex / 12);
      const month = (mIndex % 12) + 1;
      const candidate = formatYmd(year, month, Math.min(sd, daysInMonth(year, month)));
      if (candidate >= from) return candidate;
    }
    return null;
  }
  for (let yearOffset = 0; yearOffset < 2; yearOffset++) {
    const year = Math.max(sy, fy) + yearOffset;
    const candidate = formatYmd(year, sm, Math.min(sd, daysInMonth(year, sm)));
    if (candidate >= from) return candidate;
  }
  return null;
}

const LOCAL_RECURRENCE_KEY = "ours-event-recurrence-v1";

export function readLocalRecurrences(): Record<string, Recurrence> {
  try {
    const raw = localStorage.getItem(LOCAL_RECURRENCE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, Recurrence> = {};
    for (const [id, val] of Object.entries(parsed)) {
      if (typeof val === "string") {
        const mode = normalizeRecurrence(val);
        if (mode !== "none") out[id] = mode;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLocalRecurrence(id: string, recurrence: Recurrence): void {
  try {
    const map = readLocalRecurrences();
    if (recurrence === "none") delete map[id];
    else map[id] = recurrence;
    localStorage.setItem(LOCAL_RECURRENCE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function deleteLocalRecurrence(id: string): void {
  saveLocalRecurrence(id, "none");
}
