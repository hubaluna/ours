import { describe, expect, it } from "vitest";
import { findCategoryMatch } from "../supabase/functions/expense-ingest/index";
import {
  autoCategorizeMerchant,
  isGenericOrEmptyMerchant,
  matchMerchantRule,
} from "../supabase/functions/_shared/budget-categorizer";

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

  it("identifies generic or empty merchant names", () => {
    expect(isGenericOrEmptyMerchant("")).toBe(true);
    expect(isGenericOrEmptyMerchant("   ")).toBe(true);
    expect(isGenericOrEmptyMerchant("Apple Pay")).toBe(true);
    expect(isGenericOrEmptyMerchant("apple pay")).toBe(true);
    expect(isGenericOrEmptyMerchant("applepay")).toBe(true);
    expect(isGenericOrEmptyMerchant("Вручну")).toBe(true);
    expect(isGenericOrEmptyMerchant("manual")).toBe(true);
    expect(isGenericOrEmptyMerchant("Оплата")).toBe(true);
    expect(isGenericOrEmptyMerchant("Сільпо")).toBe(false);
    expect(isGenericOrEmptyMerchant("OKKO")).toBe(false);
  });

  it("never auto-categorizes empty or Apple Pay merchants", () => {
    const bogusRules = [
      { merchant_pattern: "Apple Pay", category_key: "groceries", kind: "expense" as const },
      { merchant_pattern: "", category_key: "groceries", kind: "expense" as const },
    ];
    expect(autoCategorizeMerchant("Apple Pay", bogusRules, "expense")).toEqual({
      category_key: null,
      matched_by: "none",
    });
    expect(autoCategorizeMerchant("", bogusRules, "expense")).toEqual({
      category_key: null,
      matched_by: "none",
    });
    expect(autoCategorizeMerchant("Вручну", bogusRules, "expense")).toEqual({
      category_key: null,
      matched_by: "none",
    });
    expect(matchMerchantRule("Apple Pay", bogusRules, "expense")).toBeNull();
  });

  it("categorizes obvious stores and keywords confidently", () => {
    const rules: [] = [];
    // Supermarkets -> groceries
    expect(autoCategorizeMerchant("Сільпо Київ №45", rules, "expense").category_key).toBe("groceries");
    expect(autoCategorizeMerchant("АТБ-Маркет", rules, "expense").category_key).toBe("groceries");
    expect(autoCategorizeMerchant("Фора 112", rules, "expense").category_key).toBe("groceries");
    expect(autoCategorizeMerchant("Novus Express", rules, "expense").category_key).toBe("groceries");

    // Gas -> fuel
    expect(autoCategorizeMerchant("OKKO AZS 24", rules, "expense").category_key).toBe("fuel");
    expect(autoCategorizeMerchant("WOG заправка", rules, "expense").category_key).toBe("fuel");
    expect(autoCategorizeMerchant("UPG", rules, "expense").category_key).toBe("fuel");

    // Pharmacies -> health
    expect(autoCategorizeMerchant("Аптека АНЦ", rules, "expense").category_key).toBe("health");
    expect(autoCategorizeMerchant("Аптека Подорожник", rules, "expense").category_key).toBe("health");

    // Coffee -> drinks, Restaurants -> restaurants
    expect(autoCategorizeMerchant("Кав'ярня Третій Раунд", rules, "expense").category_key).toBe("drinks");
    expect(autoCategorizeMerchant("Кава з собою", rules, "expense").category_key).toBe("drinks");
    expect(autoCategorizeMerchant("Ресторан Мусафір", rules, "expense").category_key).toBe("restaurants");

    // Flowers -> flowers
    expect(autoCategorizeMerchant("Квіти від Марічки", rules, "expense").category_key).toBe("flowers");

    // Parking -> parking
    expect(autoCategorizeMerchant("Парковка ТРЦ Gulliver", rules, "expense").category_key).toBe("parking");
    expect(autoCategorizeMerchant("Паркінг Центр", rules, "expense").category_key).toBe("parking");

    // Unknown store -> null, matched_by none (needs review)
    expect(autoCategorizeMerchant("Невідомий магазин 999", rules, "expense")).toEqual({
      category_key: null,
      matched_by: "none",
    });
  });
});
