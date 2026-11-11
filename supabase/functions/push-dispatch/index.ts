import {
  allowedPushEndpoint,
  createVapidAuthorization,
  encryptWebPush,
} from "./web-push.ts";

type Activity = {
  id: string;
  couple_id: string;
  actor_id: string;
  kind: "shopping" | "wishes" | "movies" | "events" | "recipes";
  title: string;
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
    body,
    signal: AbortSignal.timeout(10000),
  });
  return response.status !== 404 && response.status !== 410;
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const hookSecret = request.headers.get("x-ours-push-secret");
  if (!hookSecret || hookSecret.length > 128) return new Response("Not found", { status: 404 });
  let activityId: string;
  try {
    const body = await request.json();
    activityId = typeof body?.activity_id === "string" ? body.activity_id : "";
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activityId)) {
    return new Response("Bad request", { status: 400 });
  }

  try {
    const configs = await rest<PushConfig[]>("rpc/push_dispatch_config", {
      method: "POST",
      body: JSON.stringify({ p_hook_secret: hookSecret }),
    });
    const config = configs[0];
    if (!config) return new Response("Not found", { status: 404 });
    const events = await rest<Activity[]>(`activity_events?id=eq.${activityId}&select=id,couple_id,actor_id,kind,title&limit=1`);
    const activity = events[0];
    if (!activity) return new Response(null, { status: 204 });
    const members = await rest<{ user_id: string }[]>(`couple_members?couple_id=eq.${activity.couple_id}&user_id=neq.${activity.actor_id}&select=user_id`);
    const recipients = members.map((row) => row.user_id);
    if (!recipients.length) return new Response(null, { status: 204 });
    const ids = `(${recipients.join(",")})`;
    const [preferences, subscriptions, profiles] = await Promise.all([
      rest<Preferences[]>(`push_preferences?user_id=in.${ids}&select=user_id,enabled,shopping,wishes,movies,events,recipes`),
      rest<Subscription[]>(`push_subscriptions?user_id=in.${ids}&select=id,user_id,endpoint,p256dh,auth_secret`),
      rest<{ id: string; name: string }[]>(`profiles?id=eq.${activity.actor_id}&select=id,name&limit=1`),
    ]);
    const preference = new Map(preferences.map((row) => [row.user_id, row]));
    const enabledUsers = new Set(recipients.filter((userId) => {
      const pref = preference.get(userId);
      return pref?.enabled && pref[activity.kind];
    }));
    const targets = subscriptions.filter((subscription) => enabledUsers.has(subscription.user_id));
    if (!targets.length) return new Response(null, { status: 204 });

    const publicKey = config.vapid_public_key;
    const privateJwk = encodeJwk(config.vapid_private_jwk);
    const subject = config.vapid_subject;
    const payload = JSON.stringify({
      title: labels[activity.kind] ?? "ours.",
      body: `${profiles[0]?.name || "Партнер"}: ${activity.title}`,
      tag: `ours-${activity.kind}`,
      url: config.app_url,
    });

    const results = await Promise.allSettled(targets.map(async (subscription) => {
      const live = await sendOne(subscription, payload, publicKey, privateJwk, subject);
      if (!live) {
        await rest<unknown>(`push_subscriptions?id=eq.${subscription.id}`, {
          method: "DELETE",
          headers: { prefer: "return=minimal" },
        });
      }
    }));
    // Push-provider outages must not fail or roll back the originating app write.
    void results;
    return new Response(null, { status: 204 });
  } catch {
    // The database trigger is asynchronous; keep errors generic and avoid logging event data or secrets.
    return new Response("Push delivery unavailable", { status: 503 });
  }
}

if (import.meta.main) Deno.serve(handleRequest);
