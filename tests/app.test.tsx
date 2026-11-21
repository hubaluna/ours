// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "motion/react";
import { AppProvider } from "../src/hooks/AppContext";
import App from "../src/App";
import { createDemo } from "../src/lib/demo";
import { kyivDate } from "../src/lib/utils";
// Lazy feature modules can take longer than the default 1s on shared runners.
configure({ asyncUtilTimeout: 5000 });
vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    updateServiceWorker: async () => {},
  }),
}));
const mount = () =>
  render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
beforeEach(() => {
  // jsdom has no rendering timeline; exercise real animations in Playwright.
  MotionGlobalConfig.skipAnimations = true;
  localStorage.clear();
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(420);
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  mount();
});
afterEach(() => {
  cleanup();
  MotionGlobalConfig.skipAnimations = false;
  vi.restoreAllMocks();
});
const nav = () =>
  within(screen.getByRole("navigation", { name: "Основна навігація" }));
const saved = () => JSON.parse(localStorage.getItem("ours-demo-v1")!);
const closed = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
describe("Compact seven-tab app", () => {
  it("groups shopping items by supermarket category and auto-files legacy items", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Покупки"));
    await waitFor(() =>
      expect(document.querySelectorAll(".shopping-category-group")).toHaveLength(3),
    );
    const groups = [...document.querySelectorAll(".shopping-category-group")];
    expect(groups.map((group) => group.querySelector("h2")?.textContent)).toEqual([
      "М’ясо, риба та яйця",
      "Молочне",
      "Хліб і випічка",
    ]);
    expect(
      screen
        .getByRole("button", { name: "Редагувати Яйця" })
        .closest(".shopping-category-group")
        ?.querySelector("h2")?.textContent,
    ).toBe("М’ясо, риба та яйця");
    expect(document.querySelector(".pager")).not.toBeInTheDocument();
  });

  it("filters and labels shopping sessions by Kyiv date near UTC midnight", async () => {
    cleanup();
    const data = createDemo(),
      sessionId = "session-kyiv-midnight",
      created_at = "2026-12-31T22:30:00.000Z";
    data.sessions = [
      { id: sessionId, couple_id: "demo-couple", created_at },
    ];
    data.shopping = [
      {
        ...data.shopping[0],
        id: "history-milk",
        name: "Молоко",
        purchased: true,
        session_id: sessionId,
        created_at,
      },
    ];
    localStorage.setItem("ours-demo-v1", JSON.stringify(data));
    mount();
    const user = userEvent.setup();
    await user.click(nav().getByText("Покупки"));
    await user.click(
      await screen.findByRole("button", { name: "Історія покупок" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Історія покупок",
    });
    fireEvent.change(within(dialog).getByLabelText("Покупки від дати"), {
      target: { value: "2027-01-01" },
    });
    fireEvent.change(within(dialog).getByLabelText("Покупки до дати"), {
      target: { value: "2027-01-01" },
    });
    expect(within(dialog).getByText(/1 січня/)).toBeInTheDocument();
    expect(within(dialog).getByText("Молоко")).toBeInTheDocument();
  });

  it("adds shopping, purchases and restores with separate compact filters", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Покупки"));
    await user.click(
      await screen.findByRole("button", { name: "Додати товар" }),
    );
    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Назва товару"), "Авокадо");
    await user.click(
      within(dialog).getByRole("button", { name: "Додати до списку" }),
    );
    await closed();
    await user.click(
      screen.getByRole("checkbox", { name: "Куплено: Авокадо" }),
    );
    await waitFor(() =>
      expect(
        saved().shopping.find((i: { name: string }) => i.name === "Авокадо")
          .purchased,
      ).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "Куплено · 1" }));
    await user.click(
      await screen.findByRole("checkbox", { name: "Повернути: Авокадо" }),
    );
    await waitFor(() =>
      expect(
        saved().shopping.find((i: { name: string }) => i.name === "Авокадо")
          .purchased,
      ).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Потрібно · 6" }));
    expect(
      await screen.findByRole("checkbox", { name: "Куплено: Авокадо" }),
    ).toBeInTheDocument();
    dialog = screen.queryByRole("dialog")!;
    expect(dialog).toBeNull();
  });
  it("searches completed shopping sessions by product and purchase date", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Покупки"));
    while (
      (saved().shopping as { purchased: boolean; session_id: string | null }[])
        .filter((item) => !item.purchased && !item.session_id).length
    ) {
      const remaining = screen.queryAllByRole("checkbox", {
        name: /^Куплено:/,
      });
      expect(remaining.length).toBeGreaterThan(0);
      const before = (saved().shopping as { purchased: boolean }[]).filter(
        (item) => !item.purchased,
      ).length;
      await user.click(remaining[0]);
      await waitFor(() =>
        expect(
          (saved().shopping as { purchased: boolean }[]).filter(
            (item) => !item.purchased,
          ),
        ).toHaveLength(before - 1),
      );
    }
    await user.click(
      screen.getByRole("button", { name: "Куплено · 5" }),
    );
    await user.click(await screen.findByRole("button", { name: "Завершити" }));
    await waitFor(() => expect(saved().sessions).toHaveLength(1));
    const purchaseDate = kyivDate(new Date(saved().sessions[0].created_at));
    await user.click(
      screen.getByRole("button", { name: "Історія покупок" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Історія покупок",
    });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Пошук у покупках" }),
      "Молоко",
    );
    fireEvent.change(
      within(dialog).getByLabelText("Покупки від дати"),
      { target: { value: purchaseDate } },
    );
    fireEvent.change(within(dialog).getByLabelText("Покупки до дати"), {
      target: { value: purchaseDate },
    });
    expect(within(dialog).getByText("Молоко")).toBeInTheDocument();
    expect(within(dialog).getAllByText(/\d{2}:\d{2}/).length).toBeGreaterThan(0);
    await user.clear(
      within(dialog).getByRole("textbox", { name: "Пошук у покупках" }),
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Пошук у покупках" }),
      "Немає такого товару",
    );
    expect(
      within(dialog).getByText("За цими фільтрами покупок не знайдено."),
    ).toBeInTheDocument();
  });
  it("creates and edits a wish through expanded details", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Бажання"));
    await user.click(
      await screen.findByRole("button", { name: "Додати бажання" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Назва"), "Нова книга");
    await user.type(within(dialog).getByLabelText("Ціна, ₴"), "450");
    await user.click(
      within(dialog).getByRole("button", { name: "Зберегти бажання" }),
    );
    await closed();
    await user.click(screen.getByRole("heading", { name: "Нова книга" }));
    await user.click(
      await screen.findByRole("button", { name: "Редагувати Нова книга" }),
    );
    expect(await screen.findByDisplayValue("Нова книга")).toBeInTheDocument();
  });
  it("exports selected own wishes, including a private wish with its size", async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    Object.defineProperty(window, "print", { configurable: true, value: print });
    await user.click(nav().getByText("Бажання"));
    await user.click(
      await screen.findByRole("button", { name: "Експорт бажань у PDF" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Експорт у PDF" });
    await user.click(within(dialog).getByRole("button", { name: "Очистити вибір" }));
    await user.click(within(dialog).getByLabelText("Теплий светр · M"));
    await user.click(within(dialog).getByRole("button", { name: "Створити PDF · 1" }));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    expect(document.querySelector(".wishlist-print-sheet h2")?.textContent).toBe(
      "Теплий светр",
    );
    expect(document.querySelector(".wishlist-print-sheet")?.textContent).toContain(
      "Розмір / варіант: M",
    );
    expect(
      document.querySelector<HTMLAnchorElement>(".wishlist-print-sheet a")?.href,
    ).toBe("https://example.com/sweater");
  });
  it("creates a movie, expands it and marks it watched", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Кіно"));
    await user.click(
      await screen.findByRole("button", { name: "Додати фільм" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Назва"), "Наш фільм");
    await user.type(within(dialog).getByLabelText("Рік"), "2025");
    await user.click(
      within(dialog).getByRole("button", { name: "Зберегти фільм" }),
    );
    await closed();
    await user.click(screen.getByRole("heading", { name: "Наш фільм" }));
    await user.click(await screen.findByRole("button", { name: "Подивились" }));
    fireEvent.change(await screen.findByRole("slider", { name: "Оцінка фільму" }), {
      target: { value: "8" },
    });
    await user.click(screen.getByRole("button", { name: "Зберегти оцінку" }));
    await closed();
    await user.click(screen.getByRole("button", { name: "Переглянули" }));
    expect(
      await screen.findByRole("heading", { name: "Наш фільм" }),
    ).toBeInTheDocument();
    expect(
      saved().movies.find((m: { title: string }) => m.title === "Наш фільм")
        .status,
    ).toBe("watched");
  });
  it("creates an all-day calendar event", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Календар"));
    await user.click(
      await screen.findByRole("button", { name: "Додати план" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Назва"), "Кава вдвох");
    expect(within(dialog).queryByLabelText("Місце")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Категорія")).not.toBeInTheDocument();
    await user.click(within(dialog).getByText("Довідково"));
    await user.type(
      within(dialog).getByLabelText("Опис"),
      "Забронювати столик біля вікна",
    );
    await user.click(within(dialog).getByLabelText("Увесь день"));
    await user.click(
      within(dialog).getByRole("button", { name: "Додати план" }),
    );
    await closed();
    expect(await screen.findByText("Кава вдвох")).toBeInTheDocument();
    expect(screen.getByText("Увесь день")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Кава вдвох/ }),
    );
    const details = await screen.findByRole("dialog", { name: "Кава вдвох" });
    expect(within(details).getByText("Увесь день")).toBeInTheDocument();
    expect(
      within(details).queryByText("Забронювати столик біля вікна"),
    ).not.toBeInTheDocument();
    await user.click(
      within(details).getByRole("button", { name: "Довідково" }),
    );
    expect(
      within(details).getByText("Забронювати столик біля вікна"),
    ).toBeInTheDocument();
  });
  it("keeps Places out of the app navigation while Wishes stays available", async () => {
    expect(nav().queryByText("Місця")).not.toBeInTheDocument();
    await userEvent.setup().click(nav().getByText("Бажання"));
    expect(await screen.findByRole("heading", { name: "Бажання" })).toBeInTheDocument();
    expect(nav().queryByText("Місця")).not.toBeInTheDocument();
  });
  it("keeps read updates hidden after reopening the app", async () => {
    const user = userEvent.setup();
    await user.click(await screen.findByText("Інтерстеллар"));
    await waitFor(() =>
      expect(
        saved().reads.some(
          (r: { activity_id: string }) => r.activity_id === "activity-1",
        ),
      ).toBe(true),
    );
    await user.click(
      screen.getByRole("button", { name: "Закрити", exact: true }),
    );
    await closed();
    expect(screen.queryByText("Інтерстеллар")).not.toBeInTheDocument();
    cleanup();
    mount();
    await screen.findByRole("heading", { name: "Нове для вас" });
    expect(screen.queryByText("Інтерстеллар")).not.toBeInTheDocument();
    expect(screen.getByText("Кавові аксесуари")).toBeInTheDocument();
  });
  it("imports selected recipe ingredients from pasted text without fake network data", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Покупки"));
    await user.click(
      await screen.findByRole("button", { name: "Імпорт рецепта" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Вставити текст зі сторінки" }),
    );
    await user.type(
      screen.getByLabelText("Інгредієнти · кожен із нового рядка"),
      "200 г рису\n1 л води",
    );
    await user.click(screen.getByRole("button", { name: /Розібрати текст/ }));
    await user.click(
      await screen.findByRole("button", { name: "Додати 2 до покупок" }),
    );
    await closed();
    expect(saved().shopping).toHaveLength(6);
    expect(
      saved().shopping.find((i: { name: string }) => i.name === "рису"),
    ).toMatchObject({ quantity: 200, unit: "г" });
    expect(saved().shopping.some((i: { name: string }) => i.name === "води")).toBe(false);
  });
  it("opens a random recipe preview without forcing a multi-course menu", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Меню"));
    await user.click(
      await screen.findByRole("button", { name: "Згенерувати вечерю" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Додати до меню" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem("ours-dinner-idea-demo-anna")).toMatch(
      /^catalog:/,
    );
    expect(saved().mealPlan).toHaveLength(0);
    await user.click(
      within(dialog).getByRole("button", { name: "Додати до меню" }),
    );
    await closed();
    expect(saved().mealPlan).toHaveLength(1);
    expect(
      saved().shopping.some((i: { menu_key?: string }) => i.menu_key),
    ).toBe(true);
  });
  it("switches themes and preserves the preference", async () => {
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Відкрити налаштування" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Темна" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("ours-theme")).toBe("dark");
    await user.click(within(dialog).getByRole("button", { name: "Світла" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("preserves an unsaved form when continuing after close", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Покупки"));
    await user.click(
      await screen.findByRole("button", { name: "Додати товар" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Назва товару"), "Помідори");
    await user.click(within(dialog).getByText("Додатково"));
    await user.clear(within(dialog).getByLabelText("Кількість"));
    await user.type(within(dialog).getByLabelText("Кількість"), "3");
    await user.keyboard("{Escape}");
    expect(
      await screen.findByText("Залишити незбережені зміни?"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Продовжити" }));
    expect(screen.getByDisplayValue("Помідори")).toBeInTheDocument();
    expect(screen.getByLabelText("Кількість")).toHaveValue(3);
  });
  it("keeps reservations out of wishes and the update feed", async () => {
    const user = userEvent.setup();
    const activityCount = saved().activities.length;
    await user.click(nav().getByText("Бажання"));
    await user.click(
      await screen.findByRole("button", { name: "Бажання партнера" }),
    );
    await user.click(screen.getByRole("heading", { name: "Кавові аксесуари" }));
    await user.click(
      await screen.findByRole("button", { name: "Хочу подарувати" }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Заплановано · позначити придбаним",
      }),
    ).toBeInTheDocument();
    expect(saved().reservations).toHaveLength(1);
    expect(saved().activities).toHaveLength(activityCount);
    expect(saved().wishes[2]).not.toHaveProperty("status");
  });
  it("sorts purchased shopping items first by purchase date and then by category", async () => {
    cleanup();
    const data = createDemo();
    data.shopping = [
      {
        ...data.shopping[0],
        id: "old-bread",
        name: "Багет",
        category: "Хліб і випічка",
        purchased: true,
        session_id: null,
        created_at: "2026-11-10T10:00:00.000Z",
        updated_at: "2026-11-10T14:00:00.000Z",
      },
      {
        ...data.shopping[0],
        id: "old-milk",
        name: "Кефір",
        category: "Молочне",
        purchased: true,
        session_id: null,
        created_at: "2026-11-10T09:00:00.000Z",
        updated_at: "2026-11-10T15:00:00.000Z",
      },
      {
        ...data.shopping[0],
        id: "new-cheese",
        name: "Сир брі",
        category: "Молочне",
        purchased: true,
        session_id: null,
        created_at: "2026-11-12T09:00:00.000Z",
        updated_at: "2026-11-12T12:00:00.000Z",
      },
    ];
    localStorage.setItem("ours-demo-v1", JSON.stringify(data));
    mount();
    const user = userEvent.setup();
    await user.click(nav().getByText("Покупки"));
    await user.click(await screen.findByRole("button", { name: "Куплено · 3" }));
    const dateGroups = [...document.querySelectorAll(".shopping-date-group")];
    expect(dateGroups).toHaveLength(2);
    expect(dateGroups[0].querySelector(".shopping-date-heading")?.textContent).toContain("12 листопада");
    expect(dateGroups[0].textContent).toContain("Сир брі");
    expect(dateGroups[1].querySelector(".shopping-date-heading")?.textContent).toContain("10 листопада");
    const olderCategories = [...dateGroups[1].querySelectorAll(".shopping-category-heading")].map(
      (el) => el.textContent,
    );
    expect(olderCategories).toEqual(["Молочне", "Хліб і випічка"]);
  });

  it("sorts wishes by priority and price", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Бажання"));
    const sortSelect = await screen.findByLabelText("Сортування бажань");
    await user.selectOptions(sortSelect, "price-asc");
    const titlesAsc = [...document.querySelectorAll(".wish-row h2")].map(
      (el) => el.textContent,
    );
    expect(titlesAsc).toEqual([
      "Книга для повільних вихідних",
      "Теплий светр",
      "Навушники для улюбленої музики",
    ]);

    await user.selectOptions(sortSelect, "priority");
    const titlesPrio = [...document.querySelectorAll(".wish-row h2")].map(
      (el) => el.textContent,
    );
    expect(titlesPrio[0]).toBe("Навушники для улюбленої музики");
  });

  it("moves deleted items to Кошик and restores them", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Покупки"));
    await user.click(
      await screen.findByRole("button", { name: "Редагувати Молоко" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Видалити" }));
    await user.click(within(dialog).getByRole("button", { name: "Так, видалити" }));
    await closed();
    expect(
      saved().shopping.some((i: { name: string }) => i.name === "Молоко"),
    ).toBe(false);

    await user.click(
      screen.getByRole("button", { name: "Відкрити налаштування" }),
    );
    const settingsDialog = await screen.findByRole("dialog", {
      name: "Ваш простір",
    });
    await user.click(
      within(settingsDialog).getByRole("button", { name: /Кошик/ }),
    );
    const trashDialog = await screen.findByRole("dialog", { name: "Кошик" });
    expect(within(trashDialog).getByText("Молоко")).toBeInTheDocument();
    await user.click(
      within(trashDialog).getByRole("button", { name: "Відновити" }),
    );
    await waitFor(() =>
      expect(
        saved().shopping.some((i: { name: string }) => i.name === "Молоко"),
      ).toBe(true),
    );
  });

  it("creates a recurring calendar event and displays its repeat label", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Календар"));
    await user.click(
      await screen.findByRole("button", { name: "Додати план" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Назва"), "Наша дата");
    await user.selectOptions(within(dialog).getByLabelText("Повтор"), "yearly");
    await user.click(
      within(dialog).getByRole("button", { name: "Додати план" }),
    );
    await closed();
    expect(await screen.findByText("Наша дата")).toBeInTheDocument();
    expect(screen.getByText("Щороку")).toBeInTheDocument();
  });

  it("shows the На сьогодні summary dashboard (3 cards, no Меню) and replaces the empty feed state", async () => {
    const user = userEvent.setup();
    const todaySection = await screen.findByRole("region", {
      name: "На сьогодні",
    });
    for (const label of ["Покупки", "Рослини", "Календар"]) {
      const title = within(todaySection).getByText(label);
      expect(
        title.closest(".today-card-lead")?.querySelector(".today-card-icon"),
      ).toBeTruthy();
    }
    expect(within(todaySection).queryByText("Меню")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Усе переглянуто" }));
    expect(
      await screen.findByText(/Усе нове вже бачили/),
    ).toBeInTheDocument();
    const emptyToday = screen.getByRole("region", { name: "На сьогодні" });
    expect(within(emptyToday).queryByText("Меню")).not.toBeInTheDocument();
    await user.click(within(emptyToday).getByRole("button", { name: /Покупки/ }));
    expect(
      await screen.findByRole("heading", { name: "Покупки" }),
    ).toBeInTheDocument();
  });

  it("shows today-empty and upcoming days countdown on Calendar dashboard card", async () => {
    const raw = JSON.parse(localStorage.getItem("ours-demo-v1")!);
    raw.events = raw.events.filter((ev: { id: string }) => ev.id !== "event-1");
    localStorage.setItem("ours-demo-v1", JSON.stringify(raw));

    cleanup();
    render(
      <AppProvider>
        <App />
      </AppProvider>,
    );
    const todaySection = await screen.findByRole("region", {
      name: "На сьогодні",
    });
    expect(within(todaySection).getByText("2 дн.")).toBeInTheDocument();
    expect(
      within(todaySection).getByText(
        "Сьогодні нічого · Спільна прогулянка (через 2 дн.)",
      ),
    ).toBeInTheDocument();
  });

  it("manages єВдома pantry products and excludes them from recipe shopping", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Меню"));
    await user.click(await screen.findByRole("button", { name: "єВдома" }));
    const pantryDialog = await screen.findByRole("dialog", { name: "єВдома" });

    // One-click basic staple toggle
    await user.click(
      within(pantryDialog).getByRole("button", { name: /Рис/ }),
    );
    await waitFor(() =>
      expect(
        saved().pantry.some((p: { name: string }) => p.name === "Рис"),
      ).toBe(true),
    );

    // Custom product add, edit, delete
    await user.type(
      within(pantryDialog).getByLabelText("Назва продукту вдома"),
      "Морква",
    );
    await user.type(
      within(pantryDialog).getByLabelText("Кількість або примітка"),
      "500 г",
    );
    await user.click(
      within(pantryDialog).getByRole("button", { name: "Додати" }),
    );
    await waitFor(() =>
      expect(
        saved().pantry.some((p: { name: string }) => p.name === "Морква"),
      ).toBe(true),
    );
    await user.click(
      within(pantryDialog).getByRole("button", { name: "Редагувати Морква" }),
    );
    const editQty = within(pantryDialog).getByLabelText(
      "Редагувати кількість: Морква",
    );
    await user.clear(editQty);
    await user.type(editQty, "1 кг");
    await user.click(
      within(pantryDialog).getByRole("button", { name: "Зберегти Морква" }),
    );
    await waitFor(() =>
      expect(
        saved().pantry.find((p: { name: string }) => p.name === "Морква")
          ?.quantity,
      ).toBe("1 кг"),
    );
    await user.click(
      within(pantryDialog).getByRole("button", { name: "Видалити Морква" }),
    );
    await waitFor(() =>
      expect(
        saved().pantry.some((p: { name: string }) => p.name === "Морква"),
      ).toBe(false),
    );

    await user.click(
      within(pantryDialog).getByRole("button", { name: "Закрити", exact: true }),
    );
    await closed();

    // Open catalog recipe "Рис" (has Рис, Вода, Сіль, Вершкове масло)
    await user.click(
      await screen.findByRole("button", { name: "Відкрити рецепт · Рис" }),
    );
    const recipeDialog = await screen.findByRole("dialog", { name: "Рис" });
    expect(within(recipeDialog).getByText("є вдома: 3 із 4")).toBeInTheDocument();
    expect(
      within(recipeDialog).getByRole("button", {
        name: "Додати те, чого бракує (1)",
      }),
    ).toBeInTheDocument();

    await user.click(
      within(recipeDialog).getByRole("button", { name: "Додати до меню" }),
    );
    await closed();

    const menuItems = saved().shopping.filter(
      (i: { menu_key?: string }) => Boolean(i.menu_key),
    );
    expect(menuItems.map((i: { name: string }) => i.name)).toEqual([
      "Вершкове масло",
    ]);
  });

  it("displays demo budget summary and allows quick manual entry", async () => {
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Відкрити бюджет" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Бюджет" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/23 040 ₴/)).toBeInTheDocument();
    expect(screen.getByText(/Норма заощаджень 96%/)).toBeInTheDocument();

    const initialCount = saved().budgetTransactions.length;
    await user.click(
      screen.getByRole("button", { name: "Додати операцію" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Нова операція" });
    const amountInput = within(dialog).getByPlaceholderText("0,00");
    await user.type(amountInput, "425,50");
    await user.click(
      within(dialog).getByRole("button", { name: "Додати операцію" }),
    );
    await closed();

    await waitFor(() =>
      expect(saved().budgetTransactions).toHaveLength(initialCount + 1),
    );
    expect(saved().budgetTransactions[0]).toMatchObject({
      kind: "expense",
      amount: 425.5,
      category_key: "groceries",
      merchant: "Продукти",
      status: "confirmed",
    });
  });

  it("supports quick comma batch input with live removable preview chips", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Покупки"));
    await user.click(
      await screen.findByRole("button", { name: "Додати товар" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Назва товару"),
      "банани 1,5 кг, манго, рукола",
    );

    const preview = within(dialog).getByLabelText("Пакетний ввід покупок");
    const suggestionsEl = dialog.querySelector(".suggestions");
    expect(suggestionsEl).toBeInTheDocument();
    expect(
      Boolean(
        suggestionsEl &&
          suggestionsEl.compareDocumentPosition(preview) &
            Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(within(preview).getByText("Банани")).toBeInTheDocument();
    expect(within(preview).getByText("1.5 кг")).toBeInTheDocument();
    expect(within(preview).getByText("Манго")).toBeInTheDocument();
    expect(within(preview).getByText("Рукола")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Додати 3 до списку" }),
    ).toBeInTheDocument();

    await user.click(
      within(preview).getByRole("button", { name: "Прибрати Манго" }),
    );
    expect(within(preview).queryByText("Манго")).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Додати 2 до списку" }),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Додати 2 до списку" }),
    );
    await closed();

    const names = (saved().shopping as { name: string }[]).map((i) => i.name);
    expect(names).toContain("Банани");
    expect(names).toContain("Рукола");
    expect(names).not.toContain("Манго");
  });

  it("shows a soft offline badge in the header instead of an alarming banner", async () => {
    const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fireEvent(window, new Event("offline"));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Офлайн"),
    );
    expect(document.querySelector(".header-status-badge.is-offline")).toBeInTheDocument();
    expect(document.querySelector(".connection-banner")).not.toBeInTheDocument();

    onlineSpy.mockReturnValue(true);
    fireEvent(window, new Event("online"));
    await waitFor(() =>
      expect(
        document.querySelector(".header-status-badge.is-offline"),
      ).not.toBeInTheDocument(),
    );
  });
});


