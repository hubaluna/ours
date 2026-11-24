import type { Wish } from "./types";
import { parseWishOccasion } from "./wishes";

export interface SharedWishItem {
  id: string;
  name: string;
  price?: number | null;
  url?: string;
  priority?: string;
  size?: string;
  note?: string;
  image_url?: string;
  occasion?: string | null;
}

export interface SharedWishlistPayload {
  v: 1;
  title: string;
  occasion?: string | null;
  items: SharedWishItem[];
  created_at: string;
}

export function buildWishlistSharePayload(
  wishes: Wish[],
  occasionFilter: string = "all",
  selectedIds?: string[],
): SharedWishlistPayload {
  const publicWishes = wishes.filter((w) => !w.is_private && !w.fulfilled);

  const filtered = publicWishes.filter((w) => {
    if (selectedIds && !selectedIds.includes(w.id)) return false;
    if (occasionFilter === "all") return true;
    const parsed = parseWishOccasion(w.note);
    if (occasionFilter === "none") return !parsed.occasion;
    return parsed.occasion === occasionFilter;
  });

  const occasionLabel =
    occasionFilter !== "all" && occasionFilter !== "none"
      ? occasionFilter
      : null;

  const items: SharedWishItem[] = filtered.map((w) => {
    const parsed = parseWishOccasion(w.note);
    return {
      id: w.id,
      name: w.name,
      price: w.price,
      url: w.url || undefined,
      priority: w.priority || undefined,
      size: w.size || undefined,
      note: parsed.cleanNote || undefined,
      image_url: w.image_url || undefined,
      occasion: parsed.occasion || undefined,
    };
  });

  return {
    v: 1,
    title: occasionLabel ? `Вішліст · ${occasionLabel}` : "Мій вішліст",
    occasion: occasionLabel,
    items,
    created_at: new Date().toISOString(),
  };
}

export function encodeWishlistShare(payload: SharedWishlistPayload): string {
  try {
    const jsonStr = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(jsonStr);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  } catch {
    return "";
  }
}

export function decodeWishlistShare(
  encoded: string,
): SharedWishlistPayload | null {
  try {
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const jsonStr = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(jsonStr) as SharedWishlistPayload;
    if (parsed && parsed.v === 1 && Array.isArray(parsed.items)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

const GUEST_RESERVATIONS_KEY = "ours_guest_reservations";

export function getGuestReservations(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(GUEST_RESERVATIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setGuestReservation(
  wishId: string,
  reserved: boolean,
): Record<string, boolean> {
  const current = getGuestReservations();
  if (reserved) {
    current[wishId] = true;
  } else {
    delete current[wishId];
  }
  try {
    localStorage.setItem(GUEST_RESERVATIONS_KEY, JSON.stringify(current));
  } catch {
    // ignore quota
  }
  return current;
}
