import type { RecipeView } from "./types";
export type Pairing = { recipe: RecipeView; score: number; reason: string };
function profile(recipe: RecipeView) {
  const title = recipe.title.toLocaleLowerCase("uk");
  const products = recipe.ingredients
    .map((item) => item.name.toLocaleLowerCase("uk"))
    .join(" ");
  const steps = recipe.instructions.join(" ").toLocaleLowerCase("uk");
  return {
    fish: /хек|карас|форел|дорад|сібас|скумбр|лосос|риба/.test(
      title + " " + products,
    ),
    sauce: /кисло.солод/.test(title)
      ? "sweet_sour"
      : /медово.гірч|мед.*гірч|гірч.*мед/.test(title)
        ? "honey_mustard"
        : /підлив|чашуш|чахох|томат/.test(title + " " + products)
          ? "gravy"
          : /вершк|сметан/.test(title)
            ? "creamy"
            : "dry",
    method: /кляр|смажений карась|биточк/.test(title)
      ? "crispy"
      : /запеч|духов/.test(title + " " + steps)
        ? "baked"
        : /тушку|томіть|тушко/.test(steps)
          ? "stewed"
          : "pan",
    rich: /свин|ребра|котлет|кляр/.test(title),
    side: title.includes("пюре")
      ? "puree"
      : /рис/.test(title)
        ? /овоч|мікс/.test(title)
          ? "veg_rice"
          : "rice"
        : /греч/.test(title)
          ? "buckwheat"
          : /булгур/.test(title)
            ? "bulgur"
            : /макарон|паст/.test(title)
              ? "pasta"
              : /печена картоп|запечена картоп/.test(title)
                ? "baked_potato"
                : /варена картоп/.test(title)
                  ? "boiled_potato"
                  : /смажена картоп|деруни/.test(title)
                    ? "crispy_potato"
                    : "other",
  };
}
export function scorePair(
  protein: RecipeView,
  side: RecipeView,
): { score: number; reason: string } {
  const meat = profile(protein),
    garnish = profile(side);
  const ordinal = protein.recommendedSideIds.indexOf(side.sourceId ?? "");
  let score = ordinal >= 0 ? 120 - ordinal * 12 : 20;
  let reason = "Гарнір доповнює основну страву, не перевантажуючи вечерю.";
  const neutral = ["rice", "bulgur", "puree", "pasta", "buckwheat"].includes(
    garnish.side,
  );
  if (meat.sauce === "sweet_sour") {
    if (["rice", "veg_rice"].includes(garnish.side)) {
      score += 30;
      reason =
        "Рис підхоплює кисло-солодкий соус і врівноважує його насиченість.";
    } else if (garnish.side === "puree") {
      score -= 18;
      reason =
        "М’яка текстура гарніру; для кисло-солодкого соусу краще підійде рис.";
    }
  } else if (meat.sauce === "honey_mustard" && neutral) {
    score += 18;
    reason =
      "Нейтральний гарнір підкреслює солодкість меду й гостроту гірчиці.";
  } else if (meat.sauce === "gravy" && neutral) {
    score += 20;
    reason =
      garnish.side === "puree"
        ? "Пюре добре поєднується з підливою та м’яким тушкованим м’ясом."
        : "Крупа або паста вбирає підливу й доповнює насичену страву.";
  } else if (
    meat.sauce === "creamy" &&
    ["rice", "bulgur", "buckwheat"].includes(garnish.side)
  ) {
    score += 16;
    reason =
      "Крупа збалансує вершковий соус без додаткової вершкової насиченості.";
  }
  if (
    meat.fish &&
    ["boiled_potato", "baked_potato", "veg_rice", "rice"].includes(garnish.side)
  ) {
    score += 18;
    reason = "Картопля або легкий рис доповнює рибу й не перекриває її смаку.";
  }
  if (
    meat.method === "crispy" &&
    ["puree", "boiled_potato", "rice"].includes(garnish.side)
  ) {
    score += 15;
    reason = "М’який гарнір створює приємний контраст із хрусткою скоринкою.";
  }
  if (
    (meat.method === "crispy" || meat.rich) &&
    garnish.side === "crispy_potato"
  ) {
    score -= 30;
    reason =
      "Дві смажені страви разом виходять важчими; м’який гарнір буде легшим.";
  }
  if (meat.method === "baked" && garnish.side === "baked_potato") {
    score += 12;
    reason =
      "Запечені смаки добре поєднуються; страви зручно готувати поруч у духовці.";
  }
  if (
    meat.sauce === "dry" &&
    meat.method !== "crispy" &&
    ["puree", "veg_rice"].includes(garnish.side)
  ) {
    score += 10;
    reason =
      "Соковитіший гарнір доповнює основну страву без великої кількості соусу.";
  }
  return { score, reason };
}
export function pairingRecommendations(
  selected: RecipeView,
  recipes: RecipeView[],
  limit = 4,
): Pairing[] {
  if (!["side", "protein"].includes(selected.category)) return [];
  const counterpart = selected.category === "side" ? "protein" : "side";
  return recipes
    .filter((recipe) => recipe.category === counterpart)
    .map((recipe) => ({
      recipe,
      ...(selected.category === "protein"
        ? scorePair(selected, recipe)
        : scorePair(recipe, selected)),
    }))
    .sort(
      (a, b) =>
        b.score - a.score || a.recipe.title.localeCompare(b.recipe.title, "uk"),
    )
    .slice(0, limit);
}
