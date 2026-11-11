import type { Data } from "./types";
import { kyivDate } from "./utils";
export const DEMO_USER = "demo-anna",
  DEMO_COUPLE = "demo-couple";
export function createDemo(): Data {
  const now = new Date().toISOString(),
    today = kyivDate();
  const future = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return kyivDate(d);
  };
  return {
    recipes: [],
    profiles: [
      { id: DEMO_USER, name: "Анна", avatar_path: null },
      { id: "demo-mark", name: "Марк", avatar_path: null },
    ],
    shopping: [
      ["Молоко", 1, "л", "Молочні продукти"],
      ["Яйця", 10, "шт.", "Інше"],
      ["Сир", 200, "г", "Молочні продукти"],
      ["Хліб", 1, "шт.", "Бакалія"],
      ["Куряче філе", 1, "кг", "М’ясо та риба"],
    ].map(([name, quantity, unit, category], i) => ({
      id: `item-${i}`,
      couple_id: DEMO_COUPLE,
      name: String(name),
      quantity: Number(quantity),
      unit: String(unit),
      category: String(category),
      price: null,
      added_by: i % 2 ? "demo-mark" : DEMO_USER,
      purchased: false,
      session_id: null,
      created_at: now,
    })),
    movies: [
      {
        id: "movie-1",
        couple_id: DEMO_COUPLE,
        title: "Інтерстеллар",
        year: 2014,
        genres: "Фантастика · Пригоди",
        description:
          "Подорож за межі знайомого світу — і нагадування про те, що нас поєднує.",
        url: "https://www.youtube.com/watch?v=zSWdZVtXT7E",
        poster_url: "",
        status: "planned",
        added_by: "demo-mark",
        created_at: now,
      },
      {
        id: "movie-2",
        couple_id: DEMO_COUPLE,
        title: "Душа",
        year: 2020,
        genres: "Анімація · Драма",
        description: "Іноді найважливіше ховається у звичайному дні.",
        url: "",
        poster_url: "",
        status: "planned",
        added_by: DEMO_USER,
        created_at: now,
      },
    ],
    activities: [
      {
        id: "activity-1",
        couple_id: DEMO_COUPLE,
        actor_id: "demo-mark",
        kind: "movies",
        action: "added",
        entity_id: "movie-1",
        title: "Інтерстеллар",
        created_at: now,
      },
      {
        id: "activity-2",
        couple_id: DEMO_COUPLE,
        actor_id: "demo-mark",
        kind: "shopping",
        action: "added",
        entity_id: "item-1",
        title: "Яйця",
        created_at: now,
      },
      {
        id: "activity-3",
        couple_id: DEMO_COUPLE,
        actor_id: "demo-mark",
        kind: "wishes",
        action: "added",
        entity_id: "wish-3",
        title: "Кавові аксесуари",
        created_at: now,
      },
    ],
    reads: [],
    sessions: [],
    wishes: [
      {
        id: "wish-1",
        couple_id: DEMO_COUPLE,
        owner_id: DEMO_USER,
        name: "Навушники для улюбленої музики",
        price: 12999,
        url: "",
        priority: "Мрія",
        note: "Бездротові навушники з шумозаглушенням. У теплому білому кольорі.",
        image_url: "",
        image_path: "illustration:headphones",
        created_at: now,
      },
      {
        id: "wish-2",
        couple_id: DEMO_COUPLE,
        owner_id: DEMO_USER,
        name: "Книга для повільних вихідних",
        price: 680,
        url: "",
        priority: "Дуже хочу",
        note: "Щось про маленькі радощі щодня.",
        image_url: "",
        image_path: "illustration:book",
        created_at: now,
      },
      {
        id: "wish-3",
        couple_id: DEMO_COUPLE,
        owner_id: "demo-mark",
        name: "Кавові аксесуари",
        price: 2400,
        url: "",
        priority: "Дуже хочу",
        note: "Кавові аксесуари для нашої кухні.",
        image_url: "",
        image_path: "illustration:coffee",
        created_at: now,
      },
    ],
    reservations: [],
    events: [
      {
        id: "event-1",
        couple_id: DEMO_COUPLE,
        title: "Вечір кіно",
        date: today,
        time: "19:00",
        all_day: false,
        location: "Вдома, під пледом",
        description: "Обрати фільм і не забути попкорн.",
        category: "Побачення",
        created_by: DEMO_USER,
        created_at: now,
      },
      {
        id: "event-2",
        couple_id: DEMO_COUPLE,
        title: "Спільна прогулянка",
        date: future(2),
        time: "17:00",
        all_day: false,
        location: "Улюблений парк",
        description: "Без поспіху та зайвих планів.",
        category: "Побачення",
        created_by: "demo-mark",
        created_at: now,
      },
      {
        id: "event-3",
        couple_id: DEMO_COUPLE,
        title: "Маленька подорож",
        date: future(9),
        time: null,
        all_day: true,
        location: "Львів",
        description: "Наші вихідні в іншому місті.",
        category: "Поїздка",
        created_by: DEMO_USER,
        created_at: now,
      },
    ],
    history: [],
  };
}
export function readDemo(): Data {
  try {
    const saved = localStorage.getItem("ours-demo-v1");
    if (saved) {
      const data = JSON.parse(saved) as Data;
      if (
        [
          "profiles",
          "shopping",
          "sessions",
          "wishes",
          "reservations",
          "events",
          "history",
        ].every((key) => Array.isArray(data[key as keyof Data]))
      )
        return {
          ...data,
          recipes: Array.isArray(data.recipes) ? data.recipes : [],
          movies: Array.isArray(data.movies)
            ? data.movies
            : createDemo().movies,
          activities: Array.isArray(data.activities)
            ? data.activities
            : createDemo().activities,
          reads: Array.isArray(data.reads) ? data.reads : [],
          wishes: data.wishes.map((w) => ({
            ...w,
            image_url: w.image_url ?? "",
          })),
        };
    }
  } catch {
    /* reset invalid demo */
  }
  return createDemo();
}
