import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence } from "motion/react";
import { ExternalLink, Sprout, Trash2, Upload } from "lucide-react";
import { useApp } from "../hooks/AppContext";
import { useImage } from "../hooks/useImage";
import { supabase, uploadImage } from "../lib/supabase";
import { kyivDate, safeUrl } from "../lib/utils";
import { DEMO_COUPLE } from "../lib/demo";
import type { NewPlant, Plant } from "../lib/types";
import {
  BottomSheet,
  Button,
  EmptyState,
  Field,
  IconButton,
} from "../components/ui";
import { AddButton, PagedList, ScreenHeader } from "../components/Compact";

function daysUntilWatered(plant: Plant, today: string): number {
  const start = new Date(
    `${plant.last_watered_at.slice(0, 10)}T00:00:00Z`,
  ).getTime();
  const end = new Date(`${today}T00:00:00Z`).getTime();
  return plant.watering_interval_days - Math.floor((end - start) / 86_400_000);
}

function WaterStatus({ plant, today }: { plant: Plant; today: string }) {
  const days = daysUntilWatered(plant, today);
  if (days <= 0)
    return <strong className="plant-water-status due">Час поливу</strong>;
  if (days === 1)
    return (
      <strong className="plant-water-status">Полив орієнтовно завтра</strong>
    );
  return (
    <strong className="plant-water-status">
      Полив орієнтовно через {days} дн.
    </strong>
  );
}

function PlantPhoto({
  plant,
  large = false,
}: {
  plant: Pick<Plant, "name" | "image_path">;
  large?: boolean;
}) {
  const image = useImage(plant.image_path);
  return (
    <span className={`plant-photo${large ? " plant-photo-large" : ""}`}>
      {image ? (
        <img src={image} alt={plant.name} />
      ) : (
        <Sprout aria-hidden="true" />
      )}
    </span>
  );
}

function PlantForm({ onClose }: { onClose: () => void }) {
  const { addPlant, userId, coupleId, notify, pending } = useApp();
  const [photos, setPhotos] = useState<File[]>([]);
  const photo = photos[0] ?? null;
  const preview = useMemo(
    () => (photo ? URL.createObjectURL(photo) : ""),
    [photo],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const [saving, setSaving] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [recognitionNote, setRecognitionNote] = useState("");
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [interval, setInterval] = useState(7);
  const [light, setLight] = useState("");
  const [notes, setNotes] = useState("");
  const [infoUrl, setInfoUrl] = useState("");
  const [error, setError] = useState("");

  async function choosePhoto(files: File[]) {
    const selected = files.slice(0, 5);
    setPhotos(selected);
    setRecognitionNote("");
    if (!selected.length || !supabase) return;
    setRecognizing(true);
    try {
      const body = new FormData();
      for (const file of selected) body.append("images", file);
      const { data, error: reason } = await supabase.functions.invoke(
        "plant-identify",
        { body },
      );
      if (reason || !data?.recognized) {
        setRecognitionNote(
          "Не вдалося впевнено визначити вид. Вкажи назву й догляд самостійно.",
        );
        return;
      }
      setName((current) => current || String(data.name || ""));
      setSpecies(String(data.species || ""));
      setInterval((current) =>
        current === 7 ? Number(data.interval || 7) : current,
      );
      setLight((current) => current || String(data.light || ""));
      setNotes((current) => current || String(data.notes || ""));
      setInfoUrl((current) => current || String(data.info_url || ""));
      setRecognitionNote(
        "Вид визначено за фото. Перевір назву та підказки щодо поливу.",
      );
    } catch {
      setRecognitionNote(
        "Не вдалося розпізнати фото. Рослину можна додати вручну.",
      );
    } finally {
      setRecognizing(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!name.trim()) return setError("Додай назву рослини.");
    if (!photo) return setError("Додай фото рослини.");
    setSaving(true);
    setError("");
    try {
      const image_path = await uploadImage(
        photo,
        userId,
        coupleId ?? DEMO_COUPLE,
      );
      const value: NewPlant = {
        name: name.trim(),
        species: species.trim(),
        image_path,
        watering_interval_days: Math.max(1, Math.min(120, interval)),
        last_watered_at: String(form.get("lastWatered") ?? kyivDate()),
        light: light.trim(),
        watering_notes: notes.trim(),
        info_url: safeUrl(infoUrl)?.startsWith("https://")
          ? safeUrl(infoUrl)!
          : "",
      };
      if (await addPlant(value)) onClose();
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "Не вдалося зберегти рослину.";
      setError(message);
      notify(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet title="Додати рослину" onClose={onClose}>
      <form className="plant-form" onSubmit={(event) => void submit(event)}>
        <label className="plant-photo-picker">
          {preview ? (
            <img src={preview} alt="Фото для картки рослини" />
          ) : (
            <Upload size={21} />
          )}
          <span>
            {photos.length
              ? `Фото: ${photos.length} із 5`
              : "Додати 1–5 фото рослини"}
          </span>
          <input
            aria-label="Фото рослини"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) =>
              void choosePhoto(Array.from(event.target.files ?? []))
            }
          />
        </label>
        {recognizing && <p role="status">Розпізнаю рослину за фото…</p>}
        {recognitionNote && (
          <p role="status" className="plant-recognition-note">
            {recognitionNote}
          </p>
        )}
        <Field label="Назва рослини">
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Наприклад, кактус"
            maxLength={100}
            required
          />
        </Field>
        <details className="plant-extra-fields">
          <summary>Догляд та нагадування</summary>
          <div className="plant-form-extra">
            <Field label="Вид (необов’язково)">
              <input
                name="species"
                value={species}
                onChange={(event) => setSpecies(event.target.value)}
                placeholder="Заповнимо після розпізнавання"
                maxLength={120}
              />
            </Field>
            <div className="plant-form-row">
              <Field label="Інтервал перевірки, днів">
                <input
                  name="interval"
                  value={interval}
                  onChange={(event) => setInterval(Number(event.target.value))}
                  type="number"
                  min="1"
                  max="120"
                  required
                />
              </Field>
              <Field label="Останній полив">
                <input
                  name="lastWatered"
                  type="date"
                  defaultValue={kyivDate()}
                  required
                />
              </Field>
            </div>
            <Field label="Освітлення">
              <select
                name="light"
                value={light}
                onChange={(event) => setLight(event.target.value)}
              >
                <option value="">Поки не вказано</option>
                <option>Яскраве розсіяне світло</option>
                <option>Пряме сонце</option>
                <option>Півтінь</option>
                <option>Тінь</option>
              </select>
            </Field>
            <Field label="Коротко про полив">
              <textarea
                name="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Наприклад, дати ґрунту просохнути"
              />
            </Field>
            <Field label="Посилання на докладний догляд">
              <input
                name="url"
                value={infoUrl}
                onChange={(event) => setInfoUrl(event.target.value)}
                type="url"
                placeholder="https://…"
                maxLength={2048}
              />
            </Field>
          </div>
        </details>
        {error && (
          <p className="plant-form-error" role="alert">
            {error}
          </p>
        )}
        <Button
          type="submit"
          busy={saving || recognizing || pending.includes("add-plant")}
        >
          Зберегти рослину
        </Button>
      </form>
    </BottomSheet>
  );
}

function PlantDetails({
  plant,
  onClose,
}: {
  plant: Plant;
  onClose: () => void;
}) {
  const { updatePlant, removePlant, pending } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const today = kyivDate();
  const days = daysUntilWatered(plant, today);
  const url = safeUrl(plant.info_url);
  const water = async () => {
    if (await updatePlant(plant.id, { last_watered_at: today })) onClose();
  };
  return (
    <BottomSheet title={plant.name} onClose={onClose}>
      <div className="plant-details">
        <PlantPhoto plant={plant} large />
        {plant.species && <p className="plant-species">{plant.species}</p>}
        <div className="plant-detail-block">
          <span>Полив</span>
          <p>
            {days <= 0
              ? "Пора перевірити ґрунт. Якщо він сухий — полий рослину."
              : `Перевір ґрунт приблизно через ${days} дн.; інтервал зараз ${plant.watering_interval_days} дн.`}
          </p>
        </div>
        {plant.light && (
          <div className="plant-detail-block">
            <span>Світло</span>
            <p>{plant.light}</p>
          </div>
        )}
        {plant.watering_notes && (
          <div className="plant-detail-block">
            <span>Догляд</span>
            <p>{plant.watering_notes}</p>
          </div>
        )}
        <div className="plant-detail-actions">
          {url && (
            <a
              className="button ghost"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} /> Детальніше
            </a>
          )}
          {days <= 0 && (
            <Button
              onClick={() => void water()}
              busy={pending.includes(`plant-${plant.id}`)}
            >
              Полила сьогодні
            </Button>
          )}
          <IconButton
            label="Видалити рослину"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={18} />
          </IconButton>
        </div>
        {confirmDelete && (
          <div className="plant-delete-confirm" role="alert">
            <span>Видалити рослину?</span>
            <Button
              className="danger"
              busy={pending.includes(`plant-${plant.id}`)}
              onClick={() =>
                void removePlant(plant.id).then((ok) => ok && onClose())
              }
            >
              Видалити
            </Button>
            <Button className="ghost" onClick={() => setConfirmDelete(false)}>
              Скасувати
            </Button>
          </div>
        )}
        {!url && (
          <p className="plant-source-hint">
            Детальний довідник додамо разом із розпізнаванням виду.
          </p>
        )}
        <span className="sr-only" role="status">
          Інтервал поливу {plant.watering_interval_days} днів
        </span>
      </div>
    </BottomSheet>
  );
}

export default function Plants() {
  const { data, updatePlant, pending } = useApp();
  const [form, setForm] = useState(false);
  const [detail, setDetail] = useState<Plant | null>(null);
  const today = kyivDate();
  const plants = [...data.plants].sort(
    (a, b) => daysUntilWatered(a, today) - daysUntilWatered(b, today),
  );
  return (
    <section className="screen plants-screen">
      <ScreenHeader title="Рослини" subtitle="Догляд у своєму ритмі">
        <AddButton label="Додати рослину" onClick={() => setForm(true)} />
      </ScreenHeader>
      <div className="screen-panel plants-panel">
        {plants.length ? (
          <PagedList
            items={plants}
            render={(plant) => {
              const due = daysUntilWatered(plant, today) <= 0;
              return (
                <article
                  className={`plant-card card${due ? " plant-card-due" : ""}`}
                  key={plant.id}
                >
                  <button
                    className="plant-card-main"
                    onClick={() => setDetail(plant)}
                    aria-label={`Деталі рослини · ${plant.name}`}
                  >
                    <PlantPhoto plant={plant} />
                    <span className="plant-card-copy">
                      <strong>{plant.name}</strong>
                      {plant.species && <small>{plant.species}</small>}
                      <WaterStatus plant={plant} today={today} />
                    </span>
                  </button>
                  {due && (
                    <Button
                      className="plant-water-button"
                      busy={pending.includes(`plant-${plant.id}`)}
                      aria-label={`Відмітити полив · ${plant.name}`}
                      onClick={() =>
                        void updatePlant(plant.id, { last_watered_at: today })
                      }
                    >
                      Полила
                    </Button>
                  )}
                </article>
              );
            }}
          />
        ) : (
          <EmptyState
            title="Додай першу рослину"
            description="Фото, інтервал перевірки ґрунту й короткі підказки будуть в одному місці."
          >
            <Button onClick={() => setForm(true)}>Додати рослину</Button>
          </EmptyState>
        )}
      </div>
      <AnimatePresence>
        {form && <PlantForm onClose={() => setForm(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {detail && (
          <PlantDetails plant={detail} onClose={() => setDetail(null)} />
        )}
      </AnimatePresence>
    </section>
  );
}
