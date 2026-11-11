// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "motion/react";
import { AppProvider } from "../src/hooks/AppContext";
import App from "../src/App";
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
describe("Compact six-tab app", () => {
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
    await user.click(
      await screen.findByRole("button", { name: "8", exact: true }),
    );
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
    await user.click(within(dialog).getByLabelText("Увесь день"));
    await user.click(
      within(dialog).getByRole("button", { name: "Додати план" }),
    );
    await closed();
    expect(await screen.findByText("Кава вдвох")).toBeInTheDocument();
    expect(screen.getByText("Увесь день")).toBeInTheDocument();
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
    expect(saved().shopping).toHaveLength(7);
    expect(
      saved().shopping.find((i: { name: string }) => i.name === "рису"),
    ).toMatchObject({ quantity: 200, unit: "г" });
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
});
