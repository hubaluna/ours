import { useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  CalendarDays,
  CheckCheck,
  ChevronRight,
  Droplet,
  Film,
  Gift,
  ShoppingBag,
  Sprout,
  Utensils,
  X,
} from "lucide-react";
import { useApp } from "../hooks/AppContext";
import type { Activity, Tab } from "../lib/types";
import { greeting, kyivDate } from "../lib/utils";
import { getEventReminders, getPlantReminders } from "../lib/home-reminders";
import { eventOccursOn, nextOccurrence } from "../lib/recurrence";
import { differenceDays, plantSchedule } from "../lib/plant-care";
import { BottomSheet, Button } from "../components/ui";
import { PagedList, ScreenHeader } from "../components/Compact";
const DISMISSED_KEY = "ours-dismissed-reminders-v1";
const readDismissed = (): string[] => {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const icons = {
  recipes: Utensils,
  shopping: ShoppingBag,
  wishes: Gift,
  movies: Film,
  events: CalendarDays,
};
const labels = {
  recipes: "меню",
  shopping: "покупки",
  wishes: "бажання",
  movies: "кіно",
  events: "календар",
};
const actions = {
  added: "додає",
  updated: "оновлює",
  deleted: "прибирає",
  purchased: "купує",
};
export default function Home({ navigate }: { navigate: (tab: Tab) => void }) {
  const { data, userId, markRead, pending } = useApp();
  const [detail, setDetail] = useState<Activity | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const today = kyivDate();
  const plantReminders = getPlantReminders(data.plants, today);
  const eventReminders = getEventReminders(data.events, today).filter(
    (reminder) => !dismissed.includes(reminder.dismissKey),
  );
  const dismissReminder = (dismissKey: string) => {
    const next = [...new Set([...dismissed, dismissKey])];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      /* ignore storage limit */
    }
  };
  const seen = new Set(data.reads.map((r) => r.activity_id));
  const updates = data.activities.filter(
    (a) => a.actor_id !== userId && !seen.has(a.id),
  );
  const name = data.profiles.find((p) => p.id === userId)?.name || "друже";

  const activeShopping = data.shopping.filter(
    (i) => !i.session_id && !i.purchased,
  );
  const purchasedShoppingCount = data.shopping.filter(
    (i) => !i.session_id && i.purchased,
  ).length;
  const shoppingMetric = activeShopping.length
    ? String(activeShopping.length)
    : "✓";
  const shoppingDetail = activeShopping.length
    ? activeShopping
        .slice(0, 2)
        .map((i) => i.name)
        .join(", ")
    : purchasedShoppingCount > 0
      ? `Куплено (${purchasedShoppingCount}) · список чистий`
      : "Поки нічого не треба";

  const nearestPlant = [...data.plants]
    .map((plant) => ({ plant, schedule: plantSchedule(plant, today) }))
    .sort((a, b) => a.schedule.remaining - b.schedule.remaining)[0];
  const plantsCount = plantReminders.length;
  const plantsMetric =
    plantsCount > 0
      ? String(plantsCount)
      : data.plants.length > 0
        ? "✓"
        : "+";
  const plantsWhen = nearestPlant
    ? nearestPlant.schedule.remaining === 1
      ? "завтра"
      : `через ${nearestPlant.schedule.remaining} дн.`
    : "";
  const plantsDetail =
    plantsCount > 0
      ? `Полив: ${plantReminders
          .slice(0, 2)
          .map((r) => r.plant.name)
          .join(", ")}`
      : nearestPlant
        ? `${nearestPlant.plant.name} · ${plantsWhen}`
        : "Додати першу рослину";

  const todayEvents = data.events
    .filter((ev) => eventOccursOn(ev, today))
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const upcomingEvent = data.events
    .map((ev) => ({ ev, date: nextOccurrence(ev, today) }))
    .filter(
      (entry): entry is { ev: (typeof data.events)[number]; date: string } =>
        Boolean(entry.date && entry.date > today),
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const upcomingEventDays = upcomingEvent
    ? differenceDays(today, upcomingEvent.date)
    : null;
  const upcomingEventWhen =
    upcomingEventDays === 1
      ? "завтра"
      : upcomingEventDays !== null
        ? `через ${upcomingEventDays} дн.`
        : "";
  const calendarMetric =
    todayEvents.length > 0
      ? String(todayEvents.length)
      : upcomingEventDays === 1
        ? "завтра"
        : upcomingEventDays !== null
          ? `${upcomingEventDays} дн.`
          : "✓";
  const calendarDetail = todayEvents.length
    ? todayEvents
        .slice(0, 2)
        .map((ev) =>
          ev.all_day || !ev.time ? ev.title : `${ev.time.slice(0, 5)} ${ev.title}`,
        )
        .join(", ")
    : upcomingEvent
      ? `Сьогодні нічого · ${upcomingEvent.ev.title} (${upcomingEventWhen})`
      : "Сьогодні нічого · планів немає";

  const todayDateLabel = new Intl.DateTimeFormat("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${today}T12:00:00Z`));

  const todayCards = [
    {
      tab: "shopping" as Tab,
      title: "Покупки",
      metric: shoppingMetric,
      metricIsText: false,
      detail: shoppingDetail,
      icon: ShoppingBag,
      tone: "shopping",
      urgent: activeShopping.length > 0,
    },
    {
      tab: "plants" as Tab,
      title: "Рослини",
      metric: plantsMetric,
      metricIsText: false,
      detail: plantsDetail,
      icon: Sprout,
      tone: "plants",
      urgent: plantsCount > 0,
    },
    {
      tab: "plans" as Tab,
      title: "Календар",
      metric: calendarMetric,
      metricIsText: todayEvents.length === 0 && upcomingEventDays !== null,
      detail: calendarDetail,
      icon: CalendarDays,
      tone: "plans",
      urgent: todayEvents.length > 0,
    },
  ];

  const renderTodayDashboard = (compact: boolean) => (
    <section
      className={`today-dashboard${compact ? " today-dashboard-compact" : ""}`}
      aria-label="На сьогодні"
    >
      {!compact && (
        <div className="today-dashboard-head">
          <h2>На сьогодні</h2>
          <span>{todayDateLabel}</span>
        </div>
      )}
      <div className="today-grid">
        {todayCards.map((card) => {
          const CardIcon = card.icon;
          return (
            <button
              key={card.tab}
              type="button"
              className={`today-card today-card-${card.tone}${card.urgent ? " is-active" : ""}`}
              onClick={() => navigate(card.tab)}
            >
              <div className="today-card-top">
                <div className="today-card-lead">
                  <span className="today-card-icon" aria-hidden="true">
                    <CardIcon size={compact ? 14 : 15} />
                  </span>
                  <span className="today-card-title">{card.title}</span>
                </div>
                {compact && (
                  <small className="today-card-detail">{card.detail}</small>
                )}
                <strong
                  className={`today-card-metric${card.metricIsText ? " is-text" : ""}`}
                >
                  {card.metric}
                </strong>
              </div>
              {!compact && (
                <small className="today-card-detail">{card.detail}</small>
              )}
            </button>
          );
        })}
      </div>
      {!compact && (
        <p className="today-empty-footnote">
          Усе нове вже бачили — тут з’являтимуться свіжі зміни партнера.
        </p>
      )}
    </section>
  );

  return (
    <section className="screen home-screen">
      <ScreenHeader title="Нове для вас" subtitle={`${greeting()}, ${name}`}>
        {updates.length > 0 && (
          <Button
            className="ghost read-all"
            busy={pending.includes("mark-read")}
            aria-label="Усе переглянуто"
            onClick={() => void markRead(updates.map((a) => a.id))}
          >
            <CheckCheck size={20} />
          </Button>
        )}
      </ScreenHeader>
      {(plantReminders.length > 0 || eventReminders.length > 0) && (
        <div className="home-reminders" aria-label="Нагадування">
          {plantReminders.map((reminder) => (
            <button
              className="home-reminder home-reminder-plant"
              key={reminder.id}
              onClick={() => navigate("plants")}
            >
              <span className="home-reminder-icon">
                <Droplet size={17} />
              </span>
              <span className="home-reminder-body">
                <span className="row-kicker">{reminder.label}</span>
                <strong>{reminder.plant.name}</strong>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
          {eventReminders.map((reminder) => (
            <div
              className={`home-reminder home-reminder-event home-reminder-${reminder.stage}`}
              key={reminder.id}
            >
              <button
                className="home-reminder-main"
                onClick={() => navigate("plans")}
              >
                <span className="home-reminder-icon">
                  <CalendarDays size={17} />
                </span>
                <span className="home-reminder-body">
                  <span className="row-kicker">{reminder.label}</span>
                  <strong>{reminder.event.title}</strong>
                </span>
              </button>
              <button
                className="home-reminder-close"
                aria-label={`Приховати нагадування: ${reminder.event.title}`}
                onClick={() => dismissReminder(reminder.dismissKey)}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {updates.length > 0 && renderTodayDashboard(true)}
      <div className="feed-caption">
        <span className="status-dot" />
        <span>
          {updates.length
            ? `${updates.length} непрочитаних оновлень`
            : "Ви нічого не пропустили · На сьогодні"}
        </span>
      </div>
      <div className="screen-panel feed-panel">
        <PagedList
          items={updates}
          empty={renderTodayDashboard(false)}
          render={(a) => {
            const Icon = icons[a.kind];
            return (
              <button
                className={`activity-row activity-${a.kind}`}
                key={a.id}
                onClick={() => {
                  setDetail(a);
                  void markRead([a.id]);
                }}
              >
                <span className={`activity-icon ${a.kind}`}>
                  <Icon size={20} />
                </span>
                <div>
                  <span className="row-kicker">
                    {data.profiles.find((p) => p.id === a.actor_id)?.name ||
                      "Партнер"}{" "}
                    {actions[a.action]}
                  </span>
                  <strong>{a.title}</strong>
                  <small>
                    {labels[a.kind]} ·{" "}
                    {new Intl.DateTimeFormat("uk-UA", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Kyiv",
                    }).format(new Date(a.created_at))}
                  </small>
                </div>
                <ChevronRight size={17} />
              </button>
            );
          }}
        />
      </div>
      <AnimatePresence>
        {detail && (
          <BottomSheet
            title="Нове у вашому просторі"
            onClose={() => setDetail(null)}
          >
            <div className="detail-copy">
              <span className="row-kicker">
                {data.profiles.find((p) => p.id === detail.actor_id)?.name} ·{" "}
                {labels[detail.kind]}
              </span>
              <h3>{detail.title}</h3>
              <p>
                {detail.action === "deleted"
                  ? "Цей запис видалено."
                  : detail.action === "purchased"
                    ? "Уже куплено. Однією справою менше."
                    : "Зміни збережені у вашому спільному просторі."}
              </p>
              <Button
                onClick={() => {
                  navigate(
                    detail.kind === "events"
                      ? "plans"
                      : detail.kind === "recipes"
                        ? "menu"
                        : detail.kind,
                  );
                  setDetail(null);
                }}
              >
                Відкрити {labels[detail.kind]}
              </Button>
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>
    </section>
  );
}
