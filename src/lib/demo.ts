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
        return data;
    }
  } catch {
    /* reset invalid demo */
  }
  return createDemo();
}
