import { useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Movie, NewMovie } from "../lib/types";
import { useApp } from "../hooks/AppContext";
import { BottomSheet, Button, ConfirmDelete, Field } from "./ui";
import { publicUrl } from "../../supabase/functions/_shared/urls";
import { movieSynopsis } from "../../supabase/functions/_shared/movie-synopsis";

export function MovieForm({
  movie,
  initial,
  onClose,
}: {
  movie?: Movie;
  initial?: Partial<NewMovie>;
  onClose: () => void;
}) {
  const { addMovie, update, remove, pending } = useApp();
  const seed = movie ?? initial;
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Movie["status"]>(seed?.status ?? "planned");
  const [description, setDescription] = useState(movieSynopsis(seed?.description ?? ""));
  const [url, setUrl] = useState(seed?.url ?? "");
  const [poster, setPoster] = useState(seed?.poster_url ?? "");

  const hasSecondaryData = Boolean(
    seed?.description || seed?.url || seed?.poster_url,
  );
  const [moreOpen, setMoreOpen] = useState(hasSecondaryData);

  const normalizeWebUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title")).trim();
    const rawUrl = (f.get("url") !== null ? String(f.get("url")) : url).trim();
    const rawPoster = (f.get("poster") !== null ? String(f.get("poster")) : poster).trim();
    const cleanUrl = rawUrl ? normalizeWebUrl(rawUrl) : "";
    const cleanPoster = rawPoster ? normalizeWebUrl(rawPoster) : "";
    const cleanDesc = (f.get("description") !== null ? String(f.get("description")) : description).trim();
    const year = String(f.get("year") ?? "");

    if (!title || (cleanUrl && !publicUrl(cleanUrl)) || (cleanPoster && !publicUrl(cleanPoster))) {
      setError("Перевірте назву та HTTPS-посилання.");
      return;
    }
    const parsedYear = year.trim() ? Number(year.trim()) : null;
    const rawRating = status === "watched" ? Number(f.get("rating")) : null;
    if (
      (parsedYear !== null &&
        (!Number.isInteger(parsedYear) || parsedYear < 1888 || parsedYear > 2200)) ||
      (rawRating !== null &&
        (!Number.isInteger(rawRating) || rawRating < 1 || rawRating > 10))
    ) {
      setError("Перевірте рік та оцінку (від 1 до 10).");
      return;
    }
    const value: NewMovie = {
      title,
      url: cleanUrl,
      poster_url: cleanPoster,
      year: parsedYear,
      genres: String(f.get("genres") ?? ""),
      description: movieSynopsis(cleanDesc),
      status: String(f.get("status")) as Movie["status"],
      rating: rawRating,
      metadata_url: seed?.metadata_url ?? "",
    };
    const ok = movie
      ? await update("movies", movie.id, value, "Фільм оновлено")
      : await addMovie(value);
    if (ok) onClose();
  };

  return (
    <BottomSheet
      title={movie ? "Фільм для нас" : "Що подивимось?"}
      onClose={onClose}
    >
      <form className="form is-entry-sheet" onSubmit={submit}>
        <Field label="Назва">
          <input
            data-autofocus
            name="title"
            required
            maxLength={160}
            defaultValue={seed?.title}
            placeholder="Назва фільму"
          />
        </Field>
        <div className="form-grid">
          <Field label="Статус">
            <select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as Movie["status"])}
            >
              <option value="planned">Хочемо подивитись</option>
              <option value="watched">Переглянули</option>
            </select>
          </Field>
          <Field label="Рік">
            <input
              name="year"
              type="number"
              inputMode="numeric"
              min={1888}
              max={2200}
              defaultValue={seed?.year ?? ""}
              placeholder="Рік випуску"
            />
          </Field>
        </div>

        {status === "watched" ? (
          <div className="form-grid">
            <Field label="Оцінка від 1 до 10">
              <input
                name="rating"
                type="number"
                min={1}
                max={10}
                step={1}
                required
                defaultValue={seed?.rating ?? ""}
                placeholder="1–10"
              />
            </Field>
            <Field label="Жанр">
              <input
                name="genres"
                maxLength={300}
                defaultValue={seed?.genres}
                placeholder="Фантастика, драма…"
              />
            </Field>
          </div>
        ) : (
          <Field label="Жанр">
            <input
              name="genres"
              maxLength={300}
              defaultValue={seed?.genres}
              placeholder="Фантастика, драма…"
            />
          </Field>
        )}

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
                    description.trim() ? "Є опис" : null,
                    url.trim() ? "Є трейлер" : null,
                    poster.trim() ? "Є постер" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Опис, трейлер, постер"}
                </span>
              )}
            </span>
            {moreOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {moreOpen && (
            <div className="entry-sheet-more-body">
              <Field label="Опис">
                <textarea
                  name="description"
                  rows={2}
                  maxLength={650}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Короткий сюжет або чому варто глянути…"
                />
              </Field>
              <Field label="Фільм або трейлер">
                <input
                  type="url"
                  name="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Посилання на постер">
                <input
                  type="url"
                  name="poster"
                  value={poster}
                  onChange={(e) => setPoster(e.target.value)}
                  placeholder="https://…"
                />
              </Field>
            </div>
          )}
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="budget-sheet-sticky-actions is-compact-row">
          <Button
            type="submit"
            busy={pending.includes(movie?.id ?? "add-movie")}
          >
            Зберегти фільм
          </Button>
        </div>
      </form>
      {movie && (
        <ConfirmDelete
          busy={pending.includes(movie.id)}
          onConfirm={async () => {
            if (await remove("movies", movie.id)) onClose();
          }}
        />
      )}
    </BottomSheet>
  );
}
