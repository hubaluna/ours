import { describe, expect, it } from "vitest";
import { findCategoryMatch } from "../supabase/functions/expense-ingest/index";

describe("expense-ingest unit tests", () => {
  const customCategories = [
    { id: "custom-coffee-uuid", name: "Кава та солодощі", emoji: "☕" },
    { id: "custom-taxi-uuid", name: "Таксі", emoji: "🚕" },
  ];

  it("matches category with emoji prefix", () => {
    expect(findCategoryMatch("🥑 Продукти", "expense", customCategories)).toBe("groceries");
    expect(findCategoryMatch("☕ Кава та солодощі", "expense", customCategories)).toBe("custom-coffee-uuid");
    expect(findCategoryMatch("🚕 Таксі", "expense", customCategories)).toBe("custom-taxi-uuid");
  });

  it("matches category by name without emoji", () => {
    expect(findCategoryMatch("Продукти", "expense", customCategories)).toBe("groceries");
    expect(findCategoryMatch("продукти", "expense", customCategories)).toBe("groceries");
    expect(findCategoryMatch("Кава та солодощі", "expense", customCategories)).toBe("custom-coffee-uuid");
    expect(findCategoryMatch("таксі", "expense", customCategories)).toBe("custom-taxi-uuid");
  });

  it("matches category by standard ID or custom UUID", () => {
    expect(findCategoryMatch("groceries", "expense", customCategories)).toBe("groceries");
    expect(findCategoryMatch("travel", "expense", customCategories)).toBe("travel");
    expect(findCategoryMatch("custom-coffee-uuid", "expense", customCategories)).toBe("custom-coffee-uuid");
  });

  it("matches category by emoji alone", () => {
    expect(findCategoryMatch("🥑", "expense", customCategories)).toBe("groceries");
    expect(findCategoryMatch("☕", "expense", customCategories)).toBe("custom-coffee-uuid");
  });

  it("returns null for unknown category", () => {
    expect(findCategoryMatch("Невідома категорія 123", "expense", customCategories)).toBeNull();
    expect(findCategoryMatch("", "expense", customCategories)).toBeNull();
  });
});
