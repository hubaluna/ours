import { describe, expect, it } from "vitest";
import { plantSchedule } from "../src/lib/plant-care";
import type { Plant } from "../src/lib/types";

const plant = (patch: Partial<Plant> = {}) =>
  ({
    name: "Монстера",
    species: "Monstera deliciosa",
    last_watered_at: "2026-01-01",
    watering_interval_days: 10,
    wet_checked_at: null,
    ...patch,
  }) as Plant;

describe("plant watering schedule", () => {
  it("checks less often in winter, especially for cacti", () => {
    expect(plantSchedule(plant(), "2026-01-11").next).toBe("2026-01-14");
    expect(plantSchedule(plant({ name: "Кактус" }), "2026-01-11").next).toBe(
      "2026-01-18",
    );
    expect(
      plantSchedule(plant({ last_watered_at: "2026-06-01" }), "2026-06-05")
        .next,
    ).toBe("2026-06-11");
  });

  it("defers a wet soil check without treating it as watering", () => {
    const schedule = plantSchedule(
      plant({ wet_checked_at: "2026-01-14" }),
      "2026-01-14",
    );
    expect(schedule.next).toBe("2026-01-19");
    expect(schedule.remaining).toBe(5);
    expect(schedule.progress).toBe(0);
  });
});
