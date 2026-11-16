import { plantSchedule, differenceDays } from "./plant-care";
import { nextOccurrence } from "./recurrence";
import type { Plan, Plant } from "./types";

export type EventReminderStage = "week" | "3days" | "today";

export type PlantReminder = {
  kind: "plant";
  id: string;
  plant: Plant;
  overdueDays: number;
  label: string;
};

export type EventReminder = {
  kind: "event";
  id: string;
  event: Plan;
  daysLeft: number;
  stage: EventReminderStage;
  dismissKey: string;
  label: string;
};

const pluralDays = (count: number) => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "днів";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дні";
  return "днів";
};

const eventTimeText = (event: Plan) =>
  event.all_day ? "увесь день" : event.time?.slice(0, 5) || "";

const shortDayMonth = (date: string) =>
  new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

export function getPlantReminders(
  plants: Plant[],
  today: string,
): PlantReminder[] {
  return plants
    .map((plant) => {
      const schedule = plantSchedule(plant, today);
      if (schedule.remaining > 0) return null;
      const overdueDays = Math.abs(schedule.remaining);
      return {
        kind: "plant" as const,
        id: `plant-${plant.id}`,
        plant,
        overdueDays,
        label:
          overdueDays === 0
            ? "Пора поливати · сьогодні"
            : `Пора поливати · ${overdueDays} ${pluralDays(overdueDays)} тому`,
      };
    })
    .filter((entry): entry is PlantReminder => entry !== null)
    .sort((a, b) => b.overdueDays - a.overdueDays);
}

export function getEventReminders(
  events: Plan[],
  today: string,
): EventReminder[] {
  return events
    .map((event) => {
      const occDate = nextOccurrence(event, today);
      if (!occDate) return null;
      const daysLeft = differenceDays(today, occDate);
      if (daysLeft < 0 || daysLeft > 7) return null;
      const stage: EventReminderStage =
        daysLeft === 0 ? "today" : daysLeft <= 3 ? "3days" : "week";
      const time = eventTimeText(event);
      let prefix: string;
      if (daysLeft === 0) {
        prefix = "Сьогодні";
      } else if (daysLeft === 1) {
        prefix = "Завтра";
      } else if (daysLeft === 7) {
        prefix = "За тиждень";
      } else {
        prefix = `Через ${daysLeft} ${pluralDays(daysLeft)}`;
      }
      const detail =
        daysLeft === 0
          ? time
          : time
            ? `${shortDayMonth(occDate)} · ${time}`
            : shortDayMonth(occDate);
      return {
        kind: "event" as const,
        id: `event-${event.id}`,
        event,
        daysLeft,
        stage,
        dismissKey: `${event.id}:${occDate}:${stage}`,
        label: detail ? `${prefix} · ${detail}` : prefix,
      };
    })
    .filter((entry): entry is EventReminder => entry !== null)
    .sort(
      (a, b) =>
        a.daysLeft - b.daysLeft ||
        (a.event.time ?? "").localeCompare(b.event.time ?? "") ||
        a.event.title.localeCompare(b.event.title, "uk"),
    );
}
