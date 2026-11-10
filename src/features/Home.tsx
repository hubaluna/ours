import { useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  CalendarDays,
  CheckCheck,
  ChevronRight,
  Film,
  Gift,
  ShoppingBag,
} from "lucide-react";
import { useApp } from "../hooks/AppContext";
import type { Activity, Tab } from "../lib/types";
import { greeting } from "../lib/utils";
import { BottomSheet, Button, EmptyState } from "../components/ui";
import { PagedList, ScreenHeader } from "../components/Compact";
const icons = {
  shopping: ShoppingBag,
  wishes: Gift,
  movies: Film,
  events: CalendarDays,
};
const labels = {
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
  const seen = new Set(data.reads.map((r) => r.activity_id));
  const updates = data.activities.filter(
    (a) => a.actor_id !== userId && !seen.has(a.id),
  );
  const name = data.profiles.find((p) => p.id === userId)?.name || "друже";
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
      <div className="feed-caption">
        <span className="status-dot" />
        <span>
          {updates.length
            ? `${updates.length} непрочитаних оновлень`
            : "Ви нічого не пропустили"}
        </span>
      </div>
      <div className="screen-panel feed-panel">
        <PagedList
          items={updates}
          rowHeight={84}
          empty={
            <EmptyState
              title="Усе нове вже бачили"
              description="Тут з’являтимуться тільки нові зміни партнера."
            />
          }
          render={(a) => {
            const Icon = icons[a.kind];
            return (
              <button
                className="activity-row"
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
                  navigate(detail.kind === "events" ? "plans" : detail.kind);
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
