// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyShoppingQueue,
  enqueueShoppingOp,
  isOfflineNetworkError,
  readShoppingCache,
  readShoppingQueue,
  writeShoppingCache,
  writeShoppingQueue,
  type ShoppingQueueOp,
} from "../src/lib/shopping-queue";
import { isAtHomeIngredient, matchesPantryEntry } from "../src/lib/pantry";
import { syncDemoMenuShopping } from "../src/lib/recipe-catalog";
import type { MealPlanItem, PantryItem, ShoppingItem } from "../src/lib/types";

const makeShoppingItem = (overrides: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: "item-1",
  couple_id: "couple-1",
  name: "Молоко",
  quantity: 1,
  unit: "л",
  category: "Молочне",
  price: null,
  added_by: "user-1",
  purchased: false,
  session_id: null,
  created_at: "2026-11-14T08:00:00.000Z",
  updated_at: "2026-11-14T08:00:00.000Z",
  ...overrides,
});

const makePantryItem = (name: string, id = "pantry-1"): PantryItem => ({
  id,
  couple_id: "couple-1",
  name,
  normalized_name: name.toLowerCase(),
  quantity: "",
  is_basic: true,
  added_by: "user-1",
  created_at: "2026-11-14T08:00:00.000Z",
  updated_at: "2026-11-14T08:00:00.000Z",
});

beforeEach(() => {
  localStorage.clear();
});

describe("Offline shopping action queue", () => {
  it("coalesces add + update, multiple updates, update + remove, and cancels add + remove", () => {
    const addedItem = makeShoppingItem({ id: "offline-1", name: "Хліб" });
    let queue: ShoppingQueueOp[] = [];

    queue = enqueueShoppingOp(queue, {
      op: "add",
      id: addedItem.id,
      item: addedItem,
      queuedAt: "2026-11-14T08:01:00.000Z",
    });
    queue = enqueueShoppingOp(queue, {
      op: "update",
      id: addedItem.id,
      patch: { purchased: true },
      queuedAt: "2026-11-14T08:02:00.000Z",
    });
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      op: "add",
      id: addedItem.id,
      item: { purchased: true, updated_at: "2026-11-14T08:02:00.000Z" },
    });

    // Removing an offline-created item removes it from the queue completely
    queue = enqueueShoppingOp(queue, {
      op: "remove",
      id: addedItem.id,
      queuedAt: "2026-11-14T08:03:00.000Z",
    });
    expect(queue).toHaveLength(0);

    // Server item updates coalesce cleanly and transition to remove
    queue = enqueueShoppingOp(queue, {
      op: "update",
      id: "server-1",
      patch: { purchased: true },
      queuedAt: "2026-11-14T08:04:00.000Z",
    });
    queue = enqueueShoppingOp(queue, {
      op: "update",
      id: "server-1",
      patch: { price: 85 },
      queuedAt: "2026-11-14T08:05:00.000Z",
    });
    expect(queue).toEqual([
      {
        op: "update",
        id: "server-1",
        patch: { purchased: true, price: 85 },
        queuedAt: "2026-11-14T08:05:00.000Z",
      },
    ]);

    queue = enqueueShoppingOp(queue, {
      op: "remove",
      id: "server-1",
      queuedAt: "2026-11-14T08:06:00.000Z",
    });
    expect(queue).toEqual([
      {
        op: "remove",
        id: "server-1",
        queuedAt: "2026-11-14T08:06:00.000Z",
      },
    ]);
  });

  it("overlays pending offline operations onto server items without mutating server array", () => {
    const serverItems = [
      makeShoppingItem({ id: "s-1", name: "Молоко", purchased: false }),
      makeShoppingItem({ id: "s-2", name: "Сир", purchased: false }),
    ];
    const queue: ShoppingQueueOp[] = [
      {
        op: "update",
        id: "s-1",
        patch: { purchased: true },
        queuedAt: "2026-11-14T09:00:00.000Z",
      },
      {
        op: "remove",
        id: "s-2",
        queuedAt: "2026-11-14T09:01:00.000Z",
      },
      {
        op: "add",
        id: "offline-2",
        item: makeShoppingItem({ id: "offline-2", name: "Яблука" }),
        queuedAt: "2026-11-14T09:02:00.000Z",
      },
    ];

    const merged = applyShoppingQueue(serverItems, queue);
    expect(serverItems[0].purchased).toBe(false);
    expect(merged.map((i) => ({ id: i.id, name: i.name, purchased: i.purchased }))).toEqual([
      { id: "s-1", name: "Молоко", purchased: true },
      { id: "offline-2", name: "Яблука", purchased: false },
    ]);
  });

  it("persists queue and cache per user scope in localStorage and detects network errors", () => {
    const item = makeShoppingItem({ id: "q-1", name: "Кава" });
    const queue: ShoppingQueueOp[] = [
      { op: "add", id: item.id, item, queuedAt: "2026-11-14T10:00:00.000Z" },
    ];
    writeShoppingQueue("user-a", queue);
    writeShoppingCache("user-a", [item]);

    expect(readShoppingQueue("user-a")).toEqual(queue);
    expect(readShoppingQueue("user-b")).toEqual([]);
    expect(readShoppingCache("user-a")).toEqual([item]);

    writeShoppingQueue("user-a", []);
    expect(readShoppingQueue("user-a")).toEqual([]);

    expect(isOfflineNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isOfflineNetworkError(new Error("permission denied"))).toBe(false);
  });
});

describe("Home pantry matching and menu shopping sync", () => {
  it("matches Ukrainian ingredient declensions and multi-word pantry items", () => {
    expect(matchesPantryEntry("200 г рису", "Рис")).toBe(true);
    expect(matchesPantryEntry("Часнику", "Часник")).toBe(true);
    expect(matchesPantryEntry("Лаврового листа", "Лавровий лист")).toBe(true);
    expect(matchesPantryEntry("Куряче філе", "Філе")).toBe(true);
    expect(matchesPantryEntry("Болгарський перець", "Огірки")).toBe(false);

    const pantry = [makePantryItem("Рис")];
    expect(isAtHomeIngredient("Сіль", pantry)).toBe(true);
    expect(isAtHomeIngredient("Олія оливкова", pantry)).toBe(true);
    expect(isAtHomeIngredient("Рису", pantry)).toBe(true);
    expect(isAtHomeIngredient("Лосось", pantry)).toBe(false);
  });

  it("excludes pantry ingredients from menu shopping and restores them when removed from pantry", () => {
    const mealPlan: MealPlanItem[] = [
      {
        id: "plan-1",
        couple_id: "couple-1",
        catalog_id: null,
        recipe_id: "recipe-1",
        servings: 2,
        base_servings: 2,
        shopping_completed: false,
        added_by: "user-1",
        created_at: "2026-11-14T08:00:00.000Z",
        ingredients: [
          {
            name: "Рис",
            quantity: 200,
            unit: "г",
            category: "Крупи, макарони та бакалія",
          },
          {
            name: "Куряче філе",
            quantity: 400,
            unit: "г",
            category: "М’ясо, риба та яйця",
          },
          {
            name: "Сіль",
            quantity: 1,
            unit: "ч. л.",
            category: "Крупи, макарони та бакалія",
          },
        ],
      },
    ];

    const withRiceInPantry = syncDemoMenuShopping(
      mealPlan,
      [],
      [],
      "user-1",
      "couple-1",
      [makePantryItem("Рис")],
    );
    expect(withRiceInPantry.map((i) => i.name)).toEqual(["Куряче філе"]);

    const withoutRiceInPantry = syncDemoMenuShopping(
      mealPlan,
      withRiceInPantry,
      [],
      "user-1",
      "couple-1",
      [],
    );
    expect(withoutRiceInPantry.map((i) => i.name).sort()).toEqual([
      "Куряче філе",
      "Рис",
    ]);
  });
});
