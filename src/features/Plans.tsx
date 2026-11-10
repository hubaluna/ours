import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  Plus,
} from "lucide-react";
import { useApp } from "../hooks/AppContext";
import { kyivDate, longDate } from "../lib/utils";
import type { Plan } from "../lib/types";
import { spring, soft } from "../lib/motion";
import { Button, EmptyState, IconButton } from "../components/ui";
import { EventForm } from "../components/Forms";
export default function Plans() {
  const { data } = useApp();
  const today = kyivDate();
  const [selected, setSelected] = useState(today),
    [month, setMonth] = useState(
      () => new Date(`${today.slice(0, 7)}-01T12:00:00`),
    ),
    [form, setForm] = useState<Plan | "new" | null>(null),
    [direction, setDirection] = useState(1);
  const year = month.getFullYear(),
    mo = month.getMonth(),
    length = new Date(year, mo + 1, 0).getDate(),
    offset = (new Date(year, mo, 1).getDay() + 6) % 7;
  const dateKey = (d: number) =>
    `${year}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const change = (delta: number) => {
    setDirection(delta);
    setMonth(new Date(year, mo + delta, 1, 12));
  };
  const events = data.events
    .filter((e) => e.date === selected)
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  return (
    <>
      <div className="page-intro">
        <div className="eyebrow">ЧАС, ЯКИЙ МИ ДІЛИМО</div>
        <h1>
          Ваші маленькі
          <br />
          плани.
        </h1>
        <p>Від звичайного вівторка до «пам’ятаєш той день?»</p>
      </div>
      <div className="plans-grid">
        <section className="calendar card">
          <div className="calendar-header">
            <h2>
              {new Intl.DateTimeFormat("uk-UA", {
                month: "long",
                year: "numeric",
              }).format(month)}
            </h2>
            <div>
              <IconButton label="Попередній місяць" onClick={() => change(-1)}>
                <ArrowLeft size={18} />
              </IconButton>
              <IconButton label="Наступний місяць" onClick={() => change(1)}>
                <ArrowRight size={18} />
              </IconButton>
            </div>
          </div>
          <div className="calendar-weekdays">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={`${year}-${mo}`}
              className="calendar-grid"
              initial={{ opacity: 0, x: direction * 7 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={soft}
            >
              {Array.from({ length: offset }, (_, i) => (
                <span key={`empty-${i}`} />
              ))}
              {Array.from({ length }, (_, i) => {
                const d = i + 1,
                  date = dateKey(d),
                  hasEvents = data.events.some((e) => e.date === date);
                return (
                  <button
                    key={date}
                    aria-label={longDate(date)}
                    aria-pressed={date === selected}
                    aria-current={date === today ? "date" : undefined}
                    className={`${date === today ? "today" : ""} ${date === selected ? "selected" : ""}`}
                    onClick={() => setSelected(date)}
                  >
                    {selected === date && (
                      <motion.span
                        layoutId="active-day"
                        className="active-day"
                        transition={spring}
                      />
                    )}
                    <span className="day-number">{d}</span>
                    {hasEvents && <i className="event-dot" />}
                  </button>
                );
              })}
            </motion.div>
          </AnimatePresence>
          <button
            className="text-button calendar-today"
            onClick={() => {
              setSelected(today);
              setMonth(new Date(`${today.slice(0, 7)}-01T12:00:00`));
            }}
          >
            Повернутися до сьогодні
          </button>
        </section>
        <section className="day-plans">
          <div className="section-heading">
            <h2>
              {selected === today
                ? "Сьогодні"
                : new Intl.DateTimeFormat("uk-UA", {
                    day: "numeric",
                    month: "long",
                  }).format(new Date(`${selected}T12:00:00`))}
            </h2>
            <span className="count">{events.length}</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={selected}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={soft}
            >
              {events.length ? (
                events.map((e) => (
                  <button
                    key={e.id}
                    className="event-card card"
                    onClick={() => setForm(e)}
                  >
                    <span className="event-icon">
                      <CalendarDays size={23} />
                    </span>
                    <div>
                      <span className="event-category">{e.category}</span>
                      <h3>{e.title}</h3>
                      <p>
                        <Clock3 size={13} />
                        {e.all_day
                          ? "Увесь день"
                          : (e.time?.slice(0, 5) ?? "Час ще не визначено")}
                      </p>
                      {e.location && (
                        <p>
                          <MapPin size={13} />
                          {e.location}
                        </p>
                      )}
                      {e.description && (
                        <span className="event-description">
                          {e.description}
                        </span>
                      )}
                    </div>
                    <ArrowRight size={17} />
                  </button>
                ))
              ) : (
                <div className="card">
                  <EmptyState
                    title="День відкритий для ідей"
                    description="Прогулянка, кава чи просто побути разом?"
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <p className="subtle-note">Усі події — за київським часом.</p>
        </section>
      </div>
      <Button className="floating-add" onClick={() => setForm("new")}>
        <Plus size={21} />
        Додати план
      </Button>
      <AnimatePresence>
        {form && (
          <EventForm
            date={selected}
            event={form === "new" ? undefined : form}
            onClose={() => setForm(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
