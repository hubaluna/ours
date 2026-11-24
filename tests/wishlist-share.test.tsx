// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWishlistSharePayload,
  encodeWishlistShare,
  decodeWishlistShare,
  getGuestReservations,
  setGuestReservation,
} from "../src/lib/wishlist-share";
import { GuestWishlistView } from "../src/components/GuestWishlistView";
import type { Wish } from "../src/lib/types";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const sampleWishes: Wish[] = [
  {
    id: "w-1",
    couple_id: "c-1",
    owner_id: "u-1",
    name: "Навушники Sony WH-1000XM5",
    price: 12500,
    url: "https://example.com/sony",
    priority: "Мрія",
    size: "Чорний колір",
    note: "[Привід: День народження] Дуже хочу саме з шумозаглушенням",
    image_path: null,
    image_url: "https://example.com/sony.jpg",
    is_private: false,
    fulfilled: false,
    created_at: "2026-11-20T10:00:00Z",
    updated_at: "2026-11-20T10:00:00Z",
  },
  {
    id: "w-2",
    couple_id: "c-1",
    owner_id: "u-1",
    name: "Приватна білизна",
    price: 900,
    url: "",
    priority: "Просто хочу",
    size: "S",
    note: "Секретний подарунок",
    image_path: null,
    image_url: "",
    is_private: true,
    fulfilled: false,
    created_at: "2026-11-21T10:00:00Z",
    updated_at: "2026-11-21T10:00:00Z",
  },
  {
    id: "w-3",
    couple_id: "c-1",
    owner_id: "u-1",
    name: "Книга про дизайн",
    price: 450,
    url: "https://example.com/book",
    priority: "Просто хочу",
    size: "",
    note: "Українською мовою",
    image_path: null,
    image_url: "",
    is_private: false,
    fulfilled: false,
    created_at: "2026-11-22T10:00:00Z",
    updated_at: "2026-11-22T10:00:00Z",
  },
  {
    id: "w-4",
    couple_id: "c-1",
    owner_id: "u-1",
    name: "Старий чайник",
    price: 300,
    url: "",
    priority: "Просто хочу",
    size: "",
    note: "",
    image_path: null,
    image_url: "",
    is_private: false,
    fulfilled: true,
    created_at: "2026-11-10T10:00:00Z",
    updated_at: "2026-11-10T10:00:00Z",
  },
];

describe("wishlist-share logic & encoding", () => {
  it("filters out private and fulfilled wishes, keeping only public active ones", () => {
    const payload = buildWishlistSharePayload(sampleWishes);
    expect(payload.items.length).toBe(2);
    expect(payload.items.map((i) => i.id)).toEqual(["w-1", "w-3"]);
    expect(payload.items.find((i) => i.name === "Приватна білизна")).toBeUndefined();
    expect(payload.items.find((i) => i.name === "Старий чайник")).toBeUndefined();
  });

  it("filters by occasion if specified", () => {
    const payload = buildWishlistSharePayload(sampleWishes, "День народження");
    expect(payload.items.length).toBe(1);
    expect(payload.items[0].name).toBe("Навушники Sony WH-1000XM5");
    expect(payload.title).toContain("День народження");
  });

  it("encodes and decodes the share payload safely via URL-safe base64", () => {
    const payload = buildWishlistSharePayload(sampleWishes);
    const code = encodeWishlistShare(payload);
    expect(code).toBeTruthy();
    expect(code).not.toContain("+");
    expect(code).not.toContain("/");

    const decoded = decodeWishlistShare(code);
    expect(decoded).not.toBeNull();
    expect(decoded?.title).toBe(payload.title);
    expect(decoded?.items.length).toBe(payload.items.length);
    expect(decoded?.items[0].name).toBe("Навушники Sony WH-1000XM5");
  });

  it("manages guest reservations in localStorage without asking for a name", () => {
    expect(getGuestReservations()["w-1"]).toBeUndefined();
    setGuestReservation("w-1", true);
    expect(getGuestReservations()["w-1"]).toBe(true);
    setGuestReservation("w-1", false);
    expect(getGuestReservations()["w-1"]).toBeUndefined();
  });
});

describe("GuestWishlistView UI", () => {
  it("renders wishes with price, store link and 1-tap reservation without requiring a name", () => {
    const payload = buildWishlistSharePayload(sampleWishes);
    const onExit = vi.fn();

    render(<GuestWishlistView payload={payload} onExit={onExit} />);

    expect(screen.getByText("Навушники Sony WH-1000XM5")).toBeInTheDocument();
    expect(screen.getByText(/12.*500/)).toBeInTheDocument();
    expect(screen.getByText("Розмір: Чорний колір")).toBeInTheDocument();
    expect(screen.getByText("Дуже хочу саме з шумозаглушенням")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /де купити/i })[0]).toHaveAttribute("href", "https://example.com/sony");

    // Reserve buttons exist
    const reserveButtons = screen.getAllByRole("button", { name: "Забронювати" });
    expect(reserveButtons.length).toBe(2);

    // 1-tap reservation without entering any name
    fireEvent.click(reserveButtons[0]);

    // Instantly shows "Заброньовано вами"
    expect(screen.getByText("Заброньовано вами")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Скасувати" })).toBeInTheDocument();

    // Cancel reservation
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(screen.queryByText("Заброньовано вами")).not.toBeInTheDocument();
  });
});
