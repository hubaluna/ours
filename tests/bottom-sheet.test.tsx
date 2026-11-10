// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BottomSheet } from "../src/components/ui";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("keeps focus in the field the user chose and restores the opener on close", () => {
  vi.useFakeTimers();
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const sheet = render(
    <BottomSheet title="Фільм" onClose={() => {}}>
      <label>
        Назва
        <input data-autofocus />
      </label>
      <label>
        Рік
        <input type="number" />
      </label>
    </BottomSheet>,
  );
  expect(screen.getByLabelText("Назва")).toHaveFocus();
  const year = screen.getByLabelText("Рік");
  act(() => year.focus());
  act(() => vi.advanceTimersByTime(200));
  expect(year).toHaveFocus();
  sheet.unmount();
  expect(opener).toHaveFocus();
  opener.remove();
});
