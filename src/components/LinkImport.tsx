import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link2,
  ClipboardPaste,
  ArrowRight,
  Check,
  ExternalLink,
  Gift,
  UtensilsCrossed,
  ShoppingCart,
  Film,
} from "lucide-react";
import { BottomSheet, Button, Field } from "./ui";
import { supabase } from "../lib/supabase";
import {
  parseIngredient,
  parsePasted,
  type ImportKind,
  type LinkMetadata,
} from "../../supabase/functions/_shared/metadata";
import type { NewShopping } from "../lib/types";
import { groceryCatalogCategory } from "../lib/grocery-catalog";
import { movieSynopsis } from "../../supabase/functions/_shared/movie-synopsis";
import { normalizeImportUrl } from "../../supabase/functions/_shared/urls";
import { isGenericTikTokTitle } from "../../supabase/functions/_shared/movie-search";
import {
  needsClientMovieRefresh,
  resolveMovieClientSide,
} from "../lib/client-movie-search";
import { retryLinkPreview422 } from "../lib/link-preview-retry";
import { useApp } from "../hooks/AppContext";
import {
  extractShareTargetUrl,
  type ShareTargetDestination,
} from "../lib/share-target";

export function LinkImport({
  kind: initialKind = "wish",
  initialUrl = "",
  autoLoad = false,
  allowTargetChange = false,
  target,
  onTargetChange,
  onClose,
  onResult,
  onRecipe,
}: {
  kind?: ImportKind;
  initialUrl?: string;
  autoLoad?: boolean;
  allowTargetChange?: boolean;
  target?: ShareTargetDestination;
  onTargetChange?: (target: ShareTargetDestination) => void;
  onClose: () => void;
  onResult?: (result: LinkMetadata) => void;
  onRecipe?: (items: NewShopping[]) => Promise<boolean>;
}) {
  const { pending } = useApp();
  const [activeKind, setActiveKind] = useState<ImportKind>(initialKind);
  const [localTarget, setLocalTarget] = useState<ShareTargetDestination>(() => {
    if (target) return target;
    if (initialKind === "movie") return "movie";
    if (initialKind === "wish") return "wish";
    return onRecipe && !onResult ? "shopping" : "menu";
  });
  const currentTarget = target ?? localTarget;

  const [url, setUrl] = useState(initialUrl),
    [movieQuery, setMovieQuery] = useState(""),
    [text, setText] = useState(""),
    [paste, setPaste] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<LinkMetadata | null>(null),
    [ingredients, setIngredients] = useState<
      (NewShopping & { selected: boolean; note?: string })[]
    >([]);

  const receive = useCallback(
    (value: LinkMetadata, forKind: ImportKind = activeKind) => {
      if (forKind === "movie") {
        value = {
          ...value,
          description: movieSynopsis(value.description),
          image_url:
            value.image_url === value.source_url ? "" : value.image_url,
        };
      }
      setResult(value);
      setIngredients(
        (value.ingredients || []).map((line) => ({
          ...parseIngredient(line),
          selected: true,
        })),
      );
      setError("");
    },
    [activeKind],
  );

  const load = useCallback(
    async (overrideUrl?: string, overrideKind?: ImportKind) => {
      if (busy) return;
      const targetUrl = overrideUrl ?? url;
      const currentKind = overrideKind ?? activeKind;
      setBusy(true);
      setError("");
      const normalizedUrl = targetUrl.trim()
        ? normalizeImportUrl(targetUrl)
        : "";
      if (normalizedUrl && normalizedUrl !== targetUrl) setUrl(normalizedUrl);
      try {
        if (supabase) {
          try {
            const client = supabase;
            const { data, error } = await retryLinkPreview422<{
              data: LinkMetadata;
              movie_query?: string;
            }>(() =>
              client.functions.invoke("link-preview", {
                body: {
                  url:
                    normalizedUrl ||
                    (currentKind === "movie"
                      ? "https://uk.wikipedia.org/"
                      : ""),
                  kind: currentKind,
                  ...(currentKind === "movie" && movieQuery.trim()
                    ? { query: movieQuery.trim() }
                    : {}),
                },
              }),
            );
            if (!error && data?.data) {
              let payload = data.data;
              if (
                currentKind === "movie" &&
                isGenericTikTokTitle(payload.title)
              ) {
                payload = {
                  ...payload,
                  title: "",
                  description: /^TikTok/i.test(payload.description.trim())
                    ? ""
                    : payload.description,
                  provider: "TikTok",
                };
              }
              if (
                currentKind === "movie" &&
                !movieQuery.trim() &&
                needsClientMovieRefresh(payload, normalizedUrl)
              ) {
                const refreshed = await resolveMovieClientSide(normalizedUrl);
                if (refreshed) payload = refreshed;
              }
              if (
                currentKind === "movie" &&
                !payload.image_url &&
                result?.image_url
              ) {
                payload = { ...payload, image_url: result.image_url };
              }
              receive(payload, currentKind);
              if (currentKind === "movie" && !movieQuery)
                setMovieQuery(payload.movie_query || "");
              return;
            }
          } catch {
            /* Fall through to browser CORS fallback for movies or show paste box. */
          }
        }

        if (currentKind === "movie") {
          let fallback = await resolveMovieClientSide(
            normalizedUrl,
            movieQuery,
          );
          if (fallback) {
            if (!fallback.image_url && result?.image_url) {
              fallback = { ...fallback, image_url: result.image_url };
            }
            receive(fallback, currentKind);
            if (!movieQuery && fallback.movie_query)
              setMovieQuery(fallback.movie_query);
            return;
          }
        }

        setPaste(true);
        setError(
          !supabase
            ? "Автоматичне читання ще не підключене. Можна вставити текст зі сторінки."
            : "Не вдалося прочитати посилання. Спробуйте ще раз або вставте текст зі сторінки.",
        );
      } finally {
        setBusy(false);
      }
    },
    [activeKind, busy, movieQuery, receive, result, url],
  );

  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (initialUrl && autoLoad && !autoLoadedRef.current) {
      autoLoadedRef.current = true;
      void load(initialUrl, activeKind);
    }
  }, [initialUrl, autoLoad, activeKind, load]);

  const pasteFromClipboard = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
        return;
      }
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText) return;
      const extracted =
        extractShareTargetUrl(`?text=${encodeURIComponent(clipboardText)}`) ||
        normalizeImportUrl(clipboardText);
      const targetUrl = extracted || clipboardText.trim();
      if (targetUrl) {
        setUrl(targetUrl);
        setError("");
        if (!busy) {
          void load(targetUrl, activeKind);
        }
      }
    } catch {
      // Clipboard access denied or canceled
    }
  };

  const handleTargetChange = (newTarget: ShareTargetDestination) => {
    if (onTargetChange) onTargetChange(newTarget);
    setLocalTarget(newTarget);
    const newKind: ImportKind =
      newTarget === "movie" ? "movie" : newTarget === "wish" ? "wish" : "recipe";
    if (newKind !== activeKind) {
      setActiveKind(newKind);
      if (url.trim()) {
        void load(url, newKind);
      }
    }
  };

  const selected = ingredients.filter((i) => i.selected);

  const isShoppingTarget = allowTargetChange
    ? currentTarget === "shopping"
    : activeKind === "recipe" && Boolean(onRecipe) && !onResult;
  const isMenuTarget = allowTargetChange
    ? currentTarget === "menu"
    : activeKind === "recipe" && Boolean(onResult);

  const title = allowTargetChange
    ? "Імпорт посилання"
    : isShoppingTarget
      ? "Покупки з рецепта"
      : isMenuTarget
        ? "Рецепт із посилання"
        : activeKind === "movie"
          ? "Додати фільм із посилання"
          : "Додати з посилання";

  return (
    <BottomSheet title={title} onClose={onClose}>
      {allowTargetChange && (
        <div
          className="import-target-selector"
          role="radiogroup"
          aria-label="Призначення імпорту"
        >
          <button
            type="button"
            className="import-target-btn"
            aria-pressed={currentTarget === "wish"}
            onClick={() => handleTargetChange("wish")}
          >
            <Gift size={16} />
            <span>У бажання</span>
          </button>
          <button
            type="button"
            className="import-target-btn"
            aria-pressed={currentTarget === "menu"}
            onClick={() => handleTargetChange("menu")}
          >
            <UtensilsCrossed size={16} />
            <span>У меню (рецепт)</span>
          </button>
          <button
            type="button"
            className="import-target-btn"
            aria-pressed={currentTarget === "shopping"}
            onClick={() => handleTargetChange("shopping")}
          >
            <ShoppingCart size={16} />
            <span>У покупки (продукти з рецепта)</span>
          </button>
          <button
            type="button"
            className="import-target-btn"
            aria-pressed={currentTarget === "movie"}
            onClick={() => handleTargetChange("movie")}
          >
            <Film size={16} />
            <span>У кіно</span>
          </button>
        </div>
      )}

      {!result ? (
        <div className="form">
          <Field label="Посилання">
            <div className="url-input-row">
              <input
                data-autofocus
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
              <Button
                type="button"
                className="ghost paste-btn"
                onClick={() => void pasteFromClipboard()}
                title="Вставити посилання з буфера обміну"
              >
                <ClipboardPaste size={16} />
                <span>З буфера</span>
              </Button>
            </div>
          </Field>
          {activeKind === "movie" && (
            <Field label="Назва фільму · якщо відома">
              <input
                value={movieQuery}
                onChange={(e) => setMovieQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (url || movieQuery.trim())) {
                    e.preventDefault();
                    void load();
                  }
                }}
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
                  activeKind === "recipe"
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
                    activeKind === "recipe"
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
                    const normalizedUrl = url.trim()
                      ? normalizeImportUrl(url)
                      : "";
                    if (normalizedUrl && normalizedUrl !== url)
                      setUrl(normalizedUrl);
                    receive(parsePasted(text, normalizedUrl, activeKind));
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
            {isShoppingTarget ? (
              onRecipe && (
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
              )
            ) : isMenuTarget ? (
              onResult && (
                <Button
                  disabled={
                    !selected.length ||
                    selected.some(
                      (item) =>
                        !item.name.trim() ||
                        (item.quantity === null
                          ? !["за рецептом", "за смаком"].includes(item.unit)
                          : !Number.isFinite(item.quantity) ||
                            item.quantity <= 0),
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
              )
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
          {activeKind === "movie" && (
            <>
              <Field label="Знайти фільм за назвою">
                <input
                  value={movieQuery}
                  onChange={(e) => setMovieQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && movieQuery.trim()) {
                      e.preventDefault();
                      void load();
                    }
                  }}
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
                          provider: candidate.url.includes("wikipedia.org")
                            ? "Wikipedia"
                            : candidate.url.includes("wikidata.org")
                              ? "Wikidata"
                              : candidate.url.includes("tvmaze.com")
                                ? "TVMaze"
                                : "Вебсторінка",
                        })
                      }
                    >
                      <span>
                        {candidate.title}
                        {candidate.year ? ` (${candidate.year})` : ""}
                      </span>
                      {candidate.genres && <small>{candidate.genres}</small>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {activeKind === "recipe" ? (
            <>
              <Field label="Назва страви">
                <input
                  value={result.title}
                  onChange={(e) =>
                    setResult({ ...result, title: e.target.value })
                  }
                />
              </Field>
              <Field label="Опис або джерело">
                <input
                  value={result.description}
                  onChange={(e) =>
                    setResult({ ...result, description: e.target.value })
                  }
                />
              </Field>
              <div className="ingredients-head">
                <span>Інгредієнти ({selected.length})</span>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() =>
                    setIngredients(
                      ingredients.map((i) => ({
                        ...i,
                        selected: !selected.length,
                      })),
                    )
                  }
                >
                  {selected.length ? "Зняти всі" : "Вибрати всі"}
                </button>
              </div>
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
                                    category: groceryCatalogCategory(
                                      e.target.value,
                                    ),
                                  }
                                : v,
                            ),
                          )
                        }
                      />
                      {item.note && (
                        <small className="ingredient-note">
                          З джерела: {item.note}
                        </small>
                      )}
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
                            {[
                              "шт.",
                              "кг",
                              "г",
                              "л",
                              "мл",
                              "уп.",
                              "за рецептом",
                              "за смаком",
                            ].map((unit) => (
                              <option key={unit}>{unit}</option>
                            ))}
                          </select>
                        </div>
                        <small>{item.category}</small>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <Field label="Назва">
                <input
                  value={result.title}
                  onChange={(e) =>
                    setResult({ ...result, title: e.target.value })
                  }
                />
              </Field>
              {result.image_url && (
                <div className="import-preview-image">
                  <img src={result.image_url} alt={result.title} />
                </div>
              )}
              {result.price !== null && (
                <Field label="Ціна, ₴">
                  <input
                    type="number"
                    value={result.price}
                    onChange={(e) =>
                      setResult({
                        ...result,
                        price: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </Field>
              )}
              <Field label="Опис">
                <textarea
                  rows={4}
                  value={result.description}
                  onChange={(e) =>
                    setResult({ ...result, description: e.target.value })
                  }
                />
              </Field>
            </>
          )}
          {result.source_url && (
            <a
              href={result.source_url}
              target="_blank"
              rel="noreferrer"
              className="source-link"
            >
              Відкрити джерело <ExternalLink size={14} />
            </a>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
