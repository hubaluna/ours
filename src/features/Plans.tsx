import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Link2,
  Copy,
} from "lucide-react";
import { useApp } from "../hooks/AppContext";
import { kyivDate, longDate } from "../lib/utils";
import type { Plan } from "../lib/types";
import { spring, soft } from "../lib/motion";
import { BottomSheet, Button, EmptyState, IconButton } from "../components/ui";
import { EventForm } from "../components/Forms";
import { AddButton, PagedList, ScreenHeader } from "../components/Compact";
import { publicUrl } from "../../supabase/functions/_shared/urls";
import { checked, configured, supabase } from "../lib/supabase";
import publicConfig from "../lib/public-config.json";
export default function Plans() {
  const { data, demo } = useApp(),
    today = kyivDate();
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(timer);
  }, []);
  const [selected, setSelected] = useState(today),
    [month, setMonth] = useState(
      () => new Date(`${today.slice(0, 7)}-01T12:00:00`),
    ),
    [form, setForm] = useState<Plan | "new" | null>(null),
    [detail, setDetail] = useState<Plan | null>(null),
    [showDescription, setShowDescription] = useState(false),
    [expanded, setExpanded] = useState(false),
    [calendarFeed, setCalendarFeed] = useState<string | null>(null),
    [syncOpen, setSyncOpen] = useState(false),
    [feedBusy, setFeedBusy] = useState(false),
    [feedError, setFeedError] = useState("");
  const makeCalendarFeed = async () => {
    if (demo || !supabase || !configured) {
      setFeedError("Підключіть акаунт, щоб синхронізувати календар.");
      return;
    }
    setFeedBusy(true);
    setFeedError("");
    try {
      const random = crypto.getRandomValues(new Uint8Array(32));
      const token = btoa(String.fromCharCode(...random))
        .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
      await checked(supabase.rpc("rotate_calendar_feed_token", { p_token: token }));
      const projectUrl = import.meta.env.VITE_SUPABASE_URL || publicConfig.supabaseUrl;
      const feed = `${projectUrl}/functions/v1/calendar-feed?token=${token}`;
      setCalendarFeed(feed);
    } catch {
      setFeedError("Не вдалося створити посилання. Спробуйте ще раз.");
    } finally {
      setFeedBusy(false);
    }
  };
  const revokeCalendarFeed = async () => {
    if (!supabase) return;
    setFeedBusy(true);
    try {
      await checked(supabase.rpc("revoke_calendar_feed_token"));
      setCalendarFeed(null);
    } catch {
      setFeedError("Не вдалося вимкнути підписку.");
    } finally {
      setFeedBusy(false);
    }
  };
  const year = month.getFullYear(),
    mo = month.getMonth(),
    length = new Date(year, mo + 1, 0).getDate(),
    offset = (new Date(year, mo, 1).getDay() + 6) % 7;
  const monthLabel = new Intl.DateTimeFormat("uk-UA", {
    month: "long",
    year: "numeric",
  }).format(month);
  const dateKey = (d: number) =>
    `${year}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const events = data.events
    .filter((e) => e.date === selected)
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const showUpcoming = selected === today && events.length === 0;
  const shownEvents = showUpcoming
    ? data.events
        .filter((e) => e.date > today)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            (a.time ?? "").localeCompare(b.time ?? ""),
        )
    : events;
  const remaining = (date: string) => {
    const days = Math.round(
      (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
        86400000,
    );
    if (days === 1) return "Завтра";
    const ending = new Intl.PluralRules("uk").select(days);
    return `Через ${days} ${ending === "one" ? "день" : ending === "few" ? "дні" : "днів"}`;
  };
  const change = (n: number) => setMonth(new Date(year, mo + n, 1, 12));
  const calendar = (
    <>
      <div className="calendar-header">
        <button
          className="calendar-month"
          aria-label="Розгорнути місяць"
          onClick={() => setExpanded(true)}
        >
          <h2>{monthLabel}</h2>
          <ChevronDown size={13} />
        </button>
        <div>
          <IconButton label="Попередній місяць" onClick={() => change(-1)}>
            <ChevronLeft size={18} />
          </IconButton>
          <IconButton label="Наступний місяць" onClick={() => change(1)}>
            <ChevronRight size={18} />
          </IconButton>
        </div>
      </div>
      <div className="calendar-weekdays">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${year}-${mo}`}
          className="calendar-grid"
          initial={{ opacity: 0, x: 5 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={soft}
        >
          {Array.from({ length: offset }, (_, i) => (
            <span key={`empty${i}`} />
          ))}
          {Array.from({ length }, (_, i) => {
            const d = i + 1,
              date = dateKey(d);
            return (
              <button
                key={date}
                aria-label={longDate(date)}
                aria-pressed={date === selected}
                aria-current={date === today ? "date" : undefined}
                className={`${date === selected ? "selected" : ""} ${date === today ? "today" : ""}`}
                onClick={() => {
                  setSelected(date);
                  if (expanded) setExpanded(false);
                }}
              >
                {selected === date && (
                  <motion.span
                    className="active-day"
                    layoutId={expanded ? undefined : "active-day"}
                    transition={spring}
                  />
                )}
                <span className="day-number">{d}</span>
                {data.events.some((e) => e.date === date) && (
                  <i className="event-dot" />
                )}
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </>
  );
  return (
    <section className="screen">
      <ScreenHeader title="Календар" subtitle="Час, який ми ділимо">
        <IconButton label="Синхронізувати календар" onClick={() => setSyncOpen(true)}>
          <Link2 size={18} />
        </IconButton>
        <AddButton label="Додати план" onClick={() => setForm("new")} />
      </ScreenHeader>
      <div className="calendar-layout">
        <div className="calendar card">{calendar}</div>
        <Button
          className="month-expand secondary"
          onClick={() => setExpanded(true)}
        >
          <CalendarDays size={17} />
          {monthLabel}
        </Button>
        <section className="day-plans">
          <div className="day-heading">
            <h2>
              {showUpcoming && shownEvents.length
                ? "Найближчі події"
                : selected === today
                  ? "Сьогодні"
                  : new Intl.DateTimeFormat("uk-UA", {
                      day: "numeric",
                      month: "long",
                    }).format(new Date(`${selected}T12:00:00`))}
              <span className="count">{shownEvents.length}</span>
            </h2>
            <button
              className="text-button"
              onClick={() => {
                setSelected(today);
                setMonth(new Date(`${today.slice(0, 7)}-01T12:00:00`));
              }}
            >
              До сьогодні
            </button>
          </div>
          <div className="screen-panel">
            <PagedList
              items={shownEvents}
              empty={
                <EmptyState
                  title="День відкритий для ідей"
                  description="Заплануємо щось хороше?"
                />
              }
              render={(event) => (
                <button
                  className={`calendar-event-row${showUpcoming ? " calendar-upcoming" : ""}`}
                  key={event.id}
                  onClick={() => {
                    setDetail(event);
                    setShowDescription(false);
                  }}
                >
                  <span className="event-icon">
                    <CalendarDays size={19} />
                  </span>
                  <div>
                    <strong>{event.title}</strong>
                    <p>
                      {showUpcoming && (
                        <span className="event-countdown">
                          {remaining(event.date)} ·{" "}
                          {new Intl.DateTimeFormat("uk-UA", {
                            day: "numeric",
                            month: "short",
                          }).format(new Date(`${event.date}T12:00:00`))}
                        </span>
                      )}
                      <Clock3 size={12} />
                      {event.all_day
                        ? "Увесь день"
                        : event.time?.slice(0, 5) || "Без часу"}
                    </p>
                  </div>
                  <ChevronRight size={16} />
                </button>
              )}
            />
          </div>
        </section>
      </div>
      <AnimatePresence mode="wait">
        {syncOpen ? (
          <BottomSheet key="calendar-sync" title="Підписка на календар" onClose={() => setSyncOpen(false)}>
            <div className="calendar-sync-panel">
              <p>Додає події Ours до Apple або Google Calendar. Зміни в цих календарях назад в Ours не передаються.</p>
              {calendarFeed ? (
                <>
                  <label className="calendar-feed-link">Посилання на підписку<input readOnly value={calendarFeed} /></label>
                  <a className="button secondary" href={`webcal://${calendarFeed.replace(/^https?:\/\//, "")}`}><CalendarDays size={17} /> Додати в Apple Calendar</a>
                  <a className="button secondary" href={`https://calendar.google.com/calendar/u/0/r/settings/addbyurl?url=${encodeURIComponent(calendarFeed)}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} /> Додати в Google Calendar</a>
                  <Button className="ghost" busy={feedBusy} onClick={() => void navigator.clipboard?.writeText(calendarFeed).catch(() => setFeedError("Не вдалося скопіювати посилання."))}><Copy size={16} /> Копіювати посилання</Button>
                  <details className="calendar-manual-instructions">
                    <summary>Куди вставити посилання вручну?</summary>
                    <div>
                      <p><strong>Google Calendar:</strong> у браузері відкрий «Інші календарі» → «+» → «З URL-адреси» та встав посилання.</p>
                      <p><strong>iPhone:</strong> Налаштування → Програми → Календар → Облікові записи календарів → Додати обліковий запис → Інше → Додати підписаний календар.</p>
                    </div>
                  </details>
                  <Button className="danger ghost" busy={feedBusy} onClick={() => void revokeCalendarFeed()}>Відкликати посилання</Button>
                  <small>Посилання дає доступ до назв, часу, місця й описів подій. Для приватності не пересилайте його іншим. Відкличте його тут, щоб зупинити підписку.</small>
                </>
              ) : (
                <>
                  <Button busy={feedBusy} onClick={() => void makeCalendarFeed()}><Link2 size={17} /> Створити посилання</Button>
                  <Button className="danger ghost" busy={feedBusy} onClick={() => void revokeCalendarFeed()}>Відкликати раніше створене посилання</Button>
                </>
              )}
              {feedError && <p role="alert">{feedError}</p>}
            </div>
          </BottomSheet>
        ) : form ? (
          <EventForm
            key="event-form"
            date={selected}
            event={form === "new" ? undefined : form}
            onClose={() => setForm(null)}
          />
        ) : detail ? (
          <BottomSheet
            key="event-detail"
            title={detail.title}
            onClose={() => setDetail(null)}
          >
            <div className="event-detail-compact">
              <p>
                <CalendarDays size={16} />
                {longDate(detail.date)}
              </p>
              <p>
                <Clock3 size={16} />
                {detail.all_day
                  ? "Увесь день"
                  : detail.time?.slice(0, 5) || "Без часу"}
              </p>
              {detail.description && (
                <>
                  <Button
                    className="secondary"
                    aria-expanded={showDescription}
                    onClick={() => setShowDescription((open) => !open)}
                  >
                    {showDescription ? "Сховати довідку" : "Довідково"}
                    <ChevronDown
                      size={16}
                      className={showDescription ? "rotated" : ""}
                    />
                  </Button>
                  {showDescription && (
                    <p className="event-description-expanded">
                      {detail.description}
                    </p>
                  )}
                </>
              )}
              {publicUrl(detail.url ?? "") && (
                <a className="button secondary" href={publicUrl(detail.url ?? "")} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} /> Відкрити посилання
                </a>
              )}
              <Button
                onClick={() => {
                  setForm(detail);
                  setDetail(null);
                }}
              >
                Редагувати план
              </Button>
            </div>
          </BottomSheet>
        ) : expanded ? (
          <BottomSheet
            key="month-sheet"
            title="Оберіть день"
            onClose={() => setExpanded(false)}
          >
            <div className="expanded-calendar">{calendar}</div>
          </BottomSheet>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
