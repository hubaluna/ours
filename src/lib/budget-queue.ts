import type { BudgetTransaction } from "./types";

export type BudgetTxPatch = Partial<
  Pick<
    BudgetTransaction,
    | "kind"
    | "amount"
    | "merchant"
    | "note"
    | "category_key"
    | "status"
    | "is_private"
    | "occurred_on"
    | "occurred_at"
  >
>;

export type BudgetQueueOp =
  | { op: "add"; item: BudgetTransaction; queuedAt: string }
  | { op: "update"; id: string; patch: BudgetTxPatch; queuedAt: string }
  | { op: "remove"; id: string; queuedAt: string };

const queueKey = (scope: string) => `ours-budget-queue-v1:${scope || "anon"}`;
const cacheKey = (scope: string) => `ours-budget-cache-v1:${scope || "anon"}`;

export function readBudgetQueue(scope: string): BudgetQueueOp[] {
  try {
    const raw = localStorage.getItem(queueKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BudgetQueueOp[]) : [];
  } catch {
    return [];
  }
}

export function writeBudgetQueue(scope: string, ops: BudgetQueueOp[]): void {
  try {
    if (!ops.length) {
      localStorage.removeItem(queueKey(scope));
      return;
    }
    localStorage.setItem(queueKey(scope), JSON.stringify(ops));
  } catch {
    /* ignore storage quota errors */
  }
}

export function readBudgetCache(scope: string): BudgetTransaction[] {
  try {
    const raw = localStorage.getItem(cacheKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BudgetTransaction[]) : [];
  } catch {
    return [];
  }
}

export function writeBudgetCache(
  scope: string,
  items: BudgetTransaction[],
): void {
  try {
    localStorage.setItem(cacheKey(scope), JSON.stringify(items));
  } catch {
    try {
      localStorage.setItem(
        cacheKey(scope),
        JSON.stringify(items.slice(0, 100)),
      );
    } catch {
      /* ignore storage quota errors */
    }
  }
}

export function enqueueBudgetOp(
  queue: BudgetQueueOp[],
  incoming: BudgetQueueOp,
): BudgetQueueOp[] {
  const next = [...queue];

  if (incoming.op === "add") {
    const filtered = next.filter(
      (entry) => !(entry.op === "add" && entry.item.id === incoming.item.id),
    );
    return [...filtered, incoming];
  }

  if (incoming.op === "update") {
    const addIndex = next.findIndex(
      (entry) => entry.op === "add" && entry.item.id === incoming.id,
    );
    if (addIndex >= 0) {
      const existing = next[addIndex] as Extract<BudgetQueueOp, { op: "add" }>;
      next[addIndex] = {
        ...existing,
        item: {
          ...existing.item,
          ...incoming.patch,
          updated_at: incoming.queuedAt,
        },
        queuedAt: incoming.queuedAt,
      };
      return next;
    }
    const updIndex = next.findIndex(
      (entry) => entry.op === "update" && entry.id === incoming.id,
    );
    if (updIndex >= 0) {
      const existing = next[updIndex] as Extract<
        BudgetQueueOp,
        { op: "update" }
      >;
      next[updIndex] = {
        ...existing,
        patch: { ...existing.patch, ...incoming.patch },
        queuedAt: incoming.queuedAt,
      };
      return next;
    }
    return [...next, incoming];
  }

  // incoming.op === "remove"
  const addIndex = next.findIndex(
    (entry) => entry.op === "add" && entry.item.id === incoming.id,
  );
  if (addIndex >= 0) {
    return next.filter((entry) => {
      if (entry.op === "add") return entry.item.id !== incoming.id;
      return entry.id !== incoming.id;
    });
  }
  const withoutUpdates = next.filter(
    (entry) => !(entry.op === "update" && entry.id === incoming.id),
  );
  if (
    withoutUpdates.some(
      (entry) => entry.op === "remove" && entry.id === incoming.id,
    )
  ) {
    return withoutUpdates;
  }
  return [...withoutUpdates, incoming];
}

export function applyBudgetQueue(
  items: BudgetTransaction[],
  queue: BudgetQueueOp[],
): BudgetTransaction[] {
  let result = [...items];
  for (const op of queue) {
    if (op.op === "add") {
      if (!result.some((tx) => tx.id === op.item.id)) {
        result = [op.item, ...result];
      }
    } else if (op.op === "update") {
      result = result.map((tx) =>
        tx.id === op.id
          ? { ...tx, ...op.patch, updated_at: op.queuedAt }
          : tx,
      );
    } else if (op.op === "remove") {
      result = result.filter((tx) => tx.id !== op.id);
    }
  }
  return result;
}
