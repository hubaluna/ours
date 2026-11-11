import { test, expect, type Page } from "@playwright/test";
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
        const menu = document.querySelector(".menu-screen");
        if (!menu) return true;
        const mode = menu.querySelector(".segmented")!.getBoundingClientRect();
        const grid = menu.querySelector(".menu-grid")!.getBoundingClientRect();
        const footer = menu
          .querySelector(".menu-footer")!
          .getBoundingClientRect();
        const main = document
          .querySelector("#main-content")!
          .getBoundingClientRect();
        return (
          grid.top >= mode.bottom - 1 &&
          footer.bottom <= main.bottom + 1 &&
          Array.from(menu.querySelectorAll(".menu-course")).every(
            (card) =>
              card.querySelector(".course-actions")!.getBoundingClientRect()
                .bottom <=
              card.getBoundingClientRect().bottom + 1,
          )
        );
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
            content.getBoundingClientRect().bottom + 1
        );
      }),
    )
    .toBe(true);
}
async function seek(page: Page, locator: ReturnType<Page["getByRole"]>) {
  for (let i = 0; i < 12 && (await locator.count()) === 0; i++) {
    const next = page.getByRole("button", { name: "Наступна сторінка" });
    if (!(await next.isEnabled())) break;
    await next.click();
  }
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
  let dialog = page.getByRole("dialog");
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
  await expect(page.locator(".shopping-row")).toHaveCount(6);
  await shot(page, "shopping");
  await choose(page, "Меню");
  const dinner = await page.locator(".menu-course h2").allTextContents();
  await page.getByRole("button", { name: "Згенерувати вечерю" }).click();
  expect(await page.locator(".menu-course h2").allTextContents()).not.toEqual(
    dinner,
  );
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
  await page.getByRole("button", { name: "8", exact: true }).click();
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
    page.getByRole("button", { name: "Потрібно · 7" }),
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
    dialog.getByText("М’ясо та риба · визначено автоматично"),
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
  expect(item.category).toBe("М’ясо та риба");
  expect(item.quantity).toBe(2);
});

test("a complete recipe is selectable, readable and adds all products atomically", async ({
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
  await expect(dialog).not.toBeVisible();
  const card = page.locator(".menu-course").filter({
    has: page.getByRole("heading", { name: "Наш рис", exact: true }),
  });
  await expect(card.getByRole("combobox")).toHaveValue("Наш рис");
  await card.getByRole("button", { name: "Рецепт", exact: true }).click();
  await expect(
    page.getByText("Зваріть із морквою.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Продукти", exact: true })
    .click();
  await page.getByRole("button", { name: "Усі продукти до покупок" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await choose(page, "Покупки");
  await expect(
    page.getByRole("button", { name: "Потрібно · 7" }),
  ).toBeVisible();
  const ingredients = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ours-demo-v1")!).shopping.filter(
      (i: { name: string }) => ["рису", "морква"].includes(i.name),
    ),
  );
  expect(ingredients).toHaveLength(2);
  expect(ingredients.map((i: { category: string }) => i.category)).toEqual([
    "Бакалія",
    "Овочі та фрукти",
  ]);
  await choose(page, "Меню");
  await page
    .getByRole("button", { name: "Повноцінна страва", exact: true })
    .click();
  await expect(page.locator(".menu-course")).toHaveCount(1);
  await fit(page);
});

test("calendar shows upcoming events and countdown when today is empty", async ({
  page,
}) => {
  await page.goto("/");
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

test("a complete dish photo card fits every compact viewport", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("ours-demo-v1")!);
    data.recipes = [
      {
        id: "photo-recipe",
        couple_id: "demo-couple",
        title: "Плов із фото",
        category: "main",
        image_url: "https://example.com/plov.jpg",
        source_url: "",
        ingredients: ["200 г рису"],
        instructions: ["Зваріть рис."],
        added_by: "demo-anna",
        created_at: new Date().toISOString(),
      },
    ];
    localStorage.setItem("ours-demo-v1", JSON.stringify(data));
    localStorage.setItem(
      "ours-menu-demo-anna",
      JSON.stringify({
        side: "Картопляне пюре",
        protein: "Курка з травами",
        salad: "Огірок, помідор і зелень",
        main: "Плов із фото",
      }),
    );
  });
  await page.reload();
  await choose(page, "Меню");
  await page
    .getByRole("button", { name: "Повноцінна страва", exact: true })
    .click();
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 664 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".menu-course")).toHaveCount(1);
    await fit(page);
  }
});
