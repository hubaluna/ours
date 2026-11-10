import { useState, type FormEvent } from "react";
import type { Movie, NewMovie } from "../lib/types";
import { useApp } from "../hooks/AppContext";
import { BottomSheet, Button, ConfirmDelete, Field } from "./ui";
import { publicUrl } from "../../supabase/functions/_shared/urls";
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
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title")).trim(),
      url = String(f.get("url")),
      poster = String(f.get("poster")),
      year = String(f.get("year"));
    if (!title || (url && !publicUrl(url)) || (poster && !publicUrl(poster))) {
      setError("Перевірте назву та HTTPS-посилання.");
      return;
    }
    const value: NewMovie = {
      title,
      url,
      poster_url: poster,
      year: year ? Number(year) : null,
      genres: String(f.get("genres")),
      description: String(f.get("description")),
      status: String(f.get("status")) as Movie["status"],
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
      <form className="form" onSubmit={submit}>
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
          <Field label="Рік">
            <input
              name="year"
              type="number"
              inputMode="numeric"
              min={1888}
              max={2200}
              defaultValue={seed?.year ?? ""}
            />
          </Field>
          <Field label="Статус">
            <select name="status" defaultValue={seed?.status ?? "planned"}>
              <option value="planned">Хочемо подивитись</option>
              <option value="watched">Переглянули</option>
            </select>
          </Field>
        </div>
        <Field label="Жанр">
          <input
            name="genres"
            maxLength={300}
            defaultValue={seed?.genres}
            placeholder="Фантастика, драма…"
          />
        </Field>
        <Field label="Опис">
          <textarea
            name="description"
            rows={4}
            maxLength={2000}
            defaultValue={seed?.description}
          />
        </Field>
        <Field label="Фільм або трейлер">
          <input
            type="url"
            name="url"
            defaultValue={seed?.url}
            placeholder="https://…"
          />
        </Field>
        <Field label="Посилання на постер">
          <input
            type="url"
            name="poster"
            defaultValue={seed?.poster_url}
            placeholder="https://…"
          />
        </Field>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" busy={pending.includes(movie?.id ?? "add-movie")}>
          Зберегти фільм
        </Button>
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
