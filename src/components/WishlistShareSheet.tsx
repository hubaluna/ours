import { useState, useMemo } from "react";
import { Copy, ExternalLink, Sparkles, Check } from "lucide-react";
import type { Wish } from "../lib/types";
import { BottomSheet, Button } from "./ui";
import { buildWishlistSharePayload, encodeWishlistShare } from "../lib/wishlist-share";
import { parseWishOccasion } from "../lib/wishes";

export function WishlistShareSheet({
  wishes,
  availableOccasions,
  onClose,
  onOpenPreview,
  onToast,
}: {
  wishes: Wish[];
  availableOccasions: string[];
  onClose: () => void;
  onOpenPreview: (encoded: string) => void;
  onToast: (msg: string) => void;
}) {
  const [occasion, setOccasion] = useState<string>("all");
  const [copied, setCopied] = useState(false);

  // Filter public items
  const eligibleWishes = useMemo(() => {
    return wishes.filter((w) => !w.is_private && !w.fulfilled);
  }, [wishes]);

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    eligibleWishes.map((w) => w.id),
  );

  const filteredWishes = useMemo(() => {
    if (occasion === "all") return eligibleWishes;
    return eligibleWishes.filter((w) => {
      const parsed = parseWishOccasion(w.note);
      if (occasion === "none") return !parsed.occasion;
      return parsed.occasion === occasion;
    });
  }, [eligibleWishes, occasion]);

  const payload = useMemo(() => {
    return buildWishlistSharePayload(eligibleWishes, occasion, selectedIds);
  }, [eligibleWishes, occasion, selectedIds]);

  const shareCode = useMemo(() => {
    return encodeWishlistShare(payload);
  }, [payload]);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const origin = window.location.origin;
    const path = window.location.pathname.replace(/\/$/, "");
    return `${origin}${path}/?shared_wishlist=${shareCode}`;
  }, [shareCode]);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      onToast("Посилання на вішліст скопійовано!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      onToast("Не вдалося скопіювати. Спробуйте ще раз.");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    setSelectedIds(filteredWishes.map((w) => w.id));
  };

  const deselectAll = () => {
    setSelectedIds([]);
  };

  return (
    <BottomSheet title="Поділитися вішлістом з друзями" onClose={onClose}>
      <div className="wishlist-share-sheet">
        <div className="wishlist-share-mystery-banner">
          <Sparkles size={20} className="mystery-icon" />
          <div>
            <strong>Інтрига гарантована 🎁</strong>
            <p>
              Ви не бачитимете, які саме подарунки забронювали друзі. Для гостей
              усе оновлюється автоматично в 1 клік без реєстрації чи введення
              імені.
            </p>
          </div>
        </div>

        {availableOccasions.length > 0 && (
          <div className="field">
            <span className="field-label">До якого свята поділитися?</span>
            <select
              value={occasion}
              onChange={(e) => {
                setOccasion(e.target.value);
              }}
            >
              <option value="all">Усі приводи</option>
              <option value="none">Без приводу</option>
              {availableOccasions.map((occ) => (
                <option key={occ} value={occ}>
                  {occ}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="wishlist-share-items-head">
          <span>Обрано для посилання: {selectedIds.length} з {filteredWishes.length}</span>
          <div className="wishlist-share-quick-btns">
            <button type="button" onClick={selectAll}>Усі</button>
            <span>·</span>
            <button type="button" onClick={deselectAll}>Очистити</button>
          </div>
        </div>

        <div className="wishlist-share-items-list">
          {filteredWishes.length === 0 ? (
            <p className="wishlist-share-empty-note">
              Немає доступних спільних бажань для цього приводу.
            </p>
          ) : (
            filteredWishes.map((w) => {
              const isChecked = selectedIds.includes(w.id);
              return (
                <label key={w.id} className="wishlist-share-item-row">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelect(w.id)}
                  />
                  <span className="wishlist-share-item-name">{w.name}</span>
                  {w.price !== null && w.price !== undefined && w.price > 0 && (
                    <span className="wishlist-share-item-price">
                      {w.price} ₴
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>

        <div className="wishlist-share-actions">
          <Button
            type="button"
            className="w-full"
            disabled={selectedIds.length === 0}
            onClick={handleCopy}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? "Скопійовано!" : "Скопіювати посилання"}</span>
          </Button>

          <Button
            type="button"
            className="secondary w-full"
            disabled={selectedIds.length === 0}
            onClick={() => {
              onOpenPreview(shareCode);
            }}
          >
            <ExternalLink size={16} />
            <span>Подивитися як гість</span>
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
