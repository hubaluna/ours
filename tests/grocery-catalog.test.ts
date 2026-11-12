import { describe, expect, it } from "vitest";
import { groceryCategories } from "../supabase/functions/_shared/grocery-category";
import {
  groceryCatalogCategory,
  groceryCatalogCategoryCoverage,
  groceryCatalogMatches,
  groceryCatalogStats,
  matchGroceryProducts,
} from "../src/lib/grocery-catalog";

describe("shared Ukrainian shopping catalog", () => {
  it("loads all supplied products, categories, and aliases", () => {
    expect(groceryCatalogStats).toEqual({
      products: 1486,
      categories: 45,
      aliases: 802,
    });
    expect(new Set(groceryCatalogCategoryCoverage).size).toBe(45);
  });

  it("recognizes canonical names, aliases, and quantity-prefixed names", () => {
    expect(groceryCatalogCategory("картопля")).toBe("Овочі та фрукти");
    expect(groceryCatalogCategory("бульба")).toBe("Овочі та фрукти");
    expect(groceryCatalogCategory("2 кг картошки")).toBe("Овочі та фрукти");
    expect(groceryCatalogCategory("снікерс")).toBe("Солодощі");
  });

  it("keeps ambiguous aliases as choices instead of silently selecting one", () => {
    expect(matchGroceryProducts("lays").map((item) => item.name)).toEqual([
      "чіпси лейс",
      "лейс",
    ]);
    expect(groceryCatalogCategory("lays")).toBe("Снеки");
    expect(groceryCatalogMatches("lays").map((item) => item.name)).toEqual([
      "чіпси лейс",
      "лейс",
    ]);
  });

  it("uses general category intents without inventing a specific product", () => {
    expect(matchGroceryProducts("для прання")).toEqual([]);
    expect(groceryCatalogCategory("для прання")).toBe("Побутове й гігієна");
    expect(groceryCategories).toContain(
      groceryCatalogCategory("щось невідоме"),
    );
  });
});
