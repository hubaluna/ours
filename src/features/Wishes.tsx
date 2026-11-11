import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  Gift,
  Link2,
  LockKeyhole,
  Pencil,
} from "lucide-react";
import type { Wish, NewWish } from "../lib/types";
import { useApp } from "../hooks/AppContext";
import { useImage } from "../hooks/useImage";
import { money, safeUrl } from "../lib/utils";
import { publicUrl } from "../../supabase/functions/_shared/urls";
import type { LinkMetadata } from "../../supabase/functions/_shared/metadata";
import {
  BottomSheet,
  Button,
  EmptyState,
  IconButton,
  Segmented,
} from "../components/ui";
import { WishForm } from "../components/Forms";
import {
  AddButton,
  BrandArt,
  PagedList,
  ScreenHeader,
} from "../components/Compact";
import { LinkImport } from "../components/LinkImportLoader";
function WishImage({ wish, eager = false }: { wish: Wish; eager?: boolean }) {
  const image = useImage(wish.image_path),
    [failedUrl, setFailedUrl] = useState("");
  const url = image || publicUrl(wish.image_url || "");
  return (
    <span className="media-thumb">
      {url && url !== failedUrl ? (
        <img
          src={url}
          alt={wish.name}
          referrerPolicy="no-referrer"
          loading={eager ? "eager" : "lazy"}
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <BrandArt />
      )}
    </span>
  );
}
export function GiftReservationControl({ wish }: { wish: Wish }) {
  const { data, userId, reserve, update, remove, pending } = useApp();
  if (wish.owner_id === userId) return null;
  const reservation = data.reservations.find((r) => r.wish_id === wish.id);
  return (
    <div className="reservation">
      <p className="privacy-note">
        <LockKeyhole size={14} />
        Цей план бачите тільки ви.
      </p>
      {reservation ? (
        <>
          <Button
            busy={pending.includes(reservation.id)}
            className="secondary"
            onClick={() =>
              void update("gift_reservations", reservation.id, {
                status:
                  reservation.status === "planned" ? "purchased" : "planned",
              })
            }
          >
            {reservation.status === "planned" ? (
              <Gift size={17} />
            ) : (
              <Check size={17} />
            )}{" "}
            {reservation.status === "planned"
              ? "Заплановано · позначити придбаним"
              : "Придбано"}
          </Button>
          <Button
            className="ghost"
            busy={pending.includes(reservation.id)}
            onClick={() => void remove("gift_reservations", reservation.id)}
          >
            Скасувати бронювання
          </Button>
        </>
      ) : (
        <Button
          className="secondary"
          busy={pending.includes(`reserve-${wish.id}`)}
          onClick={() => void reserve(wish.id)}
        >
          <Gift size={17} />
          Хочу подарувати
        </Button>
      )}
    </div>
  );
}
export default function Wishes() {
  const { data, userId } = useApp();
  const [view, setView] = useState("mine"),
    [detail, setDetail] = useState<Wish | null>(null),
    [form, setForm] = useState<Wish | "new" | null>(null),
    [initial, setInitial] = useState<Partial<NewWish>>(),
    [exporting, setExporting] = useState(false),
    [exportSelection, setExportSelection] = useState<string[]>([]),
    [printItems, setPrintItems] = useState<Wish[]>([]),
    [importing, setImporting] = useState(false);
  const wishes = data.wishes.filter(
    (w) =>
      !w.is_deleted &&
      (view === "mine"
        ? w.owner_id === userId
        : w.owner_id !== userId && !w.is_private),
  );
  useEffect(() => {
    if (!printItems.length) return;
    let cancelled = false;
    const afterPaint = () => {
      const images = Array.from(
        document.querySelectorAll<HTMLImageElement>(
          ".wishlist-print-sheet img",
        ),
      );
      const ready = Promise.all(
        images.map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), { once: true });
                window.setTimeout(resolve, 2500);
              }),
        ),
      );
      void ready.then(() => {
        if (!cancelled) window.print();
      });
    };
    const timer = window.setTimeout(afterPaint, 250);
    const finish = () => setPrintItems([]);
    window.addEventListener("afterprint", finish);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", finish);
    };
  }, [printItems]);
  const receive = (r: LinkMetadata) => {
    setInitial({
      name: r.title,
      url: r.source_url,
      image_url: r.image_url,
      image_path: null,
      note: r.description,
      price: r.currency === "UAH" ? r.price : null,
      priority: "Просто хочу",
    });
    setImporting(false);
    setForm("new");
  };
  return (
    <section className="screen">
      <ScreenHeader title="Бажання" subtitle="Невеликі підказки для радості">
        {view === "mine" && (
          <>
            {wishes.length > 0 && (
              <IconButton
                label="Експорт бажань у PDF"
                onClick={() => {
                  setExportSelection(wishes.map((wish) => wish.id));
                  setExporting(true);
                }}
              >
                <Download size={18} />
              </IconButton>
            )}
            <IconButton
              label="Імпорт бажання"
              onClick={() => setImporting(true)}
            >
              <Link2 size={19} />
            </IconButton>
            <AddButton
              label="Додати бажання"
              onClick={() => {
                setInitial(undefined);
                setForm("new");
              }}
            />
          </>
        )}
      </ScreenHeader>
      <Segmented
        id="wishes-view"
        value={view}
        onChange={setView}
        options={[
          { id: "mine", label: "Мої бажання" },
          { id: "partner", label: "Бажання партнера" },
        ]}
      />
      <div className="screen-panel media-panel">
        <PagedList
          key={view}
          items={wishes}
          rowHeight={102}
          empty={
            <EmptyState
              title={
                view === "mine"
                  ? "Додайте щось хороше"
                  : "Тут скоро з’являться підказки"
              }
              description={
                view === "mine"
                  ? "Посилання, фотографія чи просто маленька мрія."
                  : "Партнер ще не додав бажань."
              }
            />
          }
          render={(wish) => (
            <button
              className="media-row wish-row"
              key={wish.id}
              onClick={() => setDetail(wish)}
            >
              <WishImage wish={wish} />
              <div>
                <span className="row-kicker">{wish.priority}</span>
                {wish.is_private && (
                  <span className="private-wish-badge">
                    <LockKeyhole size={11} /> Лише я
                  </span>
                )}
                <h2>{wish.name}</h2>
                <p>
                  {wish.price !== null ? money(wish.price) : "Ціна не вказана"}
                </p>
              </div>
              <ChevronRight size={17} />
            </button>
          )}
        />
      </div>
      {printItems.length > 0 && (
        <section className="wishlist-print-sheet" aria-hidden="true">
          <h1>Бажання</h1>
          {printItems.map((wish) => (
            <article className="wishlist-print-item" key={wish.id}>
              <WishImage wish={wish} eager />
              <div>
                <h2>{wish.name}</h2>
                {wish.size && <p>Розмір / варіант: {wish.size}</p>}
                {wish.price !== null && <p>Ціна: {money(wish.price)}</p>}
                {safeUrl(wish.url) && (
                  <a href={safeUrl(wish.url)!}>{safeUrl(wish.url)}</a>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
      <AnimatePresence mode="wait">
        {exporting ? (
          <BottomSheet
            key="wish-export"
            title="Експорт у PDF"
            onClose={() => setExporting(false)}
          >
            <div className="wish-export">
              <p>Оберіть бажання, які додати. У вікні друку виберіть «Зберегти як PDF».</p>
              <div className="wish-export-actions">
                <button onClick={() => setExportSelection(wishes.map((wish) => wish.id))}>Обрати всі</button>
                <button onClick={() => setExportSelection([])}>Очистити вибір</button>
              </div>
              <div className="wish-export-list">
                {wishes.map((wish) => (
                  <label key={wish.id}>
                    <input
                      type="checkbox"
                      checked={exportSelection.includes(wish.id)}
                      onChange={(event) =>
                        setExportSelection((selected) =>
                          event.target.checked
                            ? [...selected, wish.id]
                            : selected.filter((id) => id !== wish.id),
                        )
                      }
                    />
                    <span>{wish.name}{wish.size ? ` · ${wish.size}` : ""}</span>
                  </label>
                ))}
              </div>
              <Button
                disabled={!exportSelection.length}
                onClick={() => {
                  setPrintItems(wishes.filter((wish) => exportSelection.includes(wish.id)));
                  setExporting(false);
                }}
              >
                Створити PDF · {exportSelection.length}
              </Button>
            </div>
          </BottomSheet>
        ) : form ? (
          <WishForm
            key="wish-form"
            wish={form === "new" ? undefined : form}
            initial={initial}
            onClose={() => setForm(null)}
          />
        ) : importing ? (
          <LinkImport
            key="wish-import"
            kind="wish"
            onClose={() => setImporting(false)}
            onResult={receive}
          />
        ) : detail ? (
          <BottomSheet
            key="wish-detail"
            title={detail.name}
            onClose={() => setDetail(null)}
          >
            <div className="wish-detail">
              <WishImage wish={detail} />
              <span className="badge">{detail.priority}</span>
              <strong className="detail-price">
                {detail.price !== null
                  ? money(detail.price)
                  : "Ціна не вказана"}
              </strong>
              <p className="full-description">
                {detail.note || "Маленька ідея для хорошої миті."}
              </p>
              <p className="subtle-note">
                Додано{" "}
                {new Intl.DateTimeFormat("uk-UA", {
                  day: "numeric",
                  month: "long",
                  timeZone: "Europe/Kyiv",
                }).format(new Date(detail.created_at))}
              </p>
              {safeUrl(detail.url) && (
                <a
                  className="button secondary"
                  href={safeUrl(detail.url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={17} />
                  Відкрити посилання
                </a>
              )}
              {detail.owner_id === userId ? (
                <Button
                  className="ghost"
                  aria-label={`Редагувати ${detail.name}`}
                  onClick={() => {
                    setForm(detail);
                    setDetail(null);
                  }}
                >
                  <Pencil size={16} />
                  Редагувати бажання
                </Button>
              ) : (
                <GiftReservationControl
                  wish={data.wishes.find((w) => w.id === detail.id) ?? detail}
                />
              )}
            </div>
          </BottomSheet>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
