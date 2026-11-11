import { useState, useEffect } from "react";
import { AnimatePresence } from "motion/react";
import {
  Check,
  Link2,
  RotateCcw,
  Shuffle,
  Trash2,
} from "lucide-react";
import { useApp } from "../hooks/AppContext";
import type { Recipe, RecipeView } from "../lib/types";
import type { LinkMetadata } from "../../supabase/functions/_shared/metadata";
import {
  categoryNames,
  recipeLibrary,
  resolveRecipe,
} from "../lib/recipe-catalog";
import { IconButton } from "../components/ui";
import { AddButton, PagedList, ScreenHeader } from "../components/Compact";
import { RecipeForm } from "../components/RecipeForm";
import { LinkImport } from "../components/LinkImportLoader";
import { RecipeCatalog, type CatalogFilter } from "../components/RecipeCatalog";
import { RecipeDetails } from "../components/RecipeDetails";
import { PortionCounter } from "../components/PortionCounter";
const initialFilter: CatalogFilter = {
  query: "",
  category: "all",
  time: 0,
  scope: "all",
  sort: "title",
};
export default function Menu() {
  const {
    data,
    userId,
    upsertMenu,
    removeMenuItem,
    restoreMenuProducts,
    pending,
  } = useApp();
  const [showPlan, setShowPlan] = useState(false),
    [filter, setFilter] = useState<CatalogFilter>(initialFilter),
    [detail, setDetail] = useState<RecipeView | null>(null),
    [fromCatalog, setFromCatalog] = useState(false),
    [form, setForm] = useState<Recipe | "new" | null>(null),
    [initial, setInitial] = useState<LinkMetadata>(),
    [importing, setImporting] = useState(false),
    [lastRandom, setLastRandom] = useState("");
  const library = recipeLibrary(data.recipes),
    catalogLibrary = recipeLibrary(data.recipes, filter.scope === "own");
  const rows = data.mealPlan
    .map((item) => ({ item, recipe: resolveRecipe(item, data.recipes) }))
    .filter((row): row is typeof row & { recipe: RecipeView } =>
      Boolean(row.recipe),
    );
  const busy = pending.includes("menu");
  const [rowHeight, setRowHeight] = useState(
    window.innerHeight < 500 ? 94 : 141,
  );
  useEffect(() => {
    const resize = () => setRowHeight(window.innerHeight < 500 ? 94 : 141);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const openCatalog = () => {
    setDetail(null);
    setShowPlan(false);
  };
  const addFromCatalog = (recipe: RecipeView) => {
    const alreadyAdded = data.mealPlan.some((item) =>
      recipe.catalogId
        ? item.catalog_id === recipe.catalogId
        : item.recipe_id === recipe.customId,
    );
    if (!alreadyAdded) void upsertMenu([{ recipe, servings: 1 }]);
  };
  const isInMenu = (recipe: RecipeView) =>
    data.mealPlan.some((item) =>
      recipe.catalogId
        ? item.catalog_id === recipe.catalogId
        : item.recipe_id === recipe.customId,
    );
  const generate = () => {
    const choices = library.filter((recipe) => recipe.key !== lastRandom);
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const recipe = choices[random[0] % choices.length];
    if (!recipe) return;
    setLastRandom(recipe.key);
    setFromCatalog(false);
    setDetail(recipe);
    try {
      localStorage.setItem(`ours-dinner-idea-${userId}`, recipe.key);
    } catch {
      /* A preview does not block the shared menu. */
    }
  };
  return (
    <section className="screen menu-screen shared-menu-screen">
      <ScreenHeader
        title="Меню"
      >
        <IconButton label="Згенерувати вечерю" onClick={generate}>
          <Shuffle size={18} />
        </IconButton>
        <IconButton
          label="Імпорт рецепта в меню"
          onClick={() => setImporting(true)}
        >
          <Link2 size={18} />
        </IconButton>
        <AddButton
          label="Додати рецепт"
          onClick={() => {
            setInitial(undefined);
            setForm("new");
          }}
        />
      </ScreenHeader>
      <div className="menu-view-switch" role="group" aria-label="Перегляд меню">
        <button
          type="button"
          aria-label="Каталог рецептів"
          aria-pressed={!showPlan}
          onClick={openCatalog}
        >
          Каталог
        </button>
        <button
          type="button"
          aria-label={`Готуємо · ${rows.length}`}
          aria-pressed={showPlan}
          onClick={() => setShowPlan(true)}
        >
          Готуємо <span>{rows.length}</span>
        </button>
      </div>
      <div className="screen-panel meal-menu-panel">
        {showPlan ? (
          <PagedList
            items={rows}
            rowHeight={rowHeight}
            empty={<div className="menu-plan-empty">Страв ще не додано</div>}
            render={({ item, recipe }) => (
              <article className="meal-row" key={item.id}>
              <button
                className="meal-image"
                onClick={() => {
                  setFromCatalog(false);
                  setDetail(recipe);
                }}
                aria-label={`Відкрити рецепт · ${recipe.title}`}
              >
                <img
                  src={recipe.image_url}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </button>
              <div className="meal-summary">
                <button
                  className="meal-title"
                  onClick={() => {
                    setFromCatalog(false);
                    setDetail(recipe);
                  }}
                >
                  <h2>{recipe.title}</h2>
                </button>
                <small>
                  {categoryNames[recipe.category]}
                  {recipe.totalTimeMinutes
                    ? ` · ${recipe.totalTimeMinutes} хв`
                    : ""}
                </small>
                {item.shopping_completed && (
                  <span className="meal-completed">
                    <Check size={11} />
                    Продукти куплені
                  </span>
                )}
              </div>
              <PortionCounter
                label={recipe.title}
                value={item.servings}
                disabled={busy}
                onChange={(servings) => void upsertMenu([{ recipe, servings }])}
              />
              <div className="meal-row-actions">
                <button
                  onClick={() => {
                    setFromCatalog(false);
                    setDetail(recipe);
                  }}
                >
                  Продукти
                </button>
                <button
                  onClick={() => {
                    setFromCatalog(false);
                    setDetail(recipe);
                  }}
                >
                  Рецепт
                </button>
                <IconButton
                  label={`Прибрати з меню · ${recipe.title}`}
                  disabled={busy}
                  onClick={() => void removeMenuItem(item.id)}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
              </article>
            )}
          />
        ) : (
          <RecipeCatalog
            inline
            recipes={catalogLibrary}
            filter={filter}
            onFilter={setFilter}
            onClose={openCatalog}
            disabled={busy}
            onSelect={(recipe) => {
              setFromCatalog(true);
              setDetail(recipe);
            }}
            isSelected={isInMenu}
            onAdd={addFromCatalog}
          />
        )}
      </div>
      {showPlan && rows.length > 0 && (
        <div className="menu-toolbar">
          <IconButton
            label="Повернути приховані продукти"
            disabled={busy}
            onClick={() => void restoreMenuProducts()}
          >
            <RotateCcw size={17} />
          </IconButton>
        </div>
      )}
      <AnimatePresence mode="wait">
        {form ? (
          <RecipeForm
            key="private-recipe-form"
            recipe={form === "new" ? undefined : form}
            initial={initial}
            onClose={() => setForm(null)}
            onSaved={(_category, title) => {
              setForm(null);
              setFilter({ ...initialFilter, scope: "own", query: title });
              setShowPlan(false);
            }}
          />
        ) : importing ? (
          <LinkImport
            key="import-recipe"
            kind="recipe"
            onClose={() => setImporting(false)}
            onResult={(result) => {
              setInitial(result);
              setImporting(false);
              setForm("new");
            }}
          />
        ) : detail ? (
          <RecipeDetails
            key={detail.key}
            recipe={detail}
            library={library}
            current={data.mealPlan.find((item) =>
              detail.catalogId
                ? item.catalog_id === detail.catalogId
                : item.recipe_id === detail.customId,
            )}
            busy={busy}
            onClose={() => setDetail(null)}
            onBack={
              fromCatalog
                ? () => setDetail(null)
                : undefined
            }
            onAdd={async (items) => {
              const saved = await upsertMenu(items);
              setShowPlan(true);
              return saved;
            }}
            onEdit={(value) => {
              if (value.custom) {
                setDetail(null);
                setForm(value.custom);
              }
            }}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}
