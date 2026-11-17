// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "../src/hooks/AppContext";
import { ShoppingForm } from "../src/components/Forms";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("ShoppingForm Batch Input", () => {
  it("recognizes comma-separated batch input, shows chips preview, and submits batch", async () => {
    const user = userEvent.setup();
    const onCloseSpy = vi.fn();

    render(
      <AppProvider>
        <ShoppingForm onClose={onCloseSpy} />
      </AppProvider>,
    );

    const input = screen.getByLabelText("Назва товару");
    await user.type(input, "Молоко 1 л, яйця 10 шт, сир 200 г, авокадо");

    // Check that batch preview chips appear
    expect(screen.getByLabelText("Пакетний ввід покупок")).toBeInTheDocument();
    expect(screen.getByText("Пакетне додавання · 4 поз.")).toBeInTheDocument();
    expect(screen.getByText("Молоко")).toBeInTheDocument();
    expect(screen.getByText("1 л")).toBeInTheDocument();
    expect(screen.getByText("Яйця")).toBeInTheDocument();
    expect(screen.getByText("10 шт.")).toBeInTheDocument();
    expect(screen.getByText("Сир")).toBeInTheDocument();
    expect(screen.getByText("200 г")).toBeInTheDocument();
    expect(screen.getByText("Авокадо")).toBeInTheDocument();

    // Check that submit button displays batch count
    const submitBtn = screen.getByRole("button", {
      name: "Додати 4 до списку",
    });
    expect(submitBtn).toBeInTheDocument();

    // Submit batch
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onCloseSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps normal single-item flow when adding a single product without delimiters", async () => {
    const user = userEvent.setup();
    const onCloseSpy = vi.fn();

    render(
      <AppProvider>
        <ShoppingForm onClose={onCloseSpy} />
      </AppProvider>,
    );

    const input = screen.getByLabelText("Назва товару");
    await user.type(input, "Вівсяне молоко");

    expect(screen.queryByLabelText("Пакетний ввід покупок")).not.toBeInTheDocument();
    const submitBtn = screen.getByRole("button", {
      name: "Додати до списку",
    });
    expect(submitBtn).toBeInTheDocument();

    await user.click(submitBtn);

    await waitFor(() => {
      expect(onCloseSpy).toHaveBeenCalledTimes(1);
    });
  });
});
