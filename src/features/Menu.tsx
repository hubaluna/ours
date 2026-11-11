import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  Fish,
  Link2,
  Salad,
  Shuffle,
  Wheat,
  CookingPot,
  Pencil,
} from "lucide-react";
import { useApp } from "../hooks/AppContext";
import {
  firstMenu,
  menuOptions,
  nextMenu,
  type MenuSuggestion,
} from "../lib/menu";
import type { Recipe, RecipeCategory } from "../lib/types";
import type { LinkMetadata } from "../../supabase/functions/_shared/metadata";
import { parseIngredient } from "../../supabase/functions/_shared/ingredients";
import { BottomSheet, Button, IconButton, Segmented } from "../components/ui";
import { AddButton, ScreenHeader } from "../components/Compact";
import { RecipeForm, courseLabels } from "../components/RecipeForm";
import { LinkImport } from "../components/LinkImportLoader";
import { soft } from "../lib/motion";
const mainIdeas = ["Плов", "Овочеве рагу", "Паста з куркою"];
export default function Menu() {
  const { userId, data, addShoppingBatch, pending } = useApp();
  const [selection, setSelection] = useState<MenuSuggestion & { main: string }>(
    () => {
      try {
        const value = JSON.parse(
          localStorage.getItem(`ours-menu-${userId}`) || "null",
        );
        if (
          value &&
          ["side", "protein", "salad"].every(
            (k) => typeof value[k] === "string",
          )
        )
          return {
            ...value,
            main: typeof value.main === "string" ? value.main : mainIdeas[0],
          };
      } catch {
        /* Ignore invalid local selections. */
      }
      return { ...firstMenu, main: mainIdeas[0] };
    },
  );
  const [mode, setMode] = useState("courses"),
    [panel, setPanel] = useState<{
      key: RecipeCategory;
      tab: "ingredients" | "instructions";
    } | null>(null),
    [importing, setImporting] = useState(false),
    [form, setForm] = useState<Recipe | "new" | null>(null),
    [initial, setInitial] = useState<LinkMetadata>();
  const [initialCategory, setInitialCategory] =
    useState<RecipeCategory>("main");
  useEffect(() => {
    try {
      localStorage.setItem(`ours-menu-${userId}`, JSON.stringify(selection));
    } catch {
      /* A local selection must not block the shared library. */
    }
  }, [selection, userId]);
  const options = (key: RecipeCategory) => [
    ...new Set([
      ...data.recipes.filter((r) => r.category === key).map((r) => r.title),
      ...(key === "main" ? mainIdeas : menuOptions[key]),
    ]),
  ];
  const recipeFor = (key: RecipeCategory) =>
    data.recipes.find((r) => r.category === key && r.title === selection[key]);
  const courses =
    mode === "main"
      ? (["main"] as const)
      : (["side", "protein", "salad"] as const);
  const icons = { side: Wheat, protein: Fish, salad: Salad, main: CookingPot };
  const active = panel ? recipeFor(panel.key) : undefined;
  const generate = () => {
    if (mode === "courses" && !data.recipes.length) {
      setSelection((value) => ({ ...value, ...nextMenu(value) }));
      return;
    }
    setSelection((value) => {
      const next = { ...value };
      for (const key of courses) {
        const available = options(key).filter((title) => title !== value[key]);
        if (available.length) {
          const random = new Uint32Array(1);
          crypto.getRandomValues(random);
          next[key] = available[random[0] % available.length];
        }
      }
      return next;
    });
  };
  return (
    <section className="screen menu-screen">
      <ScreenHeader title="Меню" subtitle="Обираємо, що приготуємо">
        <IconButton
          label="Імпорт рецепта в меню"
          onClick={() => setImporting(true)}
        >
          <Link2 size={19} />
        </IconButton>
        <AddButton
          label="Додати рецепт"
          onClick={() => {
            setInitial(undefined);
            setInitialCategory("main");
            setForm("new");
          }}
        />
      </ScreenHeader>
      <Segmented
        id="menu-mode"
        value={mode}
        onChange={setMode}
        options={[
          { id: "courses", label: "З трьох частин" },
          { id: "main", label: "Повноцінна страва" },
        ]}
      />
      <div className="menu-content">
        <div className={`menu-grid ${mode === "main" ? "single-course" : ""}`}>
          {courses.map((key) => {
            const Icon = icons[key],
              recipe = recipeFor(key);
            return (
              <article className="menu-course card" key={key}>
                {recipe?.image_url ? (
                  <img
                    className="dish-thumb"
                    src={recipe.image_url}
                    alt={recipe.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="course-icon">
                    <Icon size={21} />
                  </span>
                )}
                <div className="course-choice">
                  <span className="row-kicker">{courseLabels[key]}</span>
                  <motion.h2
                    key={selection[key]}
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={soft}
                  >
                    {selection[key]}
                  </motion.h2>
                  <select
                    aria-label={`Оберіть страву · ${courseLabels[key]}`}
                    value={selection[key]}
                    onChange={(e) =>
                      setSelection({ ...selection, [key]: e.target.value })
                    }
                  >
                    {options(key).map((title) => (
                      <option key={title}>{title}</option>
                    ))}
                  </select>
                  <div className="course-actions">
                    <button
                      type="button"
                      onClick={() => setPanel({ key, tab: "ingredients" })}
                    >
                      Продукти <ChevronDown size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPanel({ key, tab: "instructions" })}
                    >
                      Рецепт <ChevronDown size={13} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="menu-footer">
          <Button onClick={generate}>
            <Shuffle size={17} />
            Згенерувати вечерю
          </Button>
          <p>
            Каталог і фотографії обраних страв наповнимо разом.
            <br />
            Власні рецепти можна додати вже зараз.
          </p>
        </div>
      </div>
      <AnimatePresence mode="wait">
        {form ? (
          <RecipeForm
            key="recipe-form"
            recipe={form === "new" ? undefined : form}
            initial={initial}
            category={initialCategory}
            onClose={() => setForm(null)}
            onSaved={(category, title) => {
              setSelection((value) => ({ ...value, [category]: title }));
              setMode(category === "main" ? "main" : "courses");
              setForm(null);
            }}
          />
        ) : importing ? (
          <LinkImport
            key="recipe-import"
            kind="recipe"
            onClose={() => setImporting(false)}
            onResult={(result) => {
              setInitial(result);
              setInitialCategory("main");
              setImporting(false);
              setForm("new");
            }}
          />
        ) : panel ? (
          <BottomSheet
            key="recipe-details"
            title={selection[panel.key]}
            onClose={() => setPanel(null)}
          >
            <div className="form">
              <Segmented
                id="recipe-tab"
                value={panel.tab}
                onChange={(tab) =>
                  setPanel({
                    ...panel,
                    tab: tab as "ingredients" | "instructions",
                  })
                }
                options={[
                  { id: "ingredients", label: "Продукти" },
                  { id: "instructions", label: "Рецепт" },
                ]}
              />
              {active ? (
                <>
                  <img
                    className="recipe-preview-image"
                    src={active.image_url}
                    alt={active.title}
                    referrerPolicy="no-referrer"
                  />
                  {panel.tab === "ingredients" ? (
                    <>
                      <ul className="recipe-ingredients">
                        {active.ingredients.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                      <Button
                        busy={pending.includes("recipe")}
                        onClick={async () => {
                          if (
                            await addShoppingBatch(
                              active.ingredients.map((line) => {
                                const {
                                  name,
                                  quantity,
                                  unit,
                                  category,
                                  price,
                                } = parseIngredient(line);
                                return {
                                  name,
                                  quantity,
                                  unit,
                                  category,
                                  price,
                                };
                              }),
                            )
                          )
                            setPanel(null);
                          setInitialCategory(panel.key);
                        }}
                      >
                        Усі продукти до покупок
                      </Button>
                    </>
                  ) : (
                    <ol className="recipe-steps">
                      {active.instructions.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  )}
                  {active.source_url && (
                    <a
                      href={active.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-button"
                    >
                      Джерело рецепта
                    </a>
                  )}
                  <Button
                    className="ghost"
                    onClick={() => {
                      setForm(active);
                      setPanel(null);
                    }}
                  >
                    <Pencil size={16} />
                    Редагувати рецепт
                  </Button>
                </>
              ) : (
                <>
                  <p>
                    Це поки ідея страви. Продукти, кроки й фото додамо, коли
                    оберемо рецепт.
                  </p>
                  <Button
                    onClick={() => {
                      setPanel(null);
                      setInitial({
                        ...{
                          source_url: "",
                          title: selection[panel.key],
                          description: "",
                          image_url: "",
                          year: null,
                          genres: [],
                          price: null,
                          currency: "",
                          ingredients: [],
                          provider: "",
                        },
                      });
                      setForm("new");
                    }}
                  >
                    Додати рецепт цієї страви
                  </Button>
                </>
              )}
            </div>
          </BottomSheet>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
