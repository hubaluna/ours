import { describe, expect, it } from "vitest";
import {
  parseWishOccasion,
  buildWishNote,
  getWishOccasion,
  getWishCleanNote,
  extractUniqueOccasions,
} from "../src/lib/wishes";
import type { Wish } from "../src/lib/types";

describe("wishes occasions helpers", () => {
  it("parses occasion from note correctly", () => {
    expect(parseWishOccasion("[Свято: День народження] Розмір M")).toEqual({
      occasion: "День народження",
      cleanNote: "Розмір M",
    });
    expect(parseWishOccasion("[Привід: Новий рік] У білому кольорі")).toEqual({
      occasion: "Новий рік",
      cleanNote: "У білому кольорі",
    });
    expect(parseWishOccasion("[Свято: Річниця]")).toEqual({
      occasion: "Річниця",
      cleanNote: "",
    });
    expect(parseWishOccasion("Звичайна примітка без свята")).toEqual({
      occasion: null,
      cleanNote: "Звичайна примітка без свята",
    });
    expect(parseWishOccasion("")).toEqual({
      occasion: null,
      cleanNote: "",
    });
    expect(parseWishOccasion(undefined)).toEqual({
      occasion: null,
      cleanNote: "",
    });
  });

  it("builds note with occasion properly", () => {
    expect(buildWishNote("День народження", "Розмір M")).toBe(
      "[Свято: День народження] Розмір M",
    );
    expect(buildWishNote("Новий рік", "")).toBe("[Свято: Новий рік]");
    expect(buildWishNote(null, "Просто примітка")).toBe("Просто примітка");
    expect(buildWishNote("", "Просто примітка")).toBe("Просто примітка");
  });

  it("extracts unique occasions from a list of wishes", () => {
    const wishes = [
      { id: "1", note: "[Свято: Новий рік] Чайник" },
      { id: "2", note: "[Свято: День народження] Книга" },
      { id: "3", note: "Без свята" },
      { id: "4", note: "[Свято: Новий рік] Светр" },
    ] as Wish[];

    const occasions = extractUniqueOccasions(wishes);
    expect(occasions).toEqual(["День народження", "Новий рік"]);
  });

  it("gets clean note and occasion from wish object", () => {
    const wish = {
      note: "[Свято: Річниця] Квитки на концерт",
    } as Wish;

    expect(getWishOccasion(wish)).toBe("Річниця");
    expect(getWishCleanNote(wish)).toBe("Квитки на концерт");
  });
});
