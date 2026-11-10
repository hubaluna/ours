import {
  ArrowRight,
  CalendarDays,
  Gift,
  Plus,
  Sparkles,
  ShoppingBag,
} from "lucide-react";
import { useApp } from "../hooks/AppContext";
import { greeting, isUpcoming, longDate } from "../lib/utils";
import type { Tab } from "../lib/types";
import { ShoppingRow } from "../components/ShoppingRow";
import { TogetherArt, WishArt } from "../components/Illustrations";
import { Button, EmptyState, SectionHeading } from "../components/ui";
export default function Home({
  navigate,
  onAdd,
  onEvent,
}: {
  navigate: (tab: Tab) => void;
  onAdd: () => void;
  onEvent: (id: string) => void;
}) {
  const { data, userId } = useApp();
  const me = data.profiles.find((p) => p.id === userId),
    partner = data.profiles.find((p) => p.id !== userId);
  const items = data.shopping.filter((i) => !i.session_id && !i.purchased);
  const next = [...data.events]
    .filter(isUpcoming)
    .sort((a, b) =>
      (a.date + (a.time ?? "00:00")).localeCompare(
        b.date + (b.time ?? "00:00"),
      ),
    )[0];
  return (
    <>
      <section className="welcome">
        <div className="welcome-copy">
          <div className="eyebrow">
            <span className="tiny-sun" />
            {greeting()}, {me?.name ?? "друже"}
          </div>
          <h1>
            Усе наше.
            <br />
            <span>В одному місці.</span>
          </h1>
          <p>
            Маленькі справи. Спільні плани.
            <br className="mobile-break" /> Життя, яке ми ділимо.
          </p>
          <div className="couple-pill">
            <span className="couple-dots">
              <i>{me?.name.slice(0, 1)}</i>
              <i>{partner?.name.slice(0, 1) ?? "+"}</i>
            </span>
            <span>
              {partner
                ? `${me?.name} та ${partner.name}`
                : "Ваш простір для двох"}
              <span className="couple-pill-dot">·</span>наш маленький світ
            </span>
          </div>
        </div>
        <TogetherArt />
        <span className="hero-note">краще разом</span>
      </section>
      <div className="home-grid">
        <section className="card shopping-preview">
          <div className="card-heading">
            <div>
              <span className="card-eyebrow">
                <ShoppingBag size={15} /> ЩОДЕННІ ДРІБНИЦІ
              </span>
              <h2>
                Потрібно купити <span className="count">{items.length}</span>
              </h2>
            </div>
            <Button
              className="icon-button soft-button"
              aria-label="Швидко додати товар"
              onClick={onAdd}
            >
              <Plus size={21} />
            </Button>
          </div>
          <div className="preview-list">
            {items.slice(0, 4).map((item) => (
              <ShoppingRow item={item} compact key={item.id} />
            ))}
            {items.length === 0 && (
              <EmptyState title="Список порожній. Можна відпочити ✨" />
            )}
          </div>
          <button className="card-footer" onClick={() => navigate("shopping")}>
            <span>До списку покупок</span>
            <ArrowRight size={18} />
          </button>
        </section>
        <section className="card next-event">
          <span className="card-eyebrow">
            <CalendarDays size={15} /> НАСТУПНА МИТЬ РАЗОМ
          </span>
          {next ? (
            <>
              <div className="event-illustration" aria-hidden="true">
                <div className="movie-ticket">
                  <span>ours. кіно</span>
                  <i />
                  <b>дві найкращі ролі</b>
                  <small>ти + я</small>
                </div>
                <span className="event-spark">✧</span>
              </div>
              <div className="event-date">
                {longDate(next.date)}
                {next.time ? ` · ${next.time.slice(0, 5)}` : ""}
              </div>
              <h2>{next.title}</h2>
              <p>{next.location || "Час для вас двох"}</p>
              <button
                className="round-arrow"
                aria-label="Переглянути найближчу подію"
                onClick={() => onEvent(next.id)}
              >
                <ArrowRight size={21} />
              </button>
            </>
          ) : (
            <EmptyState
              title="Поки без планів"
              description="Можливо, час придумати щось цікаве?"
            >
              <Button className="ghost" onClick={() => navigate("plans")}>
                Запланувати
              </Button>
            </EmptyState>
          )}
        </section>
      </div>
      <SectionHeading
        title="Маленькі великі бажання"
        action="Усі бажання"
        onAction={() => navigate("wishes")}
      />
      <section
        className="wishes-teaser card"
        onClick={() => navigate("wishes")}
      >
        <div className="teaser-copy">
          <span className="mini-icon">
            <Gift size={21} />
          </span>
          <h3>Те, що змушує усміхатись.</h3>
          <p>
            {data.wishes.length
              ? `${data.wishes.length} бажання й трішки натхнення для сюрпризів.`
              : "Збережіть ідеї, які хочеться здійснити."}
          </p>
          <Button className="ghost" onClick={() => navigate("wishes")}>
            Зазирнути у бажання <ArrowRight size={16} />
          </Button>
        </div>
        <div className="teaser-art">
          <div>
            <WishArt kind="headphones" />
          </div>
          <div>
            <WishArt kind="book" />
          </div>
        </div>
      </section>
      <div className="home-footnote">
        <Sparkles size={13} />
        <span>Не все потрібно встигнути. Головне — разом.</span>
      </div>
    </>
  );
}
