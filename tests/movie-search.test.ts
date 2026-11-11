import { it, expect } from "vitest";
import {
  movieSearchTerms,
  enrichMovie,
} from "../supabase/functions/_shared/movie-search";
import { parseMetadata } from "../supabase/functions/_shared/metadata";
import { groceryCategory } from "../supabase/functions/_shared/grocery-category";
it("extracts an actual film title from Ukrainian pages and public video captions", () => {
  expect(movieSearchTerms("Фільм «Початок» 2010 українською онлайн")).toBe(
    "Початок",
  );
  expect(movieSearchTerms("Назва фільму: Інтерстеллар #кіно")).toBe(
    "Інтерстеллар",
  );
  expect(movieSearchTerms("Interstellar – Official Trailer (2014)")).toBe(
    "Interstellar",
  );
});
it("enriches only an exact title match and keeps the original video URL and source credit", async () => {
  const seed = parseMetadata(
    "<title>Початок</title>",
    "https://www.tiktok.com/@demo/video/123",
    "movie",
  );
  const load = async (url: string) => ({
    url,
    html: JSON.stringify(
      url.includes("action=parse")
        ? { parse: { sections: [] } }
        : {
            query: {
              pages: [
                {
                  pageid: 1,
                  index: 1,
                  title: "Початок (фільм)",
                  extract: "Початок — фільм 2010 року.",
                  original: { source: "https://example.com/poster.jpg" },
                },
              ],
            },
          },
    ),
  });
  const result = await enrichMovie(seed, load);
  expect(result.title).toBe("Початок");
  expect(result.year).toBe(2010);
  expect(result.source_url).toBe(seed.source_url);
  expect(result.metadata_url).toContain("wikipedia.org");
  expect(result.image_url).toContain("poster.jpg");
});
it("does not present an unrelated search result as a recognized film", async () => {
  const seed = parseMetadata(
    "<title>Цікаве відео</title>",
    "https://www.tiktok.com/@demo/video/123",
    "movie",
  );
  const result = await enrichMovie(seed, async (url) => ({
    url,
    html: JSON.stringify({
      query: {
        pages: [
          {
            pageid: 2,
            index: 1,
            title: "Інший фільм",
            extract: "Це фільм 2020 року.",
          },
        ],
      },
    }),
  }));
  expect(result.title).toBe(seed.title);
  expect(result.metadata_url).toBeUndefined();
  expect(result.candidates?.length).toBeGreaterThan(0);
});
it("imports a publisher poster and separates recipe instructions from products", () => {
  expect(
    parseMetadata(
      '<title>Початок</title><img itemprop="image" src="/posters/2045.webp">',
      "https://uaserials.my/2045-pochatok.html",
      "movie",
    ).image_url,
  ).toBe("https://uaserials.my/posters/2045.webp");
  const result = parseMetadata(
    '<script type="application/ld+json">' +
      JSON.stringify({
        "@type": "Recipe",
        name: "Рис",
        recipeIngredient: ["200 г рису"],
        recipeInstructions: [
          {
            "@type": "HowToSection",
            itemListElement: [
              { "@type": "HowToStep", text: "Промити рис." },
              { "@type": "HowToStep", text: "Зварити." },
            ],
          },
        ],
      }) +
      "</script>",
    "https://example.com/recipe",
    "recipe",
  );
  expect(result.ingredients).toEqual(["200 г рису"]);
  expect(result.instructions).toEqual(["Промити рис.", "Зварити."]);
});
it.each([
  ["Молоко", "Молочні продукти"],
  ["Куряче філе", "М’ясо та риба"],
  ["200 г рису", "Бакалія"],
  ["Морква", "Овочі та фрукти"],
  ["Пральний порошок", "Побутові товари"],
  ["Мінеральна вода", "Напої"],
  ["Невідомий продукт", "Інше"],
])("recognizes the grocery category for %s", (name, category) =>
  expect(groceryCategory(name)).toBe(category),
);
it("recognizes a series named in a TikTok caption despite Wikipedia disambiguation", async () => {
  const seed = parseMetadata(
    "<title>Оцінюємо серіал «Паперовий будинок» #кіно</title>",
    "https://vt.tiktok.com/ZSpaBkVbj/",
    "movie",
  );
  const result = await enrichMovie(seed, async (url) => ({
    url,
    html: JSON.stringify(
      url.includes("action=parse")
        ? { parse: { sections: [] } }
        : {
            query: {
              pages: [
                {
                  pageid: 9,
                  index: 1,
                  title: "Паперовий будинок (телесеріал)",
                  extract: "Паперовий будинок — іспанський серіал 2017 року.",
                  original: { source: "https://example.com/money-heist.jpg" },
                },
              ],
            },
          },
    ),
  }));
  expect(result.title).toBe("Паперовий будинок");
  expect(result.year).toBe(2017);
  expect(result.metadata_url).toContain("wikipedia.org");
});
it("asks for a film name instead of saving a generic TikTok landing-page title", async () => {
  const seed = parseMetadata(
    "<title>TikTok - Make Your Day</title>",
    "https://vt.tiktok.com/ZSpaBkVbj/",
    "movie",
  );
  const result = await enrichMovie(seed, async () => {
    throw new Error("should not guess a film");
  });
  expect(result.title).toBe("");
  expect(result.candidates).toEqual([]);
});
it("filters dictionary definitions and actor biographies, and respects a known release year", async () => {
  const seed = parseMetadata(
    "<title>Фільм «Початок» 2010 українською</title>",
    "https://uaserials.my/2045-pochatok.html",
    "movie",
  );
  const pages = [
    {
      index: 1,
      pageid: 1,
      title: "Початок",
      extract:
        "Початок — вихідний пункт предмета.\nТе, з чого починається фільм.",
    },
    {
      index: 2,
      pageid: 2,
      title: "Початок (фільм, 1970)",
      extract: "Початок — фільм 1970 року.",
    },
    {
      index: 3,
      pageid: 3,
      title: "Початок (фільм, 2010)",
      extract: "Початок — фільм 2010 року.",
    },
    {
      index: 4,
      pageid: 4,
      title: "Актриса",
      extract: "Актриса — іспанська актриса, відома за роллю в телесеріалі.",
    },
  ];
  const result = await enrichMovie(seed, async (url) => ({
    url,
    html: JSON.stringify(
      url.includes("action=parse")
        ? { parse: { sections: [] } }
        : { query: { pages } },
    ),
  }));
  expect(result.year).toBe(2010);
  expect(result.metadata_url).toContain("curid=3");
  expect(
    result.candidates?.some(
      (c) => c.url.endsWith("curid=1") || c.url.endsWith("curid=4"),
    ),
  ).toBe(false);
});
