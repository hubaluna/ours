import { checked, supabase } from "./supabase";
import publicConfig from "./public-config.json";

export type DevicePushState = {
  supported: boolean;
  supportMessage: string | null;
  permission: NotificationPermission | "unsupported";
  hasLocalSubscription: boolean;
  vapidMatches: boolean;
  savedInDatabase: boolean;
  endpoint: string | null;
};

export type ServerTestPushResult =
  | {
      kind: "server";
      delivered: number;
      removed: number;
      message: string;
    }
  | {
      kind: "error";
      reason: string;
      statusCodes: number[];
      message: string;
    }
  | {
      kind: "unavailable";
      message: string;
    };

export function decodeVapidPublicKey(value = publicConfig.vapidPublicKey): Uint8Array {
  if (!value) throw new Error("Push-сповіщення не налаштовані.");
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function subscriptionMatchesVapid(
  subscription: PushSubscription,
  vapidPublicKey = publicConfig.vapidPublicKey,
): boolean {
  const existingKey = subscription.options?.applicationServerKey;
  if (!existingKey) return true; // Some browsers omit options.applicationServerKey on read
  try {
    const expected = decodeVapidPublicKey(vapidPublicKey);
    const actual = new Uint8Array(existingKey);
    if (actual.length !== expected.length) return false;
    for (let i = 0; i < expected.length; i += 1) {
      if (actual[i] !== expected[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function pushSupportMessage(): string | null {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return "Цей браузер не підтримує push-сповіщення.";
  }
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  if (ios && !standalone) {
    return "На iPhone спочатку додайте Ours на екран «Додому», а потім відкрийте встановлений застосунок.";
  }
  return null;
}

async function waitForServiceWorkerRegistration(
  timeoutMs = 6000,
): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Цей браузер не підтримує сповіщення.");
  }
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing?.active) return existing;

  let timer: number | undefined;
  try {
    const registration = await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        timer = window.setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    if (registration) return registration;
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
  throw new Error(
    "Служба сповіщень ще не готова. Перезавантажте застосунок і спробуйте ще раз.",
  );
}

export async function subscribeToPush(options?: {
  forceResubscribe?: boolean;
}): Promise<PushSubscription> {
  if (!supabase) throw new Error("Підключіть акаунт Ours.");
  const support = pushSupportMessage();
  if (support) throw new Error(support);
  if (Notification.permission === "denied") {
    throw new Error(
      "Доступ заборонено в браузері. Увімкніть сповіщення в налаштуваннях сайту на телефоні.",
    );
  }
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Дозвольте сповіщення в налаштуваннях браузера.");
  }

  const registration = await waitForServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (
    subscription &&
    (options?.forceResubscribe || !subscriptionMatchesVapid(subscription))
  ) {
    await subscription.unsubscribe().catch(() => {});
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidPublicKey() as BufferSource,
    });
  }
  return subscription;
}

export async function savePushSubscription(
  subscription: PushSubscription,
  userId: string,
  coupleId: string,
): Promise<void> {
  if (!supabase) throw new Error("Підключіть акаунт Ours.");
  const data = subscription.toJSON();
  if (!data.endpoint || !data.keys?.p256dh || !data.keys.auth) {
    throw new Error("Браузер не надав ключі push-підписки.");
  }
  await checked(
    supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        couple_id: coupleId,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth_secret: data.keys.auth,
      },
      { onConflict: "user_id,endpoint" },
    ),
  );
}

export async function unsubscribeDevicePush(userId: string): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return;
    if (supabase && userId) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("endpoint", subscription.endpoint);
    }
    await subscription.unsubscribe().catch(() => {});
  } catch {
    /* ignore */
  }
}

export async function getDevicePushState(
  userId: string,
): Promise<DevicePushState> {
  const supportMessage = pushSupportMessage();
  if (supportMessage) {
    return {
      supported: false,
      supportMessage,
      permission:
        typeof window !== "undefined" && "Notification" in window
          ? Notification.permission
          : "unsupported",
      hasLocalSubscription: false,
      vapidMatches: false,
      savedInDatabase: false,
      endpoint: null,
    };
  }

  const permission = Notification.permission;
  let subscription: PushSubscription | null = null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    subscription = (await registration?.pushManager?.getSubscription()) ?? null;
  } catch {
    /* leave subscription as null */
  }

  if (!subscription) {
    return {
      supported: true,
      supportMessage: null,
      permission,
      hasLocalSubscription: false,
      vapidMatches: false,
      savedInDatabase: false,
      endpoint: null,
    };
  }

  const vapidMatches = subscriptionMatchesVapid(subscription);
  let savedInDatabase = false;
  if (supabase && userId) {
    try {
      const { data } = await supabase
        .from("push_subscriptions")
        .select("id")
        .eq("user_id", userId)
        .eq("endpoint", subscription.endpoint)
        .maybeSingle();
      savedInDatabase = Boolean(data?.id);
    } catch {
      savedInDatabase = false;
    }
  }

  return {
    supported: true,
    supportMessage: null,
    permission,
    hasLocalSubscription: true,
    vapidMatches,
    savedInDatabase,
    endpoint: subscription.endpoint,
  };
}

/**
 * Silently heals the current device's push subscription on app startup whenever
 * the user already enabled push for their account and granted browser permission.
 */
export async function syncExistingPushSubscription(
  userId: string,
  coupleId: string,
): Promise<boolean> {
  if (!supabase || !userId || !coupleId) return false;
  if (pushSupportMessage() !== null) return false;
  if (Notification.permission !== "granted") return false;

  try {
    const { data: pref } = await supabase
      .from("push_preferences")
      .select("enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (!pref?.enabled) return false;

    const registration = await waitForServiceWorkerRegistration(4000);
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !subscriptionMatchesVapid(subscription)) {
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidPublicKey() as BufferSource,
      });
    }
    await savePushSubscription(subscription, userId, coupleId);
    return true;
  } catch {
    return false;
  }
}

function getPushFunctionUrl(): { url: string; apiKey: string } | null {
  const supabaseUrl =
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
    publicConfig.supabaseUrl;
  const apiKey =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    publicConfig.supabasePublishableKey;
  if (!supabaseUrl || !apiKey) return null;
  return {
    url: `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/push-dispatch`,
    apiKey,
  };
}

function describeServerPushFailure(
  reason: string,
  statusCodes: number[],
): string {
  switch (reason) {
    case "missing_vault_config":
    case "invalid_vapid_config":
      return "На сервері не налаштовано ключі сповіщень. Зверніться до адміністратора простору.";
    case "no_subscriptions":
      return "Для цього пристрою ще не збережено push-підписку. Натисніть «Підключити цей пристрій».";
    case "subscription_expired":
      return "Push-підписка цього пристрою застаріла й була скинута. Натисніть «Підключити цей пристрій» ще раз.";
    case "vapid_rejected":
      return "Сервіс сповіщень відхилив ключ безпеки. Потрібно перевірити ключі сповіщень на сервері й у застосунку.";
    case "unsupported_endpoint":
      return "Адреса push-сервісу цього браузера не підтримується сервером.";
    default: {
      const codes = statusCodes.length ? ` (HTTP ${statusCodes.join(", ")})` : "";
      return `Не вдалося доставити серверний push${codes}.`;
    }
  }
}

/**
 * Tests the full real Web Push pipeline end-to-end:
 * Device subscription -> Supabase push_subscriptions -> push-dispatch Edge Function -> Apple/FCM -> SW push event.
 */
export async function sendTestServerPush(
  userId: string,
  coupleId: string,
): Promise<ServerTestPushResult> {
  if (!supabase) {
    return { kind: "unavailable", message: "Підключіть акаунт Ours." };
  }
  const fn = getPushFunctionUrl();
  if (!fn) {
    return {
      kind: "unavailable",
      message: "Не знайдено адресу сервера сповіщень.",
    };
  }

  // Always ensure this device has a fresh, matching subscription in Supabase first.
  const subscription = await subscribeToPush();
  await savePushSubscription(subscription, userId, coupleId);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    return {
      kind: "unavailable",
      message: "Увійдіть в акаунт заново, щоб перевірити серверні push.",
    };
  }

  try {
    const response = await fetch(fn.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: fn.apiKey,
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        mode: "test",
        endpoint: subscription.endpoint,
      }),
    });

    if (response.status === 404 || response.status === 405) {
      return {
        kind: "unavailable",
        message:
          "Служба надсилання сповіщень на сервері ще не оновлена. Спробуйте пізніше.",
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      return {
        kind: "unavailable",
        message: `Сервер сповіщень повернув неочікувану відповідь (HTTP ${response.status}).`,
      };
    }

    const data = (await response.json()) as {
      ok?: boolean;
      delivered?: number;
      removed?: number;
      statusCodes?: number[];
      reason?: string;
    };

    if (data.ok && (data.delivered ?? 0) > 0) {
      return {
        kind: "server",
        delivered: data.delivered ?? 1,
        removed: data.removed ?? 0,
        message: "Серверний push надіслано! Перевірте сповіщення на пристрої.",
      };
    }

    const reason = data.reason || `http_${response.status}`;
    const statusCodes = Array.isArray(data.statusCodes) ? data.statusCodes : [];
    return {
      kind: "error",
      reason,
      statusCodes,
      message: describeServerPushFailure(reason, statusCodes),
    };
  } catch {
    return {
      kind: "unavailable",
      message:
        "Не вдалося звернутися до служби сповіщень. Спробуйте пізніше.",
    };
  }
}

export async function savePushPreferences(
  userId: string,
  preferences: {
    enabled: boolean;
    shopping: boolean;
    wishes: boolean;
    movies: boolean;
    events: boolean;
    recipes: boolean;
    budget?: boolean;
  },
): Promise<void> {
  if (!supabase) throw new Error("Підключіть акаунт Ours.");
  try {
    await checked(
      supabase
        .from("push_preferences")
        .upsert({ user_id: userId, ...preferences }, { onConflict: "user_id" }),
    );
  } catch (err) {
    // Fallback if migration 020 has not yet added the budget column.
    if ("budget" in preferences) {
      const { budget: _drop, ...withoutBudget } = preferences;
      void _drop;
      await checked(
        supabase
          .from("push_preferences")
          .upsert({ user_id: userId, ...withoutBudget }, { onConflict: "user_id" }),
      );
      return;
    }
    throw err;
  }
}
