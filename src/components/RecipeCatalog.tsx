import { Check, Clock3, Heart, Plus, Search } from "lucide-react";
import type { RecipeView, RecipeCategory } from "../lib/types";
import { categoryNames, normalizedIngredient } from "../lib/recipe-catalog";
import { BottomSheet, EmptyState, Field } from "./ui";
export type CatalogFilter = {
  query: string;
  category: RecipeCategory | "all";
  time: number;
  scope: "all" | "own" | "favorites";
  sort: "suggested" | "title" | "time";
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
  favoriteKeys = [],
  cookedAt = {},
  onFavorite,
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
  favoriteKeys?: string[];
  cookedAt?: Record<string, string>;
  onFavorite?: (recipe: RecipeView) => void;
}) {
  const query = normalizedIngredient(filter.query);
  const favorite = new Set(favoriteKeys);
  const latestCook = Math.max(
    0,
    ...Object.values(cookedAt).map((value) => Date.parse(value)),
  );
  const suggestionScore = (recipe: RecipeView) => {
    const last = cookedAt[recipe.key];
    const days = last
      ? Math.max(0, Math.floor((latestCook - Date.parse(last)) / 86_400_000))
      : 0;
    return (favorite.has(recipe.key) ? 1000 : 0) + Math.min(days, 120) / 30;
  };
  const shown = recipes
    .filter(
      (recipe) =>
        (filter.category === "all" || recipe.category === filter.category) &&
        (filter.scope !== "favorites" || favorite.has(recipe.key)) &&
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
        : filter.sort === "suggested"
          ? suggestionScore(b) - suggestionScore(a) ||
            a.title.localeCompare(b.title, "uk")
          : a.title.localeCompare(b.title, "uk"),
    );
  const content = (
    <>
      <div className="catalog-controls">
        {inline ? (
          <div className="catalog-search">
            <Search size={17} />
            <input
              aria-label="Пошук страви або продукту"
              data-autofocus
              type="search"
              value={filter.query}
              onChange={(e) => onFilter({ ...filter, query: e.target.value })}
              placeholder="Назва, курка, рис…"
            />
          </div>
        ) : (
          <Field label="Пошук страви або продукту">
            <div className="catalog-search">
              <Search size={17} />
              <input
                aria-label="Пошук страви або продукту"
                data-autofocus
                type="search"
                value={filter.query}
                onChange={(e) => onFilter({ ...filter, query: e.target.value })}
                placeholder="Назва, курка, рис…"
              />
            </div>
          </Field>
        )}
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
              <option value="favorites">Улюблені</option>
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
              <option value="suggested">Для вас</option>
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
                  {isSelected?.(recipe) ? (
                    <Check size={17} />
                  ) : (
                    <Plus size={18} />
                  )}
                </button>
              )}
              {onFavorite && (
                <button
                  className="catalog-card-favorite"
                  type="button"
                  aria-label={`${favorite.has(recipe.key) ? "Прибрати з улюблених" : "До улюблених"} · ${recipe.title}`}
                  aria-pressed={favorite.has(recipe.key)}
                  onClick={() => onFavorite(recipe)}
                >
                  <Heart
                    size={17}
                    fill={favorite.has(recipe.key) ? "currentColor" : "none"}
                  />
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
    <BottomSheet
      title="Каталог рецептів"
      onClose={onClose}
      wide
      guardChanges={false}
    >
      {content}
    </BottomSheet>
  );
}
