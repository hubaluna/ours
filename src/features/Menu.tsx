import { useState, useEffect } from "react";
import { AnimatePresence } from "motion/react";
import {
  BookOpen,
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
import { Button, EmptyState, IconButton } from "../components/ui";
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
  const [catalog, setCatalog] = useState(false),
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
    setCatalog(true);
  };
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
        subtitle={`${rows.length ? `Страв у меню: ${rows.length}` : "Оберіть вечерю до смаку"}`}
      >
        <IconButton label="Каталог рецептів" onClick={openCatalog}>
          <BookOpen size={19} />
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
      <div className="menu-status-line">
        <span className="status-dot" />
        Покупки перераховуються разом із порціями
      </div>
      <div className="screen-panel meal-menu-panel">
        <PagedList
          items={rows}
          rowHeight={rowHeight}
          empty={
            <EmptyState
              title="Сьогодні може бути навіть лише салат"
              description="Усі 55 рецептів уже в каталозі. Додайте будь-які страви — без обов’язкових поєднань."
            >
              <Button onClick={openCatalog}>
                <BookOpen size={17} />
                Відкрити каталог · 55
              </Button>
            </EmptyState>
          }
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
      </div>
      <div className="menu-toolbar">
        <Button onClick={generate}>
          <Shuffle size={17} />
          Згенерувати вечерю
        </Button>
        {rows.length > 0 && (
          <IconButton
            label="Повернути приховані продукти"
            disabled={busy}
            onClick={() => void restoreMenuProducts()}
          >
            <RotateCcw size={17} />
          </IconButton>
        )}
      </div>
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
              setCatalog(true);
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
                ? () => {
                    setDetail(null);
                    setCatalog(true);
                  }
                : undefined
            }
            onAdd={upsertMenu}
            onEdit={(value) => {
              if (value.custom) {
                setDetail(null);
                setForm(value.custom);
              }
            }}
          />
        ) : catalog ? (
          <RecipeCatalog
            key="recipe-catalog"
            recipes={catalogLibrary}
            filter={filter}
            onFilter={setFilter}
            onClose={() => setCatalog(false)}
            onSelect={(recipe) => {
              setFromCatalog(true);
              setCatalog(false);
              setDetail(recipe);
            }}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}
