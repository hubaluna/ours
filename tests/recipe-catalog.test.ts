import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import archive from "../src/data/ours-recipes.json";
import {
  catalogRecipes,
  scaleIngredients,
  aggregateIngredients,
  quantityLabel,
  recipeLibrary,
  structuredIngredients,
} from "../src/lib/recipe-catalog";
import { pairingRecommendations, scorePair } from "../src/lib/recipe-pairings";
import {
  catalogRows,
  validateRecipeArchive,
} from "../scripts/import-recipe-catalog.mjs";
import { movieSynopsis } from "../supabase/functions/_shared/movie-synopsis";

const recipe = (id: string) => catalogRecipes.find((r) => r.sourceId === id)!;
describe("Original recipe package, portions and pairing", () => {
  it("preserves all 55 unique recipes, every original ingredient, step and image", () => {
    expect(validateRecipeArchive(archive)).toBe(archive);
    expect(new Set(catalogRecipes.map((r) => r.catalogId)).size).toBe(55);
    expect(catalogRows(archive)).toHaveLength(55);
    for (const original of archive.recipes) {
      const item = recipe(original.id);
      expect(item.baseServings).toBe(1);
      expect(item.totalTimeMinutes).toBe(original.totalTimeMinutes);
      expect(item.instructions).toEqual(original.steps);
      expect(item.ingredients.map((i) => [i.name, i.quantity])).toEqual(
        original.ingredients.map((i) => [i.name, i.quantity]),
      );
      expect(
        readFileSync(`public/recipes/ours55/${original.image.split("/").pop()}`)
          .subarray(0, 2)
          .toString("hex"),
      ).toBe("ffd8");
    }
    expect(
      catalogRecipes.filter((r) => r.imageType === "placeholder"),
    ).toHaveLength(39);
    expect(catalogRecipes.filter((r) => r.category === "salad")).toHaveLength(
      17,
    );
  });
  it("rejects repeated identities and an accidental non-unit base portion", () => {
    expect(() =>
      validateRecipeArchive({
        ...archive,
        recipes: [archive.recipes[0], ...archive.recipes.slice(0, 54)],
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      validateRecipeArchive({
        ...archive,
        recipes: [
          { ...archive.recipes[0], baseServings: 2 },
          ...archive.recipes.slice(1),
        ],
      }),
    ).toThrow(/portion/);
  });
  it("scales all quantities exactly and keeps seasonings unquantified", () => {
    for (const item of catalogRecipes)
      for (const portions of [1, 2, 5, 12]) {
        const scaled = scaleIngredients(item.ingredients, portions);
        scaled.forEach((ingredient, i) =>
          expect(ingredient.quantity).toBe(
            item.ingredients[i].quantity === null
              ? null
              : Math.round(item.ingredients[i].quantity! * portions * 1000) /
                  1000,
          ),
        );
      }
    expect(() => scaleIngredients(recipe("rice").ingredients, 0)).toThrow();
    expect(quantityLabel(0.5, "шт.")).toBe("½ шт.");
    expect(quantityLabel(null, "за смаком")).toBe("за смаком");
    expect(
      scaleIngredients(
        [{ name: "Рис", quantity: 200, unit: "г", category: "Бакалія" }],
        3,
        2,
      )[0].quantity,
    ).toBe(300);
  });
  it("sums the same ingredients across portions while keeping different units distinct", () => {
    const ingredients = [
      { name: "Рис", quantity: 100, unit: "г", category: "Бакалія" },
      { name: "Сіль", quantity: null, unit: "за смаком", category: "Бакалія" },
    ];
    const sum = aggregateIngredients([
      { ingredients, servings: 2, baseServings: 1 },
      { ingredients, servings: 3, baseServings: 1 },
    ]);
    expect(sum).toEqual([{ ...ingredients[0], quantity: 500 }, ingredients[1]]);
    expect(
      structuredIngredients([
        "200 г рису",
        "Сіль — за смаком",
        "½ зубчика часнику",
      ]),
    ).toMatchObject([
      { quantity: 200, unit: "г" },
      { quantity: null, unit: "за смаком" },
      { quantity: 0.5, unit: "зубчик" },
    ]);
  });
  it("recommends both directions with the same pair score and descending ranks", () => {
    for (const selected of catalogRecipes.filter((r) =>
      ["protein", "side"].includes(r.category),
    )) {
      const recommendations = pairingRecommendations(
        selected,
        catalogRecipes,
        100,
      );
      expect(recommendations).toHaveLength(
        selected.category === "side" ? 18 : 10,
      );
      recommendations.forEach((pair, i) => {
        expect(pair.recipe.category).toBe(
          selected.category === "side" ? "protein" : "side",
        );
        expect(pair.reason.length).toBeGreaterThan(20);
        if (i)
          expect(pair.score).toBeLessThanOrEqual(recommendations[i - 1].score);
        const reverse = pairingRecommendations(
          pair.recipe,
          catalogRecipes,
          100,
        ).find((p) => p.recipe.key === selected.key)!;
        expect(reverse.score).toBe(pair.score);
      });
    }
    expect(
      pairingRecommendations(recipe("sweet_sour_chicken"), catalogRecipes)[0]
        .recipe.sourceId,
    ).toBe("rice");
    expect(
      scorePair(recipe("battered_hake"), recipe("mashed_potato")).score,
    ).toBeGreaterThan(
      scorePair(recipe("battered_hake"), recipe("fried_potatoes")).score,
    );
    expect(
      pairingRecommendations(recipe("green_salad"), catalogRecipes),
    ).toEqual([]);
    expect(recipeLibrary([])).toHaveLength(55);
  });
});
describe("One-paragraph film plot", () => {
  it("limits plot to three sentences without references or line breaks", () => {
    expect(
      movieSynopsis(
        "Перший факт.[12]\nДругий факт.\n\nТретій факт. Четвертий факт.",
      ),
    ).toBe("Перший факт. Другий факт. Третій факт.");
    const plot = movieSynopsis("Довге речення без завершення ".repeat(100));
    expect(plot.length).toBeLessThanOrEqual(650);
    expect(plot).not.toMatch(/[\r\n]/);
    expect(plot.endsWith("…")).toBe(true);
  });
});
