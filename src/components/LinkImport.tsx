import { useState } from "react";
import { Link2, ClipboardPaste, ArrowRight, Check } from "lucide-react";
import { BottomSheet, Button, Field } from "./ui";
import { supabase } from "../lib/supabase";
import {
  parseIngredient,
  parsePasted,
  type ImportKind,
  type LinkMetadata,
} from "../../supabase/functions/_shared/metadata";
import type { NewShopping } from "../lib/types";
import { groceryCategory } from "../../supabase/functions/_shared/grocery-category";
import { movieSynopsis } from "../../supabase/functions/_shared/movie-synopsis";
import { useApp } from "../hooks/AppContext";
export function LinkImport({
  kind,
  onClose,
  onResult,
  onRecipe,
}: {
  kind: ImportKind;
  onClose: () => void;
  onResult?: (result: LinkMetadata) => void;
  onRecipe?: (items: NewShopping[]) => Promise<boolean>;
}) {
  const { pending } = useApp();
  const [url, setUrl] = useState(""),
    [movieQuery, setMovieQuery] = useState(""),
    [text, setText] = useState(""),
    [paste, setPaste] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<LinkMetadata | null>(null),
    [ingredients, setIngredients] = useState<
      (NewShopping & { selected: boolean })[]
    >([]);
  const receive = (value: LinkMetadata) => {
    if (kind === "movie")
      value = { ...value, description: movieSynopsis(value.description) };
    setResult(value);
    setIngredients(
      value.ingredients.map((line) => ({
        ...parseIngredient(line),
        selected: true,
      })),
    );
    setError("");
  };
  const load = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!supabase) {
        setPaste(true);
        setError(
          "Автоматичне читання ще не підключене. Можна вставити текст зі сторінки.",
        );
        return;
      }
      const { data, error } = await supabase.functions.invoke("link-preview", {
        body: {
          url: url || (kind === "movie" ? "https://uk.wikipedia.org/" : ""),
          kind,
          ...(kind === "movie" && movieQuery.trim()
            ? { query: movieQuery.trim() }
            : {}),
        },
      });
      if (error || !data?.data) throw new Error();
      receive(data.data);
      if (kind === "movie" && !movieQuery)
        setMovieQuery(data.data.movie_query || "");
    } catch {
      setPaste(true);
      setError(
        "Не вдалося прочитати посилання. Спробуйте вставити текст зі сторінки.",
      );
    } finally {
      setBusy(false);
    }
  };
  const selected = ingredients.filter((i) => i.selected);
  return (
    <BottomSheet
      title={
        kind === "recipe"
          ? onResult
            ? "Рецепт із посилання"
            : "Покупки з рецепта"
          : "Додати з посилання"
      }
      onClose={onClose}
    >
      {!result ? (
        <div className="form">
          <Field label="Посилання">
            <input
              data-autofocus
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
          {kind === "movie" && (
            <Field label="Назва фільму · якщо відома">
              <input
                value={movieQuery}
                onChange={(e) => setMovieQuery(e.target.value)}
                maxLength={160}
                placeholder="Наприклад, Початок"
              />
            </Field>
          )}
          <Button
            busy={busy}
            disabled={!url && !movieQuery.trim()}
            onClick={() => void load()}
          >
            <Link2 size={17} />
            Знайти інформацію
          </Button>
          <Button className="ghost" onClick={() => setPaste(!paste)}>
            <ClipboardPaste size={16} />
            Вставити текст зі сторінки
          </Button>
          {paste && (
            <>
              <Field
                label={
                  kind === "recipe"
                    ? "Інгредієнти · кожен із нового рядка"
                    : "Текст або HTML сторінки"
                }
              >
                <textarea
                  rows={6}
                  maxLength={1_000_000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    kind === "recipe"
                      ? "200 г рису\nМолоко — 1 л"
                      : "Назва\nКороткий опис"
                  }
                />
              </Field>
              <Button
                className="secondary"
                disabled={!text.trim()}
                onClick={() => {
                  try {
                    receive(parsePasted(text, url, kind));
                  } catch {
                    setError("Для HTML потрібне повне посилання на сторінку.");
                  }
                }}
              >
                Розібрати текст <ArrowRight size={17} />
              </Button>
            </>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <p className="subtle-note">
            Знайдені дані можна перевірити й змінити перед збереженням.
          </p>
        </div>
      ) : (
        <div className="form">
          <div className="sheet-actions import-save-actions">
            {kind === "recipe" ? (
              <>
                {onRecipe && (
                  <Button
                    busy={pending.includes("recipe")}
                    disabled={
                      !selected.length ||
                      selected.some(
                        (i) =>
                          !i.name.trim() ||
                          i.quantity === null ||
                          !Number.isFinite(i.quantity) ||
                          i.quantity <= 0,
                      )
                    }
                    onClick={async () => {
                      if (
                        await onRecipe?.(
                          selected.map(
                            ({ name, quantity, unit, category, price }) => ({
                              name,
                              quantity,
                              unit,
                              category,
                              price,
                            }),
                          ),
                        )
                      )
                        onClose();
                    }}
                  >
                    Додати {selected.length} до покупок
                  </Button>
                )}

                {onResult && (
                  <Button
                    disabled={
                      !selected.length ||
                      selected.some(
                        (item) =>
                          !item.name.trim() ||
                          item.quantity === null ||
                          !Number.isFinite(item.quantity) ||
                          item.quantity <= 0,
                      )
                    }
                    onClick={() =>
                      onResult({
                        ...result,
                        ingredients: ingredients.flatMap((item, index) => {
                          if (!item.selected) return [];
                          const original = result.ingredients[index],
                            parsed = parseIngredient(original);
                          return [
                            parsed.name === item.name &&
                            parsed.quantity === item.quantity &&
                            parsed.unit === item.unit
                              ? original
                              : `${item.quantity} ${item.unit} ${item.name}`,
                          ];
                        }),
                      })
                    }
                  >
                    Перевірити й зберегти рецепт <ArrowRight size={17} />
                  </Button>
                )}
              </>
            ) : (
              <Button onClick={() => onResult?.(result)}>
                Перевірити й зберегти <ArrowRight size={17} />
              </Button>
            )}
          </div>
          <div className="import-success">
            <Check size={17} />
            {result.provider}
          </div>
          {kind === "movie" && (
            <>
              <Field label="Знайти фільм за назвою">
                <input
                  value={movieQuery}
                  onChange={(e) => setMovieQuery(e.target.value)}
                  maxLength={160}
                  placeholder="Назва з відео або опису"
                />
              </Field>
              <Button
                className="secondary"
                busy={busy}
                disabled={!movieQuery.trim()}
                onClick={() => void load()}
              >
                Знайти опис і постер
              </Button>
              {!!result.candidates?.length && (
                <div className="movie-candidates" aria-label="Знайдені фільми">
                  {result.candidates.map((candidate) => (
                    <button
                      key={candidate.url}
                      type="button"
                      aria-pressed={result.metadata_url === candidate.url}
                      onClick={() =>
                        receive({
                          ...result,
                          title: candidate.title,
                          description: candidate.description,
                          image_url: candidate.image_url || result.image_url,
                          year: candidate.year,
                          genres: candidate.genres,
                          metadata_url: candidate.url,
                          provider: "Wikipedia",
                        })
                      }
                    >
                      {candidate.image_url && (
                        <img
                          src={candidate.image_url}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <span>
                        {candidate.title}
                        <small>{candidate.year ?? ""}</small>
                      </span>
                      <Check size={14} />
                    </button>
                  ))}
                </div>
              )}
              {!result.metadata_url && (
                <p className="subtle-note">
                  Для відео потрібна назва фільму в описі. Якщо її немає,
                  введіть назву вище — оберіть відповідний результат.
                </p>
              )}
            </>
          )}
          {result.image_url && (
            <img
              className="import-preview-image"
              src={result.image_url}
              alt={result.title}
              referrerPolicy="no-referrer"
            />
          )}
          {result.metadata_url && (
            <a
              className="source-credit text-button"
              href={result.metadata_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Джерело опису та зображення · Wikipedia
            </a>
          )}
          <Field label={kind === "recipe" ? "Назва рецепта" : "Назва"}>
            <input
              value={result.title}
              onChange={(e) => setResult({ ...result, title: e.target.value })}
              maxLength={160}
            />
          </Field>
          {kind === "recipe" ? (
            <>
              <p className="subtle-note">
                Виберіть потрібне й перевірте кількість. Нерозпізнані міри
                залишені в назві.
              </p>
              {ingredients.length === 0 ? (
                <p className="form-error">
                  На сторінці не знайдено списку інгредієнтів. Вставте його
                  текст.
                </p>
              ) : (
                <div className="ingredient-list">
                  {ingredients.map((item, index) => (
                    <div className="ingredient" key={index}>
                      <input
                        aria-label={`Додати ${item.name}`}
                        type="checkbox"
                        checked={item.selected}
                        onChange={(e) =>
                          setIngredients((values) =>
                            values.map((v, i) =>
                              i === index
                                ? { ...v, selected: e.target.checked }
                                : v,
                            ),
                          )
                        }
                      />
                      <input
                        aria-label={`Інгредієнт ${index + 1}`}
                        value={item.name}
                        maxLength={160}
                        onChange={(e) =>
                          setIngredients((values) =>
                            values.map((v, i) =>
                              i === index
                                ? {
                                    ...v,
                                    name: e.target.value,
                                    category: groceryCategory(e.target.value),
                                  }
                                : v,
                            ),
                          )
                        }
                      />
                      <details className="ingredient-extra">
                        <summary>Додатково</summary>
                        <div className="form-grid">
                          <input
                            aria-label={`Кількість ${index + 1}`}
                            type="number"
                            min="0.01"
                            step="any"
                            value={item.quantity ?? ""}
                            onChange={(e) =>
                              setIngredients((values) =>
                                values.map((v, i) =>
                                  i === index
                                    ? { ...v, quantity: Number(e.target.value) }
                                    : v,
                                ),
                              )
                            }
                          />
                          <select
                            aria-label={`Одиниця ${index + 1}`}
                            value={item.unit}
                            onChange={(e) =>
                              setIngredients((values) =>
                                values.map((v, i) =>
                                  i === index
                                    ? { ...v, unit: e.target.value }
                                    : v,
                                ),
                              )
                            }
                          >
                            {["шт.", "кг", "г", "л", "мл", "уп."].map(
                              (unit) => (
                                <option key={unit}>{unit}</option>
                              ),
                            )}
                          </select>
                        </div>
                        <small>{item.category}</small>
                      </details>
                    </div>
                  ))}
                </div>
              )}
              {onResult && (
                <>
                  <Field label="Кроки приготування">
                    <textarea
                      rows={6}
                      value={result.instructions?.join("\n") ?? ""}
                      maxLength={30000}
                      onChange={(e) =>
                        setResult({
                          ...result,
                          instructions: e.target.value.split("\n"),
                        })
                      }
                    />
                  </Field>
                </>
              )}
            </>
          ) : (
            <>
              <Field label="Короткий опис">
                <textarea
                  rows={4}
                  value={result.description}
                  maxLength={kind === "movie" ? 650 : 1000}
                  onChange={(e) =>
                    setResult({ ...result, description: e.target.value })
                  }
                />
              </Field>
              {kind === "movie" && (
                <p className="subtle-note">
                  {result.year ?? "Рік не вказаний"} ·{" "}
                  {result.genres.join(", ") || "Жанр не вказаний"}
                </p>
              )}
              {result.price !== null && (
                <p className="subtle-note">
                  Ціна у джерелі: {result.price}{" "}
                  {result.currency || "валюта не вказана"}. Ціну в гривнях можна
                  ввести на наступному кроці.
                </p>
              )}
            </>
          )}
          <Button className="ghost" onClick={() => setResult(null)}>
            Інше посилання або текст
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}
