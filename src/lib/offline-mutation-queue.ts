export type OfflineMutationTable =
  | "events"
  | "wishes"
  | "movies"
  | "plants"
  | "pantry"
  | "recipes";

export type OfflineMutationOp = "insert" | "update" | "delete";

export type OfflineMutation = {
  id: string;
  table: OfflineMutationTable;
  op: OfflineMutationOp;
  entityId: string;
  payload?: Record<string, unknown>;
  queuedAt: string;
};

const queueKey = (scope: string) => `ours-offline-mutations-v1-${scope}`;

export function readOfflineMutationQueue(scope: string): OfflineMutation[] {
  try {
    const raw = localStorage.getItem(queueKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is OfflineMutation =>
        Boolean(m) &&
        typeof m === "object" &&
        typeof m.id === "string" &&
        typeof m.table === "string" &&
        typeof m.entityId === "string" &&
        (m.op === "insert" || m.op === "update" || m.op === "delete"),
    );
  } catch {
    return [];
  }
}

export function writeOfflineMutationQueue(
  scope: string,
  queue: OfflineMutation[],
): void {
  try {
    if (!queue.length) {
      localStorage.removeItem(queueKey(scope));
    } else {
      localStorage.setItem(queueKey(scope), JSON.stringify(queue));
    }
  } catch {
    // If quota exceeded, trim older mutations gracefully
    try {
      const trimmed = queue.slice(-30);
      localStorage.setItem(queueKey(scope), JSON.stringify(trimmed));
    } catch {
      /* ignore storage limit */
    }
  }
}

/**
 * Adds an operation to the offline mutation queue with smart coalescing:
 * - insert + update -> updated insert
 * - insert + delete -> cancel out (removed from queue)
 * - update + update -> merged update
 * - update + delete -> single delete
 */
export function enqueueOfflineMutation(
  queue: OfflineMutation[],
  mutation: OfflineMutation,
): OfflineMutation[] {
  const existingIdx = queue.findIndex(
    (m) => m.table === mutation.table && m.entityId === mutation.entityId,
  );

  if (existingIdx === -1) {
    return [...queue, mutation];
  }

  const existing = queue[existingIdx];

  // Case 1: Was inserted offline
  if (existing.op === "insert") {
    if (mutation.op === "delete") {
      // Created and deleted while offline: cancel out completely
      return queue.filter((_, idx) => idx !== existingIdx);
    }
    if (mutation.op === "update") {
      // Merge patch into the insert payload
      const merged: OfflineMutation = {
        ...existing,
        payload: { ...existing.payload, ...mutation.payload },
        queuedAt: mutation.queuedAt,
      };
      return queue.map((m, idx) => (idx === existingIdx ? merged : m));
    }
  }

  // Case 2: Was updated offline
  if (existing.op === "update") {
    if (mutation.op === "delete") {
      // Just delete from server
      return queue.map((m, idx) => (idx === existingIdx ? mutation : m));
    }
    if (mutation.op === "update") {
      // Merge multiple updates
      const merged: OfflineMutation = {
        ...existing,
        payload: { ...existing.payload, ...mutation.payload },
        queuedAt: mutation.queuedAt,
      };
      return queue.map((m, idx) => (idx === existingIdx ? merged : m));
    }
  }

  // Case 3: Delete stays delete
  return queue.map((m, idx) => (idx === existingIdx ? mutation : m));
}
