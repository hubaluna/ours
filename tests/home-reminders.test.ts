import { describe, expect, it } from "vitest";
import { getEventReminders, getPlantReminders } from "../src/lib/home-reminders";
import type { Plan, Plant } from "../src/lib/types";

const makePlant = (overrides: Partial<Plant> = {}): Plant => ({
  id: "plant-1",
  couple_id: "c1",
  name: "Монстера",
  species: "Monstera",
  image_path: null,
  watering_interval_days: 7,
  last_watered_at: "2026-05-01",
  wet_checked_at: null,
  light: "",
  watering_notes: "",
  info_url: "",
  added_by: "u1",
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-01T10:00:00Z",
  ...overrides,
});

const makeEvent = (overrides: Partial<Plan> = {}): Plan => ({
  id: "ev-1",
  couple_id: "c1",
  title: "Подія",
  date: "2026-05-10",
  time: "18:00",
  all_day: false,
  location: "",
  description: "",
  category: "Побачення",
  created_by: "u1",
  created_at: "2026-05-01T10:00:00Z",
  ...overrides,
});

describe("home reminders", () => {
  it("flags plants only on watering day or overdue, never 3 or 7 days early", () => {
    const dueToday = makePlant({ id: "p1", name: "Монстера", last_watered_at: "2026-05-03" });
    const overdue = makePlant({ id: "p2", name: "Фікус", last_watered_at: "2026-05-01" });
    const inThreeDays = makePlant({ id: "p3", name: "Заміокулькас", last_watered_at: "2026-05-06" });
    const inSevenDays = makePlant({ id: "p4", name: "Кактус", last_watered_at: "2026-05-10" });

    const reminders = getPlantReminders([dueToday, overdue, inThreeDays, inSevenDays], "2026-05-10");
    expect(reminders.map((r) => r.plant.name)).toEqual(["Фікус", "Монстера"]);
    expect(reminders[0].label).toContain("2 дні тому");
    expect(reminders[1].label).toBe("Пора поливати · сьогодні");
  });

  it("creates calendar reminders for 7 days, 3 days, and event day", () => {
    const today = "2026-05-10";
    const events = [
      makeEvent({ id: "e-past", title: "Минула", date: "2026-05-09" }),
      makeEvent({ id: "e-today", title: "Сьогоднішня", date: "2026-05-10", time: "19:30" }),
      makeEvent({ id: "e-3d", title: "За 3 дні", date: "2026-05-13", time: null, all_day: true }),
      makeEvent({ id: "e-7d", title: "За тиждень", date: "2026-05-17", time: "12:00" }),
      makeEvent({ id: "e-8d", title: "Далека", date: "2026-05-18" }),
    ];

    const reminders = getEventReminders(events, today);
    expect(reminders.map((r) => [r.event.title, r.stage])).toEqual([
      ["Сьогоднішня", "today"],
      ["За 3 дні", "3days"],
      ["За тиждень", "week"],
    ]);
    expect(reminders[0].label).toContain("Сьогодні");
    expect(reminders[1].label).toContain("Через 3 дні");
    expect(reminders[2].label).toContain("За тиждень");
  });

  it("holds local notifications until 11:00 Kyiv time", async () => {
    const { syncLocalReminderNotifications, setReminderPushEnabled } = await import(
      "../src/lib/reminder-notifications"
    );
    const shown: string[] = [];
    const origWindow = globalThis.window;
    const origNotification = globalThis.Notification;
    const origLocalStorage = globalThis.localStorage;
    const origLocation = globalThis.location;
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
        removeItem: (k: string) => storage.delete(k),
      },
    });
    class MockNotification {
      constructor(title: string) {
        shown.push(title);
      }
      static permission = "granted";
    }
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: MockNotification,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { Notification: MockNotification },
    });
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { origin: "https://example.test", pathname: "/" },
    });

    try {
      setReminderPushEnabled(true);
      const plant = makePlant({ id: "p-11", name: "Фікус", last_watered_at: "2026-05-01" });
      await syncLocalReminderNotifications([plant], [], "2026-05-10", 10);
      expect(shown).toHaveLength(0);

      await syncLocalReminderNotifications([plant], [], "2026-05-10", 11);
      expect(shown).toEqual(["Полив · Фікус"]);

      await syncLocalReminderNotifications([plant], [], "2026-05-10", 12);
      expect(shown).toHaveLength(1);
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: origWindow });
      Object.defineProperty(globalThis, "Notification", { configurable: true, value: origNotification });
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: origLocalStorage });
      Object.defineProperty(globalThis, "location", { configurable: true, value: origLocation });
    }
  });

  it("matches server push rules for seasonal plant intervals, wet-soil checks, and recurring dates", async () => {
    const { plantDueToday, nextEventOccurrence } = await import(
      "../supabase/functions/push-dispatch/smart-rules"
    );
    const succulent = {
      name: "Алое",
      species: "Aloe vera",
      watering_interval_days: 10,
      last_watered_at: "2026-01-01",
      wet_checked_at: null,
    };
    expect(plantDueToday(succulent, "2026-01-12")).toBe(false);
    expect(plantDueToday(succulent, "2026-01-18")).toBe(true);
    expect(plantDueToday({ ...succulent, wet_checked_at: "2026-01-16" }, "2026-01-18")).toBe(false);

    expect(nextEventOccurrence({ date: "2026-01-31", recurrence: "monthly" }, "2026-02-05")).toBe("2026-02-28");
    expect(nextEventOccurrence({ date: "2026-05-01", recurrence: "weekly" }, "2026-05-10")).toBe("2026-05-15");
    expect(nextEventOccurrence({ date: "2024-02-29", recurrence: "yearly" }, "2026-01-01")).toBe("2026-02-28");
    expect(nextEventOccurrence({ date: "2026-05-01", recurrence: null }, "2026-05-10")).toBeNull();
  });

  it("isolates Trash entries per user account on shared browsers", async () => {
    const { pushTrash, readTrash, clearTrash } = await import("../src/lib/trash");
    const origLocalStorage = globalThis.localStorage;
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
        removeItem: (k: string) => storage.delete(k),
      },
    });
    try {
      pushTrash("wishes", { title: "Секрет А" }, "user-a");
      pushTrash("wishes", { title: "Секрет Б" }, "user-b");
      expect(readTrash("user-a").map((e) => e.label)).toEqual(["Секрет А"]);
      expect(readTrash("user-b").map((e) => e.label)).toEqual(["Секрет Б"]);
      clearTrash("user-a");
      expect(readTrash("user-a")).toHaveLength(0);
      expect(readTrash("user-b").map((e) => e.label)).toEqual(["Секрет Б"]);
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: origLocalStorage });
    }
  });
});

