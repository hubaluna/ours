export type TrashKind =
  | "shopping_items"
  | "wishes"
  | "events"
  | "movies"
  | "recipes"
  | "plants"
  | "budget_transactions";

export type TrashEntry = {
  id: string;
  kind: TrashKind;
  kindLabel: string;
  label: string;
  deletedAt: string;
  payload: Record<string, unknown>;
};

const STORAGE_PREFIX = "ours-trash-v1";
const MAX_ENTRIES = 60;
const RETENTION_MS = 14 * 86_400_000;

const storageKey = (scope = "demo") => `${STORAGE_PREFIX}:${scope || "demo"}`;

const kindLabels: Record<TrashKind, string> = {
  shopping_items: "Покупки",
  wishes: "Бажання",
  events: "Календар",
  movies: "Кіно",
  recipes: "Рецепти",
  plants: "Рослини",
  budget_transactions: "Бюджет",
};

function prune(entries: TrashEntry[], now = Date.now()): TrashEntry[] {
  return entries
    .filter((entry) => {
      const ts = Date.parse(entry.deletedAt);
      return Number.isFinite(ts) && now - ts <= RETENTION_MS;
    })
    .slice(0, MAX_ENTRIES);
}

export function readTrash(scope = "demo"): TrashEntry[] {
  try {
    const key = storageKey(scope);
    const raw =
      localStorage.getItem(key) ??
      (scope === "demo" ? localStorage.getItem(STORAGE_PREFIX) : null);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const clean = prune(
      parsed.filter(
        (item): item is TrashEntry =>
          Boolean(item) &&
          typeof item.id === "string" &&
          typeof item.kind === "string" &&
          item.kind in kindLabels &&
          typeof item.label === "string" &&
          typeof item.deletedAt === "string" &&
          Boolean(item.payload) &&
          typeof item.payload === "object",
      ),
    );
    if (clean.length !== parsed.length) writeTrash(clean, scope);
    return clean;
  } catch {
    return [];
  }
}

function writeTrash(entries: TrashEntry[], scope = "demo"): TrashEntry[] {
  const next = prune(entries);
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(next));
  } catch {
    /* ignore storage quota issues */
  }
  return next;
}

export function pushTrash(
  kind: TrashKind,
  payload: Record<string, unknown>,
  scope = "demo",
): { entry: TrashEntry; entries: TrashEntry[] } {
  const label = String(payload.name || payload.title || payload.merchant || "Елемент").trim();
  const entry: TrashEntry = {
    id: crypto.randomUUID(),
    kind,
    kindLabel: kindLabels[kind],
    label: label || "Елемент",
    deletedAt: new Date().toISOString(),
    payload,
  };
  const entries = writeTrash([entry, ...readTrash(scope)], scope);
  return { entry, entries };
}

export function removeTrashEntry(entryId: string, scope = "demo"): TrashEntry[] {
  return writeTrash(
    readTrash(scope).filter((entry) => entry.id !== entryId),
    scope,
  );
}

export function clearTrash(scope = "demo"): TrashEntry[] {
  try {
    localStorage.removeItem(storageKey(scope));
    if (scope === "demo") localStorage.removeItem(STORAGE_PREFIX);
  } catch {
    /* ignore */
  }
  return [];
}
