import archive from "../data/ours-recipes.json";
import corrections from "../data/recipe-corrections.json";
import type {
  Recipe,
  RecipeCategory,
  RecipeIngredient,
  MealPlanItem,
  RecipeView,
  ShoppingItem,
} from "./types";
import { parseIngredient } from "../../supabase/functions/_shared/ingredients";
import {
  groceryCategory,
  isPantryStaple,
} from "../../supabase/functions/_shared/grocery-category";
export const MAX_SERVINGS = 12;
export const categoryMap: Record<string, RecipeCategory> = {
  sides: "side",
  meat_fish: "protein",
  salads: "salad",
  full_meals: "main",
};
export const categoryNames: Record<RecipeCategory, string> = {
  side: "Гарніри",
  protein: "М’ясо та риба",
  salad: "Салати",
  main: "Повноцінні страви",
};
export function canonicalUnit(unit: string): string {
  return /^(зубчик|зубчика|зубчики)$/.test(unit) ? "зубчик" : unit;
}
export function normalizedIngredient(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase("uk")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ");
}
export function ingredientKey(
  item: Pick<RecipeIngredient, "name" | "unit">,
): string {
  return normalizedIngredient(item.name) + "\n" + canonicalUnit(item.unit);
}
export function scaleIngredients(
  items: RecipeIngredient[],
  servings: number,
  baseServings = 1,
): RecipeIngredient[] {
  if (
    !Number.isInteger(servings) ||
    servings < 1 ||
    servings > MAX_SERVINGS ||
    baseServings <= 0
  )
    throw new Error("Оберіть від 1 до 12 порцій.");
  return items.map((item) => ({
    ...item,
    unit: canonicalUnit(item.unit),
    quantity:
      item.quantity === null
        ? null
        : Math.round(((item.quantity * servings) / baseServings) * 1000) / 1000,
  }));
}
export function quantityLabel(quantity: number | null, unit: string): string {
  if (quantity === null)
    return unit === "за рецептом" ? "за рецептом" : "за смаком";
  const fractions: Record<number, string> = { 0.25: "¼", 0.5: "½", 0.75: "¾" };
  const whole = Math.floor(quantity),
    fraction = Math.round((quantity - whole) * 1000) / 1000;
  const amount =
    ["шт.", "зубчик"].includes(canonicalUnit(unit)) && fractions[fraction]
      ? `${whole || ""}${whole ? " " : ""}${fractions[fraction]}`
      : new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 3 }).format(
          quantity,
        );
  return `${amount} ${canonicalUnit(unit)}`;
}
export function structuredIngredients(lines: string[]): RecipeIngredient[] {
  return lines.map((line) => {
    const taste = line.match(/^(.*?)\s*[-—–:,]?\s*за\s+смаком\.?$/i);
    if (taste?.[1].trim())
      return {
        name: taste[1].trim(),
        quantity: null,
        unit: "за смаком",
        category: groceryCategory(taste[1]),
      };
    const garlic = line.match(
      /^(\d+(?:[.,]\d+)?|[¼½¾])\s*(?:зубчик|зубчики|зубчика)\s+(.+)$/i,
    );
    if (garlic)
      return {
        name: garlic[2],
        quantity:
          ({ "¼": 0.25, "½": 0.5, "¾": 0.75 } as Record<string, number>)[
            garlic[1]
          ] ?? Number(garlic[1].replace(",", ".")),
        unit: "зубчик",
        category: groceryCategory(garlic[2]),
      };
    const value = parseIngredient(line);
    if (
      value.name === line.trim() &&
      (!/^\d/.test(line) || value.unit === "шт.")
    )
      return {
        name: line.trim().slice(0, 160),
        quantity: null,
        unit: "за рецептом",
        category: groceryCategory(line),
      };
    return {
      name: value.name,
      quantity: value.quantity,
      unit: value.unit,
      category: value.category,
    };
  });
}
export const correctedArchiveRecipes = archive.recipes.map(
  (record) => ({
    ...record,
    ...(corrections[record.id as keyof typeof corrections] ?? {}),
  }),
);
export const catalogRecipes: RecipeView[] = correctedArchiveRecipes.map(
  (record) => ({
    key: `catalog:ours55/${record.id}`,
    catalogId: `ours55/${record.id}`,
    sourceId: record.id,
    title: record.title,
    category: categoryMap[record.category],
    sourceCategory: record.category,
    image_url: `${import.meta.env.BASE_URL}recipes/ours55/${record.image.split("/").pop()}`,
    source_url: "",
    baseServings: 1,
    totalTimeMinutes: record.totalTimeMinutes,
    difficulty: record.difficulty,
    ingredients: record.ingredients.map((item) => ({
      ...item,
      unit: canonicalUnit(item.unit),
      category: groceryCategory(item.name),
    })),
    instructions: record.steps,
    notes: record.notes,
    imageType: record.imageType,
    recommendedSideIds: record.recommendedSideIds,
  }),
);
export function customRecipeView(recipe: Recipe): RecipeView {
  return {
    key: `custom:${recipe.id}`,
    customId: recipe.id,
    title: recipe.title,
    category: recipe.category,
    image_url: recipe.image_url,
    source_url: recipe.source_url,
    baseServings: recipe.base_servings ?? 1,
    totalTimeMinutes: recipe.total_time_minutes ?? null,
    difficulty: recipe.difficulty ?? "",
    ingredients:
      recipe.structured_ingredients ??
      structuredIngredients(recipe.ingredients),
    instructions: recipe.instructions,
    notes: recipe.notes ?? "",
    imageType: "photo",
    recommendedSideIds: [],
    custom: recipe,
  };
}
export function recipeLibrary(
  recipes: Recipe[],
  ownOnly = false,
): RecipeView[] {
  const own = recipes.map(customRecipeView);
  if (ownOnly) return own;
  // Public catalog entries are imported once. Private versions remain available
  // under “Мої рецепти”, rather than appearing twice in the combined catalog.
  const fingerprints = new Set(
    catalogRecipes.map((r) => r.category + "|" + normalizedIngredient(r.title)),
  );
  return [
    ...catalogRecipes,
    ...own.filter(
      (r) =>
        !fingerprints.has(r.category + "|" + normalizedIngredient(r.title)),
    ),
  ];
}
export function resolveRecipe(
  item: MealPlanItem,
  recipes: Recipe[],
): RecipeView | undefined {
  return item.catalog_id
    ? catalogRecipes.find((r) => r.catalogId === item.catalog_id)
    : recipes.find((r) => r.id === item.recipe_id)
      ? customRecipeView(recipes.find((r) => r.id === item.recipe_id)!)
      : undefined;
}
export function aggregateIngredients(
  items: {
    ingredients: RecipeIngredient[];
    servings: number;
    baseServings: number;
  }[],
): RecipeIngredient[] {
  const merged = new Map<string, RecipeIngredient>();
  for (const row of items)
    for (const item of scaleIngredients(
      row.ingredients,
      row.servings,
      row.baseServings,
    )) {
      if (item.quantity === 0) continue;
      const key = ingredientKey(item),
        existing = merged.get(key);
      if (existing && existing.quantity !== null && item.quantity !== null)
        existing.quantity =
          Math.round((existing.quantity + item.quantity) * 1000) / 1000;
      else if (!existing) merged.set(key, { ...item });
    }
  return [...merged.values()];
}
export function syncDemoMenuShopping(
  plan: MealPlanItem[],
  shopping: ShoppingItem[],
  excluded: string[],
  userId: string,
  coupleId: string,
): ShoppingItem[] {
  const ingredients = aggregateIngredients(
    plan
      .filter((p) => !p.shopping_completed)
      .map((p) => ({
        ingredients: p.ingredients,
        servings: p.servings,
        baseServings: p.base_servings,
      })),
  );
  const desired = new Map(
    ingredients
      .filter(
        (i) =>
          !isPantryStaple(i.name) &&
          !excluded.includes(ingredientKey(i)),
      )
      .map((i) => [ingredientKey(i), i]),
  );
  const result: ShoppingItem[] = shopping
    .filter(
      (item) =>
        !item.menu_key ||
        item.session_id ||
        desired.has(item.menu_key) ||
        item.purchased,
    )
    .map((item) => {
      if (item.menu_key && !item.session_id && !desired.has(item.menu_key))
        return { ...item, menu_key: null };
      return item;
    });
  for (const [key, item] of desired) {
    const index = result.findIndex(
      (row) => row.menu_key === key && !row.session_id,
    );
    if (index >= 0) {
      const old = result[index];
      result[index] = {
        ...old,
        ...item,
        purchased:
          old.purchased &&
          ((old.quantity === null && item.quantity === null) ||
            (old.quantity !== null &&
              item.quantity !== null &&
              old.quantity >= item.quantity)),
      };
    } else
      result.push({
        ...item,
        id: crypto.randomUUID(),
        couple_id: coupleId,
        price: null,
        added_by: userId,
        purchased: false,
        session_id: null,
        created_at: new Date().toISOString(),
        menu_key: key,
      });
  }
  return result;
}
