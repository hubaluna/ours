import { useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  Check,
  ChevronRight,
  Film,
  Link2,
  Pencil,
  Play,
  Star,
} from "lucide-react";
import { useApp } from "../hooks/AppContext";
import type { Movie, NewMovie } from "../lib/types";
import { publicUrl } from "../../supabase/functions/_shared/urls";
import type { LinkMetadata } from "../../supabase/functions/_shared/metadata";
import {
  BottomSheet,
  Button,
  EmptyState,
  IconButton,
  Segmented,
} from "../components/ui";
import {
  AddButton,
  BrandArt,
  PagedList,
  ScreenHeader,
} from "../components/Compact";
import { MovieForm } from "../components/MovieForm";
import { movieSynopsis } from "../../supabase/functions/_shared/movie-synopsis";
import { LinkImport } from "../components/LinkImportLoader";
export function Poster({ url, title }: { url: string; title: string }) {
  const [failedUrl, setFailedUrl] = useState("");
  return (
    <span className="media-thumb">
      {url && url !== failedUrl && publicUrl(url) ? (
        <img
          src={url}
          alt={title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <BrandArt />
      )}
    </span>
  );
}
export default function Movies() {
  const { data, update, pending } = useApp();
  const [view, setView] = useState("planned"),
    [detail, setDetail] = useState<Movie | null>(null),
    [form, setForm] = useState<Movie | "new" | null>(null),
    [initial, setInitial] = useState<Partial<NewMovie>>(),
    [ratingMovie, setRatingMovie] = useState<Movie | null>(null),
    [rating, setRating] = useState<number | null>(null),
    [importing, setImporting] = useState(false);
  const movies = data.movies.filter((m) => m.status === view);
  const receive = (r: LinkMetadata) => {
    setInitial({
      title: r.title,
      url: r.source_url,
      poster_url: r.image_url,
      year: r.year,
      genres: r.genres.join(", "),
      description: movieSynopsis(r.description),
      status: "planned",
      metadata_url: r.metadata_url ?? "",
    });
    setImporting(false);
    setForm("new");
  };
  return (
    <section className="screen">
      <ScreenHeader title="Кіно" subtitle="Зберігаємо хороші вечори">
        <IconButton label="Імпорт фільму" onClick={() => setImporting(true)}>
          <Link2 size={19} />
        </IconButton>
        <AddButton
          label="Додати фільм"
          onClick={() => {
            setInitial(undefined);
            setForm("new");
          }}
        />
      </ScreenHeader>
      <Segmented
        id="movies-view"
        value={view}
        onChange={setView}
        options={[
          { id: "planned", label: "Хочемо подивитись" },
          { id: "watched", label: "Переглянули" },
        ]}
      />
      <div className="screen-panel media-panel">
        <PagedList
          key={view}
          items={movies}
          rowHeight={112}
          empty={
            <EmptyState
              title={
                view === "planned"
                  ? "Що подивимось разом?"
                  : "Хороші вечори ще попереду"
              }
              description="Додайте фільм або посилання на трейлер."
            />
          }
          render={(movie) => (
            <button
              className="media-row movie-row"
              key={movie.id}
              onClick={() => setDetail(movie)}
            >
              <Poster url={movie.poster_url} title={movie.title} />
              <div>
                <span className="row-kicker">
                  <Film size={12} />
                  {movie.year ?? "Рік не вказаний"}
                </span>
                <h2>{movie.title}</h2>
                <p>{movie.genres || "Жанр не вказаний"}</p>
                {movie.rating != null && (
                  <small className="movie-rating">
                    <Star size={12} />
                    {movie.rating}/10
                  </small>
                )}
              </div>
              <ChevronRight size={17} />
            </button>
          )}
        />
      </div>
      <AnimatePresence mode="wait">
        {ratingMovie ? (
          <BottomSheet
            key="movie-rating"
            title="Як вам фільм?"
            onClose={() => setRatingMovie(null)}
          >
            <div className="form">
              <div className="sheet-actions form-save">
                <Button
                  disabled={rating === null}
                  busy={pending.includes(ratingMovie.id)}
                  onClick={async () => {
                    if (
                      await update(
                        "movies",
                        ratingMovie.id,
                        { status: "watched", rating },
                        "Фільм переглянуто й оцінено",
                      )
                    )
                      setRatingMovie(null);
                  }}
                >
                  Зберегти оцінку
                </Button>
              </div>
              <p>{ratingMovie.title}</p>
              <fieldset className="rating-picker">
                <legend>Оцінка · від 1 до 10</legend>
                <div className="rating-control">
                  <input
                    type="range"
                    aria-label="Оцінка фільму"
                    aria-valuetext={rating === null ? "Не оцінено" : `${rating} з 10`}
                    min={1}
                    max={10}
                    step={1}
                    value={rating ?? 5}
                    onChange={(event) => setRating(Number(event.target.value))}
                  />
                  <output aria-live="polite">{rating ?? "—"}<small>/10</small></output>
                </div>
                <div className="rating-scale" aria-hidden="true">
                  <span>1</span><span>5</span><span>10</span>
                </div>
              </fieldset>
            </div>
          </BottomSheet>
        ) : form ? (
          <MovieForm
            key="movie-form"
            movie={form === "new" ? undefined : form}
            initial={initial}
            onClose={() => setForm(null)}
          />
        ) : importing ? (
          <LinkImport
            key="movie-import"
            kind="movie"
            onClose={() => setImporting(false)}
            onResult={receive}
          />
        ) : detail ? (
          <BottomSheet
            key="movie-detail"
            title={detail.title}
            onClose={() => setDetail(null)}
          >
            <div className="movie-detail">
              <Poster url={detail.poster_url} title={detail.title} />
              <p>
                {detail.year ?? "Рік не вказаний"} ·{" "}
                {detail.genres || "Жанр не вказаний"}
              </p>
              <p className="full-description">
                {movieSynopsis(detail.description) ||
                  "Можна додати кілька слів про цей фільм."}
              </p>
              {detail.rating != null && (
                <p className="movie-rating">
                  <Star size={16} />
                  {detail.rating}/10
                </p>
              )}
              {publicUrl(detail.metadata_url || "") && (
                <a
                  className="text-button source-credit"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={publicUrl(detail.metadata_url || "")}
                >
                  Опис і зображення · Wikipedia / джерело
                </a>
              )}
              {publicUrl(detail.url) && (
                <a
                  className="button secondary"
                  href={publicUrl(detail.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Play size={17} />
                  Відкрити фільм або трейлер
                </a>
              )}
              <Button
                busy={pending.includes(detail.id)}
                onClick={async () => {
                  if (detail.status === "planned") {
                    setRatingMovie(detail);
                    setRating(detail.rating ?? null);
                    setDetail(null);
                    return;
                  }
                  if (
                    await update(
                      "movies",
                      detail.id,
                      {
                        status: "planned",
                        rating: null,
                      },
                      "Список кіно оновлено",
                    )
                  )
                    setDetail(null);
                }}
              >
                <Check size={17} />
                {detail.status === "planned"
                  ? "Подивились"
                  : "Повернути до планів"}
              </Button>
              {detail.status === "watched" && (
                <Button
                  className="secondary"
                  onClick={() => {
                    setRatingMovie(detail);
                    setRating(detail.rating ?? null);
                    setDetail(null);
                  }}
                >
                  Змінити оцінку
                </Button>
              )}
              <Button
                className="ghost"
                onClick={() => {
                  setForm(detail);
                  setDetail(null);
                }}
              >
                <Pencil size={16} />
                Редагувати
              </Button>
            </div>
          </BottomSheet>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
