import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ExternalLink,
  Gift,
  Heart,
  LockKeyhole,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import type { Wish } from "../lib/types";
import { useApp } from "../hooks/AppContext";
import { useImage } from "../hooks/useImage";
import { money, safeUrl } from "../lib/utils";
import { Button, EmptyState, Segmented } from "../components/ui";
import { WishForm } from "../components/Forms";
import { WishArt } from "../components/Illustrations";
function WishCard({ wish, onEdit }: { wish: Wish; onEdit: () => void }) {
  const { userId, data, reserve, update, remove, pending } = useApp();
  const mine = wish.owner_id === userId,
    reservation = data.reservations.find((r) => r.wish_id === wish.id);
  const image = useImage(wish.image_path),
    url = safeUrl(wish.url);
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="wish-card card"
    >
      <div
        className={`wish-image ${wish.image_path?.includes("book") ? "peach" : ""}`}
      >
        {image ? (
          <img src={image} alt={wish.name} loading="lazy" />
        ) : (
          <WishArt
            kind={
              wish.image_path?.startsWith("illustration:")
                ? wish.image_path
                : "placeholder"
            }
          />
        )}
        <span className="wish-priority">
          <Heart size={11} fill="currentColor" />
          {wish.priority}
        </span>
        {mine && (
          <Button
            className="icon-button glass wish-edit"
            aria-label={`Редагувати ${wish.name}`}
            onClick={onEdit}
          >
            <MoreHorizontal size={18} />
          </Button>
        )}
      </div>
      <div className="wish-body">
        <span className="wish-date">
          Додано{" "}
          {new Intl.DateTimeFormat("uk-UA", {
            day: "numeric",
            month: "long",
            timeZone: "Europe/Kyiv",
          }).format(new Date(wish.created_at))}
        </span>
        <h3>{wish.name}</h3>
        <p>{wish.note || "Ще одна маленька радість."}</p>
        <div className="wish-price">
          <strong>
            {wish.price !== null ? money(wish.price) : "Безцінна ідея"}
          </strong>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Відкрити посилання: ${wish.name}`}
            >
              <ExternalLink size={17} />
            </a>
          )}
        </div>
        {!mine && (
          <div className="reservation">
            {reservation ? (
              <>
                <Button
                  className="reservation-button"
                  busy={pending.includes(reservation.id)}
                  onClick={() =>
                    void update("gift_reservations", reservation.id, {
                      status:
                        reservation.status === "planned"
                          ? "purchased"
                          : "planned",
                    })
                  }
                >
                  {reservation.status === "planned" ? (
                    <Gift size={16} />
                  ) : (
                    <Check size={16} />
                  )}{" "}
                  {reservation.status === "planned"
                    ? "Заплановано · позначити придбаним"
                    : "Придбано"}
                </Button>
                <button
                  className="text-button"
                  disabled={pending.includes(reservation.id)}
                  onClick={() =>
                    void remove("gift_reservations", reservation.id)
                  }
                >
                  Скасувати бронювання
                </button>
              </>
            ) : (
              <Button
                className="reservation-button"
                busy={pending.includes(`reserve-${wish.id}`)}
                onClick={() => void reserve(wish.id)}
              >
                <Gift size={17} />
                Хочу подарувати
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.article>
  );
}
export default function Wishes() {
  const { data, userId } = useApp();
  const [view, setView] = useState("mine"),
    [form, setForm] = useState<Wish | "new" | null>(null);
  const wishes = data.wishes.filter((w) =>
    view === "mine" ? w.owner_id === userId : w.owner_id !== userId,
  );
  return (
    <>
      <div className="page-intro">
        <div className="eyebrow">ДЛЯ МАЛЕНЬКИХ І ВЕЛИКИХ МРІЙ</div>
        <h1>
          Бажання, які
          <br />
          хочеться здійснити.
        </h1>
        <p>Зберігайте ідеї. Залишайте місце для сюрпризів.</p>
      </div>
      <div className="wishes-toolbar">
        <Segmented
          id="wishes-view"
          value={view}
          onChange={setView}
          options={[
            { id: "mine", label: "Мої бажання" },
            { id: "partner", label: "Бажання партнера" },
          ]}
        />
      </div>
      {view === "partner" && (
        <div className="privacy-note">
          <LockKeyhole size={15} />
          <span>Ваші подарункові плани бачите лише ви.</span>
        </div>
      )}
      <div className="wish-grid">
        <AnimatePresence mode="popLayout">
          {wishes.map((w) => (
            <WishCard key={w.id} wish={w} onEdit={() => setForm(w)} />
          ))}
        </AnimatePresence>
      </div>
      {wishes.length === 0 && (
        <div className="card">
          <EmptyState
            title={
              view === "mine"
                ? "Про що ви мрієте?"
                : "Тут скоро з’являться підказки"
            }
            description={
              view === "mine"
                ? "Додайте першу ідею. Можливо, вона стане приємним сюрпризом."
                : "Партнер ще не додав бажань."
            }
          />
        </div>
      )}
      {view === "mine" && (
        <Button className="floating-add" onClick={() => setForm("new")}>
          <Plus size={21} />
          Додати бажання
        </Button>
      )}
      <AnimatePresence>
        {form && (
          <WishForm
            wish={form === "new" ? undefined : form}
            onClose={() => setForm(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
