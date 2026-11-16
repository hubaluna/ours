import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  ExternalLink,
  Pencil,
  Plus,
  ShoppingBag,
} from "lucide-react";
import { useApp } from "../hooks/AppContext";
import { isAtHomeIngredient } from "../lib/pantry";
import type { RecipeView, MealPlanItem } from "../lib/types";
import {
  categoryNames,
  quantityLabel,
  scaleIngredients,
} from "../lib/recipe-catalog";
import { pairingRecommendations } from "../lib/recipe-pairings";
import { isTikTokVideoUrl } from "../lib/recipe-source";
import { BottomSheet, Button } from "./ui";
import { PortionCounter } from "./PortionCounter";
export function RecipeDetails({
  recipe,
  library,
  current,
  onClose,
  onBack,
  onAdd,
  onEdit,
  busy,
}: {
  recipe: RecipeView;
  library: RecipeView[];
  current?: MealPlanItem;
  onClose: () => void;
  onBack?: () => void;
  onAdd: (
    choices: { recipe: RecipeView; servings: number; reopen?: boolean }[],
  ) => Promise<boolean>;
  onEdit?: (recipe: RecipeView) => void;
  busy: boolean;
}) {
  const { data, addShoppingBatch } = useApp();
  const [servings, setServings] = useState(current?.servings ?? 1);
  const products = scaleIngredients(
    recipe.ingredients,
    servings,
    recipe.baseServings,
  );
  const checkedProducts = products.map((item) => ({
    item,
    atHome: isAtHomeIngredient(item.name, data.pantry),
  }));
  const atHomeCount = checkedProducts.filter((entry) => entry.atHome).length;
  const missingProducts = checkedProducts
    .filter((entry) => !entry.atHome && entry.item.quantity !== 0)
    .map((entry) => ({
      name: entry.item.name,
      quantity: entry.item.quantity,
      unit: entry.item.unit,
      category: entry.item.category,
      price: null,
    }));
  const recommendations = pairingRecommendations(recipe, library);
  const difficulty = (
    {
      easy: "Легко",
      medium: "Середня складність",
      hard: "Складніше",
    } as Record<string, string>
  )[recipe.difficulty];
  return (
    <BottomSheet
      title={recipe.title}
      onClose={onClose}
      wide
      guardChanges={false}
    >
      <div className="sheet-actions recipe-save-actions">
        <PortionCounter
          value={servings}
          onChange={setServings}
          disabled={busy}
        />
        <Button
          busy={busy}
          onClick={async () => {
            if (await onAdd([{ recipe, servings }])) onClose();
          }}
        >
          <Plus size={17} />
          {current ? "Зберегти порції" : "Додати до меню"}
        </Button>
      </div>
      {!recipe.instructions.length && isTikTokVideoUrl(recipe.source_url) && (
        <a
          className="button secondary video-recipe-watch"
          href={recipe.source_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Дивитися, як готувати <ExternalLink size={15} />
        </a>
      )}
      {onBack && (
        <button className="text-button catalog-back" onClick={onBack}>
          <ArrowLeft size={14} />
          До каталогу
        </button>
      )}
      <div className="recipe-detail-grid">
        <div className="recipe-detail-visual">
          <img
            className="recipe-detail-image"
            src={recipe.image_url}
            alt={recipe.title}
            referrerPolicy="no-referrer"
          />
          <div className="recipe-facts">
            <span>{categoryNames[recipe.category]}</span>
            {recipe.totalTimeMinutes && (
              <span>
                <Clock3 size={14} />
                {recipe.totalTimeMinutes} хв
              </span>
            )}
            {difficulty && <span>{difficulty}</span>}
          </div>
          <p className="subtle-note">
            Час приготування не змінюється від кількості порцій.
          </p>
          {recipe.notes &&
            !["medium", "easy", "hard"].includes(recipe.notes) && (
              <p className="recipe-note">{recipe.notes}</p>
            )}
          {recipe.source_url && (
            <a
              className="text-button source-credit"
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Джерело рецепта
            </a>
          )}
          {recipe.custom && onEdit && (
            <Button className="ghost" onClick={() => onEdit(recipe)}>
              <Pencil size={15} />
              Редагувати рецепт
            </Button>
          )}
          {current?.shopping_completed && (
            <>
              <p className="subtle-note">
                Продукти для цього меню вже куплені.
              </p>
              <Button
                className="secondary"
                busy={busy}
                onClick={async () => {
                  if (await onAdd([{ recipe, servings, reopen: true }]))
                    onClose();
                }}
              >
                <ShoppingBag size={16} />
                Знову сформувати покупки
              </Button>
            </>
          )}
        </div>
        <div className="recipe-detail-copy">
          <section>
            <div className="recipe-ingredients-head">
              <h3>Продукти · {servings} порц.</h3>
              {atHomeCount > 0 && (
                <small className="recipe-pantry-summary">
                  є вдома: {atHomeCount} із {products.length}
                </small>
              )}
            </div>
            <ul className="scaled-ingredients">
              {checkedProducts.map(({ item, atHome }, index) => (
                <li
                  key={index}
                  className={atHome ? "ingredient-at-home" : undefined}
                >
                  <span>
                    {item.name}
                    {atHome && (
                      <em className="ingredient-home-mark">
                        <Check size={12} aria-hidden="true" />є вдома
                      </em>
                    )}
                    {item.note && (
                      <small className="ingredient-note">{item.note}</small>
                    )}
                  </span>
                  <strong>
                    {item.quantity === 0
                      ? "Альтернатива"
                      : quantityLabel(item.quantity, item.unit)}
                  </strong>
                </li>
              ))}
            </ul>
            {missingProducts.length > 0 && (
              <Button
                className="secondary recipe-missing-shop-btn"
                busy={busy}
                onClick={() => void addShoppingBatch(missingProducts)}
              >
                <ShoppingBag size={15} />
                {atHomeCount > 0
                  ? `Додати те, чого бракує (${missingProducts.length})`
                  : `Додати продукти до списку (${missingProducts.length})`}
              </Button>
            )}
            {atHomeCount > 0 && missingProducts.length === 0 && (
              <p className="subtle-note">
                Усі інгредієнти вже є вдома — купувати нічого не потрібно.
              </p>
            )}
            {products.some(
              (item) =>
                ["шт.", "зубчик"].includes(item.unit) &&
                item.quantity !== null &&
                !Number.isInteger(item.quantity),
            ) && (
              <p className="subtle-note">
                Дробові яйця зручно відміряти зі збитого яйця. Для покупки можна
                взяти ціле яйце або головку часнику; у рецепті показана потрібна
                частина.
              </p>
            )}
          </section>
          <section>
            <h3>Приготування</h3>
            {recipe.instructions.length ? (
              <ol className="recipe-steps">
                {recipe.instructions.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            ) : (
              <div className="video-recipe-steps">
                <p>
                  Письмових кроків немає. Перегляньте відео, щоб побачити
                  приготування.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
      {recommendations.length > 0 && (
        <section className="pairing-section">
          <h3>
            {recipe.category === "side"
              ? "До цього гарніру пасуватиме"
              : "Гарніри, які пасують"}
          </h3>
          <p className="subtle-note">
            Найвдаліші поєднання — першими. Обидві страви по {servings} порц.
          </p>
          <div className="pairing-grid">
            {recommendations.map(({ recipe: match, reason }) => (
              <article className="pairing-card" key={match.key}>
                <img
                  src={match.image_url}
                  alt={match.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <h4>{match.title}</h4>
                  <p>{reason}</p>
                  <Button
                    className="secondary"
                    busy={busy}
                    onClick={async () => {
                      if (
                        await onAdd([
                          { recipe, servings },
                          { recipe: match, servings },
                        ])
                      )
                        onClose();
                    }}
                  >
                    Додати пару
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </BottomSheet>
  );
}
