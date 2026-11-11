import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  fetchPublicPage,
  MAX_PAGE_BYTES,
} from "../supabase/functions/_shared/fetch-page";
type Page = {
  status?: number;
  headers?: Record<string, string>;
  body?: Buffer;
  wire?: Buffer;
};
let pages: Page[], writes: string[], closes: ReturnType<typeof vi.fn>[];
const connect = vi.fn(),
  startTls = vi.fn();
beforeEach(() => {
  pages = [];
  writes = [];
  closes = [];
  connect.mockReset();
  startTls.mockReset();
  connect.mockResolvedValue({ close: vi.fn() });
  startTls.mockImplementation(async () => {
    const page = pages.shift() || {};
    const body = page.body || Buffer.from("<title>Опис</title>");
    const headers = {
      "content-type": "text/html",
      "content-length": String(body.length),
      ...page.headers,
    };
    const wire =
      page.wire ||
      Buffer.concat([
        Buffer.from(
          `HTTP/1.1 ${page.status || 200} Test\r\n${Object.entries(headers)
            .map(([k, v]) => `${k}: ${v}\r\n`)
            .join("")}\r\n`,
        ),
        body,
      ]);
    let offset = 0;
    const close = vi.fn();
    closes.push(close);
    return {
      close,
      write: async (data: Uint8Array) => {
        writes.push(new TextDecoder().decode(data));
        return data.length;
      },
      read: async (buffer: Uint8Array) => {
        if (offset === wire.length) return null;
        const size = Math.min(buffer.length, wire.length - offset);
        buffer.set(wire.subarray(offset, offset + size));
        offset += size;
        return size;
      },
    };
  });
  vi.stubGlobal("Deno", { connect, startTls });
});
afterEach(() => vi.unstubAllGlobals());
const resolve = async () => ["93.184.216.34"];
it("pins TCP to public DNS while verifying TLS and HTTP Host against the original domain", async () => {
  const result = await fetchPublicPage(
    "https://example.com/page?q=1",
    resolve,
    new AbortController().signal,
  );
  expect(result.html).toContain("Опис");
  expect(connect).toHaveBeenCalledWith({
    hostname: "93.184.216.34",
    port: 443,
  });
  expect(startTls).toHaveBeenCalledWith(await connect.mock.results[0].value, {
    hostname: "example.com",
    alpnProtocols: ["http/1.1"],
  });
  expect(writes.join("")).toContain(
    "GET /page?q=1 HTTP/1.1\r\nHost: example.com\r\n",
  );
  expect(writes.join("")).not.toMatch(/Authorization:|Cookie:/);
  expect(closes[0]).toHaveBeenCalled();
});
it("rejects redirected private hosts before opening another connection", async () => {
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
  expect(connect).toHaveBeenCalledTimes(1);
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
  pages.push({
    wire: Buffer.concat([
      Buffer.from(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n",
      ),
      Buffer.alloc(MAX_PAGE_BYTES + 1),
    ]),
  });
  await expect(
    fetchPublicPage(
      "https://example.com",
      resolve,
      new AbortController().signal,
    ),
  ).rejects.toThrow("PAGE_TOO_LARGE");
  expect(closes[0]).toHaveBeenCalled();
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
  pages.push({ headers: { "x-large": "x".repeat(40_000) } });
  await expect(
    fetchPublicPage(
      "https://example.com",
      resolve,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
});
it("decodes chunked HTTP bodies and rejects truncated responses", async () => {
  pages.push({
    wire: Buffer.from(
      "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n",
    ),
  });
  expect(
    (
      await fetchPublicPage(
        "https://example.com",
        resolve,
        new AbortController().signal,
      )
    ).html,
  ).toBe("hello world");
  pages.push({ headers: { "content-length": "100" } });
  await expect(
    fetchPublicPage(
      "https://example.com",
      resolve,
      new AbortController().signal,
    ),
  ).rejects.toThrow("UNREADABLE_PAGE");
});
it("propagates failed TLS verification and closes the pinned socket", async () => {
  startTls.mockRejectedValueOnce(new Error("certificate mismatch"));
  await expect(
    fetchPublicPage(
      "https://example.com",
      resolve,
      new AbortController().signal,
    ),
  ).rejects.toThrow("certificate mismatch");
  expect((await connect.mock.results[0].value).close).toHaveBeenCalled();
});
it("does not open a connection after cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    fetchPublicPage("https://example.com", resolve, controller.signal),
  ).rejects.toThrow("TIMEOUT");
  expect(connect).not.toHaveBeenCalled();
});
it("cancels a pending TCP connection and closes it if it arrives late", async () => {
  let finish!: (connection: { close: ReturnType<typeof vi.fn> }) => void;
  connect.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const controller = new AbortController();
  const response = fetchPublicPage(
    "https://example.com",
    resolve,
    controller.signal,
  );
  await vi.waitFor(() => expect(connect).toHaveBeenCalled());
  controller.abort();
  await expect(response).rejects.toThrow("TIMEOUT");
  const socket = { close: vi.fn() };
  finish(socket);
  await vi.waitFor(() => expect(socket.close).toHaveBeenCalled());
  expect(startTls).not.toHaveBeenCalled();
});
