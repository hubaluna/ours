import { Check, Clock3, Plus, Search } from "lucide-react";
import type { RecipeView, RecipeCategory } from "../lib/types";
import { categoryNames, normalizedIngredient } from "../lib/recipe-catalog";
import { BottomSheet, EmptyState, Field } from "./ui";
export type CatalogFilter = {
  query: string;
  category: RecipeCategory | "all";
  time: number;
  scope: "all" | "own";
  sort: "title" | "time";
};
export function RecipeCatalog({
  recipes,
  filter,
  onFilter,
  onSelect,
  onClose,
  inline = false,
  isSelected,
  onAdd,
  disabled = false,
}: {
  recipes: RecipeView[];
  filter: CatalogFilter;
  onFilter: (filter: CatalogFilter) => void;
  onSelect: (recipe: RecipeView) => void;
  onClose: () => void;
  inline?: boolean;
  isSelected?: (recipe: RecipeView) => boolean;
  onAdd?: (recipe: RecipeView) => void;
  disabled?: boolean;
}) {
  const query = normalizedIngredient(filter.query);
  const shown = recipes
    .filter(
      (recipe) =>
        (filter.category === "all" || recipe.category === filter.category) &&
        (!filter.time ||
          (recipe.totalTimeMinutes !== null &&
            recipe.totalTimeMinutes <= filter.time)) &&
        (!query ||
          normalizedIngredient(
            recipe.title +
              " " +
              recipe.ingredients.map((i) => i.name).join(" "),
          ).includes(query)),
    )
    .sort((a, b) =>
      filter.sort === "time"
        ? (a.totalTimeMinutes ?? Infinity) - (b.totalTimeMinutes ?? Infinity) ||
          a.title.localeCompare(b.title, "uk")
        : a.title.localeCompare(b.title, "uk"),
    );
  const content = (
    <>
      {inline && <h2 className="catalog-inline-title">Каталог рецептів</h2>}
      <div className="catalog-controls">
        <Field label="Пошук страви або продукту">
          <div className="catalog-search">
            <Search size={17} />
            <input
              data-autofocus
              type="search"
              value={filter.query}
              onChange={(e) => onFilter({ ...filter, query: e.target.value })}
              placeholder="Назва, курка, рис…"
            />
          </div>
        </Field>
        <div
          className="catalog-category-filters"
          role="group"
          aria-label="Категорії рецептів"
        >
          {(
            [["all", "Усі"], ...Object.entries(categoryNames)] as [
              CatalogFilter["category"],
              string,
            ][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter.category === key}
              onClick={() => onFilter({ ...filter, category: key })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="catalog-filter-row">
          <label>
            Час
            <select
              aria-label="Час приготування"
              value={filter.time}
              onChange={(e) =>
                onFilter({ ...filter, time: Number(e.target.value) })
              }
            >
              <option value={0}>Будь-який</option>
              <option value={20}>До 20 хв</option>
              <option value={30}>До 30 хв</option>
              <option value={60}>До години</option>
            </select>
          </label>
          <label>
            Показати
            <select
              aria-label="Джерело рецептів"
              value={filter.scope}
              onChange={(e) =>
                onFilter({
                  ...filter,
                  scope: e.target.value as CatalogFilter["scope"],
                })
              }
            >
              <option value="all">Усі рецепти</option>
              <option value="own">Мої рецепти</option>
            </select>
          </label>
          <label>
            Порядок
            <select
              aria-label="Сортування рецептів"
              value={filter.sort}
              onChange={(e) =>
                onFilter({
                  ...filter,
                  sort: e.target.value as CatalogFilter["sort"],
                })
              }
            >
              <option value="title">За назвою</option>
              <option value="time">Спочатку швидкі</option>
            </select>
          </label>
        </div>
        <p className="catalog-count" role="status">
          {shown.length} рецептів · база на 1 порцію
        </p>
      </div>
      {shown.length ? (
        <div className="recipe-catalog-grid">
          {shown.map((recipe) => (
            <article
              className={`catalog-card card${inline ? " catalog-card-inline" : ""}`}
              key={recipe.key}
            >
              <button
                className="catalog-card-main"
                type="button"
                onClick={() => onSelect(recipe)}
                aria-label={`Відкрити рецепт · ${recipe.title}`}
              >
                <div className="catalog-card-image">
                  <img
                    src={recipe.image_url}
                    alt={recipe.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="catalog-card-copy">
                  <small>
                    {categoryNames[recipe.category]}
                    {recipe.customId ? " · Власний" : ""}
                  </small>
                  <h3>{recipe.title}</h3>
                  <p>
                    <Clock3 size={13} />
                    {recipe.totalTimeMinutes
                      ? `${recipe.totalTimeMinutes} хв`
                      : "Час не вказано"}
                  </p>
                </div>
              </button>
              {inline && onAdd && (
                <button
                  className="catalog-card-add"
                  type="button"
                  aria-label={
                    isSelected?.(recipe)
                      ? `Уже в меню · ${recipe.title}`
                      : `Додати до меню · ${recipe.title}`
                  }
                  disabled={disabled || isSelected?.(recipe)}
                  onClick={() => onAdd(recipe)}
                >
                  {isSelected?.(recipe) ? <Check size={17} /> : <Plus size={18} />}
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Такої страви ще немає"
          description="Спробуйте іншу назву або змініть фільтри."
        />
      )}
    </>
  );
  return inline ? (
    <section className="recipe-catalog-inline" aria-label="Каталог рецептів">
      {content}
    </section>
  ) : (
    <BottomSheet title="Каталог рецептів" onClose={onClose} wide guardChanges={false}>
      {content}
    </BottomSheet>
  );
}
