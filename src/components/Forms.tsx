import { useRef, useState, type FormEvent } from "react";
import { Camera, Plus } from "lucide-react";
import { z } from "zod";
import { useApp } from "../hooks/AppContext";
import { uploadImage } from "../lib/supabase";
import {
  categories,
  type ShoppingItem,
  type Wish,
  type NewWish,
  type Plan,
} from "../lib/types";
import { kyivDate } from "../lib/utils";
import { groceryCategory } from "../../supabase/functions/_shared/grocery-category";
import { quantityLabel } from "../lib/recipe-catalog";
import { publicUrl } from "../../supabase/functions/_shared/urls";
import { BottomSheet, Button, ConfirmDelete, Field } from "./ui";
const textSchema = z
  .string()
  .trim()
  .min(1, "Додайте назву.")
  .max(160, "Не більше 160 символів.");
const price = (value: string) => (value === "" ? null : Number(value));
export function ShoppingForm({
  onClose,
  item,
}: {
  onClose: () => void;
  item?: ShoppingItem;
}) {
  const { addShopping, update, remove, pending, data } = useApp();
  const [name, setName] = useState(item?.name ?? ""),
    [manualCategory, setManualCategory] = useState<string | null>(null),
    [error, setError] = useState(""),
    [another, setAnother] = useState(false);
  const [unit, setUnit] = useState(item?.unit ?? "шт.");
  const input = useRef<HTMLInputElement>(null);
  const category =
    manualCategory ??
    (item?.name === name ? item.category : undefined) ??
    [...data.history, ...data.shopping].find(
      (value) =>
        value.name.trim().toLocaleLowerCase("uk") ===
        name.trim().toLocaleLowerCase("uk"),
    )?.category ??
    groceryCategory(name);
  const suggestions = [
    ...new Map(
      [...data.history, ...data.shopping].map((i) => [i.name.toLowerCase(), i]),
    ).values(),
  ]
    .filter(
      (i) =>
        name.length > 0 && i.name.toLowerCase().includes(name.toLowerCase()),
    )
    .slice(0, 4);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = textSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    const f = new FormData(e.currentTarget);
    const value = {
      name: parsed.data,
      quantity: ["за смаком", "за рецептом"].includes(unit)
        ? null
        : Number(f.get("quantity")),
      unit,
      category,
      price: price(String(f.get("price"))),
    };
    if (
      (value.quantity !== null &&
        (!Number.isFinite(value.quantity) || value.quantity <= 0)) ||
      (value.price !== null &&
        (!Number.isFinite(value.price) || value.price < 0))
    ) {
      setError("Перевірте кількість і ціну.");
      return;
    }
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
            busy={pending.includes(item?.id ?? "add-shopping")}
          >
            <Plus size={18} />
            {item ? "Зберегти зміни" : "Додати до списку"}
          </Button>
        </div>
        <Field label="Назва товару">
          <input
            ref={input}
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Наприклад, вівсяне молоко"
            required
            maxLength={160}
          />
        </Field>
        {suggestions.length > 0 && !item && (
          <div className="suggestions">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => {
                  setName(s.name);
                  setManualCategory(s.category);
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        {name.trim() && (
          <p className="category-hint">
            {category} ·{" "}
            {manualCategory ? "обрано вами" : "визначено автоматично"}
          </p>
        )}
        <details className="additional-fields">
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
  const [error, setError] = useState(""),
    [uploading, setUploading] = useState(false),
    [image, setImage] = useState(seed?.image_path ?? null);
  const file = useRef<HTMLInputElement>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = textSchema.safeParse(String(f.get("name")));
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    const url = String(f.get("url"));
    const size = String(f.get("size") ?? "").trim();
    if (url && !z.url({ protocol: /^https?$/ }).safeParse(url).success) {
      setError("Додайте повне посилання, що починається з https://");
      return;
    }
    if (size.length > 120) {
      setError("Розмір або варіант має бути до 120 символів.");
      return;
    }
    const value = {
      name: parsed.data,
      price: price(String(f.get("price"))),
      url,
      priority: String(f.get("priority")),
      note: String(f.get("note")),
      size,
      image_path: image,
      image_url: seed?.image_url ?? "",
      is_private: f.get("is_private") === "on",
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
      <form className="form" onSubmit={submit}>
        <div className="sheet-actions form-save">
          <Button
            type="submit"
            busy={uploading || pending.includes(wish?.id ?? "add-wish")}
          >
            {wish ? "Зберегти" : "Зберегти бажання"}
          </Button>
        </div>
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
        <Button
          type="button"
          className="photo-upload"
          busy={uploading}
          onClick={() => file.current?.click()}
        >
          <Camera size={22} />
          {image ? "Фото додано · замінити" : "Додати фотографію"}
          <small>JPEG, PNG, WebP · до 12 МБ</small>
        </Button>
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
        <label className="private-wish-setting">
          <input
            type="checkbox"
            name="is_private"
            defaultChecked={seed?.is_private ?? false}
          />
          <span>
            <strong>Лише для мене</strong>
            <small>Партнер не побачить це бажання чи його фотографію.</small>
          </span>
        </label>
        <Field label="Посилання на товар">
          <input
            name="url"
            type="url"
            defaultValue={seed?.url}
            placeholder="https://"
          />
        </Field>
        <Field label="Розмір / варіант">
          <input
            name="size"
            maxLength={120}
            defaultValue={seed?.size ?? ""}
            placeholder="Наприклад, M, 38 або 250 мл"
          />
        </Field>
        <Field label="Кілька слів">
          <textarea
            name="note"
            defaultValue={seed?.note}
            maxLength={2000}
            placeholder="Колір, розмір або маленька підказка…"
            rows={3}
          />
        </Field>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
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
    const parsed = textSchema.safeParse(String(f.get("title")));
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    const value = {
      title: parsed.data,
      date: String(f.get("date")),
      time: allDay ? null : String(f.get("time")) || null,
      all_day: allDay,
      location: event?.location ?? "",
      url,
      description: String(f.get("description")),
      category: event?.category ?? "Побачення",
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
      <form className="form event-form" onSubmit={submit}>
        <div className="sheet-actions form-save">
          <Button
            type="submit"
            busy={pending.includes(event?.id ?? "add-event")}
          >
            {event ? "Зберегти зміни" : "Додати план"}
          </Button>
        </div>
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
        <label className="inline-check">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          Увесь день
        </label>
        <Field label="Посилання · необов’язково">
          <input
            name="url"
            type="url"
            maxLength={2048}
            defaultValue={event?.url}
            placeholder="https://"
          />
        </Field>
        <details className="additional-fields">
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
