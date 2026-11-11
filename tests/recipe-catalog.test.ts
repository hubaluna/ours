import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import archive from "../src/data/ours-recipes.json";
import {
  catalogRecipes,
  correctedArchiveRecipes,
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
import { isPantryStaple } from "../supabase/functions/_shared/grocery-category";

const recipe = (id: string) => catalogRecipes.find((r) => r.sourceId === id)!;
describe("Original recipe package, portions and pairing", () => {
  it("filters common pantry staples without excluding bell peppers or dairy butter", () => {
    for (const name of [
      "Сіль за смаком",
      "Цукру",
      "Меду",
      "Оцту яблучного",
      "Воду",
      "Олія, для смаження",
      "Перцю чорного меленого",
      "4 ст. л. цукру;",
      "1/4 ч. л. солі",
      "50 мл меду для подачі",
    ])
      expect(isPantryStaple(name)).toBe(true);
    expect(isPantryStaple("Болгарський перець")).toBe(false);
    expect(isPantryStaple("Масло вершкове")).toBe(false);
    expect(isPantryStaple("1 кг свинини")).toBe(false);
    expect(isPantryStaple("1 ч. л. перцю болгарського")).toBe(false);
  });
  it("preserves all 55 unique recipes, every original ingredient, step and image", () => {
    expect(validateRecipeArchive(archive)).toBe(archive);
    expect(new Set(catalogRecipes.map((r) => r.catalogId)).size).toBe(55);
    const importedRows = catalogRows(archive);
    expect(importedRows).toHaveLength(55);
    expect(importedRows.every((entry) => entry.image_type === "generated_food_illustration")).toBe(true);
    expect(new Set(importedRows.map((entry) => entry.image_url)).size).toBe(55);
    for (const source of archive.recipes) {
      expect(
        importedRows.find((entry) => entry.source_id === source.id)?.original_data,
      ).toEqual(source);
    }
    for (const original of archive.recipes) {
      const item = recipe(original.id);
      const effective = correctedArchiveRecipes.find(
        (entry) => entry.id === original.id,
      )!;
      expect(item.baseServings).toBe(1);
      expect(item.totalTimeMinutes).toBe(effective.totalTimeMinutes);
      expect(item.instructions).toEqual(effective.steps);
      expect(item.ingredients.map((i) => [i.name, i.quantity])).toEqual(
        effective.ingredients.map((i) => [i.name, i.quantity]),
      );
      expect(
        readFileSync(`public/recipes/ours55/${original.image.split("/").pop()}`)
          .subarray(0, 2)
          .toString("hex"),
      ).toBe("ffd8");
      expect(effective.imageType).toBe("generated_food_illustration");
      expect(
        readFileSync(`public/recipes/ours55/${effective.image.split("/").pop()}`)
          .subarray(0, 2)
          .toString("hex"),
      ).toBe("ffd8");
    }
    expect(
      catalogRecipes.filter((r) => r.imageType === "placeholder"),
    ).toHaveLength(0);
    expect(catalogRecipes).toHaveLength(55);
    expect(catalogRecipes.map((entry) => entry.imageType)).toEqual(
      Array(55).fill("generated_food_illustration"),
    );
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
  it("keeps Биточки as pounded chicken or pork slices with no mince or gravy", () => {
    const source = archive.recipes.find(
      (item) => item.id === "meat_patties_gravy",
    )!;
    const chops = correctedArchiveRecipes.find(
      (item) => item.id === "meat_patties_gravy",
    )!;
    expect(source.title).toBe("Биточки з підливою");
    expect(chops.title).toBe("Биточки");
    expect(chops.ingredients.map((item) => item.name).join(" ")).toMatch(
      /філе/,
    );
    expect(chops.ingredients.map((item) => item.name).join(" ")).not.toMatch(
      /фарш|сметана|томатна паста|вода/,
    );
    expect(chops.steps.join(" ")).toMatch(/відбийте/);
    expect(chops.steps.join(" ")).not.toMatch(/підлив|соус|тушкуйте/);
    expect(chops.imageType).toBe("generated_food_illustration");
    expect(recipe("meat_patties_gravy").title).toBe("Биточки");
    expect(
      scorePair(recipe("meat_patties_gravy"), recipe("mashed_potato")).reason,
    ).toMatch(/скоринк/);
    expect(
      catalogRows(archive).find(
        (item) => item.source_id === "meat_patties_gravy",
      )?.original_data,
    ).toEqual(source);
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
        [{ name: "Рис", quantity: 200, unit: "г", category: "Крупи, макарони та бакалія" }],
        3,
        2,
      )[0].quantity,
    ).toBe(300);
  });
  it("sums the same ingredients across portions while keeping different units distinct", () => {
    const ingredients = [
      { name: "Рис", quantity: 100, unit: "г", category: "Крупи, макарони та бакалія" },
      { name: "Сіль", quantity: null, unit: "за смаком", category: "Крупи, макарони та бакалія" },
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
