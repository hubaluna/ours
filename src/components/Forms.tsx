import { useRef, useState, type FormEvent } from "react";
import { Camera, Plus } from "lucide-react";
import { z } from "zod";
import { useApp } from "../hooks/AppContext";
import { uploadImage } from "../lib/supabase";
import {
  categories,
  eventCategories,
  type ShoppingItem,
  type Wish,
  type Plan,
} from "../lib/types";
import { kyivDate } from "../lib/utils";
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
    [category, setCategory] = useState(item?.category ?? "Інше"),
    [error, setError] = useState(""),
    [another, setAnother] = useState(false);
  const input = useRef<HTMLInputElement>(null);
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
      quantity: Number(f.get("quantity")),
      unit: String(f.get("unit")),
      category,
      price: price(String(f.get("price"))),
    };
    if (
      !Number.isFinite(value.quantity) ||
      value.quantity <= 0 ||
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
        setError("");
        input.current?.focus();
      } else onClose();
    }
  };
  return (
    <BottomSheet
      title={item ? "Трохи деталей" : "Що купуємо?"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="form">
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
                  setCategory(s.category);
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        <div className="form-grid">
          <Field label="Кількість">
            <input
              name="quantity"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="any"
              defaultValue={item?.quantity ?? 1}
              required
            />
          </Field>
          <Field label="Одиниці">
            <select name="unit" defaultValue={item?.unit ?? "шт."}>
              {["шт.", "кг", "г", "л", "мл", "уп."].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Категорія">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
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
        <Button
          type="submit"
          busy={pending.includes(item?.id ?? "add-shopping")}
        >
          <Plus size={18} />
          {item ? "Зберегти зміни" : "Додати до списку"}
        </Button>
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
}: {
  onClose: () => void;
  wish?: Wish;
}) {
  const { addWish, update, remove, pending, userId, coupleId } = useApp();
  const [error, setError] = useState(""),
    [uploading, setUploading] = useState(false),
    [image, setImage] = useState(wish?.image_path ?? null);
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
    if (url && !z.url({ protocol: /^https?$/ }).safeParse(url).success) {
      setError("Додайте повне посилання, що починається з https://");
      return;
    }
    const value = {
      name: parsed.data,
      price: price(String(f.get("price"))),
      url,
      priority: String(f.get("priority")),
      note: String(f.get("note")),
      image_path: image,
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
        <Field label="Назва">
          <input
            data-autofocus
            name="name"
            defaultValue={wish?.name}
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
              defaultValue={wish?.price ?? ""}
              placeholder="Необов’язково"
            />
          </Field>
          <Field label="Наскільки хочеться?">
            <select
              name="priority"
              defaultValue={wish?.priority ?? "Просто хочу"}
            >
              {["Просто хочу", "Дуже хочу", "Мрія"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Посилання на товар">
          <input
            name="url"
            type="url"
            defaultValue={wish?.url}
            placeholder="https://"
          />
        </Field>
        <Field label="Кілька слів">
          <textarea
            name="note"
            defaultValue={wish?.note}
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
        <Button
          type="submit"
          busy={uploading || pending.includes(wish?.id ?? "add-wish")}
        >
          {wish ? "Зберегти" : "Зберегти бажання"}
        </Button>
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
      location: String(f.get("location")),
      description: String(f.get("description")),
      category: String(f.get("category")),
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
      <form className="form" onSubmit={submit}>
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
        <Field label="Дата">
          <input
            name="date"
            type="date"
            required
            defaultValue={event?.date ?? date ?? kyivDate()}
          />
        </Field>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          Увесь день
        </label>
        {!allDay && (
          <Field label="Час · Київ">
            <input
              type="time"
              name="time"
              defaultValue={event?.time?.slice(0, 5) ?? "19:00"}
            />
          </Field>
        )}
        <Field label="Категорія">
          <select name="category" defaultValue={event?.category ?? "Побачення"}>
            {eventCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Місце">
          <input
            name="location"
            maxLength={300}
            defaultValue={event?.location}
            placeholder="Де зустрічаємось?"
          />
        </Field>
        <Field label="Деталі">
          <textarea
            name="description"
            maxLength={2000}
            defaultValue={event?.description}
            rows={2}
            placeholder="Усе, що хочеться пам’ятати"
          />
        </Field>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <Button type="submit" busy={pending.includes(event?.id ?? "add-event")}>
          {event ? "Зберегти зміни" : "Додати план"}
        </Button>
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
