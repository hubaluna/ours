import { it, expect } from "vitest";
import { vi } from "vitest";
import {
  movieSearchTerms,
  movieTitleFromUrl,
  movieYearFromUrl,
  isSeriesUrl,
  enrichMovie,
  tiktokMetadata,
} from "../supabase/functions/_shared/movie-search";
import { parseMetadata } from "../supabase/functions/_shared/metadata";
import { groceryCategory } from "../supabase/functions/_shared/grocery-category";
import {
  needsClientMovieRefresh,
  resolveMovieClientSide,
} from "../src/lib/client-movie-search";
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
  ["Молоко", "Молочне"],
  ["Куряче філе", "М’ясо, риба та яйця"],
  ["200 г рису", "Крупи, макарони та бакалія"],
  ["Морква", "Овочі та фрукти"],
  ["Пральний порошок", "Побутове й гігієна"],
  ["Мінеральна вода", "Напої"],
  ["Snickers", "Солодощі"],
  ["Bounty батончик", "Солодощі"],
  ["Kinder шоколад", "Солодощі"],
  ["Шоколад чорний", "Солодощі"],
  ["Цукерки", "Солодощі"],
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
it("cleans Ukrainian streaming SEO titles, extracts year & alternate title, and guesses slugs on blocked sites", () => {
  const uafix = parseMetadata(
    `<title>Серіал Самозванка (2026) дивитися онлайн українською всі серії безкоштовно в HD якості!</title><meta property="og:description" content="Дивитися нові серії серіалу Самозванка / Phony (2026) українською онлайн!">`,
    "https://uafix.net/serials/samozvanka/",
    "movie",
  );
  expect(uafix.title).toBe("Самозванка");
  expect(uafix.alternate_title).toBe("Phony");
  expect(uafix.year).toBe(2026);
  expect(uafix.image_url).toBe("");

  expect(
    movieTitleFromUrl("https://uakino.best/filmy/genre_adventure/36211-fanni.html"),
  ).toEqual(["Фанні", "fanny", "fanni"]);
  expect(movieTitleFromUrl("https://uafix.net/serials/samozvanka/")).toEqual([
    "Самозванка",
    "samozvanka",
  ]);
  expect(
    movieTitleFromUrl("https://uaserials.com/12861-nichna-zmina-2025.html"),
  ).toEqual(["Нічна зміна", "nichna zmina"]);
  expect(
    movieYearFromUrl("https://uaserials.com/12861-nichna-zmina-2025.html"),
  ).toBe(2025);
  expect(movieTitleFromUrl("https://vt.tiktok.com/ZSpVxxHh1/")).toEqual([]);
});
it("preserves TikTok video cover and clears landing title even when video caption is empty", () => {
  const html = `<title>TikTok - Make Your Day</title><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
    __DEFAULT_SCOPE__: {
      "webapp.video-detail": {
        itemInfo: {
          itemStruct: {
            id: "7706960739558329607",
            desc: "",
            video: { cover: "https://cdn.example.com/tt-cover.jpg" },
          },
        },
      },
    },
  })}</script>`;
  const seed = parseMetadata(
    html,
    "https://www.tiktok.com/@kisserteacher/video/7706960739558329607",
    "movie",
  );
  const meta = tiktokMetadata(html, seed.source_url, seed);
  expect(meta.title).toBe("");
  expect(meta.image_url).toBe("https://cdn.example.com/tt-cover.jpg");
  expect(meta.provider).toBe("TikTok");
});
it("filters out wrong decades and matches 2025/2026 films via year and alternateName", async () => {
  const seed = parseMetadata(
    `<script type="application/ld+json">${JSON.stringify({
      "@type": "Movie",
      name: "Нічна зміна",
      alternateName: "Heldin",
      datePublished: "2025",
      image: "https://uaserials.com/posters/12861.jpg",
      description: "Медсестра Флорія Лінд працює в хірургічному відділенні швейцарської лікарні у нічну зміну.",
    })}</script>`,
    "https://uaserials.com/12861-nichna-zmina-2025.html",
    "movie",
  );
  const res = await enrichMovie(seed, async (url) => {
    if (url.includes("uk.wikipedia.org/w/api.php") && url.includes("action=query")) {
      return {
        url,
        html: JSON.stringify({
          query: {
            pages: [
              {
                pageid: 1,
                index: 1,
                title: "Нічна зміна (фільм, 1990)",
                extract: "Нічна зміна — фільм жахів 1990 року.",
              },
              {
                pageid: 2,
                index: 2,
                title: "Нічна зміна (фільм, 1982)",
                extract: "Нічна зміна — комедійний фільм 1982 року.",
              },
              {
                pageid: 3,
                index: 3,
                title: "Нічна зміна (фільм, 2025)",
                extract: "Нічна зміна — драматичний фільм 2025 року.",
              },
            ],
          },
        }),
      };
    }
    if (url.includes("action=parse")) return { url, html: JSON.stringify({ parse: { sections: [] } }) };
    return { url, html: "[]" };
  });
  expect(res.title).toBe("Нічна зміна");
  expect(res.year).toBe(2025);
  expect(res.image_url).toBe("https://uaserials.com/posters/12861.jpg");
  expect(res.metadata_url).toContain("curid=3");
  expect(res.candidates?.map((c) => c.year)).toEqual([2025]);
});
it("resolves movie links client-side cleanly for TikTok, Cloudflare-blocked sites, uaserials 2025, and uafix 2026", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.includes("api.microlink.io") && u.includes("tiktok.com")) {
      return new Response(
        JSON.stringify({
          status: "success",
          data: {
            url: "https://www.tiktok.com/@kisserteacher/video/7706960739558329607?_r=1",
            title: "ДімаСвятов (@kisserteacher) on TikTok",
            description: "TikTok PWA",
            image: { url: "https://cdn.example.com/tt-thumb.jpg" },
          },
        }),
        { status: 200 },
      );
    }
    if (u.includes("api.microlink.io") && u.includes("uafix.net")) {
      return new Response(
        JSON.stringify({
          status: "success",
          data: {
            url: "https://uafix.net/serials/samozvanka/",
            title: "Серіал Самозванка (2026) дивитися онлайн українською всі серії безкоштовно в HD якості",
            description: "Дивитися нові серії серіалу Самозванка / Phony (2026) українською онлайн!",
            image: { url: "https://uafix.net/poster.jpg" },
          },
        }),
        { status: 200 },
      );
    }
    if (u.includes("api.microlink.io") && u.includes("uakino.best")) {
      return new Response(JSON.stringify({ status: "fail" }), { status: 403 });
    }
    if (u.includes("api.tvmaze.com") && u.includes("Phony")) {
      return new Response(
        JSON.stringify([
          {
            show: {
              name: "Phony",
              url: "https://www.tvmaze.com/shows/63873/phony",
              premiered: "2026-10-20",
              genres: ["Comedy"],
              summary: "<p>A 2026 mystery comedy series.</p>",
              image: { original: "https://tvmaze.com/phony.jpg" },
            },
          },
        ]),
        { status: 200 },
      );
    }
    if (u.includes("api.tvmaze.com")) {
      return new Response(
        JSON.stringify([
          {
            show: {
              name: "Самозванка",
              url: "https://www.tvmaze.com/shows/37118/samozvanka",
              premiered: "2012-01-01",
              genres: ["Drama"],
              summary: "<p>Old 2012 show.</p>",
            },
          },
        ]),
        { status: 200 },
      );
    }
    if (u.includes("uk.wikipedia.org/w/api.php") && u.includes("Fanny") === false && u.includes("Phony") === false) {
      return new Response(
        JSON.stringify({
          query: {
            pages: [
              {
                pageid: 42,
                index: 1,
                title: "Фанні (фільм, 1932)",
                extract: "Фанні — фільм 1932 року.",
                original: { source: "https://example.com/fanni32.jpg" },
              },
            ],
          },
        }),
        { status: 200 },
      );
    }
    if (u.includes("en.wikipedia.org/w/api.php") && u.includes("fanny")) {
      return new Response(
        JSON.stringify({
          query: {
            pages: [
              {
                pageid: 99,
                index: 1,
                title: "Fanny (2025 film)",
                extract: "Fanny is a 2025 drama film.",
              },
            ],
          },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  try {
    const tt = await resolveMovieClientSide("https://vt.tiktok.com/ZSpVxxHh1/");
    expect(tt).toMatchObject({
      source_url: "https://www.tiktok.com/@kisserteacher/video/7706960739558329607",
      title: "",
      image_url: "https://cdn.example.com/tt-thumb.jpg",
      provider: "TikTok",
      candidates: [],
    });

    const uafix = await resolveMovieClientSide("https://uafix.net/serials/samozvanka/");
    expect(uafix?.year).toBe(2026);
    expect(uafix?.metadata_url).toBe("https://www.tvmaze.com/shows/63873/phony");
    expect(uafix?.candidates?.some((c) => c.year === 2012)).toBe(false);

    const uakino = await resolveMovieClientSide(
      "https://uakino.best/filmy/genre_adventure/36211-fanni.html",
    );
    expect(uakino?.image_url).toBe("");
    expect(uakino?.candidates?.some((c) => c.year === 2025 && c.title === "Fanny")).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("strips season suffixes, transliterates Ukrainian DLE slugs, and auto-resolves series links like uakino.best", async () => {
  const seriesUrl =
    "https://uakino.best/seriesss/detective_series/17261--ne-lishilos-zhodnogo-1-sezon.html";
  expect(isSeriesUrl(seriesUrl)).toBe(true);
  expect(isSeriesUrl("https://uakino.best/filmy/genre_adventure/36211-fanni.html")).toBe(false);
  expect(movieTitleFromUrl(seriesUrl)).toEqual([
    "Не лишилось жодного",
    "Не лішілос жодного",
    "ne lishilos zhodnogo",
  ]);
  expect(
    movieSearchTerms("І не лишилось жодного 1 сезон дивитися онлайн українською"),
  ).toBe("І не лишилось жодного");
  expect(
    needsClientMovieRefresh(
      {
        source_url: seriesUrl,
        title: "Не лішілос жодного 1 сезон",
        description: "",
        image_url: "",
        year: null,
        genres: [],
        price: null,
        currency: "",
        ingredients: [],
        provider: "uakino.best",
        candidates: [],
      },
      seriesUrl,
    ),
  ).toBe(true);

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.includes("api.microlink.io")) {
      return new Response(JSON.stringify({ status: "fail", code: "EPROXYNEEDED" }), {
        status: 400,
      });
    }
    if (u.includes("uk.wikipedia.org/w/api.php") && u.includes("action=parse")) {
      return new Response(JSON.stringify({ parse: { sections: [] } }), { status: 200 });
    }
    if (u.includes("uk.wikipedia.org/w/api.php") && u.includes("action=query")) {
      const search = new URL(u).searchParams.get("gsrsearch") || "";
      if (search.includes("лишилось")) {
        return new Response(
          JSON.stringify({
            query: {
              pages: [
                {
                  pageid: 101,
                  index: 1,
                  title: "І не лишилось жодного (фільм, 1945)",
                  extract: "«І не лишилось жодного» — кінофільм режисера Рене Клера 1945 року.",
                  thumbnail: { source: "https://upload.wikimedia.org/1945.jpg" },
                },
                {
                  pageid: 102,
                  index: 2,
                  title: "І не лишилось жодного (серіал, 2015)",
                  extract:
                    "І не лишилось жодного (англ. And Then There Were None) — британський драматичний трилер мінісеріал 2015 року.",
                  thumbnail: { source: "https://upload.wikimedia.org/2015-series.jpg" },
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      if (search.includes("калмара~")) {
        return new Response(
          JSON.stringify({
            query: {
              pages: [
                {
                  pageid: 201,
                  index: 1,
                  title: "Гра в кальмара",
                  extract: "«Гра в кальмара» — південнокорейський телесеріал 2021 року у жанрі трилер.",
                  thumbnail: { source: "https://upload.wikimedia.org/squid.jpg" },
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
    }
    return new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  try {
    const resolved = await resolveMovieClientSide(seriesUrl);
    expect(resolved?.title).toBe("І не лишилось жодного");
    expect(resolved?.year).toBe(2015);
    expect(resolved?.image_url).toBe("https://upload.wikimedia.org/2015-series.jpg");
    expect(resolved?.metadata_url).toContain("curid=102");
    expect(resolved?.genres).toContain("Драма");
    expect(resolved?.genres).toContain("Трилер");
    expect(resolved?.candidates?.[0]?.year).toBe(2015);

    const fuzzySeries = await resolveMovieClientSide(
      "https://uakino.best/seriesss/thriller_series/999-gra-v-kalmara-1-sezon.html",
    );
    expect(fuzzySeries?.candidates?.[0]?.title).toBe("Гра в кальмара");
    expect(fuzzySeries?.candidates?.[0]?.year).toBe(2021);
  } finally {
    vi.unstubAllGlobals();
  }
});
