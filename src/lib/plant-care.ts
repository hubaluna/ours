import type { Plant } from "./types";

const day = 86_400_000;
const dateNumber = (value: string) =>
  Date.parse(`${value.slice(0, 10)}T12:00:00Z`);
export const addDays = (value: string, count: number) =>
  new Date(dateNumber(value) + count * day).toISOString().slice(0, 10);
export const differenceDays = (from: string, to: string) =>
  Math.round((dateNumber(to) - dateNumber(from)) / day);

export function plantSchedule(plant: Plant, today: string) {
  const winter = [12, 1, 2].includes(Number(today.slice(5, 7)));
  const succulent =
    /кактус|cactus|succulent|сукулент|алое|aloe|хаворт|ехевер|сансевієр/i.test(
      `${plant.name} ${plant.species}`,
    );
  const interval = Math.max(
    1,
    Math.round(
      plant.watering_interval_days * (winter ? (succulent ? 1.7 : 1.3) : 1),
    ),
  );
  const postponement = Math.max(2, Math.min(7, Math.ceil(interval / 3)));
  const wetDate = plant.wet_checked_at?.slice(0, 10);
  const next = [
    addDays(plant.last_watered_at, interval),
    wetDate ? addDays(wetDate, postponement) : "",
  ]
    .sort()
    .at(-1)!;
  const start =
    wetDate && next === addDays(wetDate, postponement)
      ? wetDate
      : plant.last_watered_at.slice(0, 10);
  const span = Math.max(1, differenceDays(start, next));
  const remaining = differenceDays(today, next);
  const progress = Math.max(
    0,
    Math.min(100, (differenceDays(start, today) / span) * 100),
  );
  return { next, remaining, progress, interval, postponement, winter };
}
