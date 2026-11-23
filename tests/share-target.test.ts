import { describe, expect, it } from "vitest";
import {
  extractShareTargetUrl,
  detectShareTarget,
} from "../src/lib/share-target";

describe("Web Share Target URL extraction", () => {
  it("extracts direct url parameter from search string", () => {
    const search = "?url=https%3A%2F%2Fwww.tiktok.com%2F%40chef%2Fvideo%2F12345";
    expect(extractShareTargetUrl(search)).toBe(
      "https://www.tiktok.com/@chef/video/12345",
    );
  });

  it("extracts url embedded inside text parameter", () => {
    const search =
      "?text=Check+out+this+recipe+https%3A%2F%2Fklopotenko.com%2Fborshch%2F+it+is+amazing";
    expect(extractShareTargetUrl(search)).toBe(
      "https://klopotenko.com/borshch/",
    );
  });

  it("strips trailing punctuation like parentheses, commas and periods from shared text", () => {
    const search =
      "?text=Look+at+this+(https%3A%2F%2Frozetka.com.ua%2Fitem%2F123%2F).";
    expect(extractShareTargetUrl(search)).toBe(
      "https://rozetka.com.ua/item/123/",
    );
  });

  it("handles title with embedded url", () => {
    const search =
      "?title=Cool+movie+https%3A%2F%2Fmegogo.net%2Fua%2Fview%2F123&text=";
    expect(extractShareTargetUrl(search)).toBe(
      "https://megogo.net/ua/view/123",
    );
  });

  it("returns null for empty search or when no url exists in params", () => {
    expect(extractShareTargetUrl("")).toBeNull();
    expect(extractShareTargetUrl("?")).toBeNull();
    expect(extractShareTargetUrl("?url=&text=")).toBeNull();
    expect(extractShareTargetUrl("?other=123&text=Just+some+plain+text")).toBeNull();
  });
});

describe("Auto-detection of import destination", () => {
  it("detects movie streaming and database domains as movie", () => {
    expect(detectShareTarget("https://www.imdb.com/title/tt1375666/")).toBe(
      "movie",
    );
    expect(
      detectShareTarget("https://www.themoviedb.org/movie/27205-inception"),
    ).toBe("movie");
    expect(
      detectShareTarget("https://megogo.net/ua/view/20123-inception.html"),
    ).toBe("movie");
    expect(detectShareTarget("https://sweet.tv/movie/12345")).toBe("movie");
    expect(detectShareTarget("https://www.netflix.com/title/800123")).toBe(
      "movie",
    );
    expect(
      detectShareTarget(
        "https://uakino.best/seriesss/detective_series/17261--ne-lishilos-zhodnogo-1-sezon.html",
      ),
    ).toBe("movie");
    expect(
      detectShareTarget("https://uaserials.com/12861-nichna-zmina-2025.html"),
    ).toBe("movie");
  });

  it("detects recipe and culinary domains or paths as menu", () => {
    expect(
      detectShareTarget("https://www.tiktok.com/@cook_ukraine/video/789123"),
    ).toBe("menu");
    expect(detectShareTarget("https://klopotenko.com/uk/sirnyky/")).toBe("menu");
    expect(detectShareTarget("https://shuba.life/recipes/1234-pancake")).toBe(
      "menu",
    );
    expect(
      detectShareTarget("https://someblog.org/food/my-favorite-recipe"),
    ).toBe("menu");
  });

  it("defaults e-commerce shops and unknown websites to wish", () => {
    expect(detectShareTarget("https://rozetka.com.ua/item/123/")).toBe("wish");
    expect(detectShareTarget("https://prom.ua/p12345-toster.html")).toBe("wish");
    expect(detectShareTarget("https://epicentrk.ua/shop/krislo.html")).toBe(
      "wish",
    );
    expect(detectShareTarget("https://example.com/gadget-review")).toBe("wish");
  });
});
