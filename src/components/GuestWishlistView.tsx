import { useState, useEffect, useCallback, useMemo } from "react";
import { ExternalLink, Gift, Check, ArrowLeft, Lock } from "lucide-react";
import type {
  SharedWishlistPayload,
  SharedWishItem,
  WishReservationsMap,
} from "../lib/wishlist-share";
import {
  fetchGuestReservations,
  toggleGuestReservation,
  subscribeToGuestReservations,
} from "../lib/wishlist-share";
import { money } from "../lib/utils";

export function GuestWishlistView({
  payload,
  onExit,
}: {
  payload: SharedWishlistPayload;
  onExit?: () => void;
}) {
  const itemIds = useMemo(
    () => payload.items.map((i) => i.id),
    [payload.items],
  );

  const [reservations, setReservations] = useState<WishReservationsMap>(() => {
    const initial: WishReservationsMap = {};
    for (const item of payload.items) {
      initial[item.id] = { isReserved: false, isReservedByMe: false };
    }
    return initial;
  });

  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  const loadReservations = useCallback(async () => {
    if (itemIds.length === 0) return;
    const res = await fetchGuestReservations(itemIds);
    setReservations((prev) => ({ ...prev, ...res }));
  }, [itemIds]);

  useEffect(() => {
    void loadReservations();
    const unsubscribe = subscribeToGuestReservations(() => {
      void loadReservations();
    });
    return () => {
      unsubscribe();
    };
  }, [loadReservations]);

  const handleToggle = async (id: string) => {
    const current = reservations[id] || {
      isReserved: false,
      isReservedByMe: false,
    };
    if (current.isReserved && !current.isReservedByMe) {
      // Reserved by another guest
      return;
    }

    // Optimistic update
    const nextState = {
      isReserved: !current.isReservedByMe,
      isReservedByMe: !current.isReservedByMe,
    };
    setReservations((prev) => ({
      ...prev,
      [id]: nextState,
    }));

    const result = await toggleGuestReservation(id, current);
    setReservations((prev) => ({
      ...prev,
      [id]: result,
    }));
  };

  return (
    <div className="guest-wishlist-page">
      <header className="guest-wishlist-header">
        <div className="guest-wishlist-header-content">
          {onExit && (
            <button
              type="button"
              className="guest-wishlist-back-btn"
              onClick={onExit}
              title="Повернутися до додатка"
            >
              <ArrowLeft size={18} />
              <span>Назад</span>
            </button>
          )}
          <div className="guest-wishlist-brand">
            ours<span>.</span>
          </div>
          <h1 className="guest-wishlist-title">
            <Gift size={24} className="guest-wishlist-icon" />
            <span>{payload.title || "Вішліст"}</span>
          </h1>
          <p className="guest-wishlist-subtitle">
            Оберіть подарунок, який хочете подарувати. Натисніть «Забронювати»,
            щоб ніхто інший не купив те саме.
          </p>
        </div>
      </header>

      <main className="guest-wishlist-main">
        {payload.items.length === 0 ? (
          <div className="guest-wishlist-empty">
            <Gift size={40} className="empty-icon" />
            <p>У цьому вішлісті поки немає бажань.</p>
          </div>
        ) : (
          <div className="guest-wishlist-grid">
            {payload.items.map((item: SharedWishItem) => {
              const resStatus = reservations[item.id] || {
                isReserved: false,
                isReservedByMe: false,
              };
              const isReservedByMe = resStatus.isReserved && resStatus.isReservedByMe;
              const isReservedByOther = resStatus.isReserved && !resStatus.isReservedByMe;

              return (
                <div
                  key={item.id}
                  className={`guest-wish-card${
                    isReservedByMe
                      ? " is-reserved-me"
                      : isReservedByOther
                        ? " is-reserved-other"
                        : ""
                  }`}
                >
                  <div className="guest-wish-card-img-wrap">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="guest-wish-card-img"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Gift size={26} className="guest-thumb-fallback" />
                    )}
                  </div>

                  <div className="guest-wish-card-body">
                    <div className="guest-wish-card-top">
                      <div className="guest-wish-badges">
                        {item.priority && (
                          <span
                            className={`guest-priority-badge ${
                              item.priority === "Мрія"
                                ? "is-dream"
                                : item.priority === "Дуже хочу"
                                  ? "is-high"
                                  : "is-normal"
                            }`}
                          >
                            {item.priority === "Мрія" ? "✨ Мрія" : item.priority}
                          </span>
                        )}
                        {item.size && (
                          <span className="guest-size-badge">
                            Розмір: {item.size}
                          </span>
                        )}
                      </div>

                      {item.price !== null &&
                        item.price !== undefined &&
                        item.price > 0 && (
                          <div className="guest-wish-card-price">
                            {money(item.price)}
                          </div>
                        )}
                    </div>

                    <h2 className="guest-wish-card-title">{item.name}</h2>

                    {item.note && (
                      <div className="guest-wish-card-note-wrap">
                        <p
                          className={`guest-wish-card-note${
                            expandedNotes[item.id] ? " is-expanded" : ""
                          }`}
                        >
                          {item.note}
                        </p>
                        {item.note.length > 90 && (
                          <button
                            type="button"
                            className="guest-note-toggle"
                            onClick={() =>
                              setExpandedNotes((prev) => ({
                                ...prev,
                                [item.id]: !prev[item.id],
                              }))
                            }
                          >
                            {expandedNotes[item.id] ? "Згорнути" : "Детальніше"}
                          </button>
                        )}
                      </div>
                    )}

                    <div className="guest-wish-card-actions">
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="guest-store-btn button secondary"
                        >
                          <ExternalLink size={13} />
                          <span>Де купити</span>
                        </a>
                      )}

                      <div className="guest-reserve-action-wrap">
                        {isReservedByMe ? (
                          <div className="guest-reserved-pill-group">
                            <span className="guest-reserved-pill">
                              <Check size={14} />
                              Заброньовано вами
                            </span>
                            <button
                              type="button"
                              className="guest-cancel-reserve-btn"
                              onClick={() => handleToggle(item.id)}
                            >
                              Скасувати
                            </button>
                          </div>
                        ) : isReservedByOther ? (
                          <div className="guest-reserved-by-other-pill">
                            <Lock size={14} />
                            <span>Вже заброньовано</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="guest-reserve-btn button"
                            onClick={() => handleToggle(item.id)}
                          >
                            <Gift size={14} />
                            <span>Забронювати</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="guest-wishlist-footer">
        <p>
          Створено з турботою у просторі для двох <strong>ours.</strong>
        </p>
      </footer>
    </div>
  );
}
