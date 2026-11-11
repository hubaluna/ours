import { checked, supabase } from "./supabase";
import publicConfig from "./public-config.json";

function applicationServerKey(): Uint8Array {
  const value = publicConfig.vapidPublicKey;
  if (!value) throw new Error("Push notifications are not configured.");
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function pushSupportMessage(): string | null {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "Цей браузер не підтримує push-сповіщення.";
  }
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
  if (ios && !standalone) return "На iPhone спочатку додайте Ours на екран «Додому», а потім відкрийте встановлений застосунок.";
  return null;
}

export async function subscribeToPush(): Promise<PushSubscription> {
  if (!supabase) throw new Error("Підключіть акаунт Ours.");
  const support = pushSupportMessage();
  if (support) throw new Error(support);
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Дозвольте сповіщення в налаштуваннях браузера.");
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey() as BufferSource,
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
  if (!data.endpoint || !data.keys?.p256dh || !data.keys.auth) throw new Error("Браузер не надав ключі push-підписки.");
  await checked(supabase.from("push_subscriptions").upsert({
    user_id: userId,
    couple_id: coupleId,
    endpoint: data.endpoint,
    p256dh: data.keys.p256dh,
    auth_secret: data.keys.auth,
  }, { onConflict: "user_id,endpoint" }));
}

export async function savePushPreferences(
  userId: string,
  preferences: { enabled: boolean; shopping: boolean; wishes: boolean; movies: boolean; events: boolean; recipes: boolean },
): Promise<void> {
  if (!supabase) throw new Error("Підключіть акаунт Ours.");
  await checked(supabase.from("push_preferences").upsert({ user_id: userId, ...preferences }, { onConflict: "user_id" }));
}
