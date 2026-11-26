import { useState, useMemo, useEffect } from "react";
import { Copy, ExternalLink, Sparkles, Check, Link2, Loader2, Lock } from "lucide-react";
import type { Wish } from "../lib/types";
import { supabase } from "../lib/supabase";
import { BottomSheet, Button, Segmented } from "./ui";
import {
  buildWishlistSharePayload,
  encodeWishlistShare,
  shortenWishlistUrl,
  saveSharedWishlist,
} from "../lib/wishlist-share";
import { parseWishOccasion } from "../lib/wishes";

export function WishlistShareSheet({
  wishes,
  userId,
  availableOccasions,
  onClose,
  onOpenPreview,
  onToast,
}: {
  wishes: Wish[];
  userId?: string;
  availableOccasions: string[];
  onClose: () => void;
  onOpenPreview: (encoded: string) => void;
  onToast: (msg: string) => void;
}) {
  const [ownerFilter, setOwnerFilter] = useState<string>("mine");
  const [occasion, setOccasion] = useState<string>("all");
  const [copied, setCopied] = useState(false);
  const [shortUrl, setShortUrl] = useState<string>("");
  const [shortening, setShortening] = useState<boolean>(false);
  const [resolvedImages, setResolvedImages] = useState<Record<string, string>>({});

  // Resolve uploaded gallery images (30-day signed URL or data URL) so guests can see them
  useEffect(() => {
    let cancelled = false;
    const withPaths = wishes.filter(
      (w) =>
        !w.image_url &&
        w.image_path &&
        !w.image_path.startsWith("illustration:"),
    );
    if (!withPaths.length) return;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        withPaths.map(async (w) => {
          if (!w.image_path) return;
          if (w.image_path.startsWith("data:")) {
            next[w.id] = w.image_path;
          } else if (supabase) {
            try {
              const { data } = await supabase.storage
                .from("photos")
                .createSignedUrl(w.image_path, 60 * 60 * 24 * 30);
              if (data?.signedUrl) next[w.id] = data.signedUrl;
            } catch {
              // skip unreachable image
            }
          }
        }),
      );
      if (!cancelled && Object.keys(next).length > 0) {
        setResolvedImages(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wishes]);

  // Filter wishes based on owner tab
  const poolWishes = useMemo(() => {
    if (!userId) return wishes;
    if (ownerFilter === "mine") {
      return wishes.filter((w) => w.owner_id === userId);
    }
    if (ownerFilter === "partner") {
      return wishes.filter((w) => w.owner_id !== userId);
    }
    return wishes;
  }, [wishes, userId, ownerFilter]);

  // Filter by occasion
  const filteredWishes = useMemo(() => {
    if (occasion === "all") return poolWishes;
    return poolWishes.filter((w) => {
      const parsed = parseWishOccasion(w.note);
      if (occasion === "none") return !parsed.occasion;
      return parsed.occasion === occasion;
    });
  }, [poolWishes, occasion]);

  // Selected wish IDs (defaults to active unfulfilled wishes in the current filtered pool)
  const defaultIdsFor = (items: Wish[]) => {
    const active = items.filter((w) => !w.is_private && !w.fulfilled);
    return (active.length > 0 ? active : items).map((w) => w.id);
  };
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    defaultIdsFor(filteredWishes),
  );

  // Sync selectedIds whenever ownerFilter or occasion changes so stale/hidden items aren't included
  useEffect(() => {
    setSelectedIds(defaultIdsFor(filteredWishes));
  }, [ownerFilter, occasion, filteredWishes]);

  const payload = useMemo(() => {
    return buildWishlistSharePayload(
      wishes,
      occasion,
      selectedIds,
      resolvedImages,
    );
  }, [wishes, occasion, selectedIds, resolvedImages]);

  const shareCode = useMemo(() => {
    return encodeWishlistShare(payload);
  }, [payload]);

  const rawShareUrl = useMemo(() => {
    if (typeof window === "undefined" || !shareCode) return "";
    const origin = window.location.origin;
    const path = window.location.pathname.replace(/\/$/, "");
    return `${origin}${path}/?shared_wishlist=${shareCode}`;
  }, [shareCode]);

  // Generate shortened URL
  useEffect(() => {
    if (!shareCode || selectedIds.length === 0) {
      setShortUrl("");
      return;
    }

    let cancelled = false;
    setShortening(true);

    const generateLinks = async () => {
      if (typeof window === "undefined") return;
      const origin = window.location.origin;
      const path = window.location.pathname.replace(/\/$/, "");

      // 1. Try to save short id to Supabase
      const shortId = await saveSharedWishlist(payload);
      const targetUrl = shortId
        ? `${origin}${path}/?w=${shortId}`
        : `${origin}${path}/?shared_wishlist=${shareCode}`;

      // 2. Shorten with is.gd
      const shortened = await shortenWishlistUrl(targetUrl);
      if (!cancelled) {
        setShortUrl(shortened || targetUrl);
        setShortening(false);
      }
    };

    const timer = window.setTimeout(() => {
      void generateLinks();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [payload, shareCode, selectedIds.length]);

  const effectiveUrl = shortUrl || rawShareUrl;

  const handleCopy = async () => {
    if (selectedIds.length === 0) {
      onToast("Оберіть хоча б одне бажання для вішліста");
      return;
    }

    const urlToCopy = effectiveUrl || rawShareUrl;
    if (!urlToCopy) {
      onToast("Посилання ще генерується, зачекайте мить");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(urlToCopy);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = urlToCopy;
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

  const handlePreview = () => {
    if (selectedIds.length === 0) {
      onToast("Оберіть хоча б одне бажання для вішліста");
      return;
    }
    onOpenPreview(shareCode);
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
    <BottomSheet
      title="Поділитися вішлістом з друзями"
      onClose={onClose}
      guardChanges={false}
    >
      <div className="wishlist-share-sheet">
        <div className="wishlist-share-mystery-banner">
          <Sparkles size={20} className="mystery-icon" />
          <div>
            <strong>Інтрига гарантована 🎁</strong>
            <p>
              Ви не бачитимете, які подарунки забронювали друзі. Для гостей усе
              синхронізується в 1 клік без реєстрації чи введення імені.
            </p>
          </div>
        </div>

        {userId && (
          <div className="field">
            <span className="field-label">Чиї бажання показати?</span>
            <Segmented
              id="wishlist-share-owner"
              value={ownerFilter}
              options={[
                { id: "mine", label: "Мої" },
                { id: "partner", label: "Партнера" },
                { id: "all", label: "Усі бажання" },
              ]}
              onChange={(val) => setOwnerFilter(val)}
            />
          </div>
        )}

        {availableOccasions.length > 0 && (
          <div className="field">
            <span className="field-label">До якого свята?</span>
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
          <span>
            Обрано для вішліста: <strong>{selectedIds.length}</strong> з {filteredWishes.length}
          </span>
          <div className="wishlist-share-quick-btns">
            <button type="button" onClick={selectAll}>
              Обрати всі
            </button>
            <span>·</span>
            <button type="button" onClick={deselectAll}>
              Зняти всі
            </button>
          </div>
        </div>

        <div className="wishlist-share-items-list">
          {filteredWishes.length === 0 ? (
            <p className="wishlist-share-empty-note">
              Немає бажань для обраного фільтру.
            </p>
          ) : (
            filteredWishes.map((w) => {
              const isChecked = selectedIds.includes(w.id);
              const isMine = userId && w.owner_id === userId;
              return (
                <label key={w.id} className="wishlist-share-item-row">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelect(w.id)}
                  />
                  <div className="wishlist-share-item-info">
                    <span className="wishlist-share-item-name">{w.name}</span>
                    <div className="wishlist-share-item-meta">
                      {w.price !== null && w.price !== undefined && w.price > 0 && (
                        <span className="wishlist-share-item-price">
                          {w.price} ₴
                        </span>
                      )}
                      {ownerFilter === "all" && (
                        <span className="wishlist-share-tag">
                          {isMine ? "Моє" : "Партнера"}
                        </span>
                      )}
                      {w.is_private && (
                        <span className="wishlist-share-tag is-private">
                          <Lock size={10} /> Приватне
                        </span>
                      )}
                      {w.fulfilled && (
                        <span className="wishlist-share-tag is-fulfilled">
                          ✓ Куплено
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>

        {effectiveUrl && (
          <div className="wishlist-share-link-box">
            <div className="wishlist-share-link-header">
              <Link2 size={14} />
              <span>Посилання для друзів (приховує вміст):</span>
              {shortening && (
                <Loader2 size={13} className="wishlist-share-spinner animate-spin" />
              )}
            </div>
            <div className="wishlist-share-link-code-row">
              <code className="wishlist-share-url-preview">
                {effectiveUrl}
              </code>
            </div>
          </div>
        )}

        <div className="wishlist-share-actions">
          <Button
            type="button"
            className="w-full"
            onClick={handleCopy}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? "Скопійовано!" : "Скопіювати посилання"}</span>
          </Button>

          <Button
            type="button"
            className="secondary w-full"
            onClick={handlePreview}
          >
            <ExternalLink size={16} />
            <span>Подивитися як гість</span>
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
