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
} from "../lib/types";
import { customRecipeView, syncDemoMenuShopping } from "../lib/recipe-catalog";
import { isAtHomeIngredient, normalizePantryName } from "../lib/pantry";
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
  deleteLocalRecurrence,
  normalizeRecurrence,
  readLocalRecurrences,
  saveLocalRecurrence,
} from "../lib/recurrence";
import {
  clearTrash,
  pushTrash,
  readTrash,
  removeTrashEntry,
  type TrashEntry,
  type TrashKind,
} from "../lib/trash";
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
  const shoppingQueueRef = useRef<ShoppingQueueOp[]>(shoppingQueue),
    flushingQueue = useRef(false),
    coupleIdRef = useRef<string | null>(coupleId);
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
  }, [trashScope]);
  const notify = useCallback(
    (text: string, action?: () => void, label = "Скасувати") =>
      setNotice({
        text,
        action,
        label,
        error: /^(Не вдалося|Немає|Пам’ять|Фото|Оберіть)/.test(text),
      }),
    [],
  );
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) notify("Не вдалося відновити вхід. Увійдіть ще раз.");
      setSession(data.session);
      setAuthReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
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
            if (isOfflineNetworkError(err)) {
              break;
            }
            // Drop permanently invalid/conflicting op so the queue cannot stall forever.
            commitShoppingQueue((prev) =>
              prev.length && prev[0] === op
                ? prev.slice(1)
                : prev.filter((item) => item !== op),
            );
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
  const refresh = useCallback(async () => {
    if (!supabase || !userId) return;
    const current = ++revision.current;
    try {
      if (navigator.onLine && shoppingQueueRef.current.length > 0) {
        await flushShoppingQueue({ silent: false });
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
          setCoupleId(null);
          setData({ ...empty, profiles: profile as Profile[] });
          setFailure(false);
        }
        return;
      }
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
        ),
        readAll<Data["reads"][number]>("activity_reads", { user_id: userId }),
        readAll<Data["recipes"][number]>("recipes", { couple_id: couple }),
        readAll<MealPlanItem>("meal_plan_items", { couple_id: couple }),
        readAll<PantryItem>("pantry_items", { couple_id: couple }).catch(
          () => [] as PantryItem[],
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
      ]);
      if (current !== revision.current) return;
      const mergedShopping = applyShoppingQueue(
        shopping,
        shoppingQueueRef.current,
      );
      writeShoppingCache(trashScope, mergedShopping);
      const localRecurrences = readLocalRecurrences();
      coupleIdRef.current = couple;
      setCoupleId(couple);
      setData({
        mealPlan,
        pantry,
        recipes,
        profiles,
        shopping: mergedShopping,
        sessions,
        wishes,
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
      });
      setFailure(false);
    } catch {
      if (current === revision.current) {
        const cached = readShoppingCache(trashScope);
        if (!navigator.onLine && (cached.length || shoppingQueueRef.current.length)) {
          setData((prev) => ({
            ...prev,
            shopping: applyShoppingQueue(
              prev.shopping.length ? prev.shopping : cached,
              shoppingQueueRef.current,
            ),
          }));
          setFailure(false);
        } else {
          setFailure(true);
          notify("Не вдалося оновити дані. Перевірте з’єднання.");
        }
      }
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, [userId, notify, flushShoppingQueue, trashScope]);
  useEffect(() => {
    if (demo) return;
    if (!userId) {
      revision.current++;
      setData(empty);
      setCoupleId(null);
      setLoading(false);
      return;
    }
    setData(empty);
    setCoupleId(null);
    setLoading(true);
    void refresh();
  }, [demo, userId, refresh]);
  useEffect(() => {
    if (!supabase || !coupleId || !userId) return;
    const channel = supabase.channel(`space:${coupleId}`);
    for (const table of [
      "shopping_items",
      "shopping_sessions",
      "shopping_product_history",
      "events",
      "couple_members",
      "movies",
      "wishes",
      "recipes",
      "meal_plan_items",
      "pantry_items",
      "plants",
      "plant_care_events",
      "recipe_cooks",
      "activity_events",
    ]) {
      for (const event of ["INSERT", "UPDATE"] as const)
        channel.on(
          "postgres_changes",
          {
            event,
            schema: "public",
            table,
            filter: `couple_id=eq.${coupleId}`,
          },
          () => void refresh(),
        );
      if (table !== "wishes")
        channel.on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table },
          () => void refresh(),
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
      () => void refresh(),
    );
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      () => void refresh(),
    );
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "activity_reads",
        filter: `user_id=eq.${userId}`,
      },
      () => void refresh(),
    );
    // Secret gifts are intentionally absent from Realtime publication.
    // The author refreshes after mutations and when returning to this page.
    channel.on("system", {}, (payload) => {
      if (payload.extension === "postgres_changes" && payload.status === "ok") {
        setSync("live");
        // PostgreSQL listeners become ready after the channel join. Refresh
        // here as well to cover changes made during that subscription gap.
        void refresh();
      }
    });
    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") setSync("connecting");
      if (status === "SUBSCRIBED") void refresh();
    });
    return () => {
      void supabase!.removeChannel(channel);
    };
  }, [coupleId, userId, refresh]);
  useEffect(() => {
    if (online && !demo && userId) void refresh();
  }, [online, demo, userId, refresh]);
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === "visible" && !demo) void refresh();
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
    action: () => Promise<void>,
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
      await action();
      if (!demo) await refresh();
      if (message) notify(message);
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
  ) =>
    run(
      key,
      async () => {
        const now = new Date().toISOString();
        const row: Record<string, unknown> & { id: string } = {
          id: crypto.randomUUID(),
          created_at: now,
          updated_at: now,
          ...value,
        };
        if (supabase) {
          if (table === "events") {
            const wantedRec = normalizeRecurrence(
              typeof row.recurrence === "string" ? row.recurrence : undefined,
            );
            try {
              await checked(supabase.from(table).insert(row).select("id").single());
            } catch (err) {
              if (!isMissingRecurrenceColumn(err)) throw err;
              const { recurrence: _drop, ...withoutRecurrence } = row;
              void _drop;
              await checked(
                supabase.from(table).insert(withoutRecurrence).select("id").single(),
              );
              saveLocalRecurrence(row.id, wantedRec);
            }
          } else {
            await checked(supabase.from(table).insert(row).select("id").single());
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
    return run(
      id,
      async () => {
        if (supabase) {
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
    let trashedEntry: TrashEntry | null = null;
    const ok = await run(id, async () => {
      if (supabase) {
        if (table === "wishes")
          await checked(supabase.rpc("delete_wish", { p_wish_id: id }));
        else {
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
  const addPlant = (value: NewPlant) =>
    run(
      "add-plant",
      async () => {
        if (supabase) {
          await checked(
            supabase
              .from("plants")
              .insert({ ...value, couple_id: coupleId, added_by: userId })
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
            wet_checked_at: null,
            ...value,
          };
          setData((d) => ({ ...d, plants: [row, ...d.plants] }));
        }
      },
      "Рослину збережено",
    );
  const updatePlant = (id: string, patch: Partial<NewPlant>) =>
    run(
      `plant-${id}`,
      async () => {
        if (supabase)
          await checked(
            supabase
              .from("plants")
              .update(patch)
              .eq("id", id)
              .select("id")
              .single(),
          );
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
  const removePlant = async (id: string) => {
    const snap = data.plants.find((p) => p.id === id) as
      | Record<string, unknown>
      | undefined;
    let trashedEntry: TrashEntry | null = null;
    const ok = await run(`plant-${id}`, async () => {
      if (supabase)
        await checked(
          supabase.from("plants").delete().eq("id", id).select("id").single(),
        );
      else
        setData((d) => ({
          ...d,
          plants: d.plants.filter((plant) => plant.id !== id),
          plantCare: d.plantCare.filter((entry) => entry.plant_id !== id),
        }));
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
    return run(
      "pantry",
      async () => {
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
        if (supabase) {
          await checked(
            supabase
              .from("pantry_items")
              .insert({
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
  const updatePantryItem = (id: string, patch: Partial<NewPantryItem>) =>
    run(
      "pantry",
      async () => {
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
        if (supabase) {
          await checked(
            supabase
              .from("pantry_items")
              .update(dbPatch)
              .eq("id", id)
              .select("id")
              .single(),
          );
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
  const removePantryItem = (id: string) =>
    run(
      "pantry",
      async () => {
        if (supabase) {
          await checked(
            supabase
              .from("pantry_items")
              .delete()
              .eq("id", id)
              .select("id")
              .single(),
          );
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
  const addShoppingBatch = (
    items: NewShopping[],
    options?: { skipPantryFilter?: boolean },
  ) => {
    const products = options?.skipPantryFilter
      ? items
      : items.filter((item) => !isAtHomeIngredient(item.name, data.pantry));
    if (!products.length) {
      notify("Усі потрібні продукти вже є вдома.");
      return Promise.resolve(false);
    }
    if (!demo && (!online || !navigator.onLine)) {
      const now = new Date().toISOString();
      for (const value of products) {
        const item: ShoppingItem = {
          ...value,
          id: crypto.randomUUID(),
          couple_id: coupleId ?? "",
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
      return Promise.resolve(true);
    }
    return run(
      "recipe",
      async () => {
        if (supabase)
          await checked(
            supabase.rpc("add_shopping_batch", { p_items: products }),
          );
        else
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
    flushShoppingQueue,
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
