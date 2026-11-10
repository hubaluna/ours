import { EventEmitter } from "node:events";
import { beforeEach, it, expect, vi } from "vitest";
const transport = vi.hoisted(() => vi.fn());
vi.mock("node:https", () => ({ request: transport }));
import {
  fetchPublicPage,
  MAX_PAGE_BYTES,
} from "../supabase/functions/_shared/fetch-page";
type Page = {
  status?: number;
  headers?: Record<string, string>;
  chunks?: Buffer[];
};
let pages: Page[];
beforeEach(() => {
  pages = [];
  transport.mockReset();
  transport.mockImplementation(
    (_url: URL, _options: unknown, callback: (response: unknown) => void) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () =>
        queueMicrotask(() => {
          const page = pages.shift() || {};
          const res = new EventEmitter() as EventEmitter & {
            statusCode: number;
            headers: Record<string, string>;
            destroy: () => void;
          };
          let destroyed = false;
          res.statusCode = page.status ?? 200;
          res.headers = { "content-type": "text/html", ...page.headers };
          res.destroy = () => {
            destroyed = true;
          };
          callback(res);
          if (!destroyed) {
            for (const chunk of page.chunks ?? [
              Buffer.from("<title>Опис</title>"),
            ])
              if (!destroyed) res.emit("data", chunk);
            if (!destroyed) res.emit("end");
          }
        });
      return req;
    },
  );
});
const resolve = async () => ["93.184.216.34"];
it("pins the request to validated DNS but verifies TLS for the original hostname", async () => {
  pages.push({});
  const result = await fetchPublicPage(
    "https://example.com/page",
    resolve,
    new AbortController().signal,
  );
  expect(result.html).toContain("Опис");
  const options = transport.mock.calls[0][1];
  expect(options.servername).toBe("example.com");
  expect(options.agent).toBe(false);
  const lookup = vi.fn();
  options.lookup("example.com", {}, lookup);
  expect(lookup).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  expect(options.headers.Authorization).toBeUndefined();
  expect(options.headers.Cookie).toBeUndefined();
});
it("rejects redirected private hosts before sending another request", async () => {
  pages.push({
    status: 302,
    headers: { location: "https://internal.example" },
  });
  await expect(
    fetchPublicPage(
      "https://example.com",
      async (host) =>
        host === "internal.example" ? ["127.0.0.1"] : ["93.184.216.34"],
      new AbortController().signal,
    ),
  ).rejects.toThrow("UNSAFE_ADDRESS");
  expect(transport).toHaveBeenCalledTimes(1);
});
it("limits redirects and rejects HTTP downgrade redirects", async () => {
  pages.push({ status: 302, headers: { location: "http://example.com/next" } });
  await expect(
    fetchPublicPage(
      "https://example.com",
      resolve,
      new AbortController().signal,
    ),
  ).rejects.toThrow("UNSAFE_URL");
  pages = Array.from({ length: 5 }, () => ({
    status: 302,
    headers: { location: "https://example.com/again" },
  }));
  await expect(
    fetchPublicPage(
      "https://example.com",
      resolve,
      new AbortController().signal,
    ),
  ).rejects.toThrow("REDIRECT_LIMIT");
});
it("limits body size even when Content-Length is missing", async () => {
  pages.push({ chunks: [Buffer.alloc(MAX_PAGE_BYTES), Buffer.from("a")] });
  await expect(
    fetchPublicPage(
      "https://example.com",
      resolve,
      new AbortController().signal,
    ),
  ).rejects.toThrow("PAGE_TOO_LARGE");
});
it("refuses oversized headers, compressed bodies and non-page content", async () => {
  for (const headers of [
    { "content-length": String(MAX_PAGE_BYTES + 1) },
    { "content-encoding": "gzip" },
    { "content-type": "application/octet-stream" },
  ]) {
    pages.push({ headers });
    await expect(
      fetchPublicPage(
        "https://example.com",
        resolve,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  }
});
it("does not send a request after cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    fetchPublicPage("https://example.com", resolve, controller.signal),
  ).rejects.toThrow("TIMEOUT");
  expect(transport).not.toHaveBeenCalled();
});
