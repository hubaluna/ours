import type { Wish } from "./types";
import { parseWishOccasion } from "./wishes";
import { supabase } from "./supabase";

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

export interface WishReservationStatus {
  isReserved: boolean;
  isReservedByMe: boolean;
}

export type WishReservationsMap = Record<string, WishReservationStatus>;

export function buildWishlistSharePayload(
  wishes: Wish[],
  occasionFilter: string = "all",
  selectedIds?: string[],
): SharedWishlistPayload {
  const filtered = wishes.filter((w) => {
    if (selectedIds) {
      return selectedIds.includes(w.id);
    }
    if (w.is_private || w.fulfilled) return false;
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

const GUEST_TOKEN_KEY = "ours_guest_token";

export function getGuestToken(): string {
  if (typeof window === "undefined") return "server-guest-token";
  try {
    let token = localStorage.getItem(GUEST_TOKEN_KEY);
    if (!token) {
      token =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `guest-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      localStorage.setItem(GUEST_TOKEN_KEY, token);
    }
    return token;
  } catch {
    return "guest-temp-session";
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

export async function fetchGuestReservations(
  wishIds: string[],
): Promise<WishReservationsMap> {
  const myToken = getGuestToken();
  const map: WishReservationsMap = {};

  for (const id of wishIds) {
    map[id] = { isReserved: false, isReservedByMe: false };
  }

  if (supabase && wishIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from("guest_wish_reservations")
        .select("wish_id, guest_token")
        .in("wish_id", wishIds);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const isMe = row.guest_token === myToken;
          map[row.wish_id] = {
            isReserved: true,
            isReservedByMe: isMe,
          };
          // Also sync to local storage if it's mine
          if (isMe) {
            setGuestReservation(row.wish_id, true);
          }
        }
        return map;
      }
    } catch {
      // fallback to local storage
    }
  }

  // Fallback to local storage
  const local = getGuestReservations();
  for (const [id, reserved] of Object.entries(local)) {
    if (reserved && map[id]) {
      map[id] = { isReserved: true, isReservedByMe: true };
    }
  }

  return map;
}

export async function toggleGuestReservation(
  wishId: string,
  current: WishReservationStatus,
): Promise<WishReservationStatus> {
  // If reserved by someone else, cannot modify
  if (current.isReserved && !current.isReservedByMe) {
    return current;
  }

  const myToken = getGuestToken();

  if (current.isReservedByMe) {
    // Unreserve
    setGuestReservation(wishId, false);
    if (supabase) {
      try {
        await supabase
          .from("guest_wish_reservations")
          .delete()
          .eq("wish_id", wishId)
          .eq("guest_token", myToken);
      } catch {
        // ignore offline error
      }
    }
    return { isReserved: false, isReservedByMe: false };
  } else {
    // Reserve
    setGuestReservation(wishId, true);
    if (supabase) {
      try {
        await supabase
          .from("guest_wish_reservations")
          .insert({ wish_id: wishId, guest_token: myToken });
      } catch {
        // ignore offline error
      }
    }
    return { isReserved: true, isReservedByMe: true };
  }
}

export function subscribeToGuestReservations(
  onUpdate: () => void,
): () => void {
  if (!supabase) return () => {};

  try {
    const channel = supabase
      .channel("guest_wish_reservations_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guest_wish_reservations" },
        () => {
          onUpdate();
        },
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  } catch {
    return () => {};
  }
}

export async function shortenWishlistUrl(longUrl: string): Promise<string> {
  if (!longUrl) return "";

  // 1. Try is.gd
  try {
    const resp = await fetch(
      `https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`,
      { signal: AbortSignal.timeout(4500) },
    );
    if (resp.ok) {
      const data = (await resp.json()) as { shorturl?: string };
      if (data?.shorturl) {
        return data.shorturl;
      }
    }
  } catch {
    // fallback
  }

  // 2. Try v.gd
  try {
    const resp = await fetch(
      `https://v.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`,
      { signal: AbortSignal.timeout(4500) },
    );
    if (resp.ok) {
      const data = (await resp.json()) as { shorturl?: string };
      if (data?.shorturl) {
        return data.shorturl;
      }
    }
  } catch {
    // fallback
  }

  return longUrl;
}

export async function saveSharedWishlist(
  payload: SharedWishlistPayload,
): Promise<string> {
  if (!supabase) return "";
  try {
    const id = `w${Math.random().toString(36).slice(2, 8)}`;
    const { error } = await supabase.from("guest_shared_wishlists").insert({
      id,
      title: payload.title,
      occasion: payload.occasion || null,
      items: payload.items,
    });
    if (!error) return id;
  } catch {
    // fallback
  }
  return "";
}

export async function fetchSharedWishlistById(
  id: string,
): Promise<SharedWishlistPayload | null> {
  if (!supabase || !id) return null;
  try {
    const { data, error } = await supabase
      .from("guest_shared_wishlists")
      .select("id, title, occasion, items, created_at")
      .eq("id", id)
      .single();
    if (!error && data && Array.isArray(data.items)) {
      return {
        v: 1,
        title: data.title || "Вішліст",
        occasion: data.occasion,
        items: data.items as SharedWishItem[],
        created_at: data.created_at || new Date().toISOString(),
      };
    }
  } catch {
    // fallback
  }
  return null;
}
