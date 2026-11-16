export function kyivHour(date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Europe/Kyiv",
    }).format(date),
  );
}

export function kyivDate(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isActivePushHour(hour = kyivHour()): boolean {
  return hour >= 11 && hour < 22;
}

export function shouldDispatchActivity(kind: string, action?: string): boolean {
  if (kind === "shopping") {
    return action === "added";
  }
  return true;
}

export function formatShoppingBatchBody(
  actorName: string,
  titles: string[],
): string {
  const unique = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return `${actorName} оновив(ла) список покупок`;
  }
  if (unique.length === 1) {
    return `${actorName} додано до покупок: ${unique[0]}`;
  }
  if (unique.length <= 3) {
    return `${actorName} додано до покупок: ${unique.join(", ")}`;
  }
  const rest = unique.length - 3;
  return `${actorName} додано ${unique.length} поз.: ${unique.slice(0, 3).join(", ")} та ще ${rest}`;
}

export function formatDigestBody(
  kind: string,
  actorName: string,
  titles: string[],
): string {
  if (kind === "shopping") return formatShoppingBatchBody(actorName, titles);
  const unique = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
  if (unique.length <= 1) return `${actorName}: ${unique[0] ?? "Оновлення"}`;
  if (unique.length <= 3) return `${actorName}: ${unique.join(", ")}`;
  return `${actorName}: ${unique.slice(0, 3).join(", ")} та ще ${unique.length - 3}`;
}

const DAY_MS = 86_400_000;

function addYmdDays(value: string, count: number): string {
  const ms = Date.parse(`${value.slice(0, 10)}T12:00:00Z`);
  return new Date(ms + count * DAY_MS).toISOString().slice(0, 10);
}

function diffYmdDays(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to.slice(0, 10)}T12:00:00Z`) -
      Date.parse(`${from.slice(0, 10)}T12:00:00Z`)) /
      DAY_MS,
  );
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function plantDueToday(
  plant: {
    name: string;
    species?: string | null;
    watering_interval_days: number;
    last_watered_at: string;
    wet_checked_at?: string | null;
  },
  today: string,
): boolean {
  const wateredDate = plant.last_watered_at?.slice(0, 10);
  if (!wateredDate || !Number.isFinite(Date.parse(`${wateredDate}T12:00:00Z`))) {
    return false;
  }
  const winter = [12, 1, 2].includes(Number(today.slice(5, 7)));
  const succulent =
    /кактус|cactus|succulent|сукулент|алое|aloe|хаворт|ехевер|сансевієр/i.test(
      `${plant.name} ${plant.species ?? ""}`,
    );
  const interval = Math.max(
    1,
    Math.round(
      plant.watering_interval_days * (winter ? (succulent ? 1.7 : 1.3) : 1),
    ),
  );
  const postponement = Math.max(2, Math.min(7, Math.ceil(interval / 3)));
  const wetDate = plant.wet_checked_at?.slice(0, 10);
  const nextWater = addYmdDays(wateredDate, interval);
  const nextWet =
    wetDate && Number.isFinite(Date.parse(`${wetDate}T12:00:00Z`))
      ? addYmdDays(wetDate, postponement)
      : "";
  const nextDue = nextWet && nextWet > nextWater ? nextWet : nextWater;
  return nextDue <= today;
}

export function nextEventOccurrence(
  event: { date: string; recurrence?: string | null },
  fromDate: string,
): string | null {
  const start = event.date?.slice(0, 10);
  if (!start || !Number.isFinite(Date.parse(`${start}T12:00:00Z`))) return null;
  const from = fromDate.slice(0, 10);
  if (from <= start) return start;
  const mode = event.recurrence;
  if (mode !== "weekly" && mode !== "monthly" && mode !== "yearly") return null;
  if (mode === "weekly") {
    const weeks = Math.ceil(diffYmdDays(start, from) / 7);
    return addYmdDays(start, weeks * 7);
  }
  const [sy, sm, sd] = start.split("-").map(Number);
  const [fy, fm] = from.split("-").map(Number);
  if (mode === "monthly") {
    let totalMonths = fy * 12 + (fm - 1);
    const startMonths = sy * 12 + (sm - 1);
    if (totalMonths < startMonths) totalMonths = startMonths;
    for (let step = 0; step < 2; step++) {
      const mIndex = totalMonths + step;
      const year = Math.floor(mIndex / 12);
      const month = (mIndex % 12) + 1;
      const candidate = formatYmd(year, month, Math.min(sd, daysInUtcMonth(year, month)));
      if (candidate >= from) return candidate;
    }
    return null;
  }
  for (let yearOffset = 0; yearOffset < 2; yearOffset++) {
    const year = Math.max(sy, fy) + yearOffset;
    const candidate = formatYmd(year, sm, Math.min(sd, daysInUtcMonth(year, sm)));
    if (candidate >= from) return candidate;
  }
  return null;
}
