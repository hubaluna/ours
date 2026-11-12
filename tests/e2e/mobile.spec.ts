import { test, expect, type Locator, type Page } from "@playwright/test";
const tabs = ["Головна", "Покупки", "Меню", "Кіно", "Бажання", "Календар"];
const nav = (page: Page) =>
  page.getByRole("navigation", { name: "Основна навігація" });
async function choose(page: Page, tab: string) {
  await nav(page).getByRole("button", { name: tab, exact: true }).click();
  await expect(page.locator(".screen-header h1")).toHaveText(
    tab === "Головна" ? "Нове для вас" : tab,
  );
  await expect(
    nav(page).getByRole("button", { name: tab, exact: true }),
  ).toHaveAttribute("aria-current", "page");
}
async function fit(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const shell = document.querySelector(".bottom-nav");
        const buttons = Array.from(
          document.querySelectorAll<HTMLButtonElement>(".bottom-nav > button"),
        );
        if (!shell || buttons.length !== 6) return false;
        const outer = shell.getBoundingClientRect();
        const boxes = buttons.map((button) => button.getBoundingClientRect());
        const labels = buttons.map((button) =>
          button.querySelector(".nav-content > span")?.getBoundingClientRect(),
        );
        return boxes.every(
          (box, index) =>
            box.left >= outer.left - 1 &&
            box.right <= outer.right + 1 &&
            box.width > 30 &&
            (index === 0 || box.left >= boxes[index - 1].right - 1) &&
            Boolean(labels[index] && labels[index]!.width > 0 && labels[index]!.right <= box.right + 1),
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const menu = document.querySelector(".menu-screen");
        if (!menu) return true;
        const toolbar = menu.querySelector(".menu-toolbar");
        const footer = toolbar?.getBoundingClientRect();
        const main = document
          .querySelector("#main-content")!
          .getBoundingClientRect();
        return (
          (!footer || footer.bottom <= main.bottom + 1) &&
          Array.from(menu.querySelectorAll(".meal-row")).every(
            (card) =>
              card.querySelector(".meal-row-actions")!.getBoundingClientRect()
                .bottom <=
              card.getBoundingClientRect().bottom + 1,
          )
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const sheet = document.querySelector<HTMLElement>(".sheet");
        if (!sheet || getComputedStyle(sheet).visibility === "hidden") return true;
        const box = sheet.getBoundingClientRect();
        return box.left >= 8 && box.top >= 8 && box.right <= innerWidth - 8 && box.bottom <= innerHeight - 8;
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const catalog = document.querySelector<HTMLElement>(".recipe-catalog-inline");
        if (!catalog) return true;
        const title = catalog.querySelector<HTMLElement>(".catalog-inline-title");
        if (!title) return true;
        const range = document.createRange();
        range.selectNodeContents(title);
        const text = range.getBoundingClientRect();
        const parent = catalog.getBoundingClientRect();
        return title.getClientRects().length > 0 && text.left >= parent.left && text.right <= parent.right;
      }),
    )
    .toBe(true);
  const bounds = await nav(page).boundingBox(),
    main = await page.locator("#main-content").boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height + 1,
  );
  expect(main!.y + main!.height).toBeLessThanOrEqual(bounds!.y + 1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const content = document.querySelector(".paged-content");
        const rows = content?.querySelector(".paged-rows");
        return (
          !content ||
          !rows ||
          rows.getBoundingClientRect().bottom <=
            content.getBoundingClientRect().bottom + 1 ||
          (getComputedStyle(content).overflowY === "auto" && content.scrollHeight > content.clientHeight)
        );
      }),
    )
    .toBe(true);
}
async function seek(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
}
async function shot(page: Page, name: string) {
  const closeToast = page.getByRole("button", { name: "Закрити повідомлення" });
  if (await closeToast.count()) await closeToast.click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `test-results/screenshots/${test.info().project.name}/${name}.png`,
    fullPage: false,
  });
}
test("six tabs, unseen updates, shopping, movies, calendar and appearance", async ({
  page,
}) => {
  test.setTimeout(90_000);
  let dialog: ReturnType<typeof page.getByRole>;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Нове для вас" }),
  ).toBeVisible();
  await fit(page);
  await shot(page, "home");
  await page.getByText("Інтерстеллар", { exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Закрити", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Нове для вас" }),
  ).toBeVisible();
  await expect(page.getByText("Інтерстеллар", { exact: true })).toHaveCount(0);
  await choose(page, "Покупки");
  await page.getByRole("button", { name: "Додати товар", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Назва товару").fill("Авокадо");
  await shot(page, "add-shopping");
  await dialog.getByRole("button", { name: "Додати до списку" }).click();
  await expect(dialog).not.toBeVisible();
  let item = page.getByRole("checkbox", { name: "Куплено: Авокадо" });
  await seek(page, item);
  await item.click();
  await expect(page.getByRole("button", { name: "Куплено · 1" })).toBeVisible();
  await page.getByRole("button", { name: "Куплено · 1" }).click();
  item = page.getByRole("checkbox", { name: "Повернути: Авокадо" });
  await expect(item).toHaveAttribute("aria-checked", "true");
  await item.click();
  await page.getByRole("button", { name: "Потрібно · 6" }).click();
  await fit(page);
  await expect(page.locator(".paged-rows .shopping-row")).toHaveCount(6);
  await expect(page.locator(".pager")).toHaveCount(0);
  await shot(page, "shopping");
  await choose(page, "Меню");
  await page.getByRole("button", { name: "Згенерувати вечерю" }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Додати до меню" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Додати до меню" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".meal-row")).toHaveCount(1);
  await fit(page);
  await shot(page, "menu");
  await choose(page, "Кіно");
  await page.getByRole("button", { name: "Додати фільм" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Назва", { exact: true }).fill("Наш фільм");
  await dialog.getByLabel("Рік", { exact: true }).fill("2025");
  await expect(dialog.getByLabel("Назва", { exact: true })).toHaveValue(
    "Наш фільм",
  );
  await expect(dialog.getByLabel("Рік", { exact: true })).toHaveValue("2025");
  await dialog.getByRole("button", { name: "Зберегти фільм" }).click();
  await expect(dialog).not.toBeVisible();
  const movie = page.getByRole("heading", { name: "Наш фільм", exact: true });
  await seek(page, movie);
  await movie.click();
  await page.getByRole("button", { name: "Подивились", exact: true }).click();
  const rating = page.getByRole("slider", { name: "Оцінка фільму" });
  await rating.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Зберегти оцінку" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Переглянули", exact: true }).click();
  await expect(movie).toBeVisible();
  await fit(page);
  await shot(page, "movies");
  await choose(page, "Бажання");
  await expect(
    page.getByRole("button", { name: "Додати бажання" }),
  ).toBeVisible();
  await fit(page);
  await shot(page, "wishes");
  await choose(page, "Календар");
  await fit(page);
  await shot(page, "calendar");
  await page.getByRole("button", { name: "Додати план" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Назва", { exact: true }).fill("Кава вдвох");
  await dialog.getByLabel("Увесь день").check();
  await dialog
    .getByRole("button", { name: "Додати план", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Кава вдвох", { exact: true })).toBeVisible();
  if (await page.getByRole("button", { name: "Закрити повідомлення" }).count())
    await page.getByRole("button", { name: "Закрити повідомлення" }).click();
  await page.getByRole("button", { name: "Відкрити налаштування" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Сповіщення" })).toBeVisible();
  await expect(dialog.getByText("Підключіть акаунт і спільний простір, щоб увімкнути push.")).toBeVisible();
  await shot(page, "settings");
  await dialog.getByRole("button", { name: "Темна", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await dialog.getByRole("button", { name: "Закрити", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await fit(page);
  await shot(page, "dark");
  expect(errors).toEqual([]);
});
for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 664 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
])
  test(`all six screens fit ${viewport.width}x${viewport.height} without document scroll`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Нове для вас" }),
    ).toBeVisible();
    for (const tab of tabs) {
      await choose(page, tab);
      await fit(page);
      if (tab === "Покупки")
        await shot(page, `shopping-${viewport.width}x${viewport.height}`);
    }
    await shot(page, `viewport-${viewport.width}x${viewport.height}`);
  });
test("recipe text imports selected ingredients with editable preview", async ({
  page,
}) => {
  await page.goto("/");
  await choose(page, "Покупки");
  await page.getByRole("button", { name: "Імпорт рецепта" }).click();
  await page
    .getByRole("button", { name: "Вставити текст зі сторінки" })
    .click();
  await page
    .getByLabel("Інгредієнти · кожен із нового рядка")
    .fill("200 г рису\n1 л води");
  await page.getByRole("button", { name: /Розібрати текст/ }).click();
  await expect(page.getByLabel("Інгредієнт 1", { exact: true })).toHaveValue(
    "рису",
  );
  await expect(page.getByLabel("Кількість 1", { exact: true })).toHaveValue(
    "200",
  );
  await page.getByRole("button", { name: "Додати 2 до покупок" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Потрібно · 6" }),
  ).toBeVisible();
  await fit(page);
});

test("grocery categories are automatic and additional fields stay collapsed", async ({
  page,
}) => {
  await page.goto("/");
  await choose(page, "Покупки");
  await page.getByRole("button", { name: "Додати товар", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Назва товару").fill("Індиче філе");
  await expect(
    dialog.getByText("М’ясо, риба та яйця · визначено автоматично"),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("Кількість", { exact: true }),
  ).not.toBeVisible();
  await dialog.getByText("Додатково", { exact: true }).click();
  await dialog.getByLabel("Кількість", { exact: true }).fill("2");
  await dialog.getByRole("button", { name: "Додати до списку" }).click();
  await expect(dialog).not.toBeVisible();
  const item = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ours-demo-v1")!).shopping.find(
      (i: { name: string }) => i.name === "Індиче філе",
    ),
  );
  expect(item.category).toBe("М’ясо, риба та яйця");
  expect(item.quantity).toBe(2);
});

test("the catalog is the default menu view and card plus is idempotent", async ({
  page,
}) => {
  await page.goto("/");
  await choose(page, "Меню");
  const catalog = page.getByRole("region", { name: "Каталог рецептів" });
  await expect(catalog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await shot(page, "menu-catalog");
  const originalViewport = page.viewportSize()!;
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 664 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await fit(page);
  }
  await page.setViewportSize(originalViewport);
  await catalog.getByLabel("Пошук страви або продукту").fill("Рис");
  const title = await catalog.locator(".catalog-card h3").nth(1).innerText();
  const add = catalog.getByRole("button", {
    name: `Додати до меню · ${title}`,
  });
  await add.click();
  await expect(
    catalog.getByRole("button", { name: `Уже в меню · ${title}` }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Готуємо · 1" }).click();
  const rice = page.locator(".meal-row").filter({
    has: page.getByRole("heading", { name: title, exact: true }),
  });
  await expect(rice).toHaveCount(1);
  await rice.getByRole("button", { name: `Збільшити порції · ${title}` }).click();
  await expect(rice.getByRole("status")).toContainText("2");
  await page.getByRole("button", { name: "Страви", exact: true }).click();
  await expect(
    catalog.getByRole("button", { name: `Уже в меню · ${title}` }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Готуємо · 1" }).click();
  await expect(rice.getByRole("status")).toContainText("2");
  const data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ours-demo-v1")!),
  );
  expect(data.mealPlan).toHaveLength(1);
  expect(data.mealPlan[0].servings).toBe(2);
  await page.getByRole("button", { name: `Прибрати з меню · ${title}` }).click();
  await expect(page.locator(".meal-row")).toHaveCount(0);
  await fit(page);
});

test("a private recipe joins the shared catalog and scales automatically into shopping", async ({
  page,
}) => {
  await page.goto("/");
  await choose(page, "Меню");
  await page
    .getByRole("button", { name: "Додати рецепт", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Назва страви").fill("Наш рис");
  await dialog.getByLabel("Тип страви").selectOption("side");
  await dialog
    .getByLabel("Фото готової страви · HTTPS-посилання")
    .fill("https://example.com/rice.jpg");
  await dialog
    .getByLabel("Продукти · кожен із нового рядка")
    .fill("200 г рису\n1 шт. морква");
  await dialog
    .getByLabel("Рецепт · кожен крок із нового рядка")
    .fill("Промийте рис.\nЗваріть із морквою.");
  await dialog.getByRole("button", { name: "Зберегти рецепт" }).click();
  const catalog = page.getByRole("region", { name: "Каталог рецептів" });
  await expect(catalog).toBeVisible();
  await catalog.getByLabel("Пошук страви або продукту").fill("Наш рис");
  await catalog
    .locator(".catalog-card")
    .filter({
      has: page.getByRole("heading", { name: "Наш рис", exact: true }),
    })
    .locator(".catalog-card-main")
    .click();
  const recipeDialog = page.getByRole("dialog");
  await expect(
    recipeDialog.getByText("Зваріть із морквою.", { exact: true }),
  ).toBeVisible();
  await recipeDialog
    .getByRole("button", { name: "Збільшити порції · Кількість порцій" })
    .click();
  await expect(recipeDialog.locator(".scaled-ingredients")).toContainText("400 г");
  await recipeDialog.getByRole("button", { name: "Додати до меню" }).click();
  await expect(recipeDialog).not.toBeVisible();
  await page.getByRole("button", { name: "Готуємо · 1" }).click();
  await expect(page.locator(".meal-row h2")).toHaveText("Наш рис");
  const data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ours-demo-v1")!),
  );
  expect(data.mealPlan).toHaveLength(1);
  expect(
    data.shopping
      .filter((i: { menu_key?: string }) => i.menu_key)
      .map((i: { quantity: number }) => i.quantity),
  ).toEqual([400, 2]);
  await page.getByRole("button", { name: "Прибрати з меню · Наш рис" }).click();
  await expect(page.locator(".meal-row")).toHaveCount(0);
  expect(
    (
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("ours-demo-v1")!),
      )
    ).shopping.filter((i: { menu_key?: string }) => i.menu_key),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Страви", exact: true }).click();
  await catalog
    .locator(".catalog-card")
    .filter({
      has: page.getByRole("heading", { name: "Наш рис", exact: true }),
    })
    .locator(".catalog-card-main")
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Редагувати рецепт" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Видалити", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Так, видалити" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(catalog).toBeVisible();
  await catalog.getByLabel("Пошук страви або продукту").fill("Наш рис");
  await expect(catalog.locator(".catalog-card")).toHaveCount(0);
  await choose(page, "Покупки");
  await fit(page);
});

test("a TikTok video recipe can omit written steps and opens its source", async ({
  page,
}) => {
  await page.goto("/");
  await choose(page, "Меню");
  await page
    .getByRole("button", { name: "Додати рецепт", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Назва страви").fill("Відео рецепт");
  await dialog
    .getByLabel("Фото готової страви · HTTPS-посилання")
    .fill("https://example.com/video-recipe.jpg");
  await dialog
    .getByLabel("Продукти · кожен із нового рядка")
    .fill("3 ст. л. цукру");
  await dialog
    .getByLabel("Джерело рецепта")
    .fill("https://www.tiktok.com/@cook/video/123456789");
  await dialog.getByRole("button", { name: "Зберегти рецепт" }).click();
  const catalog = page.getByRole("region", { name: "Каталог рецептів" });
  await catalog.getByLabel("Пошук страви або продукту").fill("Відео рецепт");
  await catalog
    .locator(".catalog-card")
    .filter({
      has: page.getByRole("heading", { name: "Відео рецепт", exact: true }),
    })
    .locator(".catalog-card-main")
    .click();
  const videoDetails = page.getByRole("dialog");
  const watch = videoDetails.getByRole("link", { name: "Дивитися, як готувати" });
  await expect(watch).toHaveAttribute(
    "href",
    "https://www.tiktok.com/@cook/video/123456789",
  );
  await expect(watch).toHaveAttribute("target", "_blank");
  await expect(videoDetails.getByText("Письмових кроків немає.")).toBeVisible();
  await videoDetails.getByRole("button", { name: "Додати до меню" }).click();
  await expect(videoDetails).not.toBeVisible();
  await page.getByRole("button", { name: "Готуємо · 1" }).click();
  await expect(page.locator(".meal-row h2")).toHaveText("Відео рецепт");
  const menuData = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ours-demo-v1")!),
  );
  expect(menuData.mealPlan).toHaveLength(1);
  expect(
    menuData.shopping.some((item: { menu_key?: string }) => item.menu_key),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Прибрати з меню · Відео рецепт" })
    .click();
  await expect(page.locator(".meal-row")).toHaveCount(0);
  await fit(page);
});

test("calendar shows upcoming events and countdown when today is empty", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("ours-demo-v1"))).not.toBeNull();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("ours-demo-v1")!);
    const date = new Date();
    date.setDate(date.getDate() + 2);
    const day = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Kyiv",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    data.events = [
      {
        id: "future-test",
        couple_id: "demo-couple",
        title: "Найближча зустріч",
        date: day,
        time: null,
        all_day: true,
        location: "",
        description: "",
        category: "Інше",
        created_by: "demo-anna",
        created_at: new Date().toISOString(),
      },
    ];
    localStorage.setItem("ours-demo-v1", JSON.stringify(data));
  });
  await page.reload();
  await choose(page, "Календар");
  await expect(
    page.getByRole("heading", { name: /Найближчі події/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Найближча зустріч", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Через 2 дні/)).toBeVisible();
  await fit(page);
});

test("calendar accepts a public HTTPS link and shows it in event details", async ({ page }) => {
  await page.goto("/");
  await choose(page, "Календар");
  await page.getByRole("button", { name: "Додати план" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Назва").fill("Посилання на подію");
  await expect(dialog.getByLabel("Місце", { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("Категорія", { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("Опис", { exact: true })).not.toBeVisible();
  await dialog.getByText("Довідково", { exact: true }).click();
  await dialog.getByLabel("Опис", { exact: true }).fill("Забронювати два квитки біля сцени");
  await dialog.getByLabel("Посилання · необов’язково").fill("http://example.com/event");
  await dialog.getByRole("button", { name: "Додати план" }).click();
  await expect(dialog.getByRole("alert")).toContainText("HTTPS");
  await dialog.getByLabel("Посилання · необов’язково").fill("https://example.com/event");
  await dialog.getByRole("button", { name: "Додати план" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Посилання на подію" }).click();
  await expect(dialog.getByText("Забронювати два квитки біля сцени")).not.toBeVisible();
  await dialog.getByRole("button", { name: "Довідково" }).click();
  await expect(dialog.getByText("Забронювати два квитки біля сцени")).toBeVisible();
  await expect(page.getByRole("link", { name: "Відкрити посилання" })).toHaveAttribute("href", "https://example.com/event");
});

test("55 recipes, filters, ranked pairings, one-click pair and portion changes survive reload", async ({
  page,
}) => {
  await page.goto("/");
  await choose(page, "Меню");
  await page.getByRole("button", { name: "Страви", exact: true }).click();
  const catalog = page.getByRole("region", { name: "Каталог рецептів" });
  await expect(catalog.locator(".catalog-count")).toContainText("55 рецептів");
  await expect(catalog.locator(".catalog-card")).toHaveCount(55);
  await expect(catalog.getByRole("heading", { name: "Каталог рецептів" })).toHaveCount(0);
  await expect(catalog.getByText("Пошук страви або продукту", { exact: true })).toHaveCount(0);
  await expect(catalog.getByLabel("Пошук страви або продукту")).toBeVisible();
  const firstTitle = await catalog.locator(".catalog-card h3").first().innerText();
  await expect(
    catalog.getByRole("button", { name: `Додати до меню · ${firstTitle}` }),
  ).toBeVisible();
  await catalog.getByRole("button", { name: "Гарніри", exact: true }).click();
  await expect(catalog.locator(".catalog-count")).toContainText("10 рецептів");
  const scrollTop = await catalog.evaluate((element) => element.scrollTop);
  await catalog.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => catalog.evaluate((element) => element.scrollTop)).toBeGreaterThan(scrollTop);
  await expect(catalog.locator(".catalog-card").last()).toBeInViewport();
  await catalog.evaluate((element) => { element.scrollTop = 0; });

  await catalog
    .getByRole("button", { name: "М’ясо та риба", exact: true })
    .click();
  await expect(catalog.locator(".catalog-count")).toContainText("18 рецептів");
  await catalog.getByLabel("Пошук страви або продукту").fill("кисло");
  await expect(catalog.locator(".catalog-card")).toHaveCount(1);
  await catalog.locator(".catalog-card-main").click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Гарніри, які пасують" }),
  ).toBeVisible();
  await expect(dialog.locator(".pairing-card h4").first()).toContainText("Рис");
  await dialog
    .getByRole("button", { name: "Збільшити порції · Кількість порцій" })
    .click();
  await dialog
    .locator(".pairing-card")
    .first()
    .getByRole("button", { name: "Додати пару" })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Готуємо · 2" })).toBeVisible();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ours-demo-v1")!),
  );
  expect(before.mealPlan).toHaveLength(2);
  expect(
    before.mealPlan.every((i: { servings: number }) => i.servings === 2),
  ).toBe(true);
  expect(
    new Set(
      before.shopping
        .filter((i: { menu_key?: string }) => i.menu_key)
        .map((i: { menu_key: string }) => i.menu_key),
    ).size,
  ).toBe(
    before.shopping.filter((i: { menu_key?: string }) => i.menu_key).length,
  );
  await page.reload();
  await choose(page, "Меню");
  await page.getByRole("button", { name: "Готуємо · 2" }).click();
  await expect(page.getByRole("button", { name: "Готуємо · 2" })).toBeVisible();
  const rice = page
    .locator(".meal-row")
    .filter({ has: page.getByRole("heading", { name: "Рис", exact: true }) });
  await seek(page, rice);
  await rice.getByRole("button", { name: "Рецепт", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "До цього гарніру пасуватиме" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Зберегти порції" }).click();
  await expect(dialog).not.toBeVisible();
  await rice
    .getByRole("button", { name: "Збільшити порції · Рис", exact: true })
    .click();
  await expect(rice.getByRole("status")).toContainText("3");
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ours-demo-v1")!),
  );
  expect(after.mealPlan).toHaveLength(2);
  expect(
    after.mealPlan.find(
      (i: { catalog_id: string }) => i.catalog_id === "ours55/rice",
    ).servings,
  ).toBe(3);
  await fit(page);
  await shot(page, "catalog-pair-menu");
});

test("a salad alone fits every compact viewport and uses its matching image", async ({
  page,
}) => {
  await page.goto("/");
  await choose(page, "Меню");
  await page
    .getByRole("button", { name: "Страви", exact: true })
    .click();
  const catalog = page.getByRole("region", { name: "Каталог рецептів" });
  await catalog.getByLabel("Пошук страви або продукту").fill("Зелений салат");
  await catalog.locator(".catalog-card-main").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Додати до меню" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Готуємо · 1" }).click();
  await expect(page.locator(".meal-row img")).toHaveAttribute(
    "src",
    /green_salad-photo\.jpg$/,
  );
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 664 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".meal-row")).toHaveCount(1);
    await fit(page);
    expect(
      await page
        .locator(".meal-row img")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    ).toBe(true);
    await shot(page, `salad-menu-${viewport.width}x${viewport.height}`);
  }
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("ours-demo-v1")!).shopping.some(
        (i: { name: string; menu_key?: string }) =>
          i.menu_key && i.name === "Авокадо",
      ),
    ),
  ).toBe(false);
});

test("save controls stay at the top before and after scrolling long forms", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");
  for (const [tab, add, save] of [
    ["Кіно", "Додати фільм", "Зберегти фільм"],
    ["Меню", "Додати рецепт", "Зберегти рецепт"],
    ["Бажання", "Додати бажання", "Зберегти бажання"],
    ["Календар", "Додати план", "Додати план"],
    ["Покупки", "Додати товар", "Додати до списку"],
  ]) {
    await choose(page, tab);
    await page.getByRole("button", { name: add, exact: true }).click();
    const dialog = page.getByRole("dialog"),
      button = dialog.getByRole("button", { name: save, exact: true });
    await expect(button).toBeInViewport();
    await dialog.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect.poll(async () => {
      const box = await button.boundingBox(),
        header = await dialog.locator(".sheet-header").boundingBox();
      return Boolean(
        box &&
          header &&
          box.y >= header.y + header.height - 2 &&
          box.y + box.height < 664,
      );
    }).toBe(true);
    await dialog.getByRole("button", { name: "Закрити", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
});

test("dialogs keep all four edges visible on small screens and above the keyboard", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 664 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [tab, add] of [
      ["Покупки", "Додати товар"],
      ["Кіно", "Додати фільм"],
      ["Меню", "Додати рецепт"],
      ["Бажання", "Додати бажання"],
      ["Календар", "Додати план"],
    ]) {
      await choose(page, tab);
      await page.getByRole("button", { name: add, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect.poll(() => dialog.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return box.left >= 16 && box.right <= innerWidth - 16 &&
          box.top >= 20 && box.bottom <= innerHeight - 20 &&
          el.scrollWidth <= el.clientWidth + 1;
      })).toBe(true);
      if (tab === "Календар" && viewport.width === 390) {
        await page.screenshot({ path: test.info().outputPath("calendar-dialog.png") });
      }
      await dialog.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await expect.poll(() => dialog.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return box.top >= 20 && box.bottom <= innerHeight - 20;
      })).toBe(true);
      await dialog.getByRole("button", { name: "Закрити", exact: true }).click();
      await expect(dialog).not.toBeVisible();
    }
  }
  await page.setViewportSize({ width: 390, height: 664 });
  await choose(page, "Календар");
  await page.getByRole("button", { name: "Додати план", exact: true }).click();
  // Mobile keyboards resize and shift the visual viewport without resizing the document.
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 290 },
      offsetTop: { configurable: true, value: 60 },
    });
    viewport.dispatchEvent(new Event("resize"));
  });
  const dialog = page.getByRole("dialog");
  await expect.poll(() => dialog.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return box.top >= 80 && box.bottom <= 330 && box.left >= 16 &&
      box.right <= 374 && el.scrollWidth <= el.clientWidth + 1;
  })).toBe(true);
  await dialog.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(dialog.locator("summary")).toBeInViewport();
});
