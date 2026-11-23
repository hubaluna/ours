// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

afterEach(() => {
  cleanup();
});

function BuggyComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test render error");
  }
  return <div>Нормальний вміст екрана</div>;
}

function TestContainer() {
  const [hasBug, setHasBug] = useState(true);
  return (
    <ErrorBoundary onReset={() => setHasBug(false)}>
      <BuggyComponent shouldThrow={hasBug} />
    </ErrorBoundary>
  );
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>Працюючий віджет</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Працюючий віджет")).toBeInTheDocument();
  });

  it("catches render error and displays polite recovery UI", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<TestContainer />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Щось пішло не так")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Спробувати знову" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Спробувати знову" }));

    expect(screen.getByText("Нормальний вміст екрана")).toBeInTheDocument();
    spy.mockRestore();
  });
});
