import { useRef, useState, type FormEvent } from "react";
import { Camera } from "lucide-react";
import { useApp } from "../hooks/AppContext";
import { parseRecipePhoto } from "../lib/ai-assist";
import type { Recipe, RecipeCategory, NewRecipe } from "../lib/types";
import type { LinkMetadata } from "../../supabase/functions/_shared/metadata";
import { publicUrl } from "../../supabase/functions/_shared/urls";
import { structuredIngredients } from "../lib/recipe-catalog";
import { isTikTokVideoUrl } from "../lib/recipe-source";
import { BottomSheet, Button, ConfirmDelete, Field } from "./ui";

const DEFAULT_RECIPE_IMAGE = "https://hubaluna.github.io/ours/art/ours-glass.webp";
const normalizeWebUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

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
  const { addRecipe, update, remove, pending, demo, notify } = useApp();
  const [error, setError] = useState("");
  const seed = recipe ?? initial;
  const [title, setTitle] = useState(seed?.title ?? "");
  const [baseServingsText, setBaseServingsText] = useState(
    String(recipe?.base_servings ?? 1),
  );
  const [totalTimeText, setTotalTimeText] = useState(
    recipe?.total_time_minutes != null ? String(recipe.total_time_minutes) : "",
  );
  const [ingredientsText, setIngredientsText] = useState(
    seed?.ingredients.join("\n") ?? "",
  );
  const [instructionsText, setInstructionsText] = useState(
    seed?.instructions?.join("\n") ?? "",
  );
  const [sourceUrl, setSourceUrl] = useState(seed?.source_url ?? "");
  const [imageUrl, setImageUrl] = useState(seed?.image_url ?? "");
  const [scanningPhoto, setScanningPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handleRecipePhoto = async (file: File | undefined) => {
    if (!file) return;
    setScanningPhoto(true);
    setError("");
    try {
      const res = await parseRecipePhoto(file);
      if (res.error || !res.data) {
        notify(res.error || "Не вдалося прочитати рецепт із фото.");
        return;
      }
      if (res.data.title) setTitle(res.data.title);
      if (res.data.ingredients.length) {
        setIngredientsText(res.data.ingredients.join("\n"));
      }
      if (res.data.instructions.length) {
        setInstructionsText(res.data.instructions.join("\n"));
      }
      if (res.data.base_servings) {
        setBaseServingsText(String(res.data.base_servings));
      }
      if (res.data.total_time_minutes) {
        setTotalTimeText(String(res.data.total_time_minutes));
      }
      notify("Рецепт розпізнано — перевірте перед збереженням");
    } finally {
      setScanningPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const lines = (key: string) =>
      String(f.get(key))
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    const rawImage = String(f.get("image") ?? "").trim();
    const image_url = rawImage
      ? publicUrl(normalizeWebUrl(rawImage))
      : DEFAULT_RECIPE_IMAGE;
    const rawSource = String(f.get("source") ?? "").trim();
    const source = rawSource ? normalizeWebUrl(rawSource) : "";
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
      (rawImage && !image_url) ||
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
        rawImage && !image_url
          ? "Посилання на фото має починатися з https://"
          : "Додайте назву, продукти й кроки приготування.",
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
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
              value={baseServingsText}
              onChange={(e) => setBaseServingsText(e.target.value)}
            />
          </Field>
          <Field label="Час приготування, хв">
            <input
              name="total_time_minutes"
              type="number"
              min={1}
              max={2880}
              step={1}
              value={totalTimeText}
              onChange={(e) => setTotalTimeText(e.target.value)}
              placeholder="хв"
            />
          </Field>
        </div>

        <Field label="Фото готової страви · HTTPS-посилання">
          <div className="recipe-photo-input-wrap">
            <input
              name="image"
              type="text"
              inputMode="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://… (необов’язково)"
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
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
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
              value={instructionsText}
              onChange={(e) => setInstructionsText(e.target.value)}
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
          {!recipe && !demo && (
            <>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => void handleRecipePhoto(e.target.files?.[0])}
              />
              <Button
                type="button"
                className="secondary"
                busy={scanningPhoto}
                onClick={() => photoInputRef.current?.click()}
              >
                <Camera size={15} />
                З фото
              </Button>
            </>
          )}
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
