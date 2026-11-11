import { useState, type FormEvent } from "react";
import { useApp } from "../hooks/AppContext";
import type { Recipe, RecipeCategory, NewRecipe } from "../lib/types";
import type { LinkMetadata } from "../../supabase/functions/_shared/metadata";
import { publicUrl } from "../../supabase/functions/_shared/urls";
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
    const value: NewRecipe = {
      title: String(f.get("title")).trim(),
      category: String(f.get("category")) as RecipeCategory,
      image_url,
      source_url: source,
      ingredients: lines("ingredients"),
      instructions: lines("instructions"),
    };
    if (
      !image_url ||
      !value.title ||
      !value.ingredients.length ||
      !value.instructions.length ||
      value.ingredients.length > 80 ||
      value.instructions.length > 60 ||
      (source && !publicUrl(source))
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
      <form className="form" onSubmit={submit}>
        <Field label="Назва страви">
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={seed?.title}
          />
        </Field>
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
        <Field label="Фото готової страви · HTTPS-посилання">
          <input
            name="image"
            type="url"
            required
            defaultValue={seed?.image_url}
            placeholder="https://…"
          />
        </Field>
        {seed?.image_url && (
          <img
            className="recipe-preview-image"
            src={seed.image_url}
            alt={seed.title}
            referrerPolicy="no-referrer"
          />
        )}
        <Field label="Продукти · кожен із нового рядка">
          <textarea
            name="ingredients"
            rows={6}
            required
            maxLength={20000}
            defaultValue={seed?.ingredients.join("\n")}
            placeholder="200 г рису\nМорква — 1 шт."
          />
        </Field>
        <Field label="Рецепт · кожен крок із нового рядка">
          <textarea
            name="instructions"
            rows={7}
            required
            maxLength={30000}
            defaultValue={seed?.instructions?.join("\n")}
            placeholder="Підготуйте продукти…"
          />
        </Field>
        <Field label="Джерело рецепта">
          <input name="source" type="url" defaultValue={seed?.source_url} />
        </Field>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <Button
          type="submit"
          busy={pending.includes(recipe?.id ?? "add-recipe")}
        >
          Зберегти рецепт
        </Button>
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
