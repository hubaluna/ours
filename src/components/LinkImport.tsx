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
    [text, setText] = useState(""),
    [paste, setPaste] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<LinkMetadata | null>(null),
    [ingredients, setIngredients] = useState<
      (NewShopping & { selected: boolean })[]
    >([]);
  const receive = (value: LinkMetadata) => {
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
        body: { url, kind },
      });
      if (error || !data?.data) throw new Error();
      receive(data.data);
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
      title={kind === "recipe" ? "Покупки з рецепта" : "Додати з посилання"}
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
          <Button busy={busy} disabled={!url} onClick={() => void load()}>
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
          <div className="import-success">
            <Check size={17} />
            {result.provider}
          </div>
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
                              i === index ? { ...v, name: e.target.value } : v,
                            ),
                          )
                        }
                      />
                      <input
                        aria-label={`Кількість ${index + 1}`}
                        type="number"
                        min="0.01"
                        step="any"
                        value={item.quantity}
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
                              i === index ? { ...v, unit: e.target.value } : v,
                            ),
                          )
                        }
                      >
                        {["шт.", "кг", "г", "л", "мл", "уп."].map((unit) => (
                          <option key={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
              <Button
                busy={pending.includes("recipe")}
                disabled={
                  !selected.length ||
                  selected.some(
                    (i) =>
                      !i.name.trim() ||
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
            </>
          ) : (
            <>
              <Field label="Короткий опис">
                <textarea
                  rows={4}
                  value={result.description}
                  maxLength={1000}
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
              <Button onClick={() => onResult?.(result)}>
                Перевірити й зберегти <ArrowRight size={17} />
              </Button>
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
