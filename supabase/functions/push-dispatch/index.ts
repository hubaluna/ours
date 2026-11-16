import {
  allowedPushEndpoint,
  createVapidAuthorization,
  encryptWebPush,
} from "./web-push.ts";
import {
  formatDigestBody,
  isActivePushHour,
  kyivDate,
  kyivHour,
  nextEventOccurrence,
  plantDueToday,
  shouldDispatchActivity,
} from "./smart-rules.ts";

type Activity = {
  id: string;
  couple_id: string;
  actor_id: string;
  kind: "shopping" | "wishes" | "movies" | "events" | "recipes";
  action?: string;
  title: string;
  created_at?: string;
};
type DigestRow = {
  id: string;
  couple_id: string;
  actor_id: string;
  kind: Activity["kind"];
  title: string;
  created_at: string;
};
type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth_secret: string };
type Preferences = {
  user_id: string;
  enabled: boolean;
  shopping: boolean;
  wishes: boolean;
  movies: boolean;
  events: boolean;
  recipes: boolean;
};
type PushConfig = { vapid_private_jwk: string; vapid_public_key: string; vapid_subject: string; app_url: string };

const labels: Record<Activity["kind"], string> = {
  shopping: "Покупки",
  wishes: "Бажання",
  movies: "Кіно",
  events: "Календар",
  recipes: "Меню",
};

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Push service is not configured");
  return value;
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error("Push data lookup failed");
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

function encodeJwk(raw: string): JsonWebKey {
  const parsed = JSON.parse(raw) as JsonWebKey;
  if (parsed.kty !== "EC" || parsed.crv !== "P-256" || !parsed.d || !parsed.x || !parsed.y) {
    throw new Error("Invalid VAPID key");
  }
  return parsed;
}

async function sendOne(subscription: Subscription, payload: string, publicKey: string, privateJwk: JsonWebKey, subject: string): Promise<boolean> {
  if (!allowedPushEndpoint(subscription.endpoint)) return false;
  const body = await encryptWebPush(payload, subscription.p256dh, subscription.auth_secret);
  const authorization = await createVapidAuthorization(subscription.endpoint, publicKey, privateJwk, subject);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      authorization,
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "86400",
      urgency: "normal",
    },
    body: body.slice().buffer as ArrayBuffer,
    signal: AbortSignal.timeout(10000),
  });
  return response.status !== 404 && response.status !== 410;
}

async function dispatchToCoupleRecipients(
  coupleId: string,
  actorId: string | null,
  kind: Activity["kind"] | "plants",
  title: string,
  body: string,
  tag: string,
  config: PushConfig,
): Promise<void> {
  const filter = actorId
    ? `couple_id=eq.${coupleId}&user_id=neq.${actorId}&select=user_id`
    : `couple_id=eq.${coupleId}&select=user_id`;
  const members = await rest<{ user_id: string }[]>(`couple_members?${filter}`);
  const recipients = members.map((row) => row.user_id);
  if (!recipients.length) return;
  const ids = `(${recipients.join(",")})`;
  const [preferences, subscriptions] = await Promise.all([
    rest<Preferences[]>(`push_preferences?user_id=in.${ids}&select=user_id,enabled,shopping,wishes,movies,events,recipes`),
    rest<Subscription[]>(`push_subscriptions?user_id=in.${ids}&select=id,user_id,endpoint,p256dh,auth_secret`),
  ]);
  const preference = new Map(preferences.map((row) => [row.user_id, row]));
  const enabledUsers = new Set(
    recipients.filter((userId) => {
      const pref = preference.get(userId);
      if (!pref?.enabled) return false;
      if (kind === "plants") return pref.events;
      return pref[kind];
    }),
  );
  const targets = subscriptions.filter((subscription) => enabledUsers.has(subscription.user_id));
  if (!targets.length) return;

  const publicKey = config.vapid_public_key;
  const privateJwk = encodeJwk(config.vapid_private_jwk);
  const subject = config.vapid_subject;
  const payload = JSON.stringify({
    title,
    body,
    tag,
    url: config.app_url,
  });

  await Promise.allSettled(
    targets.map(async (subscription) => {
      const live = await sendOne(subscription, payload, publicKey, privateJwk, subject);
      if (!live) {
        await rest<unknown>(`push_subscriptions?id=eq.${subscription.id}`, {
          method: "DELETE",
          headers: { prefer: "return=minimal" },
        });
      }
    }),
  );
}

async function queueDigest(activity: Activity): Promise<boolean> {
  try {
    await rest<unknown>("pending_push_digest", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        couple_id: activity.couple_id,
        actor_id: activity.actor_id,
        kind: activity.kind,
        title: activity.title,
        activity_id: activity.id,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

async function flushPendingAndDaily(config: PushConfig): Promise<void> {
  if (!isActivePushHour(kyivHour())) return;

  try {
    const rows = await rest<DigestRow[]>(
      "pending_push_digest?select=id,couple_id,actor_id,kind,title,created_at&order=created_at.asc&limit=500",
    );
    const nowMs = Date.now();
    const groups = new Map<string, DigestRow[]>();
    for (const row of rows) {
      const key = `${row.couple_id}:${row.actor_id}:${row.kind}`;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }

    for (const group of groups.values()) {
      const newestMs = Date.parse(group[group.length - 1].created_at);
      const isShoppingBatchStillTyping =
        group[0].kind === "shopping" && Number.isFinite(newestMs) && nowMs - newestMs < 4 * 60 * 1000;
      if (isShoppingBatchStillTyping) continue;

      const sample = group[0];
      const profiles = await rest<{ id: string; name: string }[]>(
        `profiles?id=eq.${sample.actor_id}&select=id,name&limit=1`,
      );
      const actorName = profiles[0]?.name || "Партнер";
      const body = formatDigestBody(
        sample.kind,
        actorName,
        group.map((item) => item.title),
      );
      await dispatchToCoupleRecipients(
        sample.couple_id,
        sample.actor_id,
        sample.kind,
        labels[sample.kind] ?? "ours.",
        body,
        `ours-${sample.kind}`,
        config,
      );
      const ids = group.map((item) => item.id).join(",");
      await rest<unknown>(`pending_push_digest?id=in.(${ids})`, {
        method: "DELETE",
        headers: { prefer: "return=minimal" },
      });
    }
  } catch {
    /* pending_push_digest optional before migration 018 */
  }

  try {
    const today = kyivDate();
    const optedIn = await rest<Preferences[]>(
      "push_preferences?enabled=eq.true&select=user_id,enabled,shopping,wishes,movies,events,recipes",
    );
    if (!optedIn.length) return;
    const sentToday = await rest<{ user_id: string }[]>(
      `daily_reminder_log?sent_date=eq.${today}&select=user_id`,
    );
    const alreadySent = new Set(sentToday.map((r) => r.user_id));
    const pendingUsers = optedIn.filter((p) => !alreadySent.has(p.user_id));
    if (!pendingUsers.length) return;

    const userIds = pendingUsers.map((p) => p.user_id).join(",");
    const [memberships, subscriptions] = await Promise.all([
      rest<{ user_id: string; couple_id: string }[]>(
        `couple_members?user_id=in.(${userIds})&select=user_id,couple_id`,
      ),
      rest<Subscription[]>(
        `push_subscriptions?user_id=in.(${userIds})&select=id,user_id,endpoint,p256dh,auth_secret`,
      ),
    ]);
    const coupleByUser = new Map(memberships.map((m) => [m.user_id, m.couple_id]));
    const coupleIds = [...new Set(memberships.map((m) => m.couple_id))];
    if (!coupleIds.length) return;

    type DbPlant = {
      couple_id: string;
      name: string;
      species?: string;
      watering_interval_days: number;
      last_watered_at: string;
      wet_checked_at: string | null;
    };
    type DbEvent = { couple_id: string; title: string; date: string; recurrence?: string | null };
    const [plants, events] = await Promise.all([
      rest<DbPlant[]>(
        `plants?couple_id=in.(${coupleIds.join(",")})&select=couple_id,name,species,watering_interval_days,last_watered_at,wet_checked_at`,
      ).catch(() => [] as DbPlant[]),
      rest<DbEvent[]>(
        `events?couple_id=in.(${coupleIds.join(",")})&select=couple_id,title,date,recurrence`,
      ).catch(() =>
        rest<DbEvent[]>(
          `events?couple_id=in.(${coupleIds.join(",")})&select=couple_id,title,date`,
        ).catch(() => [] as DbEvent[]),
      ),
    ]);

    const dayMs = 86_400_000;
    const todayMs = Date.parse(`${today}T12:00:00Z`);
    const dueByCouple = new Map<string, string[]>();
    for (const plant of plants) {
      if (plantDueToday(plant, today)) {
        const list = dueByCouple.get(plant.couple_id) ?? [];
        list.push(`Полив: ${plant.name}`);
        dueByCouple.set(plant.couple_id, list);
      }
    }
    for (const ev of events) {
      const occ = nextEventOccurrence(ev, today);
      if (!occ) continue;
      const diff = Math.round((Date.parse(`${occ}T12:00:00Z`) - todayMs) / dayMs);
      if (diff === 0 || diff === 3 || diff === 7) {
        const prefix = diff === 0 ? "Сьогодні" : diff === 3 ? "Через 3 дні" : "За тиждень";
        const list = dueByCouple.get(ev.couple_id) ?? [];
        list.push(`${prefix}: ${ev.title}`);
        dueByCouple.set(ev.couple_id, list);
      }
    }

    const publicKey = config.vapid_public_key;
    const privateJwk = encodeJwk(config.vapid_private_jwk);
    const subject = config.vapid_subject;
    for (const user of pendingUsers) {
      if (!user.events) continue;
      const coupleId = coupleByUser.get(user.user_id);
      if (!coupleId) continue;
      const notes = dueByCouple.get(coupleId) ?? [];
      if (notes.length > 0) {
        const userSubs = subscriptions.filter((s) => s.user_id === user.user_id);
        const payload = JSON.stringify({
          title: "ours. · Нагадування на сьогодні",
          body: notes.slice(0, 3).join(" · "),
          tag: `ours-daily-${today}`,
          url: config.app_url,
        });
        await Promise.allSettled(
          userSubs.map((sub) => sendOne(sub, payload, publicKey, privateJwk, subject)),
        );
      }
      await rest<unknown>("daily_reminder_log", {
        method: "POST",
        headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: user.user_id, sent_date: today }),
      });
    }
  } catch {
    /* daily_reminder_log optional before migration 018 */
  }
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const hookSecret = request.headers.get("x-ours-push-secret");
  if (!hookSecret || hookSecret.length > 128) return new Response("Not found", { status: 404 });
  let bodyData: { activity_id?: unknown; mode?: unknown };
  try {
    bodyData = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  try {
    const configs = await rest<PushConfig[]>("rpc/push_dispatch_config", {
      method: "POST",
      body: JSON.stringify({ p_hook_secret: hookSecret }),
    });
    const config = configs[0];
    if (!config) return new Response("Not found", { status: 404 });

    if (bodyData?.mode === "flush") {
      await flushPendingAndDaily(config);
      return new Response(null, { status: 204 });
    }

    const activityId = typeof bodyData?.activity_id === "string" ? bodyData.activity_id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activityId)) {
      return new Response("Bad request", { status: 400 });
    }

    const events = await rest<Activity[]>(
      `activity_events?id=eq.${activityId}&select=id,couple_id,actor_id,kind,action,title,created_at&limit=1`,
    );
    const activity = events[0];
    if (!activity) return new Response(null, { status: 204 });
    if (!shouldDispatchActivity(activity.kind, activity.action)) {
      return new Response(null, { status: 204 });
    }

    const activeHour = isActivePushHour(kyivHour());
    if (!activeHour || activity.kind === "shopping") {
      const queued = await queueDigest(activity);
      if (queued) return new Response(null, { status: 204 });
      if (!activeHour) return new Response(null, { status: 204 });
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const recent = await rest<{ id: string }[]>(
        `activity_events?couple_id=eq.${activity.couple_id}&actor_id=eq.${activity.actor_id}&kind=eq.shopping&action=eq.added&id=neq.${activity.id}&created_at=gte.${encodeURIComponent(fiveMinAgo)}&select=id&limit=1`,
      );
      if (recent.length > 0) return new Response(null, { status: 204 });
    }

    const profiles = await rest<{ id: string; name: string }[]>(
      `profiles?id=eq.${activity.actor_id}&select=id,name&limit=1`,
    );
    const actorName = profiles[0]?.name || "Партнер";
    const body = formatDigestBody(activity.kind, actorName, [activity.title]);
    await dispatchToCoupleRecipients(
      activity.couple_id,
      activity.actor_id,
      activity.kind,
      labels[activity.kind] ?? "ours.",
      body,
      `ours-${activity.kind}`,
      config,
    );
    return new Response(null, { status: 204 });
  } catch {
    // The database trigger is asynchronous; keep errors generic and avoid logging event data or secrets.
    return new Response("Push delivery unavailable", { status: 503 });
  }
}

if (import.meta.main) Deno.serve(handleRequest);
