import { getEventReminders, getPlantReminders } from "./home-reminders";
import type { Plan, Plant } from "./types";
import { kyivHour } from "./utils";

const PREF_KEY = "ours-reminder-push-v1";
const SENT_KEY = "ours-sent-reminders-v1";

export function isReminderNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getReminderPushEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setReminderPushEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export async function enableReminderNotifications(): Promise<void> {
  if (!isReminderNotificationSupported()) {
    throw new Error("Цей браузер не підтримує сповіщення.");
  }
  if (Notification.permission === "denied") {
    throw new Error(
      "Доступ заборонено в браузері. Увімкніть сповіщення в налаштуваннях сайту.",
    );
  }
  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Дозвольте сповіщення, щоб отримувати нагадування.");
    }
  }
  setReminderPushEnabled(true);
}

async function displayNotification(
  title: string,
  body: string,
  tag: string,
): Promise<void> {
  if (!isReminderNotificationSupported() || Notification.permission !== "granted") {
    return;
  }
  const base = import.meta.env.BASE_URL || "/";
  const options: NotificationOptions = {
    body,
    icon: `${base}icon-192.png`,
    badge: `${base}favicon.png`,
    tag,
    data: { url: `${location.origin}${base}` },
  };
  if ("serviceWorker" in navigator) {
    let timer: number | undefined;
    try {
      const registration = await Promise.race<ServiceWorkerRegistration | null>([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => {
          timer = window.setTimeout(() => resolve(null), 4000);
        }),
      ]);
      if (registration) {
        await registration.showNotification(title, options);
        return;
      }
    } catch {
      /* fallback below */
    } finally {
      if (timer !== undefined) window.clearTimeout(timer);
    }
  }
  try {
    new Notification(title, options);
  } catch {
    throw new Error(
      "На цьому пристрої сповіщення працюють лише у встановленому застосунку (додайте Ours на екран «Додому»).",
    );
  }
}

export async function sendTestReminderNotification(): Promise<void> {
  await enableReminderNotifications();
  await displayNotification(
    "ours. · нагадування працюють",
    "Ми нагадаємо про полив рослин і події з календаря.",
    `ours-test-${Date.now()}`,
  );
}

function readSentMap(today: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const cleaned: Record<string, string> = {};
    for (const [key, date] of Object.entries(parsed)) {
      if (date === today) cleaned[key] = date;
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeSentMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function syncLocalReminderNotifications(
  plants: Plant[],
  events: Plan[],
  today: string,
  hour = kyivHour(),
): Promise<void> {
  if (
    hour < 11 ||
    !getReminderPushEnabled() ||
    !isReminderNotificationSupported() ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  const sent = readSentMap(today);
  let changed = false;

  const plantReminders = getPlantReminders(plants, today);
  for (const item of plantReminders) {
    const key = `plant:${item.plant.id}:${today}`;
    if (sent[key]) continue;
    sent[key] = today;
    changed = true;
    await displayNotification(
      `Полив · ${item.plant.name}`,
      item.label,
      `ours-plant-${item.plant.id}-${today}`,
    );
  }

  const eventReminders = getEventReminders(events, today);
  for (const item of eventReminders) {
    const key = `event:${item.dismissKey}:${today}`;
    if (sent[key]) continue;
    sent[key] = today;
    changed = true;
    await displayNotification(
      `Календар · ${item.event.title}`,
      item.label,
      `ours-event-${item.dismissKey}`,
    );
  }

  if (changed) writeSentMap(sent);
}
