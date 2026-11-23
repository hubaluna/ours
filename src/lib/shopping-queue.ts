import type { ShoppingItem } from "./types";

export type ShoppingQueueOp =
  | {
      op: "add";
      id: string;
      item: ShoppingItem;
      queuedAt: string;
    }
  | {
      op: "update";
      id: string;
      patch: Record<string, unknown>;
      queuedAt: string;
    }
  | {
      op: "remove";
      id: string;
      menuKey?: string | null;
      queuedAt: string;
    };

const queueKey = (scope: string) => `ours-shopping-queue-v1-${scope}`;
const cacheKey = (scope: string) => `ours-shopping-cache-v1-${scope}`;

export function readShoppingQueue(scope: string): ShoppingQueueOp[] {
  try {
    const raw = localStorage.getItem(queueKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ShoppingQueueOp =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        (entry.op === "add" || entry.op === "update" || entry.op === "remove"),
    );
  } catch {
    return [];
  }
}

export function writeShoppingQueue(
  scope: string,
  queue: ShoppingQueueOp[],
): void {
  try {
    if (!queue.length) {
      localStorage.removeItem(queueKey(scope));
    } else {
      localStorage.setItem(queueKey(scope), JSON.stringify(queue));
    }
  } catch {
    /* ignore storage limit */
  }
}

export function readShoppingCache(scope: string): ShoppingItem[] {
  try {
    const raw = localStorage.getItem(cacheKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ShoppingItem[]) : [];
  } catch {
    return [];
  }
}

export function writeShoppingCache(
  scope: string,
  items: ShoppingItem[],
): void {
  try {
    localStorage.setItem(cacheKey(scope), JSON.stringify(items));
  } catch {
    try {
      const active = items.filter((i) => !i.purchased && !i.session_id);
      localStorage.setItem(
        cacheKey(scope),
        JSON.stringify(active.slice(0, 100)),
      );
    } catch {
      /* ignore storage limit */
    }
  }
}

export function enqueueShoppingOp(
  queue: ShoppingQueueOp[],
  next: ShoppingQueueOp,
): ShoppingQueueOp[] {
  const existingIndex = queue.findIndex((entry) => entry.id === next.id);
  if (existingIndex === -1) {
    return [...queue, next];
  }

  const existing = queue[existingIndex];
  const copy = [...queue];

  if (next.op === "add") {
    copy[existingIndex] = next;
    return copy;
  }

  if (next.op === "update") {
    if (existing.op === "add") {
      copy[existingIndex] = {
        ...existing,
        queuedAt: next.queuedAt,
        item: {
          ...existing.item,
          ...(next.patch as Partial<ShoppingItem>),
          updated_at: next.queuedAt,
        },
      };
      return copy;
    }
    if (existing.op === "update") {
      copy[existingIndex] = {
        ...existing,
        queuedAt: next.queuedAt,
        patch: { ...existing.patch, ...next.patch },
      };
      return copy;
    }
    // Never update an item already marked for removal
    return copy;
  }

  // next.op === "remove"
  if (existing.op === "add") {
    // Created offline and removed before syncing -> zero net operations
    return copy.filter((entry) => entry.id !== next.id);
  }
  copy[existingIndex] = next;
  return copy;
}

export function applyShoppingQueue(
  serverItems: ShoppingItem[],
  queue: ShoppingQueueOp[],
): ShoppingItem[] {
  if (!queue.length) return serverItems;
  let result = [...serverItems];
  for (const entry of queue) {
    if (entry.op === "add") {
      const idx = result.findIndex((row) => row.id === entry.id);
      if (idx >= 0) {
        result[idx] = { ...result[idx], ...entry.item };
      } else {
        result.push(entry.item);
      }
    } else if (entry.op === "update") {
      result = result.map((row) =>
        row.id === entry.id
          ? {
              ...row,
              ...(entry.patch as Partial<ShoppingItem>),
              updated_at: entry.queuedAt,
            }
          : row,
      );
    } else if (entry.op === "remove") {
      result = result.filter((row) => row.id !== entry.id);
    }
  }
  return result;
}

export function isOfflineNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (!error) return false;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error);
  return /failed to fetch|networkerror|load failed|fetch failed|network request failed|offline/i.test(
    message,
  );
}
