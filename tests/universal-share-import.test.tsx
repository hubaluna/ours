// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProvider } from "../src/hooks/AppContext";
import { UniversalShareImport } from "../src/components/UniversalShareImport";
import { LinkImport } from "../src/components/LinkImport";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("UniversalShareImport & LinkImport Enhancements", () => {
  it("renders target selector in LinkImport when allowTargetChange is enabled", () => {
    const onCloseSpy = vi.fn();
    render(
      <AppProvider>
        <LinkImport
          allowTargetChange={true}
          onClose={onCloseSpy}
        />
      </AppProvider>,
    );

    expect(screen.getByRole("radiogroup", { name: "Призначення імпорту" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /У бажання/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /У меню/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /У покупки/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /У кіно/i })).toBeInTheDocument();
  });

  it("provides 'З буфера' button to paste from clipboard", async () => {
    const clipboardText = "https://rozetka.com.ua/item/456/";
    Object.assign(navigator, {
      clipboard: {
        readText: vi.fn().mockResolvedValue(clipboardText),
      },
    });

    render(
      <AppProvider>
        <LinkImport onClose={vi.fn()} />
      </AppProvider>,
    );

    const pasteBtn = screen.getByRole("button", { name: /З буфера/i });
    expect(pasteBtn).toBeInTheDocument();

    fireEvent.click(pasteBtn);

    await waitFor(() => {
      const input = screen.getByPlaceholderText("https://…") as HTMLInputElement;
      expect(input.value).toBe(clipboardText);
    });
  });

  it("auto-detects destination for movie link in UniversalShareImport", async () => {
    const movieUrl = "https://www.imdb.com/title/tt1375666/";
    render(
      <AppProvider>
        <UniversalShareImport
          url={movieUrl}
          onClose={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      </AppProvider>,
    );

    const movieBtn = await screen.findByRole("button", { name: /У кіно/i });
    expect(movieBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("auto-detects destination for culinary/tiktok link in UniversalShareImport", async () => {
    const tiktokUrl = "https://www.tiktok.com/@chef/video/123456";
    render(
      <AppProvider>
        <UniversalShareImport
          url={tiktokUrl}
          onClose={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      </AppProvider>,
    );

    const menuBtn = await screen.findByRole("button", { name: /У меню/i });
    expect(menuBtn).toHaveAttribute("aria-pressed", "true");
  });
});
