import { describe, it, expect } from "vitest";
import {
  parseMetadata,
  parseArticleRecipe,
  tiktokRecipeCaption,
  parseIngredient,
  parsePasted,
  publicUrl,
} from "../supabase/functions/_shared/metadata";
import {
  isPublicAddress,
  resolvePublicUrl,
} from "../supabase/functions/_shared/url-safety";
import { tiktokMetadata } from "../supabase/functions/_shared/movie-search";
import { isTikTokVideoUrl } from "../src/lib/recipe-source";
describe("Link metadata and safe imports", () => {
  it("extracts Movie JSON-LD, year, genre, title and poster without executing scripts", () => {
    const r = parseMetadata(
      `<title>Fallback</title><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Movie","name":"Фільм &amp; вечір","datePublished":"2024-02-01","genre":["Драма","Комедія"],"description":"<b>Короткий</b> опис","image":{"url":"/poster.jpg"}}]}</script><script>throw new Error('must not run')</script>`,
      "https://example.com/movie",
      "movie",
    );
    expect(r.title).toBe("Фільм & вечір");
    expect(r.year).toBe(2024);
    expect(r.genres).toEqual(["Драма", "Комедія"]);
    expect(r.description).toBe("Короткий опис");
    expect(r.image_url).toBe("https://example.com/poster.jpg");
  });
  it("reads OG regardless of attribute order and leaves unknown movie data blank", () => {
    const r = parseMetadata(
      `<meta content='A &amp; B' property='og:title'><meta content='/a.png' name='twitter:image'><meta name='description' content='A description'>`,
      "https://example.com/trailer",
      "movie",
    );
    expect(r.title).toBe("A & B");
    expect(r.image_url).toBe("https://example.com/a.png");
    expect(r.year).toBe(null);
    expect(r.genres).toEqual([]);
  });
  it("extracts Product offers without pretending foreign currency is UAH", () => {
    const r = parseMetadata(
      '<script type="application/ld+json">{"@type":"Product","name":"Чашка","offers":{"price":"20.50","priceCurrency":"USD"}}</script>',
      "https://example.com/cup",
      "wish",
    );
    expect(r.price).toBe(20.5);
    expect(r.currency).toBe("USD");
  });
  it("reads nested recipes and preserves ingredient lines for review", () => {
    const r = parseMetadata(
      '<script type="application/ld+json">[{"@type":"WebPage","mainEntity":{"@type":"Recipe","name":"Різото","recipeIngredient":["200 г рису","1 л бульйону"]}}]</script>',
      "https://example.com/recipe",
      "recipe",
    );
    expect(r.ingredients).toEqual(["200 г рису", "1 л бульйону"]);
    expect(r.title).toBe("Різото");
  });
  it("extracts ingredients and ordered cooking paragraphs from article headings", () => {
    const source = "https://example.com/pancakes";
    const html = `<main><div class="article-text"><h2>Інгредієнти</h2><p>Потрібно:</p><ul><li>250 мл молока</li><li>3 ст. л. цукру</li><li>170 г борошна</li></ul><h2>Процес приготування</h2><p>Змішайте молоко та яйця.</p><p><a class="read-also">Читайте також: інша страва</a>Додайте борошно й перемішайте.</p><p>Смажте на сухій пательні.</p><h2>Поради</h2><p>Інший розділ не імпортується.</p></div></main>`;
    const metadata = parseArticleRecipe(
      html,
      parseMetadata(html, source, "recipe"),
    );
    expect(metadata.ingredients).toEqual([
      "250 мл молока",
      "3 ст. л. цукру",
      "170 г борошна",
    ]);
    expect(metadata.instructions).toEqual([
      "Змішайте молоко та яйця.",
      "Додайте борошно й перемішайте.",
      "Смажте на сухій пательні.",
    ]);
  });
  it("reads only explicitly labeled ingredients from a TikTok caption", () => {
    const source = "https://www.tiktok.com/@cook/video/123";
    const caption =
      "Млинці ВЖЕ з начинкою😍 Швидко й смачно☺️ Інгредієнти: Яйця 3 шт Цукор 3 ст.л. Сіль 1 ч.л. з гіркою Олія 3 ст.л. Молоко 500 г Борошно Амбар 200 г Ковбаса 100 г Твердий сир 100 г Кріп 1 ст.л. Смачного 🤗";
    const seed = parseMetadata(
      `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ video: { desc: caption, video: { cover: "https://cdn.example.com/chops.jpg" } } })}</script>`,
      source,
      "recipe",
    );
    const metadata = tiktokRecipeCaption(
      tiktokMetadata(
        `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ video: { desc: caption, video: { cover: "https://cdn.example.com/chops.jpg" } } })}</script>`,
        source,
        seed,
      ),
    );
    expect(metadata.title).toBe("Млинці ВЖЕ з начинкою");
    expect(metadata.ingredients).toHaveLength(9);
    expect(metadata.ingredients[0]).toBe("Яйця — 3 шт");
    expect(metadata.ingredients[2]).toBe("Сіль — 1 ч.л.");
    expect(metadata.instructions).toEqual([]);
    expect(metadata.image_url).toBe("https://cdn.example.com/chops.jpg");
    expect(metadata.description).toContain("Смачного");
    expect(isTikTokVideoUrl(source)).toBe(true);
    expect(isTikTokVideoUrl("https://www.tiktok.com/@cook/")).toBe(false);
    expect(isTikTokVideoUrl("https://not-tiktok.com/@cook/video/123")).toBe(
      false,
    );
  });
  it("falls back from malformed JSON-LD and rejects unsafe images", () => {
    const r = parseMetadata(
      '<meta property="og:title" content="Ідея"><meta property="og:image" content="javascript:alert(1)"><script type="application/ld+json">{bad}</script>',
      "https://example.com",
      "wish",
    );
    expect(r.title).toBe("Ідея");
    expect(r.image_url).toBe("");
  });
  it("parses Ukrainian quantities, fractions and text without losing unfamiliar units", () => {
    expect(parseIngredient("200 г рису")).toMatchObject({
      name: "рису",
      quantity: 200,
      unit: "г",
    });
    expect(parseIngredient("Молоко — 1 л")).toMatchObject({
      name: "Молоко",
      quantity: 1,
      unit: "л",
    });
    expect(parseIngredient("½ л молока")).toMatchObject({
      quantity: 0.5,
      unit: "л",
    });
    expect(parseIngredient("1½ л молока")).toMatchObject({
      quantity: 1.5,
      unit: "л",
    });
    expect(parseIngredient("2 tbsp oil").name).toBe("2 tbsp oil");
    expect(parseIngredient("2 tbsp oil")).toMatchObject({
      quantity: null,
      unit: "за рецептом",
    });
    expect(parseIngredient("3 ст. л. цукру")).toMatchObject({
      quantity: null,
      unit: "за рецептом",
    });
    expect(parseIngredient("170 гр борошна.")).toMatchObject({
      name: "борошна",
      quantity: 170,
      unit: "г",
    });
    expect(parseIngredient("Сіль за смаком")).toMatchObject({
      name: "Сіль",
      quantity: null,
      unit: "за смаком",
    });
  });
  it("supports a pasted recipe with no external infrastructure", () => {
    expect(
      parsePasted("200 г рису\n1 л води", "", "recipe").ingredients,
    ).toHaveLength(2);
  });
  it.each([
    "http://example.com",
    "https://user:pass@example.com",
    "https://127.0.0.1",
    "https://2130706433",
    "https://[::1]",
    "https://localhost",
    "https://thing.local",
    "https://example.com:8080",
  ])("rejects unsafe URL %s", (url) => expect(publicUrl(url)).toBe(""));
  it.each([
    "127.0.0.1",
    "10.2.3.4",
    "172.20.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("rejects internal DNS answer %s", (ip) =>
    expect(isPublicAddress(ip)).toBe(false),
  );
  it("accepts real public IP answers and rejects mixed or rebound DNS", async () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
    await expect(
      resolvePublicUrl("https://example.com", async () => [
        "8.8.8.8",
        "127.0.0.1",
      ]),
    ).rejects.toThrow("UNSAFE_ADDRESS");
    await expect(
      resolvePublicUrl("https://example.com", async () => []),
    ).rejects.toThrow("UNSAFE_ADDRESS");
    expect(
      (await resolvePublicUrl("https://example.com", async () => ["8.8.8.8"]))
        .addresses,
    ).toEqual(["8.8.8.8"]);
  });
});
