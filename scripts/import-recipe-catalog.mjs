import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { managementClient, projectRefFromUrl } from "./supabase-setup.mjs";
import { groceryCategory } from "../supabase/functions/_shared/grocery-category.ts";
import corrections from "../src/data/recipe-corrections.json" with { type: "json" };
const PACKAGE = "ours-recipes-55-v1";
const mapping = {
  sides: "side",
  meat_fish: "protein",
  salads: "salad",
  full_meals: "main",
};
export function validateRecipeArchive(data) {
  if (!data || !Array.isArray(data.recipes) || data.recipes.length !== 55)
    throw new Error("Expected all 55 recipes.");
  const ids = new Set();
  for (const recipe of data.recipes) {
    if (!/^[a-z][a-z0-9_]*$/.test(recipe.id) || ids.has(recipe.id))
      throw new Error("Duplicate or invalid stable recipe id.");
    ids.add(recipe.id);
    if (
      !mapping[recipe.category] ||
      recipe.baseServings !== 1 ||
      !recipe.title?.trim() ||
      recipe.title.length > 160 ||
      !Number.isInteger(recipe.totalTimeMinutes) ||
      recipe.totalTimeMinutes < 1
    )
      throw new Error(
        "Invalid recipe identity, base portion, category or time.",
      );
    if (
      !/^images\/[a-z0-9_]+\.jpg$/.test(recipe.image) ||
      !["placeholder", "generated_food_illustration"].includes(recipe.imageType)
    )
      throw new Error("Invalid recipe image path or type.");
    if (
      !Array.isArray(recipe.steps) ||
      !recipe.steps.length ||
      recipe.steps.some((step) => typeof step !== "string" || !step.trim())
    )
      throw new Error("Missing recipe steps.");
    if (
      !Array.isArray(recipe.ingredients) ||
      !recipe.ingredients.length ||
      recipe.ingredients.length > 80
    )
      throw new Error("Invalid ingredients.");
    for (const item of recipe.ingredients)
      if (
        typeof item.name !== "string" ||
        !item.name.trim() ||
        ![
          "г",
          "мл",
          "шт.",
          "зубчик",
          "зубчика",
          "зубчики",
          "за смаком",
        ].includes(item.unit) ||
        (item.quantity === null
          ? item.unit !== "за смаком"
          : typeof item.quantity !== "number" ||
            !Number.isFinite(item.quantity) ||
            item.quantity < 0)
      )
        throw new Error("Invalid ingredient name, quantity or unit.");
  }
  for (const recipe of data.recipes)
    for (const id of recipe.recommendedSideIds || [])
      if (
        !ids.has(id) ||
        data.recipes.find((item) => item.id === id).category !== "sides"
      )
        throw new Error("Invalid recommended side reference.");
  return data;
}
export function catalogRows(data, site = "https://hubaluna.github.io/ours/") {
  validateRecipeArchive(data);
  const base = new URL(site);
  if (base.protocol !== "https:")
    throw new Error("Catalog images need an HTTPS site URL.");
  return data.recipes.map((sourceRecipe) => {
    const recipe = { ...sourceRecipe, ...(corrections[sourceRecipe.id] || {}) };
    return {
      id: `ours55/${recipe.id}`,
      source_id: recipe.id,
      package: PACKAGE,
      title: recipe.title,
      category: mapping[recipe.category],
      source_category: recipe.category,
      image_url: new URL(
        `recipes/ours55/${recipe.image.split("/").pop()}`,
        base,
      ).href,
      image_type: recipe.imageType,
      image_search_url: recipe.imageSearchUrl || "",
      base_servings: 1,
      total_time_minutes: recipe.totalTimeMinutes,
      difficulty: recipe.difficulty || "",
      ingredients: recipe.ingredients.map((item) => ({
        ...item,
        unit: /^зубчик(?:а|и)?$/.test(item.unit) ? "зубчик" : item.unit,
        category: groceryCategory(item.name),
      })),
      instructions: recipe.steps,
      notes: recipe.notes || "",
      recommended_side_ids: recipe.recommendedSideIds || [],
      original_data: sourceRecipe,
    };
  });
}
export function catalogImportSQL(rows) {
  const literal = JSON.stringify(rows).replace(/'/g, "''");
  return `begin;
 select pg_advisory_xact_lock(hashtextextended('ours55-catalog-import',0));
 do $$ begin if exists(select 1 from public.recipe_catalog where id like 'ours55/%' and package<>'${PACKAGE}') then raise exception 'Catalog id collision';end if;end $$;
 with incoming as (select * from jsonb_to_recordset('${literal}'::jsonb) as x(id text,source_id text,package text,title text,category text,source_category text,image_url text,image_type text,image_search_url text,base_servings integer,total_time_minutes integer,difficulty text,ingredients jsonb,instructions jsonb,notes text,recommended_side_ids jsonb,original_data jsonb)),
 changed as (insert into public.recipe_catalog(id,source_id,package,title,category,source_category,image_url,image_type,image_search_url,base_servings,total_time_minutes,difficulty,ingredients,instructions,notes,recommended_side_ids,original_data)
 select id,source_id,package,title,category,source_category,image_url,image_type,image_search_url,base_servings,total_time_minutes,difficulty,ingredients,instructions,notes,recommended_side_ids,original_data from incoming
 on conflict(id) do update set title=excluded.title,category=excluded.category,source_category=excluded.source_category,image_url=excluded.image_url,image_type=excluded.image_type,image_search_url=excluded.image_search_url,total_time_minutes=excluded.total_time_minutes,difficulty=excluded.difficulty,ingredients=excluded.ingredients,instructions=excluded.instructions,notes=excluded.notes,recommended_side_ids=excluded.recommended_side_ids,original_data=excluded.original_data,updated_at=now()
 where row(recipe_catalog.title,recipe_catalog.category,recipe_catalog.source_category,recipe_catalog.image_url,recipe_catalog.image_type,recipe_catalog.image_search_url,recipe_catalog.base_servings,recipe_catalog.total_time_minutes,recipe_catalog.difficulty,recipe_catalog.ingredients,recipe_catalog.instructions,recipe_catalog.notes,recipe_catalog.recommended_side_ids,recipe_catalog.original_data) is distinct from row(excluded.title,excluded.category,excluded.source_category,excluded.image_url,excluded.image_type,excluded.image_search_url,excluded.base_servings,excluded.total_time_minutes,excluded.difficulty,excluded.ingredients,excluded.instructions,excluded.notes,excluded.recommended_side_ids,excluded.original_data)
 returning id) select count(*)::int as changed_rows from changed;
 commit;`;
}
export async function importCatalog({
  api,
  data,
  apply = false,
  log = console.log,
}) {
  const rows = catalogRows(data);
  const existing = await api("/database/query", {
    read_only: true,
    query: `select id,package from public.recipe_catalog where id like 'ours55/%' order by id`,
  });
  if (!Array.isArray(existing))
    throw new Error("Unexpected catalog inspection response.");
  if (existing.some((row) => row.package !== PACKAGE))
    throw new Error("Refusing to overwrite another recipe package.");
  log(
    `Catalog inspection: ${rows.length} source recipes; ${existing.length} matching stable IDs already present.`,
  );
  if (!apply) {
    log("Inspection only; no rows changed.");
    return;
  }
  await api("/database/query", {
    read_only: false,
    query: catalogImportSQL(rows),
  });
  const result = await api("/database/query", {
    read_only: true,
    query: `select count(*)::int as count,count(distinct source_id)::int as unique_ids,bool_and(base_servings=1) as one_base from public.recipe_catalog where package='${PACKAGE}'`,
  });
  if (
    result?.[0]?.count !== 55 ||
    result[0].unique_ids !== 55 ||
    !result[0].one_base
  )
    throw new Error("Catalog verification failed.");
  log(
    "55 unique recipes verified, with ingredients, steps, time and image references.",
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values } = parseArgs({
      options: { apply: { type: "boolean", default: false } },
    });
    const data = JSON.parse(
      await readFile(
        new URL("../src/data/ours-recipes.json", import.meta.url),
        "utf8",
      ),
    );
    const api = managementClient(
      process.env.SUPABASE_ACCESS_TOKEN,
      process.env.SUPABASE_PROJECT_REF ||
        projectRefFromUrl(process.env.VITE_SUPABASE_URL),
    );
    await importCatalog({ api, data, apply: values.apply });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
