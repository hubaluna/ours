import { describe, expect, it } from "vitest";
import { eventOccursOn, nextOccurrence } from "../src/lib/recurrence";
import { getEventReminders } from "../src/lib/home-reminders";
import type { Plan } from "../src/lib/types";

const makeEvent = (overrides: Partial<Plan> = {}): Plan => ({
  id: "ev-rec",
  couple_id: "c1",
  title: "Річниця",
  date: "2026-01-31",
  time: "19:00",
  all_day: false,
  location: "",
  description: "",
  category: "Свято",
  recurrence: "none",
  created_by: "u1",
  created_at: "2026-01-01T10:00:00Z",
  ...overrides,
});

describe("recurring calendar events", () => {
  it("matches weekly occurrences starting from event date", () => {
    const ev = makeEvent({ date: "2026-05-03", recurrence: "weekly" });
    expect(eventOccursOn(ev, "2026-04-26")).toBe(false);
    expect(eventOccursOn(ev, "2026-05-03")).toBe(true);
    expect(eventOccursOn(ev, "2026-05-10")).toBe(true);
    expect(eventOccursOn(ev, "2026-05-11")).toBe(false);
    expect(nextOccurrence(ev, "2026-05-05")).toBe("2026-05-10");
  });

  it("matches monthly occurrences and clamps end-of-month dates", () => {
    const ev = makeEvent({ date: "2026-01-31", recurrence: "monthly" });
    expect(eventOccursOn(ev, "2026-02-28")).toBe(true);
    expect(eventOccursOn(ev, "2026-03-31")).toBe(true);
    expect(eventOccursOn(ev, "2026-04-30")).toBe(true);
    expect(nextOccurrence(ev, "2026-02-15")).toBe("2026-02-28");
  });

  it("matches yearly occurrences including Feb 29 clamping and home reminders", () => {
    const ev = makeEvent({
      title: "День народження",
      date: "2024-02-29",
      recurrence: "yearly",
    });
    expect(eventOccursOn(ev, "2026-02-28")).toBe(true);
    expect(nextOccurrence(ev, "2026-02-21")).toBe("2026-02-28");

    const reminders = getEventReminders([ev], "2026-02-25");
    expect(reminders).toHaveLength(1);
    expect(reminders[0].stage).toBe("3days");
    expect(reminders[0].label).toContain("Через 3 дні");
  });
});
