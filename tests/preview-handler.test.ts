import { it, expect, vi } from "vitest";
import { createPreviewHandler } from "../supabase/functions/_shared/preview-handler";
import { parsePasted } from "../supabase/functions/_shared/metadata";
const origin = "https://hubaluna.github.io";
const request = (
  body: unknown = { url: "https://example.com/film", kind: "movie" },
  token = "Bearer valid",
  site = origin,
) =>
  new Request("https://project.supabase.co/functions/v1/link-preview", {
    method: "POST",
    headers: {
      Origin: site,
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
it("requires allowed origin, user token, membership and rate budget before fetching", async () => {
  const load = vi.fn(),
    authorize = vi
      .fn<() => Promise<200 | 401 | 403 | 429>>()
      .mockResolvedValue(200);
  const handle = createPreviewHandler({ origins: [origin], authorize, load });
  expect(
    (await handle(request(undefined, "Bearer valid", "https://evil.example")))
      .status,
  ).toBe(403);
  expect((await handle(request(undefined, ""))).status).toBe(401);
  expect(authorize).not.toHaveBeenCalled();
  for (const status of [401, 403, 429] as const) {
    authorize.mockResolvedValue(status);
    expect((await handle(request())).status).toBe(status);
  }
  expect(load).not.toHaveBeenCalled();
});
it("returns explicit CORS and never caches a private preview", async () => {
  const handle = createPreviewHandler({
    origins: [origin],
    authorize: async () => 200,
    load: async () =>
      parsePasted("Наш фільм", "https://example.com/film", "movie"),
  });
  const options = await handle(
    new Request("https://example.com", {
      method: "OPTIONS",
      headers: { Origin: origin },
    }),
  );
  expect(options.status).toBe(204);
  expect(options.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  const r = await handle(request());
  expect(r.status).toBe(200);
  expect(r.headers.get("Cache-Control")).toBe("no-store");
  expect((await r.json()).data.title).toBe("Наш фільм");
});
it("rejects oversized bodies, malformed input and local links without fetching", async () => {
  const load = vi.fn();
  const handle = createPreviewHandler({
    origins: [origin],
    authorize: async () => 200,
    load,
  });
  expect(
    (await handle(request({ url: "https://localhost", kind: "movie" }))).status,
  ).toBe(400);
  expect(
    (await handle(request({ url: "https://example.com", kind: "other" })))
      .status,
  ).toBe(400);
  expect((await handle(request({ text: "a".repeat(9000) }))).status).toBe(413);
  expect(load).not.toHaveBeenCalled();
});
it("returns a safe editable fallback when the source refuses reading", async () => {
  const handle = createPreviewHandler({
    origins: [origin],
    authorize: async () => 200,
    load: async () => {
      throw new Error("secret upstream failure");
    },
  });
  const r = await handle(request());
  expect(r.status).toBe(422);
  expect(await r.text()).not.toContain("secret upstream");
});
