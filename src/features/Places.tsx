import { useState, type FormEvent } from "react";
import { AnimatePresence } from "motion/react";
import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { useApp } from "../hooks/AppContext";
import type { NewPlace, Place } from "../lib/types";
import { publicUrl } from "../../supabase/functions/_shared/urls";
import { BottomSheet, Button, ConfirmDelete, EmptyState, Field } from "../components/ui";
import { AddButton, PagedList, ScreenHeader } from "../components/Compact";

const placeTypes: Place["type"][] = [
  "Кінотеатр",
  "Театр",
  "Музей",
  "Виставка",
  "Парк",
  "Зоопарк",
  "Інше",
];
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Kyiv",
  }).format(new Date(`${value}T12:00:00`));

export default function Places() {
  const { data, addPlace, update, remove, pending } = useApp();
  const [form, setForm] = useState<Place | "new" | null>(null);
  const [detail, setDetail] = useState<Place | null>(null);
  const [showDescription, setShowDescription] = useState(false);
  const [error, setError] = useState("");
  const places = [...data.places].sort(
    (a, b) =>
      (a.planned_date ?? "9999-12-31").localeCompare(
        b.planned_date ?? "9999-12-31",
      ) || a.title.localeCompare(b.title, "uk"),
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const title = String(values.get("title") ?? "").trim();
    const url = String(values.get("url") ?? "").trim();
    if (!title || title.length > 160 || (url && !publicUrl(url))) {
      setError("Перевірте назву та HTTPS-посилання.");
      return;
    }
    const value: NewPlace = {
      title,
      type: String(values.get("type")) as Place["type"],
      address: String(values.get("address") ?? "").trim(),
      url,
      planned_date: String(values.get("planned_date") ?? "") || null,
      description: String(values.get("description") ?? "").trim(),
    };
    const saved = form && form !== "new"
      ? await update("places", form.id, value, "Місце оновлено")
      : await addPlace(value);
    if (saved) setForm(null);
  };

  return (
    <section className="screen places-screen">
      <ScreenHeader title="Місця" subtitle="Куди хочеться разом">
        <AddButton label="Додати місце" onClick={() => setForm("new")} />
      </ScreenHeader>
      <div className="screen-panel">
        <PagedList
          items={places}
          rowHeight={68}
          empty={
            <EmptyState
              title="Збережімо місце для наступної пригоди"
              description="Кінотеатр, театр, музей, парк чи будь-яка інша адреса."
            />
          }
          render={(place) => (
            <button
              className="place-row"
              key={place.id}
              onClick={() => {
                setDetail(place);
                setShowDescription(false);
              }}
            >
              <span className="event-icon"><MapPin size={18} /></span>
              <span className="place-row-copy">
                <small>{place.type}{place.planned_date ? ` · ${dateLabel(place.planned_date)}` : ""}</small>
                <strong>{place.title}</strong>
                {place.address && <span>{place.address}</span>}
              </span>
            </button>
          )}
        />
      </div>
      <AnimatePresence mode="wait">
        {form ? (
          <BottomSheet
            key="place-form"
            title={form === "new" ? "Нове місце" : "Місце для нас"}
            onClose={() => setForm(null)}
          >
            <form className="form" onSubmit={(event) => void submit(event)}>
              <div className="sheet-actions form-save">
                <Button type="submit" busy={pending.includes(form === "new" ? "add-place" : form.id)}>
                  {form === "new" ? "Зберегти місце" : "Зберегти зміни"}
                </Button>
              </div>
              <Field label="Назва">
                <input name="title" required maxLength={160} defaultValue={form === "new" ? "" : form.title} placeholder="Наприклад, музей науки" />
              </Field>
              <Field label="Тип місця">
                <select name="type" defaultValue={form === "new" ? "Кінотеатр" : form.type}>
                  {placeTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              </Field>
              <Field label="Адреса">
                <input name="address" maxLength={300} defaultValue={form === "new" ? "" : form.address} placeholder="Вулиця, місто" />
              </Field>
              <div className="form-grid">
                <Field label="Коли хочемо піти">
                  <input name="planned_date" type="date" defaultValue={form === "new" ? "" : form.planned_date ?? ""} />
                </Field>
                <Field label="Посилання">
                  <input name="url" type="url" maxLength={2048} defaultValue={form === "new" ? "" : form.url} placeholder="https://" />
                </Field>
              </div>
              <Field label="Нотатка">
                <textarea name="description" maxLength={2000} rows={3} defaultValue={form === "new" ? "" : form.description} placeholder="Що хочеться тут побачити чи зробити?" />
              </Field>
              {error && <p role="alert" className="form-error">{error}</p>}
            </form>
            {form !== "new" && (
              <ConfirmDelete
                busy={pending.includes(form.id)}
                onConfirm={async () => {
                  if (await remove("places", form.id)) setForm(null);
                }}
              />
            )}
          </BottomSheet>
        ) : detail ? (
          <BottomSheet key="place-detail" title={detail.title} onClose={() => setDetail(null)}>
            <div className="place-detail">
              <span className="badge">{detail.type}</span>
              {detail.planned_date && <p><CalendarDays size={16} />{dateLabel(detail.planned_date)}</p>}
              {detail.address && <p><MapPin size={16} />{detail.address}</p>}
              {publicUrl(detail.url) && (
                <a className="button secondary" href={publicUrl(detail.url)!} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} />Відкрити посилання
                </a>
              )}
              {detail.description && (
                <>
                  <Button className="secondary" aria-expanded={showDescription} onClick={() => setShowDescription((open) => !open)}>
                    {showDescription ? "Сховати довідку" : "Довідково"}
                  </Button>
                  {showDescription && <p className="event-description-expanded">{detail.description}</p>}
                </>
              )}
              <Button onClick={() => { setForm(detail); setDetail(null); }}>Редагувати місце</Button>
            </div>
          </BottomSheet>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
