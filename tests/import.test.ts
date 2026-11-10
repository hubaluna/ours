import { describe, it, expect } from "vitest";
import {
  parseMetadata,
  parseIngredient,
  parsePasted,
  publicUrl,
} from "../supabase/functions/_shared/metadata";
import {
  isPublicAddress,
  resolvePublicUrl,
} from "../supabase/functions/_shared/url-safety";
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
    expect(parseIngredient("Сіль за смаком").name).toBe("Сіль за смаком");
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
