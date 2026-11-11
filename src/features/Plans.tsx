import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
} from "lucide-react";
import { useApp } from "../hooks/AppContext";
import { kyivDate, longDate } from "../lib/utils";
import type { Plan } from "../lib/types";
import { spring, soft } from "../lib/motion";
import { BottomSheet, Button, EmptyState, IconButton } from "../components/ui";
import { EventForm } from "../components/Forms";
import { AddButton, PagedList, ScreenHeader } from "../components/Compact";
export default function Plans() {
  const { data } = useApp(),
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
    [expanded, setExpanded] = useState(false);
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
              rowHeight={70}
              empty={
                <EmptyState
                  title="День відкритий для ідей"
                  description="Заплануємо щось хороше?"
                />
              }
              render={(event) => (
                <button
                  className="calendar-event-row"
                  key={event.id}
                  onClick={() => setForm(event)}
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
                      {event.location && (
                        <>
                          <MapPin size={12} />
                          <span>{event.location}</span>
                        </>
                      )}
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
        {form ? (
          <EventForm
            key="event-form"
            date={selected}
            event={form === "new" ? undefined : form}
            onClose={() => setForm(null)}
          />
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
