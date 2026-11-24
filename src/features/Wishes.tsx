import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  Gift,
  Link2,
  LockKeyhole,
  Pencil,
  RotateCcw,
  Share2,
} from "lucide-react";
import type { Wish, NewWish } from "../lib/types";
import { useApp } from "../hooks/AppContext";
import {
  getWishOccasion,
  getWishCleanNote,
  extractUniqueOccasions,
} from "../lib/wishes";
import {
  optimizeExternalImageUrl,
  recoverImage,
  useImage,
} from "../hooks/useImage";
import { money, safeUrl } from "../lib/utils";
import { publicUrl } from "../../supabase/functions/_shared/urls";
import type { LinkMetadata } from "../../supabase/functions/_shared/metadata";
import { supabase } from "../lib/supabase";
import { exportWishesPdf } from "../lib/wishes-pdf";
import {
  BottomSheet,
  Button,
  EmptyState,
  FilterSelect,
  IconButton,
  Segmented,
} from "../components/ui";
import { WishForm } from "../components/Forms";
import { WishlistShareSheet } from "../components/WishlistShareSheet";
import {
  AddButton,
  BrandArt,
  PagedList,
  ScreenHeader,
} from "../components/Compact";
import { LinkImport } from "../components/LinkImportLoader";

function WishImage({
  wish,
  eager = true,
  variant = "thumb",
}: {
  wish: Wish;
  eager?: boolean;
  variant?: "thumb" | "detail";
}) {
  const image = useImage(wish.image_path),
    [retriedPath, setRetriedPath] = useState<string | null>(null),
    [fallbackRawExt, setFallbackRawExt] = useState(""),
    [failedUrl, setFailedUrl] = useState("");
  const rawExternal = publicUrl(wish.image_url || "");
  const optimizedExternal = rawExternal
    ? optimizeExternalImageUrl(rawExternal, variant)
    : "";
  const externalUrl =
    fallbackRawExt === rawExternal || !optimizedExternal
      ? rawExternal
      : optimizedExternal;
  const url = image || externalUrl;
  return (
    <span className="media-thumb">
      {url && url !== failedUrl ? (
        <img
          src={url}
          alt={wish.name}
          referrerPolicy="no-referrer"
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => {
            if (image && wish.image_path && retriedPath !== wish.image_path) {
              setRetriedPath(wish.image_path);
              void recoverImage(wish.image_path).then((fresh) => {
                if (!fresh) setFailedUrl(url);
              });
              return;
            }
            if (!image && url !== rawExternal && rawExternal) {
              setFallbackRawExt(rawExternal);
              return;
            }
            setFailedUrl(url);
          }}
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

export default function Wishes({
  onOpenGuestWishlist,
}: {
  onOpenGuestWishlist?: (code: string) => void;
} = {}) {
  const { data, userId, toggleWishFulfilled, pending, notify } = useApp();
  const [view, setView] = useState("mine"),
    [sort, setSort] = useState<"newest" | "priority" | "price-asc" | "price-desc">("newest"),
    [showFulfilled, setShowFulfilled] = useState(false),
    [onlyReserved, setOnlyReserved] = useState(false),
    [occasionFilter, setOccasionFilter] = useState("all"),
    [detail, setDetail] = useState<Wish | null>(null),
    [form, setForm] = useState<Wish | "new" | null>(null),
    [initial, setInitial] = useState<Partial<NewWish>>(),
    [exporting, setExporting] = useState(false),
    [pdfBusy, setPdfBusy] = useState(false),
    [exportSelection, setExportSelection] = useState<string[]>([]),
    [printItems, setPrintItems] = useState<Wish[]>([]),
    [importing, setImporting] = useState(false),
    [sharing, setSharing] = useState(false);

  const priorityOrder: Record<string, number> = {
    "Мрія": 0,
    "Дуже хочу": 1,
    "Просто хочу": 2,
  };

  const ownAll = data.wishes.filter(
    (w) => !w.is_deleted && w.owner_id === userId,
  );
  const fulfilledCount = ownAll.filter((w) => w.fulfilled).length;
  const reservationByWish = new Map(
    data.reservations.map((r) => [r.wish_id, r]),
  );
  const partnerAll = data.wishes.filter(
    (w) => !w.is_deleted && w.owner_id !== userId && !w.is_private,
  );
  const reservedCount = partnerAll.filter((w) =>
    reservationByWish.has(w.id),
  ).length;

  const availableOccasions = extractUniqueOccasions(
    view === "mine" ? ownAll : partnerAll,
  );

  const wishes = (view === "mine" ? ownAll : partnerAll)
    .filter((w) => {
      if (view === "mine") {
        if (showFulfilled ? !w.fulfilled : w.fulfilled) return false;
      } else {
        if (onlyReserved && !reservationByWish.has(w.id)) return false;
        if (w.fulfilled) return false;
      }
      if (occasionFilter !== "all") {
        const occ = getWishOccasion(w);
        if (occasionFilter === "none") {
          if (occ) return false;
        } else if (occ !== occasionFilter) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "priority") {
        return (
          (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3) ||
          b.created_at.localeCompare(a.created_at)
        );
      }
      if (sort === "price-asc") {
        return (
          (a.price ?? Number.POSITIVE_INFINITY) -
            (b.price ?? Number.POSITIVE_INFINITY) ||
          b.created_at.localeCompare(a.created_at)
        );
      }
      if (sort === "price-desc") {
        return (
          (b.price ?? -1) - (a.price ?? -1) ||
          b.created_at.localeCompare(a.created_at)
        );
      }
      return b.created_at.localeCompare(a.created_at);
    });

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

  const handleExportPdf = async () => {
    const selected = wishes.filter((wish) => exportSelection.includes(wish.id));
    if (!selected.length) return;

    // In headless/jsdom environments where Canvas 2D is unavailable, keep print fallback.
    const testCanvas = document.createElement("canvas");
    const hasCanvas = Boolean(testCanvas.getContext?.("2d"));
    if (!hasCanvas) {
      setPrintItems(selected);
      setExporting(false);
      return;
    }

    setPdfBusy(true);
    try {
      const resolvedImages: Record<string, string> = {};
      await Promise.all(
        selected.map(async (wish) => {
          if (wish.image_path) {
            if (wish.image_path.startsWith("data:")) {
              resolvedImages[wish.id] = wish.image_path;
            } else if (
              !wish.image_path.startsWith("illustration:") &&
              supabase
            ) {
              const { data: signed } = await supabase.storage
                .from("photos")
                .createSignedUrl(wish.image_path, 300);
              if (signed?.signedUrl) resolvedImages[wish.id] = signed.signedUrl;
            }
          } else if (wish.image_url) {
            resolvedImages[wish.id] = publicUrl(wish.image_url);
          }
        }),
      );
      const me = data.profiles.find((p) => p.id === userId);
      const mode = await exportWishesPdf(selected, resolvedImages, me?.name);
      setExporting(false);
      notify(mode === "shared" ? "PDF-файл готовий" : "PDF-файл завантажено");
    } catch {
      setPrintItems(selected);
      setExporting(false);
    } finally {
      setPdfBusy(false);
    }
  };

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

  const liveDetail = detail
    ? (data.wishes.find((w) => w.id === detail.id) ?? detail)
    : null;

  return (
    <section className="screen">
      <ScreenHeader title="Бажання" subtitle="Невеликі підказки для радості">
        {view === "mine" && (
          <>
            {wishes.length > 0 && (
              <>
                <IconButton
                  label="Поділитися вішлістом з друзями"
                  onClick={() => setSharing(true)}
                >
                  <Share2 size={18} />
                </IconButton>
                <IconButton
                  label="Експорт бажань у PDF"
                  onClick={() => {
                    setExportSelection(wishes.map((wish) => wish.id));
                    setExporting(true);
                  }}
                >
                  <Download size={18} />
                </IconButton>
              </>
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
        onChange={(next) => {
          setView(next);
          setOccasionFilter("all");
          if (next === "mine") setOnlyReserved(false);
          else setShowFulfilled(false);
        }}
        options={[
          { id: "mine", label: "Мої бажання" },
          { id: "partner", label: "Бажання партнера" },
        ]}
      />
      <div className="filter-line wishes-filter-line">
        <FilterSelect
          label="Сортування бажань"
          value={sort}
          onChange={(val) =>
            setSort(
              val as "newest" | "priority" | "price-asc" | "price-desc",
            )
          }
          active={sort !== "newest"}
          icon={<ArrowUpDown size={13} />}
        >
          <option value="newest">Спочатку нові</option>
          <option value="priority">За силою бажання</option>
          <option value="price-asc">Дешевші спочатку</option>
          <option value="price-desc">Дорожчі спочатку</option>
        </FilterSelect>
        {availableOccasions.length > 0 && (
          <FilterSelect
            label="Фільтр за приводом"
            value={occasionFilter}
            onChange={setOccasionFilter}
            active={occasionFilter !== "all"}
            icon={<Gift size={13} />}
            className="wishes-occasion-pill"
          >
            <option value="all">Усі приводи</option>
            <option value="none">Без приводу</option>
            {availableOccasions.map((occ) => (
              <option key={occ} value={occ}>
                {occ}
              </option>
            ))}
          </FilterSelect>
        )}
        {view === "mine" && (fulfilledCount > 0 || showFulfilled) && (
          <button
            type="button"
            className={`wishes-filter-toggle${showFulfilled ? " active" : ""}`}
            aria-pressed={showFulfilled}
            onClick={() => setShowFulfilled((v) => !v)}
          >
            <CheckCircle2 size={14} />
            {showFulfilled
              ? `Виконані · ${fulfilledCount}`
              : `Виконані (${fulfilledCount})`}
          </button>
        )}
        {view === "partner" && (
          <button
            type="button"
            className={`wishes-filter-toggle${onlyReserved ? " active" : ""}`}
            aria-pressed={onlyReserved}
            onClick={() => setOnlyReserved((v) => !v)}
          >
            <Gift size={14} />
            Мої бронювання{reservedCount > 0 ? ` · ${reservedCount}` : ""}
          </button>
        )}
      </div>
      <div className="screen-panel media-panel">
        <PagedList
          key={`${view}-${sort}-${showFulfilled}-${onlyReserved}-${occasionFilter}`}
          items={wishes}
          empty={
            <EmptyState
              title={
                view === "mine"
                  ? showFulfilled
                    ? "Поки немає виконаних бажань"
                    : "Додайте щось хороше"
                  : onlyReserved
                    ? "Ви ще нічого не забронювали"
                    : "Тут скоро з’являться підказки"
              }
              description={
                view === "mine"
                  ? showFulfilled
                    ? "Коли бажання здійсниться, позначте його в картці — воно збережеться тут."
                    : "Посилання, фотографія чи просто маленька мрія."
                  : onlyReserved
                    ? "Відкрийте бажання партнера й натисніть «Хочу подарувати»."
                    : "Партнер ще не додав бажань."
              }
            />
          }
          render={(wish) => {
            const reservation =
              view === "partner" ? reservationByWish.get(wish.id) : undefined;
            const occasion = getWishOccasion(wish);
            return (
              <button
                className={`media-row wish-row${wish.fulfilled ? " wish-row-fulfilled" : ""}`}
                key={wish.id}
                onClick={() => setDetail(wish)}
              >
                <WishImage wish={wish} />
                <div>
                  <span className="row-kicker">
                    {wish.priority}
                    {wish.fulfilled ? " · Виконано" : ""}
                    {reservation
                      ? reservation.status === "purchased"
                        ? " · Придбано вами"
                        : " · Заплановано вами"
                      : ""}
                  </span>
                  {occasion && (
                    <span className="wish-occasion-tag">
                      <Gift size={11} aria-hidden="true" />
                      {occasion}
                    </span>
                  )}
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
            );
          }}
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
              <p>
                Оберіть бажання, які додати — ми сформуємо готовий PDF-файл із
                фото, розмірами, цінами та посиланнями.
              </p>
              <div className="wish-export-actions">
                <button
                  onClick={() => setExportSelection(wishes.map((wish) => wish.id))}
                >
                  Обрати всі
                </button>
                <button onClick={() => setExportSelection([])}>
                  Очистити вибір
                </button>
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
                    <span>
                      {wish.name}
                      {wish.size ? ` · ${wish.size}` : ""}
                    </span>
                  </label>
                ))}
              </div>
              <Button
                disabled={!exportSelection.length}
                busy={pdfBusy}
                onClick={() => void handleExportPdf()}
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
        ) : liveDetail ? (
          <BottomSheet
            key="wish-detail"
            title={liveDetail.name}
            onClose={() => setDetail(null)}
          >
            <div className="wish-detail">
              <WishImage wish={liveDetail} variant="detail" />
              <span className="badge">
                {liveDetail.fulfilled
                  ? `${liveDetail.priority} · Виконано`
                  : liveDetail.priority}
              </span>
              {(() => {
                const occ = getWishOccasion(liveDetail);
                return occ ? (
                  <span className="wish-detail-occasion">
                    <Gift size={13} aria-hidden="true" />
                    До свята: <strong>{occ}</strong>
                  </span>
                ) : null;
              })()}
              <strong className="detail-price">
                {liveDetail.price !== null
                  ? money(liveDetail.price)
                  : "Ціна не вказана"}
              </strong>
              <p className="full-description">
                {getWishCleanNote(liveDetail) || "Маленька ідея для хорошої миті."}
              </p>
              <p className="subtle-note">
                Додано{" "}
                {new Intl.DateTimeFormat("uk-UA", {
                  day: "numeric",
                  month: "long",
                  timeZone: "Europe/Kyiv",
                }).format(new Date(liveDetail.created_at))}
              </p>
              {safeUrl(liveDetail.url) && (
                <a
                  className="button secondary"
                  href={safeUrl(liveDetail.url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={17} />
                  Відкрити посилання
                </a>
              )}
              {liveDetail.owner_id === userId ? (
                <>
                  <Button
                    className="secondary"
                    busy={pending.includes(`wish-fulfilled-${liveDetail.id}`)}
                    onClick={() =>
                      void toggleWishFulfilled(
                        liveDetail.id,
                        !liveDetail.fulfilled,
                      ).then((ok) => {
                        if (ok) setDetail(null);
                      })
                    }
                  >
                    {liveDetail.fulfilled ? (
                      <>
                        <RotateCcw size={16} />
                        Повернути в активні
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        Позначити виконаним
                      </>
                    )}
                  </Button>
                  <Button
                    className="ghost"
                    aria-label={`Редагувати ${liveDetail.name}`}
                    onClick={() => {
                      setForm(liveDetail);
                      setDetail(null);
                    }}
                  >
                    <Pencil size={16} />
                    Редагувати бажання
                  </Button>
                </>
              ) : (
                <GiftReservationControl wish={liveDetail} />
              )}
            </div>
          </BottomSheet>
        ) : null}
      </AnimatePresence>
      {sharing && (
        <WishlistShareSheet
          wishes={data.wishes.filter((w) => !w.is_deleted)}
          userId={userId}
          availableOccasions={availableOccasions}
          onClose={() => setSharing(false)}
          onOpenPreview={(code) => {
            setSharing(false);
            if (onOpenGuestWishlist) {
              onOpenGuestWishlist(code);
            }
          }}
          onToast={notify}
        />
      )}
    </section>
  );
}
