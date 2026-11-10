import { test, expect } from "@playwright/test";
test("navigation, sheet, responsive layout and themes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const snapshot = async (name: string) => {
    // Allow the page's finite spring transition to settle before visual review.
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `test-results/screenshots/${test.info().project.name}/${name}.png`,
      fullPage: false,
    });
  };
  await page.goto("/");
  await expect(page.getByText("Усе наше.")).toBeVisible();
  await snapshot("home");
  const nav = page.getByRole("navigation", { name: "Основна навігація" });
  await nav.getByText("Покупки").click();
  await page.getByRole("button", { name: "Додати товар", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator(".sheet-backdrop")).toHaveCSS("opacity", "1");
  const sheetBounds = await dialog.boundingBox();
  expect(sheetBounds!.y).toBeGreaterThanOrEqual(0);
  expect(sheetBounds!.y + sheetBounds!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height + 1,
  );
  await snapshot("add-shopping");
  await dialog.getByLabel("Назва товару").fill("Авокадо");
  await dialog.getByRole("button", { name: "Додати до списку" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("checkbox", { name: "Куплено: Авокадо" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Повернути: Авокадо" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".shopping-list .shopping-row")).toHaveCount(6);
  await page.getByRole("button", { name: "Закрити повідомлення" }).click();
  await snapshot("shopping");
  await nav.getByText("Бажання").click();
  await expect(
    page.getByRole("button", { name: "Додати бажання" }),
  ).toBeVisible();
  await snapshot("wishes");
  await nav.getByText("Плани").click();
  await expect(page.getByRole("button", { name: "Додати план" })).toBeVisible();
  await snapshot("plans");
  await page.getByRole("button", { name: "Відкрити налаштування" }).click();
  await expect(page.locator(".sheet-backdrop")).toHaveCSS("opacity", "1");
  await snapshot("settings");
  await page.getByRole("button", { name: "Темна", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Закрити", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-dark.png`,
    fullPage: false,
  });
});
test("320px has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await expect(page.getByRole("navigation")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
