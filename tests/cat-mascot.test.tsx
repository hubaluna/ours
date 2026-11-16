// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CatMascot } from "../src/components/CatMascot";
import {
  MascotContext,
  type MascotContextValue,
} from "../src/components/MascotContext";

describe("CatMascot component", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders when placement matches context", () => {
    const mockContext: MascotContextValue = {
      placement: "logo",
      image: "cat-sitting.webp",
      tapCat: vi.fn(),
      bubble: null,
      isSquishing: false,
    };

    render(
      <MascotContext.Provider value={mockContext}>
        <CatMascot placement="logo" />
      </MascotContext.Provider>,
    );

    const button = screen.getByRole("button", { name: "Погладити кішку" });
    expect(button).toBeInTheDocument();
    expect(button.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("cat-sitting.webp"),
    );
  });

  it("does not render when placement does not match context", () => {
    const mockContext: MascotContextValue = {
      placement: "title",
      image: "cat-bed-loaf.webp",
      tapCat: vi.fn(),
      bubble: null,
      isSquishing: false,
    };

    render(
      <MascotContext.Provider value={mockContext}>
        <CatMascot placement="logo" />
      </MascotContext.Provider>,
    );

    expect(
      screen.queryByRole("button", { name: "Погладити кішку" }),
    ).not.toBeInTheDocument();
  });

  it("calls tapCat and stops click propagation to parent brand button", () => {
    const tapCatSpy = vi.fn();
    const parentClickSpy = vi.fn();

    const mockContext: MascotContextValue = {
      placement: "logo",
      image: "cat-sitting.webp",
      tapCat: tapCatSpy,
      bubble: null,
      isSquishing: false,
    };

    render(
      <button onClick={parentClickSpy}>
        <span>ours.</span>
        <MascotContext.Provider value={mockContext}>
          <CatMascot placement="logo" />
        </MascotContext.Provider>
      </button>,
    );

    const mascot = screen.getByRole("button", { name: "Погладити кішку" });
    fireEvent.click(mascot);

    expect(tapCatSpy).toHaveBeenCalledTimes(1);
    expect(parentClickSpy).not.toHaveBeenCalled();
  });

  it("displays speech bubble text when bubble state is active", () => {
    const mockContext: MascotContextValue = {
      placement: "title",
      image: "cat-sleeping.webp",
      tapCat: vi.fn(),
      bubble: { text: "мррр… 💤", key: 12345 },
      isSquishing: false,
    };

    render(
      <MascotContext.Provider value={mockContext}>
        <CatMascot placement="title" />
      </MascotContext.Provider>,
    );

    expect(screen.getByText("мррр… 💤")).toBeInTheDocument();
  });

  it("applies is-squishing class when isSquishing is true", () => {
    const mockContext: MascotContextValue = {
      placement: "panel",
      image: "cat-sofa-loaf.webp",
      tapCat: vi.fn(),
      bubble: null,
      isSquishing: true,
    };

    render(
      <MascotContext.Provider value={mockContext}>
        <CatMascot placement="panel" />
      </MascotContext.Provider>,
    );

    const img = screen
      .getByRole("button", {
        name: "Погладити кішку",
      })
      .querySelector("img");
    expect(img).toHaveClass("is-squishing");
  });
});
