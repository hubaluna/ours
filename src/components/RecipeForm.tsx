import { useState, type FormEvent } from "react";
import { useApp } from "../hooks/AppContext";
import type { Recipe, RecipeCategory, NewRecipe } from "../lib/types";
import type { LinkMetadata } from "../../supabase/functions/_shared/metadata";
import { publicUrl } from "../../supabase/functions/_shared/urls";
import { structuredIngredients } from "../lib/recipe-catalog";
import { isTikTokVideoUrl } from "../lib/recipe-source";
import { BottomSheet, Button, ConfirmDelete, Field } from "./ui";

export const courseLabels = {
  side: "Гарнір",
  protein: "М’ясо або риба",
  salad: "Салат",
  main: "Повноцінна страва",
};

export function RecipeForm({
  recipe,
  initial,
  category,
  onClose,
  onSaved,
}: {
  recipe?: Recipe;
  initial?: LinkMetadata;
  category?: RecipeCategory;
  onClose: () => void;
  onSaved: (category: RecipeCategory, title: string) => void;
}) {
  const { addRecipe, update, remove, pending } = useApp();
  const [error, setError] = useState("");
  const seed = recipe ?? initial;
  const [sourceUrl, setSourceUrl] = useState(seed?.source_url ?? "");
  const [imageUrl, setImageUrl] = useState(seed?.image_url ?? "");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const lines = (key: string) =>
      String(f.get(key))
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    const image_url = publicUrl(String(f.get("image"))),
      source = String(f.get("source")).trim();
    const videoRecipe = isTikTokVideoUrl(source);
    const baseServings = Number(f.get("base_servings") || 1);
    const totalTimeRaw = String(f.get("total_time_minutes") ?? "").trim();
    const totalTime = totalTimeRaw ? Number(totalTimeRaw) : null;
    const value: NewRecipe = {
      title: String(f.get("title")).trim(),
      category: String(f.get("category")) as RecipeCategory,
      image_url,
      source_url: publicUrl(source) || "",
      ingredients: lines("ingredients"),
      instructions: lines("instructions"),
      structured_ingredients: structuredIngredients(lines("ingredients")),
      base_servings: Number.isFinite(baseServings)
        ? Math.max(1, Math.min(12, Math.round(baseServings)))
        : 1,
      total_time_minutes:
        totalTime !== null && Number.isFinite(totalTime) && totalTime >= 1
          ? Math.min(2880, Math.round(totalTime))
          : null,
    };
    if (
      !image_url ||
      !value.title ||
      !value.ingredients.length ||
      (!value.instructions.length && !videoRecipe) ||
      value.ingredients.length > 80 ||
      value.instructions.length > 60 ||
      (source && !publicUrl(source)) ||
      !Number.isFinite(baseServings) ||
      baseServings < 1 ||
      baseServings > 12 ||
      (totalTime !== null &&
        (!Number.isFinite(totalTime) || totalTime < 1 || totalTime > 2880))
    ) {
      setError(
        "Додайте назву, фото готової страви, продукти й кроки приготування.",
      );
      return;
    }
    const saved = recipe
      ? await update("recipes", recipe.id, value, "Рецепт оновлено")
      : await addRecipe(value);
    if (saved) onSaved(value.category, value.title);
  };

  return (
    <BottomSheet
      title={recipe ? "Ваш рецепт" : "Додати рецепт"}
      onClose={onClose}
    >
      <form className="form is-entry-sheet" onSubmit={submit}>
        <Field label="Назва страви">
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={seed?.title}
            placeholder="Назва страви"
          />
        </Field>

        <div className="recipe-meta-grid">
          <Field label="Тип страви">
            <select
              name="category"
              defaultValue={recipe?.category ?? category ?? "main"}
            >
              {Object.entries(courseLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Базових порцій у рецепті">
            <input
              name="base_servings"
              type="number"
              min={1}
              max={12}
              step={1}
              required
              defaultValue={recipe?.base_servings ?? 1}
            />
          </Field>
          <Field label="Час приготування, хв">
            <input
              name="total_time_minutes"
              type="number"
              min={1}
              max={2880}
              step={1}
              defaultValue={recipe?.total_time_minutes ?? ""}
              placeholder="хв"
            />
          </Field>
        </div>

        <Field label="Фото готової страви · HTTPS-посилання">
          <div className="recipe-photo-input-wrap">
            <input
              name="image"
              type="url"
              required
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
            {imageUrl && (
              <img
                className="recipe-preview-thumbnail recipe-preview-image"
                src={imageUrl}
                alt=""
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        </Field>

        <div className="recipe-textareas-grid">
          <Field label="Продукти · кожен із нового рядка">
            <textarea
              name="ingredients"
              rows={2}
              required
              maxLength={20000}
              defaultValue={seed?.ingredients.join("\n")}
              placeholder="200 г рису&#10;Морква — 1 шт."
            />
          </Field>
          <Field
            label={
              isTikTokVideoUrl(sourceUrl)
                ? "Кроки приготування · не обов’язково для відеорецепта"
                : "Рецепт · кожен крок із нового рядка"
            }
          >
            <textarea
              name="instructions"
              rows={2}
              required={!isTikTokVideoUrl(sourceUrl)}
              maxLength={30000}
              defaultValue={seed?.instructions?.join("\n")}
              placeholder={
                seed?.instructions?.length
                  ? "Підготуйте продукти…"
                  : isTikTokVideoUrl(sourceUrl)
                    ? "Письмові кроки не обов’язкові для відеорецепта…"
                    : "Додайте кроки приготування вручну…"
              }
            />
          </Field>
        </div>

        <Field label="Джерело рецепта">
          <input
            name="source"
            type="url"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://… (необов’язково)"
          />
        </Field>

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <div className="budget-sheet-sticky-actions is-compact-row">
          <Button
            type="submit"
            busy={pending.includes(recipe?.id ?? "add-recipe")}
          >
            Зберегти рецепт
          </Button>
        </div>
      </form>
      {recipe && (
        <ConfirmDelete
          busy={pending.includes(recipe.id)}
          onConfirm={async () => {
            if (await remove("recipes", recipe.id)) onClose();
          }}
        />
      )}
    </BottomSheet>
  );
}
