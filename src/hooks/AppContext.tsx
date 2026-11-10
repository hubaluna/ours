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
import { errorMessage } from "../lib/utils";
import type {
  Data,
  NewPlan,
  NewMovie,
  Activity,
  NewShopping,
  NewWish,
  Profile,
  Table,
} from "../lib/types";
const empty: Data = {
  profiles: [],
  movies: [],
  activities: [],
  reads: [],
  shopping: [],
  sessions: [],
  wishes: [],
  reservations: [],
  events: [],
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
  const busy = useRef(new Set<string>()),
    revision = useRef(0);
  const demo = !configured,
    userId = demo ? DEMO_USER : (session?.user.id ?? "");
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
  const refresh = useCallback(async () => {
    if (!supabase || !userId) return;
    const current = ++revision.current;
    try {
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
      ]);
      if (current !== revision.current) return;
      setCoupleId(couple);
      setData({
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
      });
      setFailure(false);
    } catch {
      if (current === revision.current) {
        setFailure(true);
        notify("Не вдалося оновити дані. Перевірте з’єднання.");
      }
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, [userId, notify]);
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
      "wishes",
      "events",
      "couple_members",
      "movies",
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
      // Supabase cannot filter DELETE events. No private payload is consumed;
      // a delete only invalidates the caller's own RLS-protected queries.
      channel.on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table },
        () => void refresh(),
      );
    }
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
    channel.subscribe((status) => {
      setSync(status === "SUBSCRIBED" ? "live" : "connecting");
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
        const row = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...value,
        };
        if (supabase)
          await checked(supabase.from(table).insert(row).select("id").single());
        else {
          const field = (
            {
              shopping_items: "shopping",
              wishes: "wishes",
              events: "events",
              gift_reservations: "reservations",
              movies: "movies",
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
  ) =>
    run(
      id,
      async () => {
        if (supabase)
          await checked(
            supabase
              .from(table)
              .update(patch)
              .eq("id", id)
              .select("id")
              .single(),
          );
        else {
          const field = (
            {
              shopping_items: "shopping",
              wishes: "wishes",
              events: "events",
              gift_reservations: "reservations",
              movies: "movies",
            } as const
          )[table];
          setData((d) =>
            demoActivity(
              {
                ...d,
                [field]: d[field].map((row) =>
                  row.id === id ? { ...row, ...patch } : row,
                ),
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
  const remove = async (table: Table, id: string) =>
    run(
      id,
      async () => {
        if (supabase)
          await checked(
            supabase.from(table).delete().eq("id", id).select("id").single(),
          );
        else {
          const field = (
            {
              shopping_items: "shopping",
              wishes: "wishes",
              events: "events",
              gift_reservations: "reservations",
              movies: "movies",
            } as const
          )[table];
          setData((d) =>
            demoActivity(
              {
                ...d,
                [field]: d[field].filter((row) => row.id !== id),
                ...(table === "wishes"
                  ? {
                      reservations: d.reservations.filter(
                        (r) => r.wish_id !== id,
                      ),
                    }
                  : {}),
              },
              table,
              { ...d[field].find((row) => row.id === id) },
              "deleted",
            ),
          );
        }
      },
      "Видалено",
    );
  const addShopping = (value: NewShopping) =>
    insert(
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
  const addMovie = (value: NewMovie) =>
    insert(
      "movies",
      { ...value, couple_id: coupleId, added_by: userId },
      "add-movie",
      "Фільм збережено",
    );
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
  const addShoppingBatch = (items: NewShopping[]) =>
    run(
      "recipe",
      async () => {
        if (supabase)
          await checked(supabase.rpc("add_shopping_batch", { p_items: items }));
        else
          setData((d) => {
            const rows = items.map((value) => ({
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
              { name: `Продукти з рецепта · ${items.length}` },
              "added",
            );
          });
      },
      "Продукти додано до списку",
    );
  const archive = () =>
    run(
      "archive",
      async () => {
        if (supabase) await checked(supabase.rpc("finish_shopping"));
        else {
          const id = crypto.randomUUID();
          setData((d) => ({
            ...d,
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
    sync,
    notice,
    setNotice,
    notify,
    refresh,
    run,
    addShopping,
    addWish,
    addEvent,
    addMovie,
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
