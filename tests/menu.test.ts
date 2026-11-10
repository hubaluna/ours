import { it, expect } from "vitest";
import { firstMenu, nextMenu, menuOptions } from "../src/lib/menu";
it("generates a side, protein and salad without repeating the current courses", () => {
  const next = nextMenu(firstMenu, () => 0);
  for (const key of ["side", "protein", "salad"] as const) {
    expect(next[key]).not.toBe(firstMenu[key]);
    expect(menuOptions[key]).toContain(next[key]);
  }
});
