// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "../src/hooks/AppContext";
import App from "../src/App";
vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    updateServiceWorker: async () => {},
  }),
}));
beforeEach(() => {
  localStorage.clear();
  window.scrollTo = vi.fn();
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
});
afterEach(cleanup);
const nav = () =>
  within(screen.getByRole("navigation", { name: "Основна навігація" }));
describe("Working demo experience", () => {
  it("adds shopping, marks purchased, restores, and survives reload storage", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Покупки"));
    await user.click(
      await screen.findByRole("button", { name: "Додати товар" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Назва товару"), "Авокадо");
    await user.click(
      within(dialog).getByRole("button", { name: "Додати до списку" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Куплено: Авокадо" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "Повернути: Авокадо" }),
      ).toHaveAttribute("aria-checked", "true"),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Повернути: Авокадо" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "Куплено: Авокадо" }),
      ).toHaveAttribute("aria-checked", "false"),
    );
    expect(
      JSON.parse(localStorage.getItem("ours-demo-v1")!).shopping.some(
        (i: { name: string }) => i.name === "Авокадо",
      ),
    ).toBe(true);
  });
  it("creates and edits a wish", async () => {
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
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: "Нова книга" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Редагувати Нова книга" }),
    );
    expect(await screen.findByDisplayValue("Нова книга")).toBeInTheDocument();
  });
  it("creates an all-day calendar event", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Плани"));
    await user.click(
      await screen.findByRole("button", { name: "Додати план" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Назва"), "Кава вдвох");
    await user.click(within(dialog).getByLabelText("Увесь день"));
    await user.click(
      within(dialog).getByRole("button", { name: "Додати план" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole("heading", { name: "Кава вдвох" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Увесь день")).toBeInTheDocument();
  });
  it("changes theme and preserves choice", async () => {
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
  it("warns before discarding a form and keeps input when continuing", async () => {
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Швидко додати товар" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Назва товару"), "Помідори");
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
  it("reserves partner wish without putting reservation fields on wishes", async () => {
    const user = userEvent.setup();
    await user.click(nav().getByText("Бажання"));
    await user.click(
      await screen.findByRole("button", { name: "Бажання партнера" }),
    );
    await user.click(screen.getByRole("button", { name: "Хочу подарувати" }));
    expect(
      await screen.findByRole("button", {
        name: "Заплановано · позначити придбаним",
      }),
    ).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem("ours-demo-v1")!);
    expect(saved.reservations).toHaveLength(1);
    expect(saved.wishes[2]).not.toHaveProperty("status");
  });
});
