import { useRef, useState, type FormEvent } from "react";
import { Camera, ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useApp } from "../hooks/AppContext";
import { uploadImage } from "../lib/supabase";
import {
  categories,
  type ShoppingItem,
  type Wish,
  type NewWish,
  type Plan,
} from "../lib/types";
import { kyivDate, safeUrl } from "../lib/utils";
import { groceryCategory } from "../../supabase/functions/_shared/grocery-category";
import {
  groceryCatalogCategory,
  groceryCatalogMatches,
} from "../lib/grocery-catalog";
import {
  hasBatchDelimiter,
  isBatchShoppingInput,
  parseBatchShoppingInput,
  sanitizeShoppingItemForDb,
  splitBatchTokens,
} from "../lib/shopping-parser";
import { quantityLabel } from "../lib/recipe-catalog";
import { publicUrl } from "../../supabase/functions/_shared/urls";
import { normalizeRecurrence, recurrenceOptions } from "../lib/recurrence";
import {
  COMMON_OCCASIONS,
  buildWishNote,
  parseWishOccasion,
} from "../lib/wishes";
import { BottomSheet, Button, ConfirmDelete, Field } from "./ui";
const validateText = (value: string, max = 160): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= max ? trimmed : null;
};
const textError = (value: string, max = 160) =>
  !value.trim() ? "Додайте назву." : `Не більше ${max} символів.`;
const normalizeWebUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};
const price = (value: string) => (value === "" ? null : Number(value));
export function ShoppingForm({
  onClose,
  item,
}: {
  onClose: () => void;
  item?: ShoppingItem;
}) {
  const { addShopping, addShoppingBatch, update, remove, pending, data } = useApp();
  const [name, setName] = useState(item?.name ?? ""),
    [manualCategory, setManualCategory] = useState<string | null>(null),
    [error, setError] = useState(""),
    [another, setAnother] = useState(false);
  const [unit, setUnit] = useState(item?.unit ?? "шт.");
  const input = useRef<HTMLInputElement>(null);

  const hasBatchSep = !item && hasBatchDelimiter(name);
  const rawTokens = hasBatchSep ? splitBatchTokens(name) : [];
  const batchItems = hasBatchSep ? parseBatchShoppingInput(name, unit) : [];
  const isBatch = !item && isBatchShoppingInput(name);
  const showBatchPreview = hasBatchSep && batchItems.length > 0;
  const trailingDelimiter = hasBatchSep && /[\n,;]\s*$/.test(name);
  const activeQuery = hasBatchSep
    ? trailingDelimiter
      ? ""
      : (rawTokens[rawTokens.length - 1] ?? "")
    : name;

  const removeBatchToken = (index: number) => {
    const remaining = rawTokens.filter((_, idx) => idx !== index);
    setName(remaining.join(", "));
    setError("");
    input.current?.focus();
  };

  const applySuggestion = (suggestedName: string, suggestedCategory?: string) => {
    if (hasBatchSep) {
      const prefix = trailingDelimiter ? rawTokens : rawTokens.slice(0, -1);
      setName([...prefix, suggestedName].join(", ") + ", ");
      setError("");
      input.current?.focus();
      return;
    }
    setName(suggestedName);
    setManualCategory(suggestedCategory ?? null);
  };

  const category =
    manualCategory ??
    (item?.name === name ? item.category : undefined) ??
    [...data.history, ...data.shopping].find(
      (value) =>
        value.name.trim().toLocaleLowerCase("uk") ===
        name.trim().toLocaleLowerCase("uk"),
    )?.category ??
    (name.trim() ? groceryCatalogCategory(name) : undefined) ??
    groceryCategory(name);
  const catalogSuggestions =
    item || !activeQuery.trim() ? [] : groceryCatalogMatches(activeQuery, 5);
  const catalogNames = new Set(
    catalogSuggestions.map((c) => c.name.toLocaleLowerCase("uk")),
  );
  const suggestions = [
    ...new Map(
      [...data.history, ...data.shopping].map((i) => [i.name.toLowerCase(), i]),
    ).values(),
  ]
    .filter(
      (i) =>
        activeQuery.trim().length > 0 &&
        i.name.toLowerCase().includes(activeQuery.trim().toLowerCase()) &&
        !catalogNames.has(i.name.toLocaleLowerCase("uk")),
    )
    .slice(0, 4);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isBatch && batchItems.length > 1) {
      const itemsToSave = batchItems.map((b) => ({
        name: b.name,
        quantity: b.quantity,
        unit: b.unit,
        category: manualCategory ?? b.category,
        price: null,
      }));
      const ok = await addShoppingBatch(itemsToSave, {
        skipPantryFilter: true,
      });
      if (ok) {
        if (another && !item) {
          setName("");
          setManualCategory(null);
          setError("");
          input.current?.focus();
        } else onClose();
      }
      return;
    }
    const singleFromBatch = hasBatchSep && batchItems.length === 1 ? batchItems[0] : null;
    const rawName = singleFromBatch ? singleFromBatch.name : name;
    const validatedName = validateText(rawName);
    if (!validatedName) {
      setError(textError(rawName));
      return;
    }
    const f = new FormData(e.currentTarget);
    const effectiveUnit = singleFromBatch ? singleFromBatch.unit : unit;
    const rawValue = {
      name: validatedName,
      quantity:
        singleFromBatch && singleFromBatch.quantity !== null
          ? singleFromBatch.quantity
          : ["за смаком", "за рецептом"].includes(effectiveUnit)
            ? null
            : Number(f.get("quantity")),
      unit: effectiveUnit,
      category: singleFromBatch
        ? (manualCategory ?? singleFromBatch.category)
        : category,
      price: price(String(f.get("price"))),
    };
    if (
      (rawValue.quantity !== null &&
        (!Number.isFinite(rawValue.quantity) || rawValue.quantity <= 0)) ||
      (rawValue.price !== null &&
        (!Number.isFinite(rawValue.price) || rawValue.price < 0))
    ) {
      setError("Перевірте кількість і ціну.");
      return;
    }
    const value = sanitizeShoppingItemForDb(rawValue);
    const ok = item
      ? await update("shopping_items", item.id, value, "Товар оновлено")
      : await addShopping(value);
    if (ok) {
      if (another && !item) {
        setName("");
        setManualCategory(null);
        setError("");
        input.current?.focus();
      } else onClose();
    }
  };
  if (item?.menu_key)
    return (
      <BottomSheet title="Продукт із меню" onClose={onClose}>
        <div className="form">
          <strong>
            {item.name} · {quantityLabel(item.quantity, item.unit)}
          </strong>
          <p>
            Кількість перераховується автоматично. Щоб її змінити, змініть
            порції страви в меню.
          </p>
          <Button
            onClick={async () => {
              if (await remove("shopping_items", item.id)) onClose();
            }}
          >
            Є вдома · прибрати з покупок
          </Button>
          <p className="subtle-note">
            Повернути прибрані продукти можна кнопкою в меню.
          </p>
        </div>
      </BottomSheet>
    );
  return (
    <BottomSheet
      title={item ? "Трохи деталей" : "Що купуємо?"}
      onClose={onClose}
    >
      {item && (
        <p className="shopping-added-by">
          Додано:{" "}
          {data.profiles.find((p) => p.id === item.added_by)?.name ?? "ми"}
        </p>
      )}
      <form onSubmit={submit} className="form">
        <div className="sheet-actions form-save">
          <Button
            type="submit"
            busy={
              pending.includes(item?.id ?? "add-shopping") ||
              (!item && pending.includes("add-shopping-batch"))
            }
          >
            <Plus size={18} />
            {item
              ? "Зберегти зміни"
              : isBatch && batchItems.length > 1
                ? `Додати ${batchItems.length} до списку`
                : "Додати до списку"}
          </Button>
        </div>
        <Field label="Назва товару">
          <input
            ref={input}
            data-autofocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setManualCategory(null);
            }}
            placeholder={
              item
                ? "Наприклад, вівсяне молоко"
                : "Молоко 1 л, яйця 10 шт, сир 200 г, авокадо"
            }
            required
            maxLength={320}
          />
        </Field>
        {catalogSuggestions.length > 0 && !item && (
          <div
            className="suggestions catalog-suggestions"
            aria-label="Товари з каталогу"
          >
            {catalogSuggestions.map((product) => (
              <button
                type="button"
                key={product.id}
                onClick={() => {
                  applySuggestion(product.name);
                  if (!hasBatchSep) {
                    setUnit(
                      product.unit === "шт"
                        ? "шт."
                        : product.unit === "уп"
                          ? "уп."
                          : product.unit,
                    );
                  }
                }}
              >
                <span>{product.name}</span>
                <small>{groceryCatalogCategory(product.name)}</small>
              </button>
            ))}
          </div>
        )}
        {suggestions.length > 0 && !item && (
          <div className="suggestions" aria-label="Недавні товари">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => applySuggestion(s.name, s.category)}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        {!item &&
          !showBatchPreview &&
          catalogSuggestions.length === 0 &&
          suggestions.length === 0 && (
            <p className="batch-hint">
              Кілька товарів — через кому, кількість і категорія визначаться самі
            </p>
          )}
        {showBatchPreview && (
          <div className="batch-preview" aria-label="Пакетний ввід покупок">
            <div className="batch-preview-title">
              <span>
                {batchItems.length > 1
                  ? `Пакетне додавання · ${batchItems.length} поз.`
                  : "Швидкий список через кому"}
              </span>
              <small>
                {trailingDelimiter
                  ? "допишіть наступний товар"
                  : batchItems.length > 1
                    ? "додадуться окремо"
                    : "поставте кому для ще одного"}
              </small>
            </div>
            <div className="batch-chips" role="list">
              {batchItems.map((b, idx) => (
                <span key={`${b.name}-${idx}`} className="batch-chip" role="listitem">
                  <span className="batch-chip-main">
                    <strong>{b.name}</strong>
                    {b.quantity !== null && (
                      <span className="batch-chip-qty">
                        {b.quantity} {b.unit}
                      </span>
                    )}
                    <span className="batch-chip-category">
                      {manualCategory ?? b.category}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="batch-chip-remove"
                    aria-label={`Прибрати ${b.name}`}
                    onClick={() => removeBatchToken(idx)}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        {name.trim() && !showBatchPreview && (
          <p className="category-hint">
            {category} ·{" "}
            {manualCategory ? "обрано вами" : "визначено автоматично"}
          </p>
        )}
        <details className="additional-fields" open={Boolean(item)}>
          <summary>Додатково</summary>
          <div className="form">
            <div className="form-grid">
              <Field label="Кількість">
                <input
                  name="quantity"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="any"
                  defaultValue={item?.quantity ?? 1}
                  required={!["за смаком", "за рецептом"].includes(unit)}
                  disabled={["за смаком", "за рецептом"].includes(unit)}
                />
              </Field>
              <Field label="Одиниці">
                <select
                  name="unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  {[
                    "шт.",
                    "кг",
                    "г",
                    "л",
                    "мл",
                    "уп.",
                    "пучок",
                    "порц",
                    "зубчик",
                    "за смаком",
                    "за рецептом",
                  ].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Категорія">
              <select
                value={manualCategory ?? "auto"}
                onChange={(e) =>
                  setManualCategory(
                    e.target.value === "auto" ? null : e.target.value,
                  )
                }
              >
                <option value="auto">Автоматично · {category}</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Приблизна ціна, ₴ · необов’язково">
              <input
                name="price"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                defaultValue={item?.price ?? ""}
                placeholder="0"
              />
            </Field>
          </div>
        </details>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!item && (
          <label className="inline-check">
            <input
              type="checkbox"
              checked={another}
              onChange={(e) => setAnother(e.target.checked)}
            />
            Додати ще один після збереження
          </label>
        )}
      </form>
      {item && (
        <ConfirmDelete
          busy={pending.includes(item.id)}
          onConfirm={async () => {
            if (await remove("shopping_items", item.id)) onClose();
          }}
        />
      )}
    </BottomSheet>
  );
}
export function WishForm({
  onClose,
  wish,
  initial,
}: {
  onClose: () => void;
  wish?: Wish;
  initial?: Partial<NewWish>;
}) {
  const { addWish, update, remove, pending, userId, coupleId } = useApp();
  const seed = wish ?? initial;
  const initialParsed = parseWishOccasion(seed?.note);
  const [error, setError] = useState(""),
    [uploading, setUploading] = useState(false),
    [image, setImage] = useState(seed?.image_path ?? null);
  const [occasion, setOccasion] = useState<string>(initialParsed.occasion ?? "");
  const [isCustomOccasion, setIsCustomOccasion] = useState<boolean>(
    Boolean(
      initialParsed.occasion &&
        !(COMMON_OCCASIONS as readonly string[]).includes(initialParsed.occasion),
    ),
  );
  const [customOccasion, setCustomOccasion] = useState<string>(
    initialParsed.occasion &&
      !(COMMON_OCCASIONS as readonly string[]).includes(initialParsed.occasion)
      ? initialParsed.occasion
      : "",
  );
  const [url, setUrl] = useState<string>(seed?.url ?? "");
  const [size, setSize] = useState<string>(seed?.size ?? "");
  const [note, setNote] = useState<string>(initialParsed.cleanNote ?? "");
  const [isPrivate, setIsPrivate] = useState<boolean>(seed?.is_private ?? false);

  const hasSecondaryData = Boolean(
    seed?.url || seed?.size || seed?.is_private || initialParsed.cleanNote,
  );
  const [moreOpen, setMoreOpen] = useState(hasSecondaryData);

  const file = useRef<HTMLInputElement>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const rawName = String(f.get("name"));
    const validatedName = validateText(rawName);
    if (!validatedName) {
      setError(textError(rawName));
      return;
    }
    const cleanUrlRaw = (f.get("url") !== null ? String(f.get("url")) : url).trim();
    const cleanUrl = cleanUrlRaw ? normalizeWebUrl(cleanUrlRaw) : "";
    const cleanSize = (f.get("size") !== null ? String(f.get("size")) : size).trim();
    if (cleanUrl && !safeUrl(cleanUrl)) {
      setError("Додайте повне посилання, що починається з https://");
      return;
    }
    if (cleanSize.length > 120) {
      setError("Розмір або варіант має бути до 120 символів.");
      return;
    }
    const parsedPrice = price(String(f.get("price") ?? "").trim());
    if (
      parsedPrice !== null &&
      (!Number.isFinite(parsedPrice) || parsedPrice < 0)
    ) {
      setError("Перевірте ціну.");
      return;
    }
    const selectedOcc = isCustomOccasion
      ? customOccasion.trim()
      : occasion.trim();
    const cleanNoteText = (f.get("note") !== null ? String(f.get("note")) : note).trim();
    const finalNote = buildWishNote(selectedOcc || null, cleanNoteText);
    const privateValue =
      f.get("is_private") !== null
        ? f.get("is_private") === "on"
        : isPrivate;
    const value = {
      name: validatedName,
      price: parsedPrice,
      url: cleanUrl,
      priority: String(f.get("priority")),
      note: finalNote,
      size: cleanSize,
      image_path: image,
      image_url: seed?.image_url ?? "",
      is_private: privateValue,
    };
    const ok = wish
      ? await update("wishes", wish.id, value, "Бажання збережено")
      : await addWish(value);
    if (ok) onClose();
  };
  return (
    <BottomSheet
      title={wish ? "Моє бажання" : "Ще одна хороша ідея"}
      onClose={onClose}
    >
      <form className="form is-entry-sheet" onSubmit={submit}>
        <Field label="Назва">
          <input
            data-autofocus
            name="name"
            defaultValue={seed?.name}
            required
            maxLength={160}
            placeholder="Про що мрієте?"
          />
        </Field>
        <div className="form-grid">
          <Field label="Ціна, ₴">
            <input
              name="price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              defaultValue={seed?.price ?? ""}
              placeholder="Необов’язково"
            />
          </Field>
          <Field label="Наскільки хочеться?">
            <select
              name="priority"
              defaultValue={seed?.priority ?? "Просто хочу"}
            >
              {["Просто хочу", "Дуже хочу", "Мрія"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="field">
          <label className="field-label">До якого свята або приводу?</label>
          <div
            className="wish-occasion-chips is-compact"
            role="radiogroup"
            aria-label="Привід"
          >
            <button
              type="button"
              className={`wish-occasion-chip${!occasion && !isCustomOccasion ? " selected" : ""}`}
              onClick={() => {
                setOccasion("");
                setIsCustomOccasion(false);
              }}
            >
              Без приводу
            </button>
            {COMMON_OCCASIONS.map((occ) => (
              <button
                type="button"
                key={occ}
                className={`wish-occasion-chip${occasion === occ && !isCustomOccasion ? " selected" : ""}`}
                onClick={() => {
                  setOccasion(occ);
                  setIsCustomOccasion(false);
                }}
              >
                {occ}
              </button>
            ))}
            <button
              type="button"
              className={`wish-occasion-chip${isCustomOccasion ? " selected" : ""}`}
              onClick={() => {
                setIsCustomOccasion(true);
                if (
                  !customOccasion &&
                  occasion &&
                  !(COMMON_OCCASIONS as readonly string[]).includes(occasion)
                ) {
                  setCustomOccasion(occasion);
                }
              }}
            >
              + Інший привід
            </button>
          </div>
          {isCustomOccasion && (
            <input
              type="text"
              className="wish-custom-occasion-input"
              placeholder="Наприклад: Новосілля, Випускний, Весілля…"
              value={customOccasion}
              maxLength={60}
              onChange={(e) => setCustomOccasion(e.target.value)}
              autoFocus
            />
          )}
        </div>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          ref={file}
          onChange={async (e) => {
            const selected = e.target.files?.[0];
            if (!selected) return;
            setUploading(true);
            try {
              setImage(await uploadImage(selected, userId, coupleId!));
              setError("");
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Не вдалося завантажити фото.",
              );
            } finally {
              setUploading(false);
            }
          }}
        />
        <div className="compact-photo-row">
          <button
            type="button"
            className="compact-photo-btn"
            disabled={uploading}
            onClick={() => file.current?.click()}
          >
            <Camera size={15} />
            <span>{image ? "Змінити фото" : "Додати фото"}</span>
          </button>
          {image && (
            <div className="compact-photo-thumb-wrap">
              <span>📷 Фото додано</span>
              <button
                type="button"
                className="compact-photo-remove"
                onClick={() => setImage(null)}
                title="Прибрати фото"
                aria-label="Прибрати фото"
              >
                ✕
              </button>
            </div>
          )}
        </div>
        <div className="entry-sheet-more">
          <button
            type="button"
            className={`entry-sheet-more-toggle ${moreOpen ? "is-open" : ""}`}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <span className="entry-sheet-more-label">
              <strong>Ще деталі</strong>
              {!moreOpen && (
                <span className="entry-sheet-more-summary">
                  {[
                    isPrivate ? "Лише для мене" : "Спільне",
                    size.trim() ? `Розмір: ${size}` : null,
                    url.trim() ? "Є посилання" : null,
                    note.trim() ? "Є примітка" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </span>
            {moreOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {moreOpen && (
            <div className="entry-sheet-more-body">
              <Field label="Посилання на товар">
                <input
                  name="url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://"
                />
              </Field>
              <Field label="Розмір / варіант">
                <input
                  name="size"
                  maxLength={120}
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder="Наприклад, M, 38 або 250 мл"
                />
              </Field>
              <Field label="Кілька слів">
                <textarea
                  name="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  placeholder="Колір, розмір або маленька підказка…"
                  rows={2}
                />
              </Field>
              <label className="private-wish-setting is-compact">
                <input
                  type="checkbox"
                  name="is_private"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                />
                <span>
                  <strong>Лише для мене</strong>
                  <small>Партнер не побачить це бажання.</small>
                </span>
              </label>
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="budget-sheet-sticky-actions is-compact-row">
          <Button
            type="submit"
            busy={uploading || pending.includes(wish?.id ?? "add-wish")}
          >
            {wish ? "Зберегти" : "Зберегти бажання"}
          </Button>
        </div>
      </form>
      {wish && (
        <ConfirmDelete
          busy={pending.includes(wish.id)}
          onConfirm={async () => {
            if (await remove("wishes", wish.id)) onClose();
          }}
        />
      )}
    </BottomSheet>
  );
}
export function EventForm({
  onClose,
  event,
  date,
}: {
  onClose: () => void;
  event?: Plan;
  date?: string;
}) {
  const { addEvent, update, remove, pending } = useApp();
  const [allDay, setAllDay] = useState(event?.all_day ?? false),
    [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const url = String(f.get("url") ?? "").trim();
    if (url && !publicUrl(url)) {
      setError("Посилання має бути публічним HTTPS-адресом.");
      return;
    }
    const rawTitle = String(f.get("title"));
    const validatedTitle = validateText(rawTitle);
    if (!validatedTitle) {
      setError(textError(rawTitle));
      return;
    }
    const value = {
      title: validatedTitle,
      date: String(f.get("date")),
      time: allDay ? null : String(f.get("time")) || null,
      all_day: allDay,
      location: event?.location ?? "",
      url,
      description: String(f.get("description")),
      category: event?.category ?? "Побачення",
      recurrence: normalizeRecurrence(String(f.get("recurrence") ?? "none")),
    };
    const ok = event
      ? await update("events", event.id, value, "План оновлено")
      : await addEvent(value);
    if (ok) onClose();
  };
  return (
    <BottomSheet
      title={event ? "Ваш маленький план" : "Заплануємо щось хороше"}
      onClose={onClose}
    >
      <form className="form event-form is-entry-sheet" onSubmit={submit}>
        <Field label="Назва">
          <input
            data-autofocus
            name="title"
            required
            maxLength={160}
            defaultValue={event?.title}
            placeholder="Наприклад, вечеря вдвох"
          />
        </Field>
        <div className="form-grid event-datetime">
          <Field label="Дата">
            <input
              name="date"
              type="date"
              required
              defaultValue={event?.date ?? date ?? kyivDate()}
            />
          </Field>
          {!allDay && (
            <Field label="Час · Київ">
              <input
                type="time"
                name="time"
                defaultValue={event?.time?.slice(0, 5) ?? "19:00"}
              />
            </Field>
          )}
        </div>
        <div className="event-row-options">
          <label className="inline-check event-allday-check">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            Увесь день
          </label>
          <Field label="Повтор">
            <select
              name="recurrence"
              defaultValue={normalizeRecurrence(event?.recurrence)}
            >
              {recurrenceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Посилання · необов’язково">
          <input
            name="url"
            type="url"
            maxLength={2048}
            defaultValue={event?.url}
            placeholder="https://"
          />
        </Field>
        <details
          className="additional-fields"
          open={Boolean(event?.description)}
        >
          <summary>Довідково</summary>
          <div className="form">
            <Field label="Опис">
              <textarea
                name="description"
                maxLength={2000}
                defaultValue={event?.description}
                rows={2}
                placeholder="Усе, що хочеться пам’ятати"
              />
            </Field>
          </div>
        </details>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="budget-sheet-sticky-actions is-compact-row">
          <Button
            type="submit"
            busy={pending.includes(event?.id ?? "add-event")}
          >
            {event ? "Зберегти зміни" : "Додати план"}
          </Button>
        </div>
      </form>
      {event && (
        <ConfirmDelete
          busy={pending.includes(event.id)}
          onConfirm={async () => {
            if (await remove("events", event.id)) onClose();
          }}
        />
      )}
    </BottomSheet>
  );
}
