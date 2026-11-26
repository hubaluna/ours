import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { checked, configured, supabase, readAll } from "../lib/supabase";
import { DEMO_COUPLE, DEMO_USER, readDemo } from "../lib/demo";
import { errorMessage, kyivDate } from "../lib/utils";
import type {
  Data,
  NewPlan,
  NewMovie,
  NewRecipe,
  Activity,
  NewShopping,
  NewWish,
  Profile,
  Table,
  RecipeView,
  MealPlanItem,
  Plant,
  NewPlant,
  PlantCareEvent,
  RecipeFavorite,
  RecipeCook,
  PantryItem,
  NewPantryItem,
  ShoppingItem,
  BudgetCategory,
  BudgetTransaction,
  BudgetMerchantRule,
  BudgetSettings,
  BudgetTokenStatus,
  BudgetRecurringPayment,
  NewBudgetRecurringPayment,
  BudgetKind,
  NewBudgetTransaction,
  NewBudgetCategory,
} from "../lib/types";
import {
  findCategoryMeta,
  generateBudgetIngestToken,
  normalizeCategoryKey,
  normalizeMerchantName,
} from "../lib/budget";
import {
  isMissingBudgetTableError,
  markLocalBudgetSynced,
  peekLocalBudgetPendingSync,
  readLocalBudgetState,
  writeLocalBudgetState,
} from "../lib/budget-local";
import {
  applyBudgetQueue,
  enqueueBudgetOp,
  readBudgetCache,
  readBudgetQueue,
  writeBudgetCache,
  writeBudgetQueue,
  type BudgetQueueOp,
} from "../lib/budget-queue";
import { customRecipeView, syncDemoMenuShopping } from "../lib/recipe-catalog";
import { isAtHomeIngredient, normalizePantryName } from "../lib/pantry";
import { sanitizeShoppingItemForDb } from "../lib/shopping-parser";
import {
  applyShoppingQueue,
  enqueueShoppingOp,
  isOfflineNetworkError,
  readShoppingCache,
  readShoppingQueue,
  writeShoppingCache,
  writeShoppingQueue,
  type ShoppingQueueOp,
} from "../lib/shopping-queue";
import {
  enqueueOfflineMutation,
  readOfflineMutationQueue,
  writeOfflineMutationQueue,
  type OfflineMutation,
  type OfflineMutationTable,
} from "../lib/offline-mutation-queue";
import {
  deleteLocalRecurrence,
  normalizeRecurrence,
  readLocalRecurrences,
  saveLocalRecurrence,
} from "../lib/recurrence";
import {
  clearAppCache,
  readAppCache,
  readStoredSupabaseSession,
  writeAppCache,
} from "../lib/app-cache";
import {
  clearTrash,
  pushTrash,
  readTrash,
  removeTrashEntry,
  type TrashEntry,
  type TrashKind,
} from "../lib/trash";
const isMissingTableError = (error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error);
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /does not exist|Could not find the table/i.test(message)
  );
};
const isRetryableQueueError = (error: unknown) => {
  if (isOfflineNetworkError(error)) return true;
  if (!error || typeof error !== "object") return false;
  const err = error as { status?: unknown; name?: unknown; message?: unknown };
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  const status = typeof err.status === "number" ? err.status : Number(err.status);
  if (
    status === 401 ||
    status === 408 ||
    status === 429 ||
    (status >= 500 && status <= 599)
  ) {
    return true;
  }
  const message = String(err.message ?? "");
  return /timeout|timed out|abort|jwt expired|502|503|504|429/i.test(message);
};
const isMissingRecurrenceColumn = (error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error);
  return code === "42703" || code === "PGRST204" || /recurrence/i.test(message);
};
const isMissingFulfilledColumn = (error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error);
  return code === "42703" || code === "PGRST204" || /fulfilled/i.test(message);
};
const fulfilledKey = (scope: string) => `ours-wishes-fulfilled-v1:${scope || "anon"}`;
const readLocalFulfilledWishes = (scope: string): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem(fulfilledKey(scope));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
};
const writeLocalFulfilledWish = (
  scope: string,
  wishId: string,
  fulfilled: boolean,
) => {
  try {
    const map = readLocalFulfilledWishes(scope);
    map[wishId] = fulfilled;
    localStorage.setItem(fulfilledKey(scope), JSON.stringify(map));
  } catch {
    /* ignore */
  }
};
const empty: Data = {
  mealPlan: [],
  pantry: [],
  recipes: [],
  profiles: [],
  movies: [],
  activities: [],
  reads: [],
  shopping: [],
  sessions: [],
  wishes: [],
  reservations: [],
  events: [],
  plants: [],
  plantCare: [],
  recipeFavorites: [],
  recipeCooks: [],
  history: [],
  budgetCategories: [],
  budgetTransactions: [],
  budgetMerchantRules: [],
  budgetSettings: [],
  budgetRecurring: [],
};
type Notice = {
  text: string;
  action?: () => void;
  label?: string;
  error?: boolean;
};
function useStore() {
  const [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(!configured),
    [data, setData] = useState<Data>(() => (configured ? empty : readDemo())),
    [coupleId, setCoupleId] = useState<string | null>(
      configured ? null : DEMO_COUPLE,
    ),
    [loading, setLoading] = useState(configured),
    [failure, setFailure] = useState(false),
    [pending, setPending] = useState<string[]>([]),
    [online, setOnline] = useState(navigator.onLine),
    [sync, setSync] = useState("connecting"),
    [notice, setNotice] = useState<Notice | null>(null);
  const demo = !configured,
    userId = demo ? DEMO_USER : (session?.user.id ?? ""),
    trashScope = demo ? "demo" : (userId || "anon");
  const [trash, setTrash] = useState<TrashEntry[]>(() =>
    readTrash(demo ? "demo" : "anon"),
  );
  const [shoppingQueue, setShoppingQueue] = useState<ShoppingQueueOp[]>(() =>
    readShoppingQueue(demo ? "demo" : "anon"),
  );
  const [budgetQueue, setBudgetQueue] = useState<BudgetQueueOp[]>(() =>
    readBudgetQueue(demo ? "demo" : "anon"),
  );
  const [mutationQueue, setMutationQueue] = useState<OfflineMutation[]>(() =>
    readOfflineMutationQueue(demo ? "demo" : "anon"),
  );
  const shoppingQueueRef = useRef<ShoppingQueueOp[]>(shoppingQueue),
    flushingQueue = useRef(false),
    budgetQueueRef = useRef<BudgetQueueOp[]>(budgetQueue),
    flushingBudgetQueue = useRef(false),
    mutationQueueRef = useRef<OfflineMutation[]>(mutationQueue),
    flushingMutationQueue = useRef(false),
    coupleIdRef = useRef<string | null>(coupleId),
    budgetLocalModeRef = useRef(false),
    budgetRecurringLocalRef = useRef(false),
    lastRefreshAtRef = useRef(0),
    refreshInFlightRef = useRef<Promise<void> | null>(null);
  const [realtimeRetry, setRealtimeRetry] = useState(0);
  const busy = useRef(new Set<string>()),
    revision = useRef(0);
  useEffect(() => {
    coupleIdRef.current = coupleId;
  }, [coupleId]);
  useEffect(() => {
    setTrash(readTrash(trashScope));
    const loadedQueue = readShoppingQueue(trashScope);
    shoppingQueueRef.current = loadedQueue;
    setShoppingQueue(loadedQueue);
    const loadedBudgetQueue = readBudgetQueue(trashScope);
    budgetQueueRef.current = loadedBudgetQueue;
    setBudgetQueue(loadedBudgetQueue);
    const loadedMutationQueue = readOfflineMutationQueue(trashScope);
    mutationQueueRef.current = loadedMutationQueue;
    setMutationQueue(loadedMutationQueue);
  }, [trashScope]);
  const notify = useCallback(
    (text: string, action?: () => void, label = "Скасувати", isError?: boolean) =>
      setNotice({
        text,
        action,
        label,
        error:
          isError ??
          /^(Не вдалося|Немає|Пам’ять|Фото|Оберіть|Введіть|Вкажіть|Некоректн|Такий|У файлі|Перевірте|Посилання|Забагато|Частину)/.test(
            text,
          ),
      }),
    [],
  );
  useEffect(() => {
    if (!supabase) return;
    let settled = false;
    const storedSession = readStoredSupabaseSession();
    if (storedSession && !navigator.onLine) {
      setSession(storedSession);
      setAuthReady(true);
    }
    const fallbackTimer =
      storedSession && navigator.onLine
        ? window.setTimeout(() => {
            if (settled) return;
            setSession((prev) => prev ?? storedSession);
            setAuthReady(true);
          }, 2500)
        : null;
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        settled = true;
        if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
        if (error) {
          if (storedSession && (!navigator.onLine || isOfflineNetworkError(error))) {
            setSession((prev) => prev ?? storedSession);
            setAuthReady(true);
            return;
          }
          notify("Не вдалося відновити вхід. Увійдіть ще раз.");
        }
        if (data.session) {
          setSession(data.session);
        } else if (!storedSession || navigator.onLine) {
          setSession(null);
        }
        setAuthReady(true);
      })
      .catch(() => {
        settled = true;
        if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
        if (storedSession) {
          setSession((prev) => prev ?? storedSession);
        }
        setAuthReady(true);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      settled = true;
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      if (event === "SIGNED_OUT") {
        setSession((prev) => {
          if (prev?.user.id) clearAppCache(prev.user.id);
          return null;
        });
      } else {
        setSession(s);
      }
      setAuthReady(true);
    });
    return () => {
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [notify]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (demo) {
      try {
        localStorage.setItem("ours-demo-v1", JSON.stringify(data));
      } catch {
        notify(
          "Пам’ять деморежиму заповнена. Ці зміни залишаться до закриття сторінки.",
        );
      }
    }
  }, [data, demo, notify]);
  const commitShoppingQueue = useCallback(
    (updater: (prev: ShoppingQueueOp[]) => ShoppingQueueOp[]) => {
      const next = updater(shoppingQueueRef.current);
      shoppingQueueRef.current = next;
      setShoppingQueue(next);
      writeShoppingQueue(trashScope, next);
      return next;
    },
    [trashScope],
  );
  const flushShoppingQueue = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (
        demo ||
        !supabase ||
        !userId ||
        !navigator.onLine ||
        flushingQueue.current ||
        !shoppingQueueRef.current.length
      ) {
        return 0;
      }
      flushingQueue.current = true;
      let syncedCount = 0;
      try {
        while (shoppingQueueRef.current.length > 0 && navigator.onLine) {
          const op = shoppingQueueRef.current[0];
          try {
            if (op.op === "add") {
              const { error } = await supabase
                .from("shopping_items")
                .insert({
                  id: op.item.id,
                  couple_id: op.item.couple_id || coupleIdRef.current,
                  name: op.item.name,
                  quantity: op.item.quantity,
                  unit: op.item.unit,
                  category: op.item.category,
                  price: op.item.price,
                  added_by: op.item.added_by || userId,
                  purchased: op.item.purchased,
                  session_id: op.item.session_id ?? null,
                  created_at: op.item.created_at,
                  updated_at: op.item.updated_at ?? op.queuedAt,
                })
                .select("id")
                .single();
              if (error && (error as { code?: string }).code !== "23505") {
                throw error;
              }
            } else if (op.op === "update") {
              await checked(
                supabase
                  .from("shopping_items")
                  .update(op.patch)
                  .eq("id", op.id)
                  .select("id")
                  .maybeSingle(),
              );
            } else if (op.op === "remove") {
              await checked(
                supabase
                  .from("shopping_items")
                  .delete()
                  .eq("id", op.id)
                  .select("id")
                  .maybeSingle(),
              );
            }
            syncedCount++;
            commitShoppingQueue((prev) =>
              prev.length && prev[0] === op
                ? prev.slice(1)
                : prev.filter((item) => item !== op),
            );
          } catch (err) {
            if (isRetryableQueueError(err)) {
              break;
            }
            // Drop permanently invalid/conflicting op so the queue cannot stall forever.
            commitShoppingQueue((prev) =>
              prev.length && prev[0] === op
                ? prev.slice(1)
                : prev.filter((item) => item !== op),
            );
            notify("Частину відкладених покупок не вдалося синхронізувати", undefined, "Скасувати", true);
          }
        }
      } finally {
        flushingQueue.current = false;
      }
      if (syncedCount > 0 && !opts?.silent) {
        notify("Офлайн-зміни покупок синхронізовано");
      }
      return syncedCount;
    },
    [demo, userId, commitShoppingQueue, notify],
  );
  const commitBudgetQueue = useCallback(
    (updater: (prev: BudgetQueueOp[]) => BudgetQueueOp[]) => {
      const next = updater(budgetQueueRef.current);
      budgetQueueRef.current = next;
      setBudgetQueue(next);
      writeBudgetQueue(trashScope, next);
      return next;
    },
    [trashScope],
  );
  const enqueueOfflineBudget = useCallback(
    (op: BudgetQueueOp) => {
      commitBudgetQueue((prev) => enqueueBudgetOp(prev, op));
      setData((d) => {
        const nextBudget = applyBudgetQueue(d.budgetTransactions, [op]);
        writeBudgetCache(trashScope, nextBudget);
        return { ...d, budgetTransactions: nextBudget };
      });
    },
    [commitBudgetQueue, trashScope],
  );
  const flushBudgetQueue = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (
        demo ||
        !supabase ||
        !userId ||
        !navigator.onLine ||
        flushingBudgetQueue.current ||
        budgetLocalModeRef.current ||
        !budgetQueueRef.current.length
      ) {
        return 0;
      }
      flushingBudgetQueue.current = true;
      let syncedCount = 0;
      try {
        while (budgetQueueRef.current.length > 0 && navigator.onLine) {
          const op = budgetQueueRef.current[0];
          try {
            if (op.op === "add") {
              const { error } = await supabase
                .from("budget_transactions")
                .insert({
                  id: op.item.id,
                  couple_id: op.item.couple_id || coupleIdRef.current,
                  user_id: op.item.user_id || userId,
                  kind: op.item.kind,
                  amount: op.item.amount,
                  merchant: op.item.merchant,
                  note: op.item.note,
                  category_key: op.item.category_key,
                  status: op.item.status,
                  source: op.item.source,
                  is_private: op.item.is_private,
                  card_label: op.item.card_label ?? "",
                  occurred_on: op.item.occurred_on,
                  occurred_at: op.item.occurred_at,
                })
                .select("id")
                .single();
              if (error && (error as { code?: string }).code !== "23505") {
                throw error;
              }
            } else if (op.op === "update") {
              await checked(
                supabase
                  .from("budget_transactions")
                  .update(op.patch)
                  .eq("id", op.id)
                  .select("id")
                  .maybeSingle(),
              );
            } else if (op.op === "remove") {
              await checked(
                supabase
                  .from("budget_transactions")
                  .delete()
                  .eq("id", op.id)
                  .select("id")
                  .maybeSingle(),
              );
            }
            syncedCount++;
            commitBudgetQueue((prev) =>
              prev.length && prev[0] === op
                ? prev.slice(1)
                : prev.filter((item) => item !== op),
            );
          } catch (err) {
            if (isRetryableQueueError(err)) {
              break;
            }
            if (isMissingBudgetTableError(err)) {
              budgetLocalModeRef.current = true;
              break;
            }
            commitBudgetQueue((prev) =>
              prev.length && prev[0] === op
                ? prev.slice(1)
                : prev.filter((item) => item !== op),
            );
            notify("Частину відкладених операцій бюджету не вдалося зберегти", undefined, "Скасувати", true);
          }
        }
      } finally {
        flushingBudgetQueue.current = false;
      }
      if (syncedCount > 0 && !opts?.silent) {
        notify("Офлайн-зміни бюджету синхронізовано");
      }
      return syncedCount;
    },
    [demo, userId, commitBudgetQueue, notify],
  );
  const commitMutationQueue = useCallback(
    (updater: (prev: OfflineMutation[]) => OfflineMutation[]) => {
      const next = updater(mutationQueueRef.current);
      mutationQueueRef.current = next;
      setMutationQueue(next);
      writeOfflineMutationQueue(trashScope, next);
      return next;
    },
    [trashScope],
  );
  const enqueueOfflineMutationOp = useCallback(
    (mut: OfflineMutation) => {
      commitMutationQueue((prev) => enqueueOfflineMutation(prev, mut));
    },
    [commitMutationQueue],
  );
  const flushMutationQueue = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (
        demo ||
        !supabase ||
        !userId ||
        !navigator.onLine ||
        flushingMutationQueue.current ||
        !mutationQueueRef.current.length
      ) {
        return 0;
      }
      flushingMutationQueue.current = true;
      let syncedCount = 0;
      try {
        while (mutationQueueRef.current.length > 0 && navigator.onLine) {
          const m = mutationQueueRef.current[0];
          try {
            if (m.op === "insert") {
              if (m.table === "events") {
                const wantedRec = normalizeRecurrence(
                  typeof m.payload?.recurrence === "string"
                    ? m.payload.recurrence
                    : undefined,
                );
                try {
                  await checked(
                    supabase.from("events").insert(m.payload!).select("id").single(),
                  );
                } catch (err) {
                  if (!isMissingRecurrenceColumn(err)) throw err;
                  const { recurrence: _drop, ...withoutRecurrence } = m.payload!;
                  void _drop;
                  await checked(
                    supabase
                      .from("events")
                      .insert(withoutRecurrence)
                      .select("id")
                      .single(),
                  );
                  saveLocalRecurrence(m.entityId, wantedRec);
                }
              } else if (m.table === "pantry") {
                await checked(
                  supabase
                    .from("pantry_items")
                    .insert(m.payload!)
                    .select("id")
                    .single(),
                );
              } else {
                const { error } = await supabase
                  .from(m.table)
                  .insert(m.payload!)
                  .select("id")
                  .single();
                if (error && (error as { code?: string }).code !== "23505") {
                  throw error;
                }
              }
            } else if (m.op === "update") {
              if (m.table === "events" && m.payload && "recurrence" in m.payload) {
                const wantedRec = normalizeRecurrence(
                  typeof m.payload.recurrence === "string"
                    ? m.payload.recurrence
                    : undefined,
                );
                try {
                  await checked(
                    supabase
                      .from("events")
                      .update(m.payload)
                      .eq("id", m.entityId)
                      .select("id")
                      .single(),
                  );
                } catch (err) {
                  if (!isMissingRecurrenceColumn(err)) throw err;
                  const { recurrence: _drop, ...withoutRecurrence } = m.payload;
                  void _drop;
                  await checked(
                    supabase
                      .from("events")
                      .update(withoutRecurrence)
                      .eq("id", m.entityId)
                      .select("id")
                      .single(),
                  );
                  saveLocalRecurrence(m.entityId, wantedRec);
                }
              } else if (m.table === "pantry") {
                await checked(
                  supabase
                    .from("pantry_items")
                    .update(m.payload!)
                    .eq("id", m.entityId)
                    .select("id")
                    .single(),
                );
              } else {
                await checked(
                  supabase
                    .from(m.table)
                    .update(m.payload!)
                    .eq("id", m.entityId)
                    .select("id")
                    .single(),
                );
              }
            } else if (m.op === "delete") {
              if (m.table === "wishes") {
                await checked(
                  supabase.rpc("delete_wish", { p_wish_id: m.entityId }),
                );
              } else if (m.table === "pantry") {
                await checked(
                  supabase
                    .from("pantry_items")
                    .delete()
                    .eq("id", m.entityId)
                    .select("id")
                    .single(),
                );
              } else {
                await checked(
                  supabase
                    .from(m.table)
                    .delete()
                    .eq("id", m.entityId)
                    .select("id")
                    .single(),
                );
              }
            }
            syncedCount++;
            commitMutationQueue((prev) =>
              prev.length && prev[0] === m
                ? prev.slice(1)
                : prev.filter((item) => item !== m),
            );
          } catch (err) {
            if (isRetryableQueueError(err)) {
              break;
            }
            commitMutationQueue((prev) =>
              prev.length && prev[0] === m
                ? prev.slice(1)
                : prev.filter((item) => item !== m),
            );
            notify("Частину відкладених змін не вдалося синхронізувати", undefined, "Скасувати", true);
          }
        }
      } finally {
        flushingMutationQueue.current = false;
      }
      if (syncedCount > 0 && !opts?.silent) {
        notify("Офлайн-зміни синхронізовано");
      }
      return syncedCount;
    },
    [demo, userId, commitMutationQueue, notify],
  );
  const refresh = useCallback(async () => {
    if (!supabase || !userId) return;
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }
    const exec = (async () => {
      const current = ++revision.current;
      try {
      if (navigator.onLine && shoppingQueueRef.current.length > 0) {
        await flushShoppingQueue({ silent: false });
      }
      if (navigator.onLine && budgetQueueRef.current.length > 0) {
        await flushBudgetQueue({ silent: false });
      }
      if (navigator.onLine && mutationQueueRef.current.length > 0) {
        await flushMutationQueue({ silent: false });
      }
      const members = await checked(
        supabase
          .from("couple_members")
          .select("couple_id")
          .eq("user_id", userId)
          .maybeSingle(),
      );
      const couple = members?.couple_id as string | undefined;
      if (!couple) {
        const profile = await checked(
          supabase.from("profiles").select("*").eq("id", userId),
        );
        if (current === revision.current) {
          coupleIdRef.current = null;
          clearAppCache(trashScope);
          setCoupleId(null);
          setData({ ...empty, profiles: profile as Profile[] });
          setFailure(false);
        }
        return;
      }
      let budgetSchemaMissing = false;
      let budgetRecurringMissing = false;
      const [
        profiles,
        shopping,
        sessions,
        wishes,
        reservations,
        events,
        history,
        movies,
        activities,
        reads,
        recipes,
        mealPlan,
        pantry,
        plants,
        plantCare,
        recipeFavorites,
        recipeCooks,
        budgetCategories,
        budgetTransactions,
        budgetMerchantRules,
        budgetSettings,
        budgetRecurring,
      ] = await Promise.all([
        readAll<Profile>("profiles"),
        readAll<Data["shopping"][number]>("shopping_items", {
          couple_id: couple,
        }),
        readAll<Data["sessions"][number]>(
          "shopping_sessions",
          { couple_id: couple },
          "created_at",
          false,
        ),
        readAll<Data["wishes"][number]>(
          "wishes",
          { couple_id: couple },
          "created_at",
          false,
        ),
        readAll<Data["reservations"][number]>("gift_reservations", {
          reserved_by: userId,
        }),
        readAll<Data["events"][number]>(
          "events",
          { couple_id: couple },
          "date",
        ),
        readAll<Data["history"][number]>("shopping_product_history", {
          couple_id: couple,
        }),
        readAll<Data["movies"][number]>(
          "movies",
          { couple_id: couple },
          "created_at",
          false,
        ),
        readAll<Data["activities"][number]>(
          "activity_events",
          { couple_id: couple },
          "created_at",
          false,
          300,
        ),
        readAll<Data["reads"][number]>("activity_reads", { user_id: userId }),
        readAll<Data["recipes"][number]>("recipes", { couple_id: couple }),
        readAll<MealPlanItem>("meal_plan_items", { couple_id: couple }),
        readAll<PantryItem>("pantry_items", { couple_id: couple }).catch(
          (err) => {
            if (isMissingTableError(err)) return [] as PantryItem[];
            throw err;
          },
        ),
        readAll<Plant>("plants", { couple_id: couple }, "created_at", false),
        readAll<PlantCareEvent>(
          "plant_care_events",
          { couple_id: couple },
          "occurred_at",
          false,
        ),
        checked(
          supabase
            .from("recipe_favorites")
            .select("user_id,recipe_key")
            .eq("user_id", userId)
            .order("recipe_key"),
        ) as Promise<RecipeFavorite[]>,
        readAll<RecipeCook>(
          "recipe_cooks",
          { couple_id: couple },
          "cooked_at",
          false,
        ),
        readAll<BudgetCategory>(
          "budget_categories",
          { couple_id: couple },
          "sort_order",
        ).catch((err) => {
          if (isMissingBudgetTableError(err)) {
            budgetSchemaMissing = true;
            return [] as BudgetCategory[];
          }
          throw err;
        }),
        readAll<BudgetTransaction>(
          "budget_transactions",
          { couple_id: couple },
          "occurred_on",
          false,
        ).catch((err) => {
          if (isMissingBudgetTableError(err)) {
            budgetSchemaMissing = true;
            return [] as BudgetTransaction[];
          }
          throw err;
        }),
        readAll<BudgetMerchantRule>(
          "budget_merchant_rules",
          { couple_id: couple },
          "created_at",
          false,
        ).catch((err) => {
          if (isMissingBudgetTableError(err)) {
            budgetSchemaMissing = true;
            return [] as BudgetMerchantRule[];
          }
          throw err;
        }),
        readAll<BudgetSettings>(
          "budget_settings",
          { couple_id: couple },
          "user_id",
        ).catch((err) => {
          if (isMissingBudgetTableError(err)) {
            budgetSchemaMissing = true;
            return [] as BudgetSettings[];
          }
          throw err;
        }),
        readAll<BudgetRecurringPayment>(
          "budget_recurring_payments",
          { couple_id: couple },
          "day_of_month",
        ).catch((err) => {
          if (isMissingBudgetTableError(err)) {
            budgetRecurringMissing = true;
            return [] as BudgetRecurringPayment[];
          }
          throw err;
        }),
      ]);
      let finalBudgetCategories = budgetCategories;
      let finalBudgetTransactions = budgetTransactions;
      let finalBudgetMerchantRules = budgetMerchantRules;
      let finalBudgetSettings = budgetSettings;
      let finalBudgetRecurring = budgetRecurring;

      if (budgetSchemaMissing) {
        budgetLocalModeRef.current = true;
        budgetRecurringLocalRef.current = true;
        const localBudget = readLocalBudgetState(couple, userId);
        finalBudgetCategories = localBudget.categories;
        finalBudgetTransactions = localBudget.transactions;
        finalBudgetMerchantRules = localBudget.merchantRules;
        finalBudgetSettings = localBudget.settings;
        finalBudgetRecurring = localBudget.recurring;
      } else {
        budgetLocalModeRef.current = false;
        if (budgetRecurringMissing) {
          budgetRecurringLocalRef.current = true;
          finalBudgetRecurring = readLocalBudgetState(couple, userId).recurring;
        } else {
          budgetRecurringLocalRef.current = false;
        }
        const pendingLocal = peekLocalBudgetPendingSync(couple);
        if (pendingLocal) {
          try {
            if (pendingLocal.categories.length > 0) {
              await checked(
                supabase.from("budget_categories").upsert(
                  pendingLocal.categories.map((c) => ({
                    id: c.id,
                    couple_id: couple,
                    kind: c.kind,
                    name: c.name,
                    emoji: c.emoji,
                    sort_order: c.sort_order,
                    created_by: c.created_by || userId,
                  })),
                  { onConflict: "id", ignoreDuplicates: true },
                ),
              );
            }
            if (pendingLocal.transactions.length > 0) {
              await checked(
                supabase.from("budget_transactions").upsert(
                  pendingLocal.transactions.map((r) => ({
                    id: r.id,
                    couple_id: couple,
                    user_id: r.user_id || userId,
                    kind: r.kind,
                    amount: r.amount,
                    merchant: r.merchant,
                    note: r.note,
                    category_key: r.category_key,
                    status: r.status,
                    source: r.source,
                    is_private: r.is_private,
                    card_label: r.card_label,
                    occurred_on: r.occurred_on,
                    occurred_at: r.occurred_at,
                  })),
                  { onConflict: "id", ignoreDuplicates: true },
                ),
              );
            }
            if (pendingLocal.merchantRules.length > 0) {
              await checked(
                supabase.from("budget_merchant_rules").upsert(
                  pendingLocal.merchantRules.map((r) => ({
                    couple_id: couple,
                    merchant_pattern: r.merchant_pattern,
                    category_key: r.category_key,
                    kind: r.kind,
                    created_by: r.created_by || userId,
                  })),
                  { onConflict: "couple_id,normalized_pattern" },
                ),
              );
            }
            const mySetting = pendingLocal.settings.find(
              (s) => s.user_id === userId,
            );
            if (mySetting) {
              await checked(
                supabase.rpc("set_budget_income_sharing", {
                  p_share: mySetting.share_income_with_partner,
                }),
              );
              await checked(
                supabase
                  .from("budget_transactions")
                  .update({ is_private: !mySetting.share_income_with_partner })
                  .eq("couple_id", couple)
                  .eq("user_id", userId),
              );
            }
            markLocalBudgetSynced(couple);
            [
              finalBudgetCategories,
              finalBudgetTransactions,
              finalBudgetMerchantRules,
              finalBudgetSettings,
            ] = await Promise.all([
              readAll<BudgetCategory>(
                "budget_categories",
                { couple_id: couple },
                "sort_order",
              ),
              readAll<BudgetTransaction>(
                "budget_transactions",
                { couple_id: couple },
                "occurred_on",
                false,
              ),
              readAll<BudgetMerchantRule>(
                "budget_merchant_rules",
                { couple_id: couple },
                "created_at",
                false,
              ),
              readAll<BudgetSettings>(
                "budget_settings",
                { couple_id: couple },
                "user_id",
              ),
            ]);
          } catch {
            // Keep pendingSync = true to retry on next refresh
          }
        }
      }
      if (current !== revision.current) return;
      const mergedShopping = applyShoppingQueue(
        shopping,
        shoppingQueueRef.current,
      );
      writeShoppingCache(trashScope, mergedShopping);
      const mergedBudgetTransactions = applyBudgetQueue(
        finalBudgetTransactions,
        budgetQueueRef.current,
      );
      writeBudgetCache(trashScope, mergedBudgetTransactions);
      const localRecurrences = readLocalRecurrences();
      const localFulfilled = readLocalFulfilledWishes(trashScope);
      coupleIdRef.current = couple;
      setCoupleId(couple);
      const nextData: Data = {
        mealPlan,
        pantry,
        recipes,
        profiles,
        shopping: mergedShopping,
        sessions,
        wishes: wishes.map((w) => ({
          ...w,
          fulfilled:
            typeof w.fulfilled === "boolean"
              ? w.fulfilled
              : Boolean(localFulfilled[w.id]),
        })),
        reservations,
        events: events.map((ev) => ({
          ...ev,
          recurrence: ev.recurrence ?? localRecurrences[ev.id] ?? "none",
        })),
        plants,
        plantCare,
        recipeFavorites,
        recipeCooks,
        history,
        movies,
        activities,
        reads,
        budgetCategories: finalBudgetCategories,
        budgetTransactions: mergedBudgetTransactions,
        budgetMerchantRules: finalBudgetMerchantRules,
        budgetSettings: finalBudgetSettings,
        budgetRecurring: finalBudgetRecurring,
      };
      setData(nextData);
      writeAppCache(trashScope, couple, nextData);
      lastRefreshAtRef.current = Date.now();
      setFailure(false);
    } catch {
      if (current === revision.current) {
        const cachedApp = readAppCache(trashScope, empty);
        const cachedShopping = readShoppingCache(trashScope);
        const cachedBudget = readBudgetCache(trashScope);
        if (coupleIdRef.current || cachedApp) {
          if (!coupleIdRef.current && cachedApp) {
            coupleIdRef.current = cachedApp.coupleId;
            setCoupleId(cachedApp.coupleId);
          }
          setData((prev) => {
            const base =
              prev.profiles.length ||
              prev.shopping.length ||
              prev.budgetTransactions.length
                ? prev
                : (cachedApp?.data ?? prev);
            return {
              ...base,
              shopping: applyShoppingQueue(
                base.shopping.length ? base.shopping : cachedShopping,
                shoppingQueueRef.current,
              ),
              budgetTransactions: applyBudgetQueue(
                base.budgetTransactions.length
                  ? base.budgetTransactions
                  : cachedBudget,
                budgetQueueRef.current,
              ),
            };
          });
          setFailure(false);
        } else {
          setFailure(true);
          notify("Не вдалося оновити дані. Перевірте з’єднання.");
        }
      }
    } finally {
      if (current === revision.current) setLoading(false);
    }
    })();
    refreshInFlightRef.current = exec;
    try {
      await exec;
    } finally {
      if (refreshInFlightRef.current === exec) {
        refreshInFlightRef.current = null;
      }
    }
  }, [userId, notify, flushShoppingQueue, flushBudgetQueue, flushMutationQueue, trashScope]);
  useEffect(() => {
    if (demo) return;
    if (!userId) {
      revision.current++;
      coupleIdRef.current = null;
      setData(empty);
      setCoupleId(null);
      setLoading(false);
      return;
    }
    const cachedApp = readAppCache(trashScope, empty);
    if (cachedApp) {
      const loadedShoppingQueue = readShoppingQueue(trashScope);
      const loadedBudgetQueue = readBudgetQueue(trashScope);
      coupleIdRef.current = cachedApp.coupleId;
      setCoupleId(cachedApp.coupleId);
      setData({
        ...cachedApp.data,
        shopping: applyShoppingQueue(
          cachedApp.data.shopping,
          loadedShoppingQueue,
        ),
        budgetTransactions: applyBudgetQueue(
          cachedApp.data.budgetTransactions,
          loadedBudgetQueue,
        ),
      });
      setFailure(false);
      setLoading(false);
      if (navigator.onLine) {
        void refresh();
      }
      return;
    }
    coupleIdRef.current = null;
    setData(empty);
    setCoupleId(null);
    setLoading(true);
    void refresh();
  }, [demo, userId, trashScope, refresh]);
  useEffect(() => {
    if (!supabase || !coupleId || !userId) return;
    let refreshTimer: number | null = null;
    let hadLiveOnce = false;
    const scheduleRefresh = () => {
      if (refreshTimer !== null) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refresh();
      }, 180);
    };

    const channel = supabase.channel(`space:${coupleId}`);
    // Consolidate to a single wildcard listener per RLS-protected table
    // (cuts server-side Realtime subscription setup from ~59 filters down to ~23).
    for (const table of [
      "shopping_items",
      "shopping_sessions",
      "shopping_product_history",
      "events",
      "couple_members",
      "movies",
      "recipes",
      "meal_plan_items",
      "pantry_items",
      "plants",
      "plant_care_events",
      "recipe_cooks",
      "activity_events",
      "budget_categories",
      "budget_transactions",
      "budget_merchant_rules",
      "budget_settings",
      "budget_recurring_payments",
    ]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleRefresh,
      );
    }
    // Wishes stay scoped to INSERT/UPDATE for couple_id to preserve private-wish deletion semantics.
    for (const event of ["INSERT", "UPDATE"] as const) {
      channel.on(
        "postgres_changes",
        {
          event,
          schema: "public",
          table: "wishes",
          filter: `couple_id=eq.${coupleId}`,
        },
        scheduleRefresh,
      );
    }
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "recipe_favorites",
        filter: `user_id=eq.${userId}`,
      },
      scheduleRefresh,
    );
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      scheduleRefresh,
    );
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "activity_reads",
        filter: `user_id=eq.${userId}`,
      },
      scheduleRefresh,
    );
    // Secret gifts are intentionally absent from Realtime publication.
    // The author refreshes after mutations and when returning to this page.
    channel.on("system", {}, (payload) => {
      if (payload.extension === "postgres_changes" && payload.status === "ok") {
        setSync("live");
        // Only refresh after an actual reconnect gap; initial boot already loaded data.
        if (hadLiveOnce) {
          scheduleRefresh();
        }
        hadLiveOnce = true;
      }
    });
    let retryTimer: number | null = null;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setSync("live");
        return;
      }
      setSync("connecting");
      if (
        (status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED") &&
        retryTimer === null
      ) {
        const delay = Math.min(30_000, 3000 * 2 ** Math.min(realtimeRetry, 3));
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          setRealtimeRetry((n) => n + 1);
        }, delay);
      }
    });
    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      void supabase!.removeChannel(channel);
    };
  }, [coupleId, userId, refresh, realtimeRetry]);
  useEffect(() => {
    if (online && !demo && userId && Date.now() - lastRefreshAtRef.current > 2000) {
      void refresh();
    }
  }, [online, demo, userId, refresh]);
  useEffect(() => {
    const visible = () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        !demo &&
        Date.now() - lastRefreshAtRef.current > 15_000
      ) {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [refresh, demo]);
  const enqueueOfflineShopping = useCallback(
    (op: ShoppingQueueOp) => {
      commitShoppingQueue((prev) => enqueueShoppingOp(prev, op));
      setData((d) => {
        const nextShopping = applyShoppingQueue(d.shopping, [op]);
        writeShoppingCache(trashScope, nextShopping);
        return {
          ...d,
          shopping: nextShopping,
          ...(op.op === "remove" && op.menuKey
            ? {
                menuExcludedKeys: [
                  ...(d.menuExcludedKeys ?? []),
                  op.menuKey,
                ],
              }
            : {}),
        };
      });
    },
    [commitShoppingQueue, trashScope],
  );
  const run = async (
    key: string,
    action: () => Promise<void | { skipRefresh?: boolean }>,
    message?: string,
  ) => {
    if (busy.current.has(key)) return false;
    if (!demo && !online) {
      notify("Немає з’єднання. Зміни ще не збережено.");
      return false;
    }
    busy.current.add(key);
    setPending([...busy.current]);
    try {
      const outcome = await action();
      if (!demo && !outcome?.skipRefresh) await refresh();
      if (message && !outcome?.skipRefresh) notify(message);
      return true;
    } catch (e) {
      notify(errorMessage(e));
      return false;
    } finally {
      busy.current.delete(key);
      setPending([...busy.current]);
    }
  };
  const demoActivity = (
    d: Data,
    table: Table,
    row: Record<string, unknown>,
    action: Activity["action"],
  ): Data => {
    if (table === "gift_reservations") return d;
    if (table === "wishes" && row.is_private === true) return d;
    return {
      ...d,
      activities: [
        {
          id: crypto.randomUUID(),
          couple_id: DEMO_COUPLE,
          actor_id: userId,
          kind: table === "shopping_items" ? "shopping" : table,
          action,
          entity_id: typeof row.id === "string" ? row.id : null,
          title: String(row.name || row.title || "Оновлення").slice(0, 160),
          created_at: new Date().toISOString(),
        },
        ...d.activities,
      ],
    };
  };
  const insert = async (
    table: Table,
    value: Record<string, unknown>,
    key: string,
    message: string,
  ) => {
    const isMutationTable =
      table === "events" ||
      table === "wishes" ||
      table === "movies" ||
      table === "recipes";
    const now = new Date().toISOString();
    const row: Record<string, unknown> & { id: string } = {
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
      ...value,
    };
    if (isMutationTable && !demo && (!online || !navigator.onLine)) {
      if (table === "wishes") {
        setData((d) => ({
          ...d,
          wishes: [row as unknown as Data["wishes"][number], ...d.wishes],
        }));
      } else if (table === "events") {
        setData((d) => ({
          ...d,
          events: [row as unknown as Data["events"][number], ...d.events],
        }));
      } else if (table === "movies") {
        setData((d) => ({
          ...d,
          movies: [row as unknown as Data["movies"][number], ...d.movies],
        }));
      } else if (table === "recipes") {
        setData((d) => ({
          ...d,
          recipes: [row as unknown as Data["recipes"][number], ...d.recipes],
        }));
      }
      enqueueOfflineMutationOp({
        id: crypto.randomUUID(),
        table,
        op: "insert",
        entityId: row.id,
        payload: row,
        queuedAt: now,
      });
      if (message) notify(message);
      return true;
    }
    return run(
      key,
      async () => {
        if (supabase) {
          if (table === "events") {
            const wantedRec = normalizeRecurrence(
              typeof row.recurrence === "string" ? row.recurrence : undefined,
            );
            try {
              await checked(supabase.from(table).insert(row).select("id").single());
            } catch (err) {
              if (isOfflineNetworkError(err)) {
                setData((d) => ({
                  ...d,
                  events: [
                    row as unknown as Data["events"][number],
                    ...d.events,
                  ],
                }));
                enqueueOfflineMutationOp({
                  id: crypto.randomUUID(),
                  table: "events",
                  op: "insert",
                  entityId: row.id,
                  payload: row,
                  queuedAt: now,
                });
                notify(message || "Збережено офлайн · синхронізується з мережею");
                return { skipRefresh: true };
              }
              if (!isMissingRecurrenceColumn(err)) throw err;
              const { recurrence: _drop, ...withoutRecurrence } = row;
              void _drop;
              await checked(
                supabase.from(table).insert(withoutRecurrence).select("id").single(),
              );
              saveLocalRecurrence(row.id, wantedRec);
            }
          } else {
            try {
              await checked(supabase.from(table).insert(row).select("id").single());
            } catch (err) {
              if (isMutationTable && isOfflineNetworkError(err)) {
                if (table === "wishes") {
                  setData((d) => ({
                    ...d,
                    wishes: [row as unknown as Data["wishes"][number], ...d.wishes],
                  }));
                } else if (table === "movies") {
                  setData((d) => ({
                    ...d,
                    movies: [row as unknown as Data["movies"][number], ...d.movies],
                  }));
                } else if (table === "recipes") {
                  setData((d) => ({
                    ...d,
                    recipes: [row as unknown as Data["recipes"][number], ...d.recipes],
                  }));
                }
                enqueueOfflineMutationOp({
                  id: crypto.randomUUID(),
                  table: table as OfflineMutationTable,
                  op: "insert",
                  entityId: row.id,
                  payload: row,
                  queuedAt: now,
                });
                notify(message || "Збережено офлайн · синхронізується з мережею");
                return { skipRefresh: true };
              }
              throw err;
            }
          }
        } else {
          const field = (
            {
              shopping_items: "shopping",
              wishes: "wishes",
              events: "events",
              gift_reservations: "reservations",
              movies: "movies",
              recipes: "recipes",
            } as const
          )[table];
          setData((d) =>
            demoActivity(
              { ...d, [field]: [...d[field], row] },
              table,
              row,
              "added",
            ),
          );
        }
      },
      message,
    );
  };
  const update = async (
    table: Table,
    id: string,
    patch: Record<string, unknown>,
    message?: string,
  ) => {
    const hasQueuedShoppingOp =
      table === "shopping_items" &&
      !demo &&
      shoppingQueueRef.current.some((op) => op.id === id);
    if (
      table === "shopping_items" &&
      !demo &&
      (!online || !navigator.onLine || hasQueuedShoppingOp)
    ) {
      const queuedAt = new Date().toISOString();
      enqueueOfflineShopping({ op: "update", id, patch, queuedAt });
      if (online && navigator.onLine && supabase) {
        void refresh();
      }
      if (message) notify(message);
      return true;
    }
    if (table === "shopping_items" && !demo && supabase) {
      if (busy.current.has(id)) return false;
      busy.current.add(id);
      setPending([...busy.current]);
      const prevRow = data.shopping.find((r) => r.id === id);
      // Optimistic UI immediately even before network returns
      setData((d) => {
        const nextShopping = d.shopping.map((row) =>
          row.id === id
            ? { ...row, ...(patch as Partial<ShoppingItem>), updated_at: new Date().toISOString() }
            : row,
        );
        writeShoppingCache(trashScope, nextShopping);
        return { ...d, shopping: nextShopping };
      });
      try {
        await checked(
          supabase
            .from(table)
            .update(patch)
            .eq("id", id)
            .select("id")
            .single(),
        );
        await refresh();
        if (message) notify(message);
        return true;
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          enqueueOfflineShopping({
            op: "update",
            id,
            patch,
            queuedAt: new Date().toISOString(),
          });
          notify(message || "Збережено офлайн · синхронізується з мережею");
          return true;
        }
        if (prevRow) {
          setData((d) => ({
            ...d,
            shopping: d.shopping.map((r) => (r.id === id ? prevRow : r)),
          }));
        }
        notify(errorMessage(err));
        return false;
      } finally {
        busy.current.delete(id);
        setPending([...busy.current]);
      }
    }
    const isMutationTable =
      table === "events" ||
      table === "wishes" ||
      table === "movies" ||
      table === "recipes";
    const hasQueuedMutationOp =
      isMutationTable &&
      !demo &&
      mutationQueueRef.current.some((m) => m.entityId === id);
    if (
      isMutationTable &&
      !demo &&
      (!online || !navigator.onLine || hasQueuedMutationOp)
    ) {
      const field = (
        {
          wishes: "wishes",
          events: "events",
          movies: "movies",
          recipes: "recipes",
        } as const
      )[table];
      setData((d) => ({
        ...d,
        [field]: d[field].map((row) =>
          row.id === id
            ? { ...row, ...patch, updated_at: new Date().toISOString() }
            : row,
        ),
      }));
      enqueueOfflineMutationOp({
        id: crypto.randomUUID(),
        table,
        op: "update",
        entityId: id,
        payload: patch,
        queuedAt: new Date().toISOString(),
      });
      if (online && navigator.onLine && supabase) {
        void refresh();
      }
      if (message) notify(message);
      return true;
    }
    return run(
      id,
      async () => {
        if (supabase) {
          try {
            if (table === "events" && "recurrence" in patch) {
              const wantedRec = normalizeRecurrence(
                typeof patch.recurrence === "string" ? patch.recurrence : undefined,
              );
              try {
                await checked(
                  supabase
                    .from(table)
                    .update(patch)
                    .eq("id", id)
                    .select("id")
                    .single(),
                );
              } catch (err) {
                if (!isMissingRecurrenceColumn(err)) throw err;
                const { recurrence: _drop, ...withoutRecurrence } = patch;
                void _drop;
                await checked(
                  supabase
                    .from(table)
                    .update(withoutRecurrence)
                    .eq("id", id)
                    .select("id")
                    .single(),
                );
                saveLocalRecurrence(id, wantedRec);
              }
            } else {
              await checked(
                supabase
                  .from(table)
                  .update(patch)
                  .eq("id", id)
                  .select("id")
                  .single(),
              );
            }
          } catch (err) {
            if (isMutationTable && isOfflineNetworkError(err)) {
              const field = (
                {
                  wishes: "wishes",
                  events: "events",
                  movies: "movies",
                  recipes: "recipes",
                } as const
              )[table];
              setData((d) => ({
                ...d,
                [field]: d[field].map((row) =>
                  row.id === id
                    ? { ...row, ...patch, updated_at: new Date().toISOString() }
                    : row,
                ),
              }));
              enqueueOfflineMutationOp({
                id: crypto.randomUUID(),
                table,
                op: "update",
                entityId: id,
                payload: patch,
                queuedAt: new Date().toISOString(),
              });
              notify(message || "Збережено офлайн · синхронізується з мережею");
              return { skipRefresh: true };
            }
            throw err;
          }
        } else {
          const field = (
            {
              shopping_items: "shopping",
              wishes: "wishes",
              events: "events",
              gift_reservations: "reservations",
              movies: "movies",
              recipes: "recipes",
            } as const
          )[table];
          setData((d) =>
            demoActivity(
              {
                ...d,
                [field]: d[field].map((row) =>
                  row.id === id
                    ? { ...row, ...patch, updated_at: new Date().toISOString() }
                    : row,
                ),
                ...(table === "recipes"
                  ? (() => {
                      const recipe = d.recipes.find((row) => row.id === id);
                      if (!recipe) return {};
                      const updated = customRecipeView({ ...recipe, ...patch });
                      const mealPlan = d.mealPlan.map((item) =>
                        item.recipe_id === id
                          ? {
                              ...item,
                              ingredients: updated.ingredients,
                              base_servings: updated.baseServings,
                              shopping_completed:
                                item.shopping_completed &&
                                JSON.stringify(item.ingredients) ===
                                  JSON.stringify(updated.ingredients) &&
                                item.base_servings === updated.baseServings,
                            }
                          : item,
                      );
                      return {
                        mealPlan,
                        shopping: syncDemoMenuShopping(
                          mealPlan,
                          d.shopping,
                          d.menuExcludedKeys ?? [],
                          userId,
                          DEMO_COUPLE,
                          d.pantry,
                        ),
                      };
                    })()
                  : {}),
              },
              table,
              { ...d[field].find((row) => row.id === id), ...patch },
              patch.purchased === true ? "purchased" : "updated",
            ),
          );
        }
      },
      message,
    );
  };
  const snapshotRow = (table: Table, id: string): Record<string, unknown> | null => {
    if (table === "shopping_items")
      return (data.shopping.find((r) => r.id === id) as Record<string, unknown> | undefined) ?? null;
    if (table === "wishes")
      return (data.wishes.find((r) => r.id === id) as Record<string, unknown> | undefined) ?? null;
    if (table === "events")
      return (data.events.find((r) => r.id === id) as Record<string, unknown> | undefined) ?? null;
    if (table === "movies")
      return (data.movies.find((r) => r.id === id) as Record<string, unknown> | undefined) ?? null;
    if (table === "recipes")
      return (data.recipes.find((r) => r.id === id) as Record<string, unknown> | undefined) ?? null;
    return null;
  };
  const remove = async (table: Table, id: string) => {
    const snap = snapshotRow(table, id);
    const hasQueuedShoppingOp =
      table === "shopping_items" &&
      !demo &&
      shoppingQueueRef.current.some((op) => op.id === id);
    if (
      table === "shopping_items" &&
      !demo &&
      (!online || !navigator.onLine || hasQueuedShoppingOp)
    ) {
      const menuKey =
        typeof snap?.menu_key === "string" ? snap.menu_key : undefined;
      enqueueOfflineShopping({
        op: "remove",
        id,
        menuKey,
        queuedAt: new Date().toISOString(),
      });
      if (online && navigator.onLine && supabase) {
        void refresh();
      }
      if (snap) {
        const res = pushTrash("shopping_items", snap, trashScope);
        setTrash(res.entries);
        notify(
          hasQueuedShoppingOp && online ? "Переміщено в кошик" : "Переміщено в кошик (офлайн)",
          () => void restoreFromTrash(res.entry.id),
          "Відновити",
        );
      } else {
        notify(hasQueuedShoppingOp && online ? "Видалено" : "Видалено (офлайн)");
      }
      return true;
    }
    const isMutationTable =
      table === "wishes" ||
      table === "events" ||
      table === "movies" ||
      table === "recipes";
    const hasQueuedMutationOp =
      isMutationTable &&
      !demo &&
      mutationQueueRef.current.some((m) => m.entityId === id);
    if (
      isMutationTable &&
      !demo &&
      (!online || !navigator.onLine || hasQueuedMutationOp)
    ) {
      const field = (
        {
          wishes: "wishes",
          events: "events",
          movies: "movies",
          recipes: "recipes",
        } as const
      )[table];
      setData((d) => ({
        ...d,
        [field]: d[field].filter((r) => r.id !== id),
      }));
      enqueueOfflineMutationOp({
        id: crypto.randomUUID(),
        table,
        op: "delete",
        entityId: id,
        queuedAt: new Date().toISOString(),
      });
      if (online && navigator.onLine && supabase) {
        void refresh();
      }
      if (snap) {
        const res = pushTrash(table, snap, trashScope);
        setTrash(res.entries);
        notify(
          "Переміщено в кошик (офлайн)",
          () => void restoreFromTrash(res.entry.id),
          "Відновити",
        );
      } else {
        notify("Видалено (офлайн)");
      }
      return true;
    }
    let trashedEntry: TrashEntry | null = null;
    const ok = await run(id, async () => {
      if (supabase) {
        if (table === "wishes") {
          try {
            await checked(supabase.rpc("delete_wish", { p_wish_id: id }));
          } catch (err) {
            if (isOfflineNetworkError(err)) {
              enqueueOfflineMutationOp({
                id: crypto.randomUUID(),
                table: "wishes",
                op: "delete",
                entityId: id,
                queuedAt: new Date().toISOString(),
              });
            } else {
              throw err;
            }
          }
        } else {
          try {
            await checked(
              supabase.from(table).delete().eq("id", id).select("id").single(),
            );
          } catch (err) {
            if (table === "shopping_items" && isOfflineNetworkError(err)) {
              const menuKey =
                typeof snap?.menu_key === "string" ? snap.menu_key : undefined;
              enqueueOfflineShopping({
                op: "remove",
                id,
                menuKey,
                queuedAt: new Date().toISOString(),
              });
            } else if (isMutationTable && isOfflineNetworkError(err)) {
              enqueueOfflineMutationOp({
                id: crypto.randomUUID(),
                table,
                op: "delete",
                entityId: id,
                queuedAt: new Date().toISOString(),
              });
            } else {
              throw err;
            }
          }
        }
      } else {
        const field = (
          {
            shopping_items: "shopping",
            wishes: "wishes",
            events: "events",
            gift_reservations: "reservations",
            movies: "movies",
            recipes: "recipes",
          } as const
        )[table];
        setData((d) =>
          demoActivity(
            {
              ...d,
              [field]: d[field].filter((row) => row.id !== id),
              ...(table === "shopping_items" &&
              d.shopping.find((row) => row.id === id)?.menu_key
                ? {
                    menuExcludedKeys: [
                      ...(d.menuExcludedKeys ?? []),
                      d.shopping.find((row) => row.id === id)!.menu_key!,
                    ],
                  }
                : {}),
              ...(table === "recipes"
                ? {
                    mealPlan: d.mealPlan.filter((row) => row.recipe_id !== id),
                    shopping: syncDemoMenuShopping(
                      d.mealPlan.filter((row) => row.recipe_id !== id),
                      d.shopping,
                      d.menuExcludedKeys ?? [],
                      userId,
                      DEMO_COUPLE,
                      d.pantry,
                    ),
                  }
                : {}),
              ...(table === "wishes"
                ? {
                    reservations: d.reservations.filter((r) => r.wish_id !== id),
                  }
                : {}),
            },
            table,
            { ...d[field].find((row) => row.id === id) },
            "deleted",
          ),
        );
      }
      if (table === "events") deleteLocalRecurrence(id);
      if (snap && table !== "gift_reservations") {
        const res = pushTrash(table as TrashKind, snap, trashScope);
        trashedEntry = res.entry;
        setTrash(res.entries);
      }
    });
    if (ok) {
      if (trashedEntry) {
        const entryId = (trashedEntry as TrashEntry).id;
        notify("Переміщено в кошик", () => void restoreFromTrash(entryId), "Відновити");
      } else {
        notify("Видалено");
      }
    }
    return ok;
  };
  const addShopping = async (value: NewShopping) => {
    if (!demo && (!online || !navigator.onLine)) {
      const now = new Date().toISOString();
      const item: ShoppingItem = {
        id: crypto.randomUUID(),
        couple_id: coupleId ?? "",
        added_by: userId,
        purchased: false,
        session_id: null,
        created_at: now,
        updated_at: now,
        ...value,
      };
      enqueueOfflineShopping({ op: "add", id: item.id, item, queuedAt: now });
      notify("Товар збережено офлайн");
      return true;
    }
    if (!demo && supabase) {
      if (busy.current.has("add-shopping")) return false;
      busy.current.add("add-shopping");
      setPending([...busy.current]);
      const now = new Date().toISOString();
      const item: ShoppingItem = {
        id: crypto.randomUUID(),
        couple_id: coupleId ?? "",
        added_by: userId,
        purchased: false,
        session_id: null,
        created_at: now,
        updated_at: now,
        ...value,
      };
      try {
        await checked(
          supabase
            .from("shopping_items")
            .insert({
              id: item.id,
              couple_id: item.couple_id,
              added_by: item.added_by,
              purchased: false,
              session_id: null,
              created_at: now,
              updated_at: now,
              ...value,
            })
            .select("id")
            .single(),
        );
        await refresh();
        notify("Товар додано");
        return true;
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          enqueueOfflineShopping({
            op: "add",
            id: item.id,
            item,
            queuedAt: now,
          });
          notify("Товар збережено офлайн");
          return true;
        }
        notify(errorMessage(err));
        return false;
      } finally {
        busy.current.delete("add-shopping");
        setPending([...busy.current]);
      }
    }
    return insert(
      "shopping_items",
      {
        ...value,
        couple_id: coupleId,
        added_by: userId,
        purchased: false,
        session_id: null,
      },
      "add-shopping",
      "Товар додано",
    );
  };
  const addWish = (value: NewWish) =>
    insert(
      "wishes",
      { ...value, couple_id: coupleId, owner_id: userId },
      "add-wish",
      "Бажання збережено",
    );
  const addEvent = (value: NewPlan) =>
    insert(
      "events",
      { ...value, couple_id: coupleId, created_by: userId },
      "add-event",
      "План збережено",
    );
  const addPlant = (value: NewPlant) => {
    const now = new Date().toISOString();
    const row: Plant = {
      id: crypto.randomUUID(),
      couple_id: coupleId ?? DEMO_COUPLE,
      added_by: userId,
      created_at: now,
      updated_at: now,
      wet_checked_at: null,
      ...value,
    };
    if (!demo && (!online || !navigator.onLine)) {
      setData((d) => ({ ...d, plants: [row, ...d.plants] }));
      enqueueOfflineMutationOp({
        id: crypto.randomUUID(),
        table: "plants",
        op: "insert",
        entityId: row.id,
        payload: { ...value, couple_id: coupleId, added_by: userId },
        queuedAt: now,
      });
      notify("Рослину збережено (офлайн)");
      return Promise.resolve(true);
    }
    return run(
      "add-plant",
      async () => {
        if (supabase) {
          try {
            await checked(
              supabase
                .from("plants")
                .insert({ ...value, couple_id: coupleId, added_by: userId })
                .select("id")
                .single(),
            );
          } catch (err) {
            if (isOfflineNetworkError(err)) {
              setData((d) => ({ ...d, plants: [row, ...d.plants] }));
              enqueueOfflineMutationOp({
                id: crypto.randomUUID(),
                table: "plants",
                op: "insert",
                entityId: row.id,
                payload: { ...value, couple_id: coupleId, added_by: userId },
                queuedAt: now,
              });
              notify("Рослину збережено (офлайн)");
              return;
            }
            throw err;
          }
        } else {
          setData((d) => ({ ...d, plants: [row, ...d.plants] }));
        }
      },
      "Рослину збережено",
    );
  };
  const updatePlant = (id: string, patch: Partial<NewPlant>) => {
    if (!demo && (!online || !navigator.onLine)) {
      setData((d) => ({
        ...d,
        plants: d.plants.map((plant) =>
          plant.id === id
            ? { ...plant, ...patch, updated_at: new Date().toISOString() }
            : plant,
        ),
      }));
      enqueueOfflineMutationOp({
        id: crypto.randomUUID(),
        table: "plants",
        op: "update",
        entityId: id,
        payload: patch,
        queuedAt: new Date().toISOString(),
      });
      notify("Дані рослини оновлено (офлайн)");
      return Promise.resolve(true);
    }
    return run(
      `plant-${id}`,
      async () => {
        if (supabase) {
          try {
            await checked(
              supabase
                .from("plants")
                .update(patch)
                .eq("id", id)
                .select("id")
                .single(),
            );
          } catch (err) {
            if (isOfflineNetworkError(err)) {
              setData((d) => ({
                ...d,
                plants: d.plants.map((plant) =>
                  plant.id === id
                    ? { ...plant, ...patch, updated_at: new Date().toISOString() }
                    : plant,
                ),
              }));
              enqueueOfflineMutationOp({
                id: crypto.randomUUID(),
                table: "plants",
                op: "update",
                entityId: id,
                payload: patch,
                queuedAt: new Date().toISOString(),
              });
              notify("Дані рослини оновлено (офлайн)");
              return;
            }
            throw err;
          }
        }
        setData((d) => ({
          ...d,
          plants: d.plants.map((plant) =>
            plant.id === id
              ? { ...plant, ...patch, updated_at: new Date().toISOString() }
              : plant,
          ),
        }));
      },
      "Дані рослини оновлено",
    );
  };
  const removePlant = async (id: string) => {
    const snap = data.plants.find((p) => p.id === id) as
      | Record<string, unknown>
      | undefined;
    if (!demo && (!online || !navigator.onLine)) {
      setData((d) => ({
        ...d,
        plants: d.plants.filter((plant) => plant.id !== id),
        plantCare: d.plantCare.filter((entry) => entry.plant_id !== id),
      }));
      enqueueOfflineMutationOp({
        id: crypto.randomUUID(),
        table: "plants",
        op: "delete",
        entityId: id,
        queuedAt: new Date().toISOString(),
      });
      if (snap) {
        const res = pushTrash("plants", snap, trashScope);
        setTrash(res.entries);
        notify(
          "Рослину переміщено в кошик (офлайн)",
          () => void restoreFromTrash(res.entry.id),
          "Відновити",
        );
      } else {
        notify("Рослину видалено (офлайн)");
      }
      return true;
    }
    let trashedEntry: TrashEntry | null = null;
    const ok = await run(`plant-${id}`, async () => {
      if (supabase) {
        try {
          await checked(
            supabase.from("plants").delete().eq("id", id).select("id").single(),
          );
        } catch (err) {
          if (isOfflineNetworkError(err)) {
            enqueueOfflineMutationOp({
              id: crypto.randomUUID(),
              table: "plants",
              op: "delete",
              entityId: id,
              queuedAt: new Date().toISOString(),
            });
          } else {
            throw err;
          }
        }
      } else {
        setData((d) => ({
          ...d,
          plants: d.plants.filter((plant) => plant.id !== id),
          plantCare: d.plantCare.filter((entry) => entry.plant_id !== id),
        }));
      }
      if (snap) {
        const res = pushTrash("plants", snap, trashScope);
        trashedEntry = res.entry;
        setTrash(res.entries);
      }
    });
    if (ok) {
      if (trashedEntry) {
        const entryId = (trashedEntry as TrashEntry).id;
        notify(
          "Рослину переміщено в кошик",
          () => void restoreFromTrash(entryId),
          "Відновити",
        );
      } else {
        notify("Рослину видалено");
      }
    }
    return ok;
  };
  const recordPlantCare = (id: string, action: "watered" | "wet") =>
    run(
      `plant-${id}`,
      async () => {
        if (supabase)
          await checked(
            supabase.rpc("record_plant_care", {
              p_plant_id: id,
              p_action: action,
            }),
          );
        else
          setData((d) => ({
            ...d,
            plants: d.plants.map((plant) =>
              plant.id === id
                ? {
                    ...plant,
                    ...(action === "watered"
                      ? { last_watered_at: kyivDate(), wet_checked_at: null }
                      : { wet_checked_at: kyivDate() }),
                  }
                : plant,
            ),
            plantCare: [
              {
                id: crypto.randomUUID(),
                plant_id: id,
                couple_id: DEMO_COUPLE,
                actor_id: userId,
                action,
                occurred_at: new Date().toISOString(),
              },
              ...d.plantCare,
            ],
          }));
      },
      action === "wet"
        ? "Ґрунт ще вологий — перевірку відкладено"
        : "Полив записано",
    );
  const addMovie = (value: NewMovie) =>
    insert(
      "movies",
      { ...value, couple_id: coupleId, added_by: userId },
      "add-movie",
      "Фільм збережено",
    );
  const addRecipe = (value: NewRecipe) =>
    insert(
      "recipes",
      { ...value, couple_id: coupleId, added_by: userId },
      "add-recipe",
      "Рецепт збережено",
    );
  const upsertMenu = (
    choices: { recipe: RecipeView; servings: number; reopen?: boolean }[],
  ) =>
    run(
      "menu",
      async () => {
        if (supabase)
          await checked(
            supabase.rpc("upsert_menu_items", {
              p_items: choices.map(({ recipe, servings, reopen }) => ({
                catalog_id: recipe.catalogId ?? null,
                recipe_id: recipe.customId ?? null,
                servings,
                ingredients: recipe.ingredients,
                reopen: reopen ?? false,
              })),
            }),
          );
        else
          setData((d) => {
            const mealPlan = [...d.mealPlan];
            for (const { recipe, servings, reopen } of choices) {
              const index = mealPlan.findIndex((item) =>
                recipe.catalogId
                  ? item.catalog_id === recipe.catalogId
                  : item.recipe_id === recipe.customId,
              );
              const old = mealPlan[index];
              const row: MealPlanItem = {
                id: old?.id ?? crypto.randomUUID(),
                couple_id: DEMO_COUPLE,
                catalog_id: recipe.catalogId ?? null,
                recipe_id: recipe.customId ?? null,
                servings,
                base_servings: recipe.baseServings,
                ingredients: recipe.ingredients,
                shopping_completed:
                  !!old?.shopping_completed &&
                  !reopen &&
                  old.servings === servings &&
                  JSON.stringify(old.ingredients) ===
                    JSON.stringify(recipe.ingredients),
                added_by: old?.added_by ?? userId,
                created_at: old?.created_at ?? new Date().toISOString(),
              };
              if (index >= 0) mealPlan[index] = row;
              else mealPlan.push(row);
            }
            return {
              ...d,
              mealPlan,
              shopping: syncDemoMenuShopping(
                mealPlan,
                d.shopping,
                d.menuExcludedKeys ?? [],
                userId,
                DEMO_COUPLE,
                d.pantry,
              ),
            };
          });
      },
      "Меню та покупки оновлено",
    );
  const removeMenuItem = (id: string) =>
    run(
      "menu",
      async () => {
        if (supabase)
          await checked(supabase.rpc("remove_menu_item", { p_id: id }));
        else
          setData((d) => {
            const mealPlan = d.mealPlan.filter((item) => item.id !== id);
            return {
              ...d,
              mealPlan,
              shopping: syncDemoMenuShopping(
                mealPlan,
                d.shopping,
                d.menuExcludedKeys ?? [],
                userId,
                DEMO_COUPLE,
                d.pantry,
              ),
            };
          });
      },
      "Страву прибрано з меню",
    );
  const finishMenuItem = (id: string) =>
    run(
      "menu",
      async () => {
        if (supabase)
          await checked(supabase.rpc("finish_menu_item", { p_id: id }));
        else
          setData((d) => {
            const item = d.mealPlan.find((row) => row.id === id);
            if (!item) return d;
            const mealPlan = d.mealPlan.filter((row) => row.id !== id);
            return {
              ...d,
              mealPlan,
              recipeCooks: [
                {
                  id: crypto.randomUUID(),
                  couple_id: DEMO_COUPLE,
                  actor_id: userId,
                  recipe_key: item.catalog_id
                    ? `catalog:ours55/${item.catalog_id}`
                    : `custom:${item.recipe_id}`,
                  cooked_at: new Date().toISOString(),
                },
                ...d.recipeCooks,
              ],
              shopping: syncDemoMenuShopping(
                mealPlan,
                d.shopping,
                d.menuExcludedKeys ?? [],
                userId,
                DEMO_COUPLE,
                d.pantry,
              ),
            };
          });
      },
      "Страву позначено як приготовану",
    );
  const toggleRecipeFavorite = (recipeKey: string) =>
    run(
      `favorite-${recipeKey}`,
      async () => {
        const favored = data.recipeFavorites.some(
          (item) => item.recipe_key === recipeKey,
        );
        if (supabase) {
          if (favored)
            await checked(
              supabase
                .from("recipe_favorites")
                .delete()
                .eq("user_id", userId)
                .eq("recipe_key", recipeKey),
            );
          else
            await checked(
              supabase
                .from("recipe_favorites")
                .insert({ user_id: userId, recipe_key: recipeKey }),
            );
        } else
          setData((d) => ({
            ...d,
            recipeFavorites: favored
              ? d.recipeFavorites.filter(
                  (item) => item.recipe_key !== recipeKey,
                )
              : [
                  ...d.recipeFavorites,
                  { user_id: userId, recipe_key: recipeKey },
                ],
          }));
      },
      "Улюблені страви оновлено",
    );
  const restoreMenuProducts = () =>
    run(
      "menu",
      async () => {
        if (supabase) await checked(supabase.rpc("restore_menu_products"));
        else
          setData((d) => ({
            ...d,
            menuExcludedKeys: [],
            shopping: syncDemoMenuShopping(
              d.mealPlan,
              d.shopping,
              [],
              userId,
              DEMO_COUPLE,
              d.pantry,
            ),
          }));
      },
      "Продукти меню перераховано",
    );
  const addPantryItem = (value: NewPantryItem) => {
    const cleanName = value.name.trim();
    const norm = normalizePantryName(cleanName);
    if (!cleanName || !norm) {
      notify("Вкажіть назву продукту");
      return Promise.resolve(false);
    }
    if (
      data.pantry.some((item) => item.normalized_name === norm)
    ) {
      notify("Такий продукт уже є у списку «єВдома»");
      return Promise.resolve(false);
    }
    const now = new Date().toISOString();
    const row: PantryItem = {
      id: crypto.randomUUID(),
      couple_id: coupleId ?? DEMO_COUPLE,
      name: cleanName,
      normalized_name: norm,
      quantity: (value.quantity ?? "").trim(),
      is_basic: Boolean(value.is_basic),
      added_by: userId,
      created_at: now,
      updated_at: now,
    };
    if (!demo && (!online || !navigator.onLine)) {
      setData((d) => {
        const pantry = [row, ...d.pantry];
        return {
          ...d,
          pantry,
          shopping: syncDemoMenuShopping(
            d.mealPlan,
            d.shopping,
            d.menuExcludedKeys ?? [],
            userId,
            DEMO_COUPLE,
            pantry,
          ),
        };
      });
      enqueueOfflineMutationOp({
        id: crypto.randomUUID(),
        table: "pantry",
        op: "insert",
        entityId: row.id,
        payload: {
          id: row.id,
          couple_id: coupleId,
          name: row.name,
          normalized_name: row.normalized_name,
          quantity: row.quantity,
          is_basic: row.is_basic,
          added_by: userId,
        },
        queuedAt: now,
      });
      notify("Додано до «єВдома» (офлайн)");
      return Promise.resolve(true);
    }
    return run(
      "pantry",
      async () => {
        if (supabase) {
          try {
            await checked(
              supabase
                .from("pantry_items")
                .insert({
                  id: row.id,
                  couple_id: coupleId,
                  name: row.name,
                  normalized_name: row.normalized_name,
                  quantity: row.quantity,
                  is_basic: row.is_basic,
                  added_by: userId,
                })
                .select("id")
                .single(),
            );
          } catch (err) {
            if (isOfflineNetworkError(err)) {
              setData((d) => {
                const pantry = [row, ...d.pantry];
                return {
                  ...d,
                  pantry,
                  shopping: syncDemoMenuShopping(
                    d.mealPlan,
                    d.shopping,
                    d.menuExcludedKeys ?? [],
                    userId,
                    DEMO_COUPLE,
                    pantry,
                  ),
                };
              });
              enqueueOfflineMutationOp({
                id: crypto.randomUUID(),
                table: "pantry",
                op: "insert",
                entityId: row.id,
                payload: {
                  id: row.id,
                  couple_id: coupleId,
                  name: row.name,
                  normalized_name: row.normalized_name,
                  quantity: row.quantity,
                  is_basic: row.is_basic,
                  added_by: userId,
                },
                queuedAt: now,
              });
              notify("Додано до «єВдома» (офлайн)");
              return;
            }
            throw err;
          }
        } else {
          setData((d) => {
            const pantry = [row, ...d.pantry];
            return {
              ...d,
              pantry,
              shopping: syncDemoMenuShopping(
                d.mealPlan,
                d.shopping,
                d.menuExcludedKeys ?? [],
                userId,
                DEMO_COUPLE,
                pantry,
              ),
            };
          });
        }
      },
      "Додано до «єВдома»",
    );
  };
  const updatePantryItem = (id: string, patch: Partial<NewPantryItem>) => {
    const nextName = patch.name?.trim();
    const nextNorm = nextName ? normalizePantryName(nextName) : undefined;
    const dbPatch: Record<string, unknown> = {};
    if (nextName && nextNorm) {
      dbPatch.name = nextName;
      dbPatch.normalized_name = nextNorm;
    }
    if (patch.quantity !== undefined) {
      dbPatch.quantity = patch.quantity.trim();
    }
    if (patch.is_basic !== undefined) {
      dbPatch.is_basic = patch.is_basic;
    }
    if (!demo && (!online || !navigator.onLine)) {
      setData((d) => {
        const pantry = d.pantry.map((item) =>
          item.id === id
            ? {
                ...item,
                ...(nextName && nextNorm
                  ? { name: nextName, normalized_name: nextNorm }
                  : {}),
                ...(patch.quantity !== undefined
                  ? { quantity: patch.quantity.trim() }
                  : {}),
                ...(patch.is_basic !== undefined
                  ? { is_basic: patch.is_basic }
                  : {}),
                updated_at: new Date().toISOString(),
              }
            : item,
        );
        return {
          ...d,
          pantry,
          shopping: syncDemoMenuShopping(
            d.mealPlan,
            d.shopping,
            d.menuExcludedKeys ?? [],
            userId,
            DEMO_COUPLE,
            pantry,
          ),
        };
      });
      enqueueOfflineMutationOp({
        id: crypto.randomUUID(),
        table: "pantry",
        op: "update",
        entityId: id,
        payload: dbPatch,
        queuedAt: new Date().toISOString(),
      });
      notify("Оновлено (офлайн)");
      return Promise.resolve(true);
    }
    return run(
      "pantry",
      async () => {
        if (supabase) {
          try {
            await checked(
              supabase
                .from("pantry_items")
                .update(dbPatch)
                .eq("id", id)
                .select("id")
                .single(),
            );
          } catch (err) {
            if (isOfflineNetworkError(err)) {
              setData((d) => {
                const pantry = d.pantry.map((item) =>
                  item.id === id
                    ? {
                        ...item,
                        ...(nextName && nextNorm
                          ? { name: nextName, normalized_name: nextNorm }
                          : {}),
                        ...(patch.quantity !== undefined
                          ? { quantity: patch.quantity.trim() }
                          : {}),
                        ...(patch.is_basic !== undefined
                          ? { is_basic: patch.is_basic }
                          : {}),
                        updated_at: new Date().toISOString(),
                      }
                    : item,
                );
                return {
                  ...d,
                  pantry,
                  shopping: syncDemoMenuShopping(
                    d.mealPlan,
                    d.shopping,
                    d.menuExcludedKeys ?? [],
                    userId,
                    DEMO_COUPLE,
                    pantry,
                  ),
                };
              });
              enqueueOfflineMutationOp({
                id: crypto.randomUUID(),
                table: "pantry",
                op: "update",
                entityId: id,
                payload: dbPatch,
                queuedAt: new Date().toISOString(),
              });
              notify("Оновлено (офлайн)");
              return;
            }
            throw err;
          }
        } else {
          setData((d) => {
            const pantry = d.pantry.map((item) =>
              item.id === id
                ? {
                    ...item,
                    ...(nextName && nextNorm
                      ? { name: nextName, normalized_name: nextNorm }
                      : {}),
                    ...(patch.quantity !== undefined
                      ? { quantity: patch.quantity.trim() }
                      : {}),
                    ...(patch.is_basic !== undefined
                      ? { is_basic: patch.is_basic }
                      : {}),
                    updated_at: new Date().toISOString(),
                  }
                : item,
            );
            return {
              ...d,
              pantry,
              shopping: syncDemoMenuShopping(
                d.mealPlan,
                d.shopping,
                d.menuExcludedKeys ?? [],
                userId,
                DEMO_COUPLE,
                pantry,
              ),
            };
          });
        }
      },
      "Оновлено",
    );
  };
  const removePantryItem = (id: string) => {
    if (!demo && (!online || !navigator.onLine)) {
      setData((d) => {
        const pantry = d.pantry.filter((item) => item.id !== id);
        return {
          ...d,
          pantry,
          shopping: syncDemoMenuShopping(
            d.mealPlan,
            d.shopping,
            d.menuExcludedKeys ?? [],
            userId,
            DEMO_COUPLE,
            pantry,
          ),
        };
      });
      enqueueOfflineMutationOp({
        id: crypto.randomUUID(),
        table: "pantry",
        op: "delete",
        entityId: id,
        queuedAt: new Date().toISOString(),
      });
      notify("Прибрано з «єВдома» (офлайн)");
      return Promise.resolve(true);
    }
    return run(
      "pantry",
      async () => {
        if (supabase) {
          try {
            await checked(
              supabase
                .from("pantry_items")
                .delete()
                .eq("id", id)
                .select("id")
                .single(),
            );
          } catch (err) {
            if (isOfflineNetworkError(err)) {
              setData((d) => {
                const pantry = d.pantry.filter((item) => item.id !== id);
                return {
                  ...d,
                  pantry,
                  shopping: syncDemoMenuShopping(
                    d.mealPlan,
                    d.shopping,
                    d.menuExcludedKeys ?? [],
                    userId,
                    DEMO_COUPLE,
                    pantry,
                  ),
                };
              });
              enqueueOfflineMutationOp({
                id: crypto.randomUUID(),
                table: "pantry",
                op: "delete",
                entityId: id,
                queuedAt: new Date().toISOString(),
              });
              notify("Прибрано з «єВдома» (офлайн)");
              return;
            }
            throw err;
          }
        } else {
          setData((d) => {
            const pantry = d.pantry.filter((item) => item.id !== id);
            return {
              ...d,
              pantry,
              shopping: syncDemoMenuShopping(
                d.mealPlan,
                d.shopping,
                d.menuExcludedKeys ?? [],
                userId,
                DEMO_COUPLE,
                pantry,
              ),
            };
          });
        }
      },
      "Прибрано з «єВдома»",
    );
  };
  const toggleBasicPantryItem = async (name: string) => {
    const norm = normalizePantryName(name);
    const existing = data.pantry.find((item) => item.normalized_name === norm);
    if (existing) return removePantryItem(existing.id);
    return addPantryItem({ name, is_basic: true });
  };
  const markRead = (ids: string[]) =>
    run("mark-read", async () => {
      if (supabase) {
        for (let offset = 0; offset < ids.length; offset += 500)
          await checked(
            supabase.rpc("mark_activity_read", {
              p_ids: ids.slice(offset, offset + 500),
            }),
          );
      } else
        setData((d) => ({
          ...d,
          reads: [
            ...d.reads,
            ...ids
              .filter((id) => !d.reads.some((r) => r.activity_id === id))
              .map((activity_id) => ({
                id: crypto.randomUUID(),
                activity_id,
                user_id: userId,
                created_at: new Date().toISOString(),
              })),
          ],
        }));
    });
  const addShoppingBatch = async (
    items: NewShopping[],
    options?: { skipPantryFilter?: boolean },
  ) => {
    const sanitized = items
      .map((item) => sanitizeShoppingItemForDb(item))
      .filter((item) => item.name.length > 0);
    const products = options?.skipPantryFilter
      ? sanitized
      : sanitized.filter((item) => !isAtHomeIngredient(item.name, data.pantry));
    if (!products.length) {
      notify(
        options?.skipPantryFilter
          ? "Додайте хоча б один товар."
          : "Усі потрібні продукти вже є вдома.",
      );
      return false;
    }
    const activeCoupleId = coupleId ?? coupleIdRef.current;
    if (!demo && (!online || !navigator.onLine)) {
      const now = new Date().toISOString();
      for (const value of products) {
        const item: ShoppingItem = {
          ...value,
          id: crypto.randomUUID(),
          couple_id: activeCoupleId ?? "",
          added_by: userId,
          purchased: false,
          session_id: null,
          created_at: now,
          updated_at: now,
        };
        enqueueOfflineShopping({
          op: "add",
          id: item.id,
          item,
          queuedAt: now,
        });
      }
      notify(
        options?.skipPantryFilter
          ? `Товари (${products.length}) збережено офлайн`
          : `Продукти (${products.length}) збережено офлайн`,
      );
      return true;
    }
    const busyKey = options?.skipPantryFilter ? "add-shopping-batch" : "recipe";
    if (!demo && supabase) {
      if (!activeCoupleId) {
        notify("Зачекайте завершення синхронізації простору");
        return false;
      }
      if (busy.current.has(busyKey)) return false;
      busy.current.add(busyKey);
      setPending([...busy.current]);
      const now = new Date().toISOString();
      const rows = products.map((value) => ({
        id: crypto.randomUUID(),
        couple_id: activeCoupleId,
        added_by: userId,
        purchased: false,
        session_id: null,
        created_at: now,
        updated_at: now,
        ...value,
      }));
      try {
        if (options?.skipPantryFilter) {
          await checked(
            supabase.from("shopping_items").insert(rows).select("id"),
          );
        } else {
          await checked(
            supabase.rpc("add_shopping_batch", { p_items: products }),
          );
        }
        await refresh();
        notify(
          options?.skipPantryFilter
            ? `Товари додано до списку (${products.length})`
            : "Продукти додано до списку",
        );
        return true;
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          for (const item of rows) {
            enqueueOfflineShopping({
              op: "add",
              id: item.id,
              item,
              queuedAt: now,
            });
          }
          notify(
            options?.skipPantryFilter
              ? `Товари (${products.length}) збережено офлайн`
              : `Продукти (${products.length}) збережено офлайн`,
          );
          return true;
        }
        notify(errorMessage(err));
        return false;
      } finally {
        busy.current.delete(busyKey);
        setPending([...busy.current]);
      }
    }
    return run(
      busyKey,
      async () => {
        setData((d) => {
          const rows = products.map((value) => ({
            ...value,
            id: crypto.randomUUID(),
            couple_id: DEMO_COUPLE,
            added_by: userId,
            purchased: false,
            session_id: null,
            created_at: new Date().toISOString(),
          }));
          return demoActivity(
            { ...d, shopping: [...d.shopping, ...rows] },
            "shopping_items",
            {
              name: options?.skipPantryFilter
                ? `Покупки (${products.length})`
                : `Продукти з рецепта · ${products.length}`,
            },
            "added",
          );
        });
      },
      options?.skipPantryFilter
        ? `Товари додано до списку (${products.length})`
        : "Продукти додано до списку",
    );
  };
  const archive = () =>
    run(
      "archive",
      async () => {
        if (supabase) await checked(supabase.rpc("finish_shopping"));
        else {
          const id = crypto.randomUUID();
          setData((d) => ({
            ...d,
            mealPlan: d.mealPlan.map((item) => ({
              ...item,
              shopping_completed: true,
            })),
            sessions: [
              {
                id,
                couple_id: DEMO_COUPLE,
                created_at: new Date().toISOString(),
              },
              ...d.sessions,
            ],
            shopping: d.shopping.map((i) =>
              i.session_id ? i : { ...i, session_id: id },
            ),
            history: [
              ...new Map(
                [
                  ...d.history,
                  ...d.shopping
                    .filter((i) => !i.session_id)
                    .map((i) => ({
                      id: crypto.randomUUID(),
                      couple_id: DEMO_COUPLE,
                      name: i.name,
                      category: i.category,
                      unit: i.unit,
                    })),
                ].map((i) => [i.name.toLowerCase(), i]),
              ).values(),
            ],
          }));
        }
      },
      "Покупки завершено",
    );
  const repeat = (id: string) =>
    run(
      `repeat-${id}`,
      async () => {
        if (supabase)
          await checked(supabase.rpc("repeat_shopping", { p_session: id }));
        else
          setData((d) => ({
            ...d,
            shopping: [
              ...d.shopping,
              ...d.shopping
                .filter((i) => i.session_id === id)
                .map((i) => ({
                  ...i,
                  id: crypto.randomUUID(),
                  session_id: null,
                  purchased: false,
                  added_by: userId,
                  created_at: new Date().toISOString(),
                })),
            ],
          }));
      },
      "Список повторено",
    );
  const saveProfile = (name: string, avatar_path: string | null) =>
    run(
      "profile",
      async () => {
        if (supabase)
          await checked(
            supabase
              .from("profiles")
              .update({ name, avatar_path })
              .eq("id", userId),
          );
        else
          setData((d) => ({
            ...d,
            profiles: d.profiles.map((p) =>
              p.id === userId ? { ...p, name, avatar_path } : p,
            ),
          }));
      },
      "Профіль оновлено",
    );
  const reserve = (wishId: string) =>
    insert(
      "gift_reservations",
      { wish_id: wishId, reserved_by: userId, status: "planned" },
      `reserve-${wishId}`,
      "Це залишиться вашим секретом",
    );
  const restoreFromTrash = async (entryId: string) => {
    const entry = readTrash(trashScope).find((item) => item.id === entryId);
    if (!entry) return false;
    const p = entry.payload;
    let ok = false;
    if (entry.kind === "shopping_items") {
      ok = await insert(
        "shopping_items",
        {
          name: p.name,
          quantity: p.quantity ?? null,
          unit: p.unit ?? "шт.",
          category: p.category ?? "Інше",
          price: p.price ?? null,
          purchased: Boolean(p.purchased),
          menu_key: p.menu_key ?? null,
          couple_id: coupleId,
          added_by: userId,
          session_id: null,
        },
        `restore-${entry.id}`,
        "Відновлено з кошика",
      );
      if (ok && demo && typeof p.menu_key === "string") {
        setData((d) => ({
          ...d,
          menuExcludedKeys: (d.menuExcludedKeys ?? []).filter(
            (key) => key !== p.menu_key,
          ),
        }));
      }
    } else if (entry.kind === "wishes") {
      ok = await insert(
        "wishes",
        {
          name: p.name,
          price: p.price ?? null,
          url: p.url ?? "",
          priority: p.priority ?? "Просто хочу",
          note: p.note ?? "",
          image_path: p.image_path ?? null,
          image_url: p.image_url ?? "",
          is_private: Boolean(p.is_private),
          size: p.size ?? "",
          couple_id: coupleId,
          owner_id: userId,
        },
        `restore-${entry.id}`,
        "Відновлено з кошика",
      );
    } else if (entry.kind === "events") {
      ok = await insert(
        "events",
        {
          title: p.title,
          date: p.date,
          time: p.time ?? null,
          all_day: Boolean(p.all_day),
          location: p.location ?? "",
          url: p.url ?? "",
          description: p.description ?? "",
          category: p.category ?? "Побачення",
          recurrence: normalizeRecurrence(
            typeof p.recurrence === "string" ? p.recurrence : undefined,
          ),
          couple_id: coupleId,
          created_by: userId,
        },
        `restore-${entry.id}`,
        "Відновлено з кошика",
      );
    } else if (entry.kind === "movies") {
      ok = await insert(
        "movies",
        {
          title: p.title,
          url: p.url ?? "",
          poster_url: p.poster_url ?? "",
          year: p.year ?? null,
          genres: p.genres ?? "",
          description: p.description ?? "",
          status: p.status === "watched" ? "watched" : "planned",
          rating: p.rating ?? null,
          metadata_url: p.metadata_url ?? "",
          couple_id: coupleId,
          added_by: userId,
        },
        `restore-${entry.id}`,
        "Відновлено з кошика",
      );
    } else if (entry.kind === "recipes") {
      ok = await insert(
        "recipes",
        {
          title: p.title,
          category: p.category ?? "main",
          image_url: p.image_url ?? "",
          source_url: p.source_url ?? "",
          ingredients: Array.isArray(p.ingredients) ? p.ingredients : [],
          instructions: Array.isArray(p.instructions) ? p.instructions : [],
          base_servings: p.base_servings ?? 2,
          total_time_minutes: p.total_time_minutes ?? null,
          difficulty: p.difficulty ?? "",
          notes: p.notes ?? "",
          structured_ingredients: p.structured_ingredients ?? null,
          couple_id: coupleId,
          added_by: userId,
        },
        `restore-${entry.id}`,
        "Відновлено з кошика",
      );
    } else if (entry.kind === "plants") {
      const rawInterval = Number(p.watering_interval_days ?? 7);
      const intervalDays = Number.isFinite(rawInterval)
        ? Math.min(120, Math.max(1, Math.round(rawInterval)))
        : 7;
      const lastWatered =
        typeof p.last_watered_at === "string" &&
        /^\d{4}-\d{2}-\d{2}/.test(p.last_watered_at)
          ? p.last_watered_at.slice(0, 10)
          : kyivDate();
      const restoredPlant: NewPlant = {
        name: String(p.name ?? "Рослина"),
        species: String(p.species ?? ""),
        image_path: typeof p.image_path === "string" ? p.image_path : null,
        watering_interval_days: intervalDays,
        last_watered_at: lastWatered,
        light: String(p.light ?? ""),
        watering_notes: String(p.watering_notes ?? ""),
        info_url: String(p.info_url ?? ""),
      };
      ok = await run(
        `restore-${entry.id}`,
        async () => {
          if (supabase) {
            await checked(
              supabase
                .from("plants")
                .insert({
                  ...restoredPlant,
                  couple_id: coupleId,
                  added_by: userId,
                })
                .select("id")
                .single(),
            );
          } else {
            const row: Plant = {
              id: crypto.randomUUID(),
              couple_id: coupleId ?? DEMO_COUPLE,
              added_by: userId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              wet_checked_at:
                typeof p.wet_checked_at === "string" &&
                /^\d{4}-\d{2}-\d{2}/.test(p.wet_checked_at)
                  ? p.wet_checked_at.slice(0, 10)
                  : null,
              ...restoredPlant,
            };
            setData((d) => ({ ...d, plants: [row, ...d.plants] }));
          }
        },
        "Рослину відновлено з кошика",
      );
    } else if (entry.kind === "budget_transactions") {
      const amount = Number(p.amount ?? 0);
      if (Number.isFinite(amount) && amount > 0) {
        const kind: BudgetKind = p.kind === "income" ? "income" : "expense";
        const myShareIncome =
          data.budgetSettings.find((s) => s.user_id === userId)
            ?.share_income_with_partner ?? false;
        const isPrivate = !myShareIncome;
        ok = await run(
          `restore-${entry.id}`,
          async () => {
            const restored: BudgetTransaction = {
              id: crypto.randomUUID(),
              couple_id: coupleId ?? DEMO_COUPLE,
              user_id: userId,
              kind,
              amount: Math.round(amount * 100) / 100,
              merchant: String(p.merchant ?? "").trim(),
              note: String(p.note ?? "").trim(),
              category_key:
                typeof p.category_key === "string" && p.category_key
                  ? normalizeCategoryKey(p.category_key, kind)
                  : kind === "income"
                    ? "refund"
                    : "other",
              status: "confirmed",
              source: p.source === "apple_pay" ? "apple_pay" : "manual",
              is_private: isPrivate,
              card_label: String(p.card_label ?? ""),
              occurred_on:
                typeof p.occurred_on === "string" &&
                /^\d{4}-\d{2}-\d{2}$/.test(p.occurred_on)
                  ? p.occurred_on
                  : kyivDate(),
              occurred_at:
                typeof p.occurred_at === "string" && p.occurred_at
                  ? p.occurred_at
                  : new Date().toISOString(),
              created_at: new Date().toISOString(),
            };
            const activeCoupleId = coupleId ?? coupleIdRef.current ?? DEMO_COUPLE;
            const applyLocalRestore = () => {
              if (supabase) {
                writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
                  ...prev,
                  pendingSync: true,
                  transactions: [restored, ...prev.transactions],
                }));
              }
              setData((d) => ({
                ...d,
                budgetTransactions: [restored, ...d.budgetTransactions],
              }));
            };
            if (supabase && !budgetLocalModeRef.current) {
              try {
                await checked(
                  supabase
                    .from("budget_transactions")
                    .insert({
                      couple_id: restored.couple_id,
                      user_id: restored.user_id,
                      kind: restored.kind,
                      amount: restored.amount,
                      merchant: restored.merchant,
                      note: restored.note,
                      category_key: restored.category_key,
                      status: restored.status,
                      source: restored.source,
                      is_private: restored.is_private,
                      card_label: restored.card_label,
                      occurred_on: restored.occurred_on,
                      occurred_at: restored.occurred_at,
                    })
                    .select("id")
                    .single(),
                );
              } catch (err) {
                if (!isMissingBudgetTableError(err)) throw err;
                budgetLocalModeRef.current = true;
                applyLocalRestore();
              }
            } else {
              applyLocalRestore();
            }
          },
          "Операцію відновлено з кошика",
        );
      }
    }
    if (ok) setTrash(removeTrashEntry(entry.id, trashScope));
    return ok;
  };
  const deleteTrashEntry = (entryId: string) => {
    setTrash(removeTrashEntry(entryId, trashScope));
  };
  const emptyTrash = () => {
    setTrash(clearTrash(trashScope));
    notify("Кошик очищено");
  };

  const addBudgetTransaction = async (input: NewBudgetTransaction) => {
    const cleanAmount = Math.round(Number(input.amount) * 100) / 100;
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0 || cleanAmount >= 100_000_000) {
      notify("Вкажіть коректну суму більше 0 ₴");
      return false;
    }
    const activeCoupleId = coupleId ?? coupleIdRef.current;
    if (supabase && !activeCoupleId) {
      notify("Зачекайте завершення синхронізації простору");
      return false;
    }
    const myShareIncome =
      data.budgetSettings.find((s) => s.user_id === userId)
        ?.share_income_with_partner ?? false;
    const isPrivate = input.is_private ?? !myShareIncome;
    const now = new Date().toISOString();
    const status = input.status ?? (input.category_key ? "confirmed" : "needs_review");
    const catMeta = findCategoryMeta(
      input.category_key,
      data.budgetCategories,
      input.kind,
    );
    const cleanMerchant =
      input.merchant.trim().slice(0, 160) ||
      (input.category_key ? catMeta.name : "");
    const row: BudgetTransaction = {
      id: crypto.randomUUID(),
      couple_id: activeCoupleId ?? DEMO_COUPLE,
      user_id: userId,
      kind: input.kind,
      amount: cleanAmount,
      merchant: cleanMerchant,
      note: (input.note ?? "").trim().slice(0, 500),
      category_key: input.category_key,
      status,
      source: input.source ?? "manual",
      is_private: isPrivate,
      card_label: (input.card_label ?? "").trim().slice(0, 60),
      occurred_on: input.occurred_on || kyivDate(),
      occurred_at: now,
      created_at: now,
      updated_at: now,
    };

    if (supabase && !budgetLocalModeRef.current && !online) {
      enqueueOfflineBudget({ op: "add", item: row, queuedAt: now });
      notify(
        input.kind === "income"
          ? "Дохід збережено офлайн"
          : "Витрату збережено офлайн",
      );
      return true;
    }

    if (supabase && !budgetLocalModeRef.current) {
      if (busy.current.has("add-budget-tx")) return false;
      busy.current.add("add-budget-tx");
      setPending([...busy.current]);
      try {
        const inserted = (await checked(
          supabase
            .from("budget_transactions")
            .insert({
              id: row.id,
              couple_id: row.couple_id,
              user_id: row.user_id,
              kind: row.kind,
              amount: row.amount,
              merchant: row.merchant,
              note: row.note,
              category_key: row.category_key,
              status: row.status,
              source: row.source,
              is_private: row.is_private,
              card_label: row.card_label,
              occurred_on: row.occurred_on,
              occurred_at: row.occurred_at,
            })
            .select("*")
            .single(),
        )) as BudgetTransaction;
        setData((d) => ({
          ...d,
          budgetTransactions: [
            inserted,
            ...d.budgetTransactions.filter((tx) => tx.id !== inserted.id),
          ],
        }));
        await refresh();
        notify(input.kind === "income" ? "Дохід записано" : "Витрату записано");
        return true;
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          enqueueOfflineBudget({ op: "add", item: row, queuedAt: now });
          notify(
            input.kind === "income"
              ? "Дохід збережено офлайн"
              : "Витрату збережено офлайн",
          );
          return true;
        }
        if (isMissingBudgetTableError(err)) {
          budgetLocalModeRef.current = true;
          if (activeCoupleId) {
            writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
              ...prev,
              pendingSync: true,
              transactions: [
                row,
                ...prev.transactions.filter((tx) => tx.id !== row.id),
              ],
            }));
          }
          setData((d) => ({
            ...d,
            budgetTransactions: [row, ...d.budgetTransactions],
          }));
          notify(input.kind === "income" ? "Дохід записано" : "Витрату записано");
          return true;
        }
        notify(errorMessage(err));
        return false;
      } finally {
        busy.current.delete("add-budget-tx");
        setPending([...busy.current]);
      }
    }

    return run(
      "add-budget-tx",
      async () => {
        if (supabase && activeCoupleId) {
          writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
            ...prev,
            pendingSync: true,
            transactions: [
              row,
              ...prev.transactions.filter((tx) => tx.id !== row.id),
            ],
          }));
        }
        setData((d) => ({
          ...d,
          budgetTransactions: [row, ...d.budgetTransactions],
        }));
      },
      input.kind === "income" ? "Дохід записано" : "Витрату записано",
    );
  };

  const importBudgetTransactions = async (
    items: NewBudgetTransaction[],
  ): Promise<number> => {
    const activeCoupleId = coupleId ?? coupleIdRef.current;
    if (supabase && !activeCoupleId) {
      notify("Зачекайте завершення синхронізації простору");
      return 0;
    }
    const myShareIncome =
      data.budgetSettings.find((s) => s.user_id === userId)
        ?.share_income_with_partner ?? false;
    const now = new Date().toISOString();

    const rows: BudgetTransaction[] = [];
    for (const input of items) {
      const cleanAmount = Math.round(Number(input.amount) * 100) / 100;
      if (!Number.isFinite(cleanAmount) || cleanAmount <= 0 || cleanAmount >= 100_000_000) {
        continue;
      }
      const isPrivate = input.is_private ?? !myShareIncome;
      const status =
        input.status ?? (input.category_key ? "confirmed" : "needs_review");
      const catMeta = findCategoryMeta(
        input.category_key,
        data.budgetCategories,
        input.kind,
      );
      const cleanMerchant =
        input.merchant.trim().slice(0, 160) ||
        (input.category_key ? catMeta.name : "");
      const occurredOn = /^\d{4}-\d{2}-\d{2}$/.test(input.occurred_on)
        ? input.occurred_on
        : kyivDate();

      const occurredAt =
        input.occurred_at && /^\d{4}-\d{2}-\d{2}T/.test(input.occurred_at)
          ? input.occurred_at
          : `${occurredOn}T12:00:00.000Z`;

      rows.push({
        id: crypto.randomUUID(),
        couple_id: activeCoupleId ?? DEMO_COUPLE,
        user_id: userId,
        kind: input.kind,
        amount: cleanAmount,
        merchant: cleanMerchant,
        note: (input.note ?? "").trim().slice(0, 500),
        category_key: input.category_key,
        status,
        source: input.source ?? "manual",
        is_private: isPrivate,
        card_label: (input.card_label ?? "").trim().slice(0, 60),
        occurred_on: occurredOn,
        occurred_at: occurredAt,
        created_at: now,
        updated_at: now,
      });
    }

    if (rows.length === 0) {
      notify("Немає коректних операцій для імпорту");
      return 0;
    }

    if (supabase && !budgetLocalModeRef.current) {
      if (busy.current.has("import-budget-tx")) return 0;
      busy.current.add("import-budget-tx");
      setPending([...busy.current]);
      const insertedAll: BudgetTransaction[] = [];
      try {
        const CHUNK_SIZE = 100;
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE).map((r) => ({
            id: r.id,
            couple_id: r.couple_id,
            user_id: r.user_id,
            kind: r.kind,
            amount: r.amount,
            merchant: r.merchant,
            note: r.note,
            category_key: r.category_key,
            status: r.status,
            source: r.source,
            is_private: r.is_private,
            card_label: r.card_label,
            occurred_on: r.occurred_on,
            occurred_at: r.occurred_at,
          }));
          const inserted = (await checked(
            supabase.from("budget_transactions").insert(chunk).select("*"),
          )) as BudgetTransaction[];
          insertedAll.push(...inserted);
        }
        setData((d) => {
          const insertedIds = new Set(insertedAll.map((tx) => tx.id));
          return {
            ...d,
            budgetTransactions: [
              ...insertedAll,
              ...d.budgetTransactions.filter((tx) => !insertedIds.has(tx.id)),
            ],
          };
        });
        await refresh();
        notify(`Імпортовано операцій: ${insertedAll.length}`);
        return insertedAll.length;
      } catch (err) {
        if (isMissingBudgetTableError(err)) {
          budgetLocalModeRef.current = true;
          if (activeCoupleId) {
            writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
              ...prev,
              pendingSync: true,
              transactions: [...rows, ...prev.transactions],
            }));
          }
          setData((d) => ({
            ...d,
            budgetTransactions: [...rows, ...d.budgetTransactions],
          }));
          notify(`Імпортовано операцій: ${rows.length}`);
          return rows.length;
        }
        notify(errorMessage(err));
        return insertedAll.length;
      } finally {
        busy.current.delete("import-budget-tx");
        setPending([...busy.current]);
      }
    }

    const ok = await run(
      "import-budget-tx",
      async () => {
        if (supabase && activeCoupleId) {
          writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
            ...prev,
            pendingSync: true,
            transactions: [...rows, ...prev.transactions],
          }));
        }
        setData((d) => ({
          ...d,
          budgetTransactions: [...rows, ...d.budgetTransactions],
        }));
      },
      `Імпортовано операцій: ${rows.length}`,
    );
    return ok ? rows.length : 0;
  };

  const updateBudgetTransaction = async (
    id: string,
    patch: Partial<
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
    >,
  ) => {
    const activeCoupleId = coupleId ?? coupleIdRef.current;
    const now = new Date().toISOString();
    if (supabase && !budgetLocalModeRef.current && !online) {
      enqueueOfflineBudget({ op: "update", id, patch, queuedAt: now });
      notify("Зміни збережено офлайн");
      return true;
    }
    if (supabase && !budgetLocalModeRef.current) {
      const key = `budget-tx-${id}`;
      if (busy.current.has(key)) return false;
      busy.current.add(key);
      setPending([...busy.current]);
      try {
        const updated = (await checked(
          supabase
            .from("budget_transactions")
            .update(patch)
            .eq("id", id)
            .select("*")
            .single(),
        )) as BudgetTransaction;
        setData((d) => ({
          ...d,
          budgetTransactions: d.budgetTransactions.map((tx) =>
            tx.id === id ? updated : tx,
          ),
        }));
        await refresh();
        notify("Операцію оновлено");
        return true;
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          enqueueOfflineBudget({ op: "update", id, patch, queuedAt: now });
          notify("Зміни збережено офлайн");
          return true;
        }
        if (isMissingBudgetTableError(err)) {
          budgetLocalModeRef.current = true;
          if (activeCoupleId) {
            writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
              ...prev,
              pendingSync: true,
              transactions: prev.transactions.map((tx) =>
                tx.id === id ? { ...tx, ...patch, updated_at: now } : tx,
              ),
            }));
          }
          setData((d) => ({
            ...d,
            budgetTransactions: d.budgetTransactions.map((tx) =>
              tx.id === id ? { ...tx, ...patch, updated_at: now } : tx,
            ),
          }));
          notify("Операцію оновлено");
          return true;
        }
        notify(errorMessage(err));
        return false;
      } finally {
        busy.current.delete(key);
        setPending([...busy.current]);
      }
    }
    return run(
      `budget-tx-${id}`,
      async () => {
        if (supabase && activeCoupleId) {
          writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
            ...prev,
            pendingSync: true,
            transactions: prev.transactions.map((tx) =>
              tx.id === id ? { ...tx, ...patch, updated_at: now } : tx,
            ),
          }));
        }
        setData((d) => ({
          ...d,
          budgetTransactions: d.budgetTransactions.map((tx) =>
            tx.id === id ? { ...tx, ...patch, updated_at: now } : tx,
          ),
        }));
      },
      "Операцію оновлено",
    );
  };

  const removeBudgetTransaction = async (id: string) => {
    const activeCoupleId = coupleId ?? coupleIdRef.current;
    const snap = data.budgetTransactions.find((tx) => tx.id === id) as
      | Record<string, unknown>
      | undefined;
    const now = new Date().toISOString();
    if (supabase && !budgetLocalModeRef.current && !online) {
      enqueueOfflineBudget({ op: "remove", id, queuedAt: now });
      if (snap) {
        const res = pushTrash("budget_transactions", snap, trashScope);
        setTrash(res.entries);
      }
      notify("Видалення збережено офлайн");
      return true;
    }
    let trashedEntry: TrashEntry | null = null;
    if (supabase && !budgetLocalModeRef.current) {
      const key = `budget-tx-${id}`;
      if (busy.current.has(key)) return false;
      busy.current.add(key);
      setPending([...busy.current]);
      try {
        await checked(
          supabase
            .from("budget_transactions")
            .delete()
            .eq("id", id)
            .select("id")
            .single(),
        );
        setData((d) => ({
          ...d,
          budgetTransactions: d.budgetTransactions.filter((tx) => tx.id !== id),
        }));
        if (snap) {
          const res = pushTrash("budget_transactions", snap, trashScope);
          trashedEntry = res.entry;
          setTrash(res.entries);
        }
        await refresh();
        if (trashedEntry) {
          const entryId = (trashedEntry as TrashEntry).id;
          notify(
            "Операцію переміщено в кошик",
            () => void restoreFromTrash(entryId),
            "Відновити",
          );
        } else {
          notify("Операцію видалено");
        }
        return true;
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          enqueueOfflineBudget({ op: "remove", id, queuedAt: now });
          if (snap) {
            const res = pushTrash("budget_transactions", snap, trashScope);
            setTrash(res.entries);
          }
          notify("Видалення збережено офлайн");
          return true;
        }
        if (isMissingBudgetTableError(err)) {
          budgetLocalModeRef.current = true;
          if (activeCoupleId) {
            writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
              ...prev,
              pendingSync: true,
              transactions: prev.transactions.filter((tx) => tx.id !== id),
            }));
          }
          setData((d) => ({
            ...d,
            budgetTransactions: d.budgetTransactions.filter((tx) => tx.id !== id),
          }));
          if (snap) {
            const res = pushTrash("budget_transactions", snap, trashScope);
            setTrash(res.entries);
          }
          notify("Операцію видалено");
          return true;
        }
        notify(errorMessage(err));
        return false;
      } finally {
        busy.current.delete(key);
        setPending([...busy.current]);
      }
    }
    const ok = await run(`budget-tx-${id}`, async () => {
      if (supabase && budgetLocalModeRef.current && activeCoupleId) {
        writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
          ...prev,
          pendingSync: true,
          transactions: prev.transactions.filter((tx) => tx.id !== id),
        }));
      }
      setData((d) => ({
        ...d,
        budgetTransactions: d.budgetTransactions.filter((tx) => tx.id !== id),
      }));
      if (snap) {
        const res = pushTrash("budget_transactions", snap, trashScope);
        trashedEntry = res.entry;
        setTrash(res.entries);
      }
    });
    if (ok) {
      if (trashedEntry) {
        const entryId = (trashedEntry as TrashEntry).id;
        notify(
          "Операцію переміщено в кошик",
          () => void restoreFromTrash(entryId),
          "Відновити",
        );
      } else {
        notify("Операцію видалено");
      }
    }
    return ok;
  };

  const categorizeBudgetTransaction = (
    txId: string,
    categoryKey: string,
    saveRule = true,
    rulePattern?: string,
  ) => {
    const activeCoupleId = coupleId ?? coupleIdRef.current ?? DEMO_COUPLE;
    return run(
      `categorize-${txId}`,
      async () => {
        const applyLocalCategorize = () => {
          const applyOnCollections = (
            transactions: BudgetTransaction[],
            merchantRules: BudgetMerchantRule[],
          ) => {
            const target = transactions.find((tx) => tx.id === txId);
            if (!target) return { transactions, merchantRules };
            const now = new Date().toISOString();
            const targetNorm = normalizeMerchantName(target.merchant);
            const patternRaw = (
              rulePattern?.trim() ||
              target.merchant ||
              ""
            ).slice(0, 120);
            const patternNorm = normalizeMerchantName(patternRaw);

            const nextTxs = transactions.map((tx) => {
              if (tx.id === txId) {
                return {
                  ...tx,
                  category_key: categoryKey,
                  status: "confirmed" as const,
                  updated_at: now,
                };
              }
              if (
                saveRule &&
                tx.status === "needs_review" &&
                tx.kind === target.kind &&
                targetNorm &&
                normalizeMerchantName(tx.merchant) === targetNorm
              ) {
                return {
                  ...tx,
                  category_key: categoryKey,
                  status: "confirmed" as const,
                  updated_at: now,
                };
              }
              return tx;
            });

            let nextRules = merchantRules;
            if (saveRule && patternRaw && patternNorm) {
              const existingIdx = nextRules.findIndex(
                (r) => r.normalized_pattern === patternNorm,
              );
              const newRule: BudgetMerchantRule = {
                id:
                  existingIdx >= 0
                    ? nextRules[existingIdx].id
                    : crypto.randomUUID(),
                couple_id: activeCoupleId,
                merchant_pattern: patternRaw,
                normalized_pattern: patternNorm,
                category_key: categoryKey,
                kind: target.kind,
                created_by: userId,
                created_at:
                  existingIdx >= 0
                    ? nextRules[existingIdx].created_at
                    : now,
                updated_at: now,
              };
              nextRules =
                existingIdx >= 0
                  ? nextRules.map((r, i) => (i === existingIdx ? newRule : r))
                  : [newRule, ...nextRules];
            }
            return { transactions: nextTxs, merchantRules: nextRules };
          };

          if (supabase) {
            writeLocalBudgetState(activeCoupleId, userId, (prev) => {
              const next = applyOnCollections(
                prev.transactions,
                prev.merchantRules,
              );
              return {
                ...prev,
                pendingSync: true,
                transactions: next.transactions,
                merchantRules: next.merchantRules,
              };
            });
          }
          setData((d) => {
            const next = applyOnCollections(
              d.budgetTransactions,
              d.budgetMerchantRules,
            );
            return {
              ...d,
              budgetTransactions: next.transactions,
              budgetMerchantRules: next.merchantRules,
            };
          });
        };

        if (supabase && !budgetLocalModeRef.current) {
          try {
            await checked(
              supabase.rpc("categorize_budget_transaction", {
                p_tx_id: txId,
                p_category_key: categoryKey,
                p_save_rule: saveRule,
                p_rule_pattern: rulePattern?.trim() || null,
              }),
            );
          } catch (err) {
            if (!isMissingBudgetTableError(err)) throw err;
            budgetLocalModeRef.current = true;
            applyLocalCategorize();
          }
        } else {
          applyLocalCategorize();
        }
      },
      saveRule ? "Категорію збережено і запам’ятовано" : "Категорію збережено",
    );
  };

  const addBudgetCategory = (input: NewBudgetCategory) => {
    const name = input.name.trim().slice(0, 50);
    const emoji = input.emoji.trim().slice(0, 16) || "📦";
    if (!name) {
      notify("Введіть назву категорії");
      return Promise.resolve(false);
    }
    if (
      data.budgetCategories.some(
        (c) =>
          c.kind === input.kind &&
          c.name.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      notify("Така категорія вже існує");
      return Promise.resolve(false);
    }
    const activeCoupleId = coupleId ?? coupleIdRef.current ?? DEMO_COUPLE;
    return run(
      "add-budget-cat",
      async () => {
        const now = new Date().toISOString();
        const row: BudgetCategory = {
          id: crypto.randomUUID(),
          couple_id: activeCoupleId,
          kind: input.kind,
          name,
          emoji,
          sort_order: 100 + data.budgetCategories.length,
          created_by: userId,
          created_at: now,
          updated_at: now,
        };
        const applyLocalAddCat = () => {
          if (supabase) {
            writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
              ...prev,
              pendingSync: true,
              categories: [...prev.categories, row],
            }));
          }
          setData((d) => ({
            ...d,
            budgetCategories: [...d.budgetCategories, row],
          }));
        };
        if (supabase && !budgetLocalModeRef.current) {
          try {
            await checked(
              supabase
                .from("budget_categories")
                .insert({
                  couple_id: row.couple_id,
                  kind: row.kind,
                  name: row.name,
                  emoji: row.emoji,
                  sort_order: row.sort_order,
                  created_by: row.created_by,
                })
                .select("id")
                .single(),
            );
          } catch (err) {
            if (!isMissingBudgetTableError(err)) throw err;
            budgetLocalModeRef.current = true;
            applyLocalAddCat();
          }
        } else {
          applyLocalAddCat();
        }
      },
      "Категорію додано",
    );
  };

  const removeBudgetCategory = (id: string) => {
    const activeCoupleId = coupleId ?? coupleIdRef.current ?? DEMO_COUPLE;
    return run(
      `del-budget-cat-${id}`,
      async () => {
        const applyLocalRemoveCat = () => {
          const customKey = `custom:${id}`;
          const applyOnCollections = (
            categories: BudgetCategory[],
            transactions: BudgetTransaction[],
            merchantRules: BudgetMerchantRule[],
          ) => {
            const cat = categories.find((c) => c.id === id);
            const fallback = cat?.kind === "income" ? "refund" : "other";
            return {
              categories: categories.filter((c) => c.id !== id),
              transactions: transactions.map((tx) =>
                tx.category_key === customKey
                  ? { ...tx, category_key: fallback }
                  : tx,
              ),
              merchantRules: merchantRules.map((rule) =>
                rule.category_key === customKey
                  ? { ...rule, category_key: fallback }
                  : rule,
              ),
            };
          };
          if (supabase) {
            writeLocalBudgetState(activeCoupleId, userId, (prev) => {
              const next = applyOnCollections(
                prev.categories,
                prev.transactions,
                prev.merchantRules,
              );
              return {
                ...prev,
                pendingSync: true,
                categories: next.categories,
                transactions: next.transactions,
                merchantRules: next.merchantRules,
              };
            });
          }
          setData((d) => {
            const next = applyOnCollections(
              d.budgetCategories,
              d.budgetTransactions,
              d.budgetMerchantRules,
            );
            return {
              ...d,
              budgetCategories: next.categories,
              budgetTransactions: next.transactions,
              budgetMerchantRules: next.merchantRules,
            };
          });
        };
        if (supabase && !budgetLocalModeRef.current) {
          try {
            await checked(
              supabase.rpc("delete_budget_category", { p_category_id: id }),
            );
          } catch (err) {
            if (!isMissingBudgetTableError(err)) throw err;
            budgetLocalModeRef.current = true;
            applyLocalRemoveCat();
          }
        } else {
          applyLocalRemoveCat();
        }
      },
      "Категорію видалено",
    );
  };

  const saveBudgetMerchantRule = (
    pattern: string,
    categoryKey: string,
    kind: BudgetKind = "expense",
  ) => {
    const clean = pattern.trim().slice(0, 120);
    const norm = normalizeMerchantName(clean);
    if (!clean || !norm) {
      notify("Введіть назву продавця для правила");
      return Promise.resolve(false);
    }
    const activeCoupleId = coupleId ?? coupleIdRef.current ?? DEMO_COUPLE;
    return run(
      "save-budget-rule",
      async () => {
        const applyLocalRule = () => {
          const applyOnRules = (rules: BudgetMerchantRule[]) => {
            const idx = rules.findIndex((r) => r.normalized_pattern === norm);
            const now = new Date().toISOString();
            const nextRule: BudgetMerchantRule = {
              id: idx >= 0 ? rules[idx].id : crypto.randomUUID(),
              couple_id: activeCoupleId,
              merchant_pattern: clean,
              normalized_pattern: norm,
              category_key: categoryKey,
              kind,
              created_by: userId,
              created_at: idx >= 0 ? rules[idx].created_at : now,
              updated_at: now,
            };
            return idx >= 0
              ? rules.map((r, i) => (i === idx ? nextRule : r))
              : [nextRule, ...rules];
          };
          if (supabase) {
            writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
              ...prev,
              pendingSync: true,
              merchantRules: applyOnRules(prev.merchantRules),
            }));
          }
          setData((d) => ({
            ...d,
            budgetMerchantRules: applyOnRules(d.budgetMerchantRules),
          }));
        };
        if (supabase && !budgetLocalModeRef.current) {
          try {
            await checked(
              supabase.from("budget_merchant_rules").upsert(
                {
                  couple_id: activeCoupleId,
                  merchant_pattern: clean,
                  category_key: categoryKey,
                  kind,
                  created_by: userId,
                },
                { onConflict: "couple_id,normalized_pattern" },
              ),
            );
          } catch (err) {
            if (!isMissingBudgetTableError(err)) throw err;
            budgetLocalModeRef.current = true;
            applyLocalRule();
          }
        } else {
          applyLocalRule();
        }
      },
      "Правило збережено",
    );
  };

  const removeBudgetMerchantRule = (id: string) => {
    const activeCoupleId = coupleId ?? coupleIdRef.current ?? DEMO_COUPLE;
    return run(
      `del-rule-${id}`,
      async () => {
        const applyLocalRemoveRule = () => {
          if (supabase) {
            writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
              ...prev,
              pendingSync: true,
              merchantRules: prev.merchantRules.filter((r) => r.id !== id),
            }));
          }
          setData((d) => ({
            ...d,
            budgetMerchantRules: d.budgetMerchantRules.filter(
              (r) => r.id !== id,
            ),
          }));
        };
        if (supabase && !budgetLocalModeRef.current) {
          try {
            await checked(
              supabase
                .from("budget_merchant_rules")
                .delete()
                .eq("id", id)
                .select("id")
                .single(),
            );
          } catch (err) {
            if (!isMissingBudgetTableError(err)) throw err;
            budgetLocalModeRef.current = true;
            applyLocalRemoveRule();
          }
        } else {
          applyLocalRemoveRule();
        }
      },
      "Правило видалено",
    );
  };

  const setBudgetIncomeSharing = (share: boolean) => {
    const activeCoupleId = coupleId ?? coupleIdRef.current ?? DEMO_COUPLE;
    return run(
      "budget-income-sharing",
      async () => {
        const applyLocalSharing = () => {
          const now = new Date().toISOString();
          const applyOnCollections = (
            settings: BudgetSettings[],
            transactions: BudgetTransaction[],
          ) => {
            const exists = settings.some((s) => s.user_id === userId);
            const nextSettings = exists
              ? settings.map((s) =>
                  s.user_id === userId
                    ? { ...s, share_income_with_partner: share, updated_at: now }
                    : s,
                )
              : [
                  ...settings,
                  {
                    user_id: userId,
                    couple_id: activeCoupleId,
                    share_income_with_partner: share,
                    updated_at: now,
                  },
                ];
            return {
              settings: nextSettings,
              transactions: transactions.map((tx) =>
                tx.user_id === userId ? { ...tx, is_private: !share } : tx,
              ),
            };
          };
          if (supabase) {
            writeLocalBudgetState(activeCoupleId, userId, (prev) => {
              const next = applyOnCollections(prev.settings, prev.transactions);
              return {
                ...prev,
                pendingSync: true,
                settings: next.settings,
                transactions: next.transactions,
              };
            });
          }
          setData((d) => {
            const next = applyOnCollections(
              d.budgetSettings,
              d.budgetTransactions,
            );
            return {
              ...d,
              budgetSettings: next.settings,
              budgetTransactions: next.transactions,
            };
          });
        };
        if (supabase && !budgetLocalModeRef.current) {
          try {
            await checked(
              supabase.rpc("set_budget_income_sharing", { p_share: share }),
            );
            await checked(
              supabase
                .from("budget_transactions")
                .update({ is_private: !share })
                .eq("couple_id", activeCoupleId)
                .eq("user_id", userId),
            );
          } catch (err) {
            if (!isMissingBudgetTableError(err)) throw err;
            budgetLocalModeRef.current = true;
            applyLocalSharing();
          }
        } else {
          applyLocalSharing();
        }
      },
      share
        ? "Ваші операції тепер видимі партнеру"
        : "Ваші операції приховано від партнера",
    );
  };

  const DEMO_TOKEN_KEY = "ours-demo-budget-token-v1";
  const fetchBudgetIngestTokenStatus = useCallback(async (): Promise<BudgetTokenStatus> => {
    if (demo || !supabase || budgetLocalModeRef.current) {
      try {
        const raw = localStorage.getItem(DEMO_TOKEN_KEY);
        if (raw) return JSON.parse(raw) as BudgetTokenStatus;
      } catch {
        /* ignore */
      }
      return { has_token: false, token_hint: "", last_used_at: null, created_at: null };
    }
    try {
      const rows = (await checked(
        supabase.rpc("budget_ingest_token_status"),
      )) as BudgetTokenStatus[];
      return (
        rows[0] ?? {
          has_token: false,
          token_hint: "",
          last_used_at: null,
          created_at: null,
        }
      );
    } catch (err) {
      if (isMissingBudgetTableError(err)) {
        budgetLocalModeRef.current = true;
        return { has_token: false, token_hint: "", last_used_at: null, created_at: null };
      }
      throw err;
    }
  }, [demo]);

  const rotateBudgetIngestToken = async (): Promise<{
    token: string;
    status: BudgetTokenStatus;
  } | null> => {
    const token = generateBudgetIngestToken();
    const status: BudgetTokenStatus = {
      has_token: true,
      token_hint: token.slice(-4),
      last_used_at: null,
      created_at: new Date().toISOString(),
    };
    const ok = await run(
      "rotate-budget-token",
      async () => {
        if (supabase) {
          try {
            await checked(
              supabase.rpc("rotate_budget_ingest_token", { p_token: token }),
            );
          } catch (err) {
            if (isMissingBudgetTableError(err)) {
              throw new Error(
                "Щоб увімкнути Apple Pay, спершу застосуйте SQL-міграцію бюджету в Supabase.",
                { cause: err },
              );
            }
            throw err;
          }
        } else {
          localStorage.setItem(DEMO_TOKEN_KEY, JSON.stringify(status));
        }
      },
      "Токен Apple Pay створено",
    );
    return ok ? { token, status } : null;
  };

  const revokeBudgetIngestToken = () =>
    run(
      "revoke-budget-token",
      async () => {
        if (supabase) {
          try {
            await checked(supabase.rpc("revoke_budget_ingest_token"));
          } catch (err) {
            if (isMissingBudgetTableError(err)) {
              throw new Error(
                "Щоб керувати Apple Pay токеном, спершу застосуйте SQL-міграцію бюджету в Supabase.",
                { cause: err },
              );
            }
            throw err;
          }
        } else {
          localStorage.removeItem(DEMO_TOKEN_KEY);
        }
      },
      "Токен Apple Pay відкликано",
    );

  const toggleWishFulfilled = (id: string, fulfilled: boolean) =>
    run(
      `wish-fulfilled-${id}`,
      async () => {
        writeLocalFulfilledWish(trashScope, id, fulfilled);
        if (supabase) {
          try {
            await checked(
              supabase
                .from("wishes")
                .update({ fulfilled })
                .eq("id", id)
                .select("id")
                .single(),
            );
          } catch (err) {
            if (!isMissingFulfilledColumn(err)) throw err;
          }
        }
        setData((d) => ({
          ...d,
          wishes: d.wishes.map((w) => (w.id === id ? { ...w, fulfilled } : w)),
        }));
      },
      fulfilled ? "Позначено виконаним" : "Повернуто в активні бажання",
    );

  const addBudgetRecurring = (input: NewBudgetRecurringPayment) => {
    const title = input.title.trim().slice(0, 120);
    const amount = Math.round(Number(input.amount) * 100) / 100;
    const day = Math.max(1, Math.min(31, Math.round(Number(input.day_of_month) || 1)));
    if (!title) {
      notify("Введіть назву регулярного платежу");
      return Promise.resolve(false);
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount >= 100_000_000) {
      notify("Вкажіть коректну суму більше 0 ₴");
      return Promise.resolve(false);
    }
    const activeCoupleId = coupleId ?? coupleIdRef.current ?? DEMO_COUPLE;
    return run(
      "add-budget-recurring",
      async () => {
        const now = new Date().toISOString();
        const row: BudgetRecurringPayment = {
          id: crypto.randomUUID(),
          couple_id: activeCoupleId,
          user_id: userId,
          title,
          kind: input.kind,
          amount,
          category_key: input.category_key,
          day_of_month: day,
          active: true,
          last_confirmed_month: null,
          last_skipped_month: null,
          created_at: now,
          updated_at: now,
        };
        const saveLocalRecurring = () => {
          if (supabase && activeCoupleId) {
            writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
              ...prev,
              recurring: [...prev.recurring, row],
            }));
          }
          setData((d) => ({
            ...d,
            budgetRecurring: [...d.budgetRecurring, row],
          }));
        };
        if (supabase && !budgetLocalModeRef.current && !budgetRecurringLocalRef.current) {
          try {
            const inserted = (await checked(
              supabase
                .from("budget_recurring_payments")
                .insert({
                  id: row.id,
                  couple_id: row.couple_id,
                  user_id: row.user_id,
                  title: row.title,
                  kind: row.kind,
                  amount: row.amount,
                  category_key: row.category_key,
                  day_of_month: row.day_of_month,
                  active: row.active,
                })
                .select("*")
                .single(),
            )) as BudgetRecurringPayment;
            setData((d) => ({
              ...d,
              budgetRecurring: [
                ...d.budgetRecurring.filter((r) => r.id !== inserted.id),
                inserted,
              ],
            }));
          } catch (err) {
            if (!isMissingBudgetTableError(err)) throw err;
            budgetRecurringLocalRef.current = true;
            saveLocalRecurring();
          }
        } else {
          saveLocalRecurring();
        }
      },
      "Регулярний платіж додано",
    );
  };

  const updateBudgetRecurring = (
    id: string,
    patch: Partial<
      Pick<
        BudgetRecurringPayment,
        | "title"
        | "kind"
        | "amount"
        | "category_key"
        | "day_of_month"
        | "active"
        | "last_confirmed_month"
        | "last_skipped_month"
      >
    >,
    message = "Регулярний платіж оновлено",
  ) => {
    const activeCoupleId = coupleId ?? coupleIdRef.current ?? DEMO_COUPLE;
    return run(
      `budget-rec-${id}`,
      async () => {
        const now = new Date().toISOString();
        const saveLocalUpdate = () => {
          if (supabase && activeCoupleId) {
            writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
              ...prev,
              recurring: prev.recurring.map((r) =>
                r.id === id ? { ...r, ...patch, updated_at: now } : r,
              ),
            }));
          }
          setData((d) => ({
            ...d,
            budgetRecurring: d.budgetRecurring.map((r) =>
              r.id === id ? { ...r, ...patch, updated_at: now } : r,
            ),
          }));
        };
        if (supabase && !budgetLocalModeRef.current && !budgetRecurringLocalRef.current) {
          try {
            const updated = (await checked(
              supabase
                .from("budget_recurring_payments")
                .update(patch)
                .eq("id", id)
                .select("*")
                .single(),
            )) as BudgetRecurringPayment;
            setData((d) => ({
              ...d,
              budgetRecurring: d.budgetRecurring.map((r) =>
                r.id === id ? updated : r,
              ),
            }));
          } catch (err) {
            if (!isMissingBudgetTableError(err)) throw err;
            budgetRecurringLocalRef.current = true;
            saveLocalUpdate();
          }
        } else {
          saveLocalUpdate();
        }
      },
      message,
    );
  };

  const removeBudgetRecurring = (id: string) => {
    const activeCoupleId = coupleId ?? coupleIdRef.current ?? DEMO_COUPLE;
    return run(
      `del-budget-rec-${id}`,
      async () => {
        const saveLocalRemove = () => {
          if (supabase && activeCoupleId) {
            writeLocalBudgetState(activeCoupleId, userId, (prev) => ({
              ...prev,
              recurring: prev.recurring.filter((r) => r.id !== id),
            }));
          }
          setData((d) => ({
            ...d,
            budgetRecurring: d.budgetRecurring.filter((r) => r.id !== id),
          }));
        };
        if (supabase && !budgetLocalModeRef.current && !budgetRecurringLocalRef.current) {
          try {
            await checked(
              supabase
                .from("budget_recurring_payments")
                .delete()
                .eq("id", id)
                .select("id")
                .single(),
            );
            setData((d) => ({
              ...d,
              budgetRecurring: d.budgetRecurring.filter((r) => r.id !== id),
            }));
          } catch (err) {
            if (!isMissingBudgetTableError(err)) throw err;
            budgetRecurringLocalRef.current = true;
            saveLocalRemove();
          }
        } else {
          saveLocalRemove();
        }
      },
      "Регулярний платіж видалено",
    );
  };

  const confirmBudgetRecurring = async (
    item: BudgetRecurringPayment,
    overrideAmount?: number,
  ) => {
    const amount = overrideAmount ?? item.amount;
    const today = kyivDate();
    const ym = today.slice(0, 7);
    const ok = await addBudgetTransaction({
      kind: item.kind,
      amount,
      merchant: item.title,
      note: "Регулярний платіж",
      category_key: item.category_key,
      is_private: !(
        data.budgetSettings.find((s) => s.user_id === userId)
          ?.share_income_with_partner ?? false
      ),
      occurred_on: today,
    });
    if (!ok) return false;
    await updateBudgetRecurring(
      item.id,
      { last_confirmed_month: ym },
      "",
    );
    return true;
  };

  const skipBudgetRecurring = (item: BudgetRecurringPayment) => {
    const ym = kyivDate().slice(0, 7);
    return updateBudgetRecurring(
      item.id,
      { last_skipped_month: ym },
      "Пропущено цього місяця",
    );
  };

  const importBackupJson = async (
    raw: Record<string, unknown>,
  ): Promise<{ restored: number; summary: string } | null> => {
    const arr = <T,>(...keys: string[]): T[] => {
      for (const k of keys) {
        if (Array.isArray(raw[k])) return raw[k] as T[];
      }
      return [];
    };
    const shopping = arr<ShoppingItem>("shopping");
    const wishes = arr<Data["wishes"][number]>("wishes");
    const events = arr<Data["events"][number]>("events");
    const movies = arr<Data["movies"][number]>("movies");
    const recipes = arr<Data["recipes"][number]>("recipes");
    const plants = arr<Plant>("plants");
    const pantry = arr<PantryItem>("pantry");
    const budgetTransactions = arr<BudgetTransaction>(
      "budget_transactions",
      "budgetTransactions",
    );
    const budgetCategories = arr<BudgetCategory>(
      "budget_categories",
      "budgetCategories",
    );
    const budgetMerchantRules = arr<BudgetMerchantRule>(
      "budget_merchant_rules",
      "budgetMerchantRules",
    );
    const budgetRecurring = arr<BudgetRecurringPayment>(
      "budget_recurring",
      "budgetRecurring",
    );

    const totalIncoming =
      shopping.length +
      wishes.length +
      events.length +
      movies.length +
      recipes.length +
      plants.length +
      pantry.length +
      budgetTransactions.length +
      budgetCategories.length +
      budgetMerchantRules.length +
      budgetRecurring.length;

    if (totalIncoming === 0) {
      notify("У файлі не знайдено даних для відновлення");
      return null;
    }

    const activeCoupleId = coupleId ?? coupleIdRef.current ?? DEMO_COUPLE;
    const validProfileIds = new Set(data.profiles.map((p) => p.id));
    const safeActor = (id?: string | null) =>
      id && validProfileIds.has(id) ? id : userId;

    const mergeById = <T extends { id: string }>(
      existing: T[],
      incoming: T[],
    ): T[] => {
      const map = new Map<string, T>();
      for (const item of existing) map.set(item.id, item);
      for (const item of incoming) {
        if (item && typeof item.id === "string") map.set(item.id, item);
      }
      return [...map.values()];
    };

    const ok = await run(
      "import-backup",
      async () => {
        if (supabase && activeCoupleId) {
          if (shopping.length) {
            await checked(
              supabase.from("shopping_items").upsert(
                shopping
                  .filter((i) => i.name && !i.session_id && !i.menu_key)
                  .map((i) => ({
                    id: i.id,
                    couple_id: activeCoupleId,
                    name: i.name,
                    quantity: i.quantity,
                    unit: i.unit || "шт.",
                    category: i.category || "Інше",
                    price: i.price ?? null,
                    added_by: safeActor(i.added_by),
                    purchased: Boolean(i.purchased),
                    session_id: null,
                  })),
                { onConflict: "id", ignoreDuplicates: true },
              ),
            );
          }
          if (wishes.length) {
            await checked(
              supabase.from("wishes").upsert(
                wishes
                  .filter((w) => w.name)
                  .map((w) => ({
                    id: w.id,
                    couple_id: activeCoupleId,
                    owner_id: safeActor(w.owner_id),
                    name: w.name,
                    price: w.price ?? null,
                    url: w.url ?? "",
                    priority: w.priority || "Просто хочу",
                    note: w.note ?? "",
                    image_path: w.image_path ?? null,
                    image_url: w.image_url ?? "",
                    is_private: Boolean(w.is_private),
                    fulfilled: Boolean(w.fulfilled),
                    size: w.size ?? "",
                  })),
                { onConflict: "id", ignoreDuplicates: true },
              ),
            );
          }
          if (events.length) {
            await checked(
              supabase.from("events").upsert(
                events
                  .filter((e) => e.title && e.date)
                  .map((e) => ({
                    id: e.id,
                    couple_id: activeCoupleId,
                    title: e.title,
                    date: e.date,
                    time: e.time ?? null,
                    all_day: Boolean(e.all_day),
                    location: e.location ?? "",
                    url: e.url ?? "",
                    description: e.description ?? "",
                    category: e.category || "Інше",
                    recurrence: normalizeRecurrence(e.recurrence),
                    created_by: safeActor(e.created_by),
                  })),
                { onConflict: "id", ignoreDuplicates: true },
              ),
            );
          }
          if (movies.length) {
            await checked(
              supabase.from("movies").upsert(
                movies
                  .filter((m) => m.title)
                  .map((m) => ({
                    id: m.id,
                    couple_id: activeCoupleId,
                    title: m.title,
                    url: m.url ?? "",
                    poster_url: m.poster_url ?? "",
                    year: m.year ?? null,
                    genres: m.genres ?? "",
                    description: m.description ?? "",
                    status: m.status === "watched" ? "watched" : "planned",
                    rating: typeof m.rating === "number" ? m.rating : null,
                    metadata_url: m.metadata_url ?? "",
                    added_by: safeActor(m.added_by),
                  })),
                { onConflict: "id", ignoreDuplicates: true },
              ),
            );
          }
          if (recipes.length) {
            await checked(
              supabase.from("recipes").upsert(
                recipes
                  .filter((r) => r.title && r.image_url && Array.isArray(r.ingredients) && r.ingredients.length)
                  .map((r) => ({
                    id: r.id,
                    couple_id: activeCoupleId,
                    title: r.title,
                    category: r.category || "main",
                    image_url: r.image_url,
                    source_url: r.source_url ?? "",
                    ingredients: r.ingredients,
                    instructions: Array.isArray(r.instructions) ? r.instructions : [],
                    base_servings: r.base_servings || 1,
                    total_time_minutes: r.total_time_minutes ?? null,
                    added_by: safeActor(r.added_by),
                  })),
                { onConflict: "id", ignoreDuplicates: true },
              ),
            );
          }
          if (plants.length) {
            await checked(
              supabase.from("plants").upsert(
                plants
                  .filter((p) => p.name)
                  .map((p) => ({
                    id: p.id,
                    couple_id: activeCoupleId,
                    name: p.name,
                    species: p.species ?? "",
                    image_path: p.image_path ?? null,
                    watering_interval_days: p.watering_interval_days || 7,
                    last_watered_at: p.last_watered_at || kyivDate(),
                    wet_checked_at: p.wet_checked_at ?? null,
                    light: p.light ?? "",
                    watering_notes: p.watering_notes ?? "",
                    info_url: p.info_url ?? "",
                    added_by: safeActor(p.added_by),
                  })),
                { onConflict: "id", ignoreDuplicates: true },
              ),
            );
          }
          if (pantry.length) {
            await checked(
              supabase.from("pantry_items").upsert(
                pantry
                  .filter((p) => p.name)
                  .map((p) => ({
                    id: p.id,
                    couple_id: activeCoupleId,
                    name: p.name,
                    normalized_name:
                      p.normalized_name || normalizePantryName(p.name),
                    quantity: p.quantity ?? "",
                    is_basic: Boolean(p.is_basic),
                    added_by: safeActor(p.added_by),
                  })),
                { onConflict: "couple_id,normalized_name", ignoreDuplicates: true },
              ),
            );
          }
          if (budgetCategories.length && !budgetLocalModeRef.current) {
            try {
              await checked(
                supabase.from("budget_categories").upsert(
                  budgetCategories
                    .filter((c) => c.name)
                    .map((c) => ({
                      id: c.id,
                      couple_id: activeCoupleId,
                      name: c.name,
                      kind: c.kind === "income" ? "income" : "expense",
                      emoji: c.emoji || "✨",
                      sort_order: c.sort_order ?? 100,
                      created_by: safeActor(c.created_by),
                    })),
                  { onConflict: "id", ignoreDuplicates: true },
                ),
              );
            } catch (err) {
              if (!isMissingBudgetTableError(err)) throw err;
            }
          }
          if (budgetMerchantRules.length && !budgetLocalModeRef.current) {
            try {
              await checked(
                supabase.from("budget_merchant_rules").upsert(
                  budgetMerchantRules
                    .filter((r) => r.merchant_pattern && r.category_key)
                    .map((r) => ({
                      id: r.id,
                      couple_id: activeCoupleId,
                      merchant_pattern: r.merchant_pattern,
                      category_key: r.category_key,
                      kind: r.kind === "income" ? "income" : "expense",
                      created_by: safeActor(r.created_by),
                    })),
                  { onConflict: "id", ignoreDuplicates: true },
                ),
              );
            } catch (err) {
              if (!isMissingBudgetTableError(err)) throw err;
            }
          }
          if (budgetTransactions.length && !budgetLocalModeRef.current) {
            try {
              await checked(
                supabase.from("budget_transactions").upsert(
                  budgetTransactions
                    .filter((t) => Number(t.amount) > 0)
                    .map((t) => ({
                      id: t.id,
                      couple_id: activeCoupleId,
                      user_id: safeActor(t.user_id),
                      kind: t.kind === "income" ? "income" : "expense",
                      amount: t.amount,
                      merchant: t.merchant ?? "",
                      note: t.note ?? "",
                      category_key: t.category_key || "other",
                      status:
                        t.status === "needs_review" ? "needs_review" : "confirmed",
                      source: t.source === "apple_pay" ? "apple_pay" : "manual",
                      is_private: Boolean(t.is_private),
                      card_label: t.card_label ?? "",
                      occurred_on: t.occurred_on || kyivDate(),
                      occurred_at: t.occurred_at || new Date().toISOString(),
                    })),
                  { onConflict: "id", ignoreDuplicates: true },
                ),
              );
            } catch (err) {
              if (!isMissingBudgetTableError(err)) throw err;
            }
          }
          if (budgetRecurring.length && !budgetRecurringLocalRef.current) {
            try {
              await checked(
                supabase.from("budget_recurring_payments").upsert(
                  budgetRecurring
                    .filter((r) => r.title && Number(r.amount) > 0)
                    .map((r) => ({
                      id: r.id,
                      couple_id: activeCoupleId,
                      user_id: safeActor(r.user_id),
                      title: r.title,
                      kind: r.kind === "income" ? "income" : "expense",
                      amount: r.amount,
                      category_key: r.category_key || "other",
                      day_of_month: Math.max(1, Math.min(31, Number(r.day_of_month) || 1)),
                      active: r.active !== false,
                      last_confirmed_month: r.last_confirmed_month ?? null,
                      last_skipped_month: r.last_skipped_month ?? null,
                    })),
                  { onConflict: "id", ignoreDuplicates: true },
                ),
              );
            } catch (err) {
              if (!isMissingBudgetTableError(err)) throw err;
            }
          }
        } else {
          setData((d) => ({
            ...d,
            shopping: shopping.length ? mergeById(d.shopping, shopping) : d.shopping,
            wishes: wishes.length ? mergeById(d.wishes, wishes) : d.wishes,
            events: events.length ? mergeById(d.events, events) : d.events,
            movies: movies.length ? mergeById(d.movies, movies) : d.movies,
            recipes: recipes.length ? mergeById(d.recipes, recipes) : d.recipes,
            plants: plants.length ? mergeById(d.plants, plants) : d.plants,
            pantry: pantry.length ? mergeById(d.pantry, pantry) : d.pantry,
            budgetTransactions: budgetTransactions.length
              ? mergeById(d.budgetTransactions, budgetTransactions)
              : d.budgetTransactions,
            budgetCategories: budgetCategories.length
              ? mergeById(d.budgetCategories, budgetCategories)
              : d.budgetCategories,
            budgetMerchantRules: budgetMerchantRules.length
              ? mergeById(d.budgetMerchantRules, budgetMerchantRules)
              : d.budgetMerchantRules,
            budgetRecurring: budgetRecurring.length
              ? mergeById(d.budgetRecurring, budgetRecurring)
              : d.budgetRecurring,
          }));
        }
      },
      "Резервну копію відновлено",
    );
    if (!ok) return null;
    return {
      restored: totalIncoming,
      summary: `Відновлено записів: ${totalIncoming}`,
    };
  };

  return {
    demo,
    session,
    authReady,
    userId,
    coupleId,
    data,
    loading,
    failure,
    pending,
    online,
    queuedShoppingCount: shoppingQueue.length,
    queuedBudgetCount: budgetQueue.length,
    queuedMutationCount: mutationQueue.length,
    flushShoppingQueue,
    flushBudgetQueue,
    flushMutationQueue,
    sync,
    notice,
    setNotice,
    notify,
    refresh,
    run,
    trash,
    restoreFromTrash,
    deleteTrashEntry,
    emptyTrash,
    addShopping,
    addWish,
    toggleWishFulfilled,
    addEvent,
    addPlant,
    updatePlant,
    removePlant,
    recordPlantCare,
    addMovie,
    addRecipe,
    upsertMenu,
    removeMenuItem,
    finishMenuItem,
    toggleRecipeFavorite,
    restoreMenuProducts,
    addPantryItem,
    updatePantryItem,
    removePantryItem,
    toggleBasicPantryItem,
    markRead,
    addShoppingBatch,
    update,
    remove,
    archive,
    repeat,
    saveProfile,
    reserve,
    addBudgetTransaction,
    importBudgetTransactions,
    updateBudgetTransaction,
    removeBudgetTransaction,
    categorizeBudgetTransaction,
    addBudgetCategory,
    removeBudgetCategory,
    saveBudgetMerchantRule,
    removeBudgetMerchantRule,
    setBudgetIncomeSharing,
    fetchBudgetIngestTokenStatus,
    rotateBudgetIngestToken,
    revokeBudgetIngestToken,
    addBudgetRecurring,
    updateBudgetRecurring,
    removeBudgetRecurring,
    confirmBudgetRecurring,
    skipBudgetRecurring,
    importBackupJson,
  };
}
const Context = createContext<ReturnType<typeof useStore> | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useStore()}>{children}</Context.Provider>;
}
export function useApp() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("Missing AppProvider");
  return ctx;
}
