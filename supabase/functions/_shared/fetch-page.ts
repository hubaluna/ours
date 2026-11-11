import { Buffer } from "node:buffer";
import { HTTPParser } from "http-parser-js";
import { resolvePublicUrl } from "./url-safety.ts";
export const MAX_PAGE_BYTES = 1_500_000;
const MAX_WIRE_BYTES = MAX_PAGE_BYTES + 65_536;
type Connection = {
  read: (buffer: Uint8Array) => Promise<number | null>;
  write: (buffer: Uint8Array) => Promise<number>;
  close: () => void;
};
type TlsRuntime = {
  connect: (options: { hostname: string; port: number }) => Promise<Connection>;
  startTls: (
    connection: Connection,
    options: { hostname: string; alpnProtocols: string[] },
  ) => Promise<Connection>;
};
type PageResponse = { status: number; location: string; body: string };
// Supabase's node:https adapter does not support custom DNS lookup and loses
// SNI when hostname is an IP. Pin TCP first, then verify TLS for the source host.
export async function requestPinnedPage(
  url: URL,
  address: string,
  signal: AbortSignal,
  runtime: TlsRuntime = (globalThis as unknown as { Deno: TlsRuntime }).Deno,
): Promise<PageResponse> {
  let connection: Connection | undefined;
  const close = () => {
    try {
      connection?.close();
    } catch {
      /* Already closed or consumed by TLS. */
    }
  };
  const open = (pending: Promise<Connection>) =>
    new Promise<Connection>((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener("abort", abort);
        reject(new Error("TIMEOUT"));
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      pending.then(
        (socket) => {
          signal.removeEventListener("abort", abort);
          if (signal.aborted) {
            try {
              socket.close();
            } catch {
              /* Already closed. */
            }
            reject(new Error("TIMEOUT"));
          } else resolve(socket);
        },
        (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
    });
  signal.addEventListener("abort", close, { once: true });
  try {
    if (signal.aborted) throw new Error("TIMEOUT");
    connection = await open(runtime.connect({ hostname: address, port: 443 }));
    if (signal.aborted) throw new Error("TIMEOUT");
    connection = await open(
      runtime.startTls(connection, {
        hostname: url.hostname,
        alpnProtocols: ["http/1.1"],
      }),
    );
    if (signal.aborted) throw new Error("TIMEOUT");
    const request = new TextEncoder().encode(
      `GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nAccept: text/html,application/xhtml+xml,application/json\r\nAccept-Encoding: identity\r\nUser-Agent: ours-link-preview/2.0\r\nConnection: close\r\n\r\n`,
    );
    for (let offset = 0; offset < request.length;) {
      const written = await connection.write(request.subarray(offset));
      if (written <= 0) throw new Error("UNREADABLE_PAGE");
      offset += written;
    }
    const parser = new HTTPParser(HTTPParser.RESPONSE);
    parser.maxHeaderSize = 32_768;
    let status = 0,
      location = "",
      size = 0,
      done = false;
    const chunks: Buffer[] = [];
    parser[HTTPParser.kOnHeadersComplete] = (info) => {
      if (
        info.headers.reduce((size, part) => size + part.length + 2, 64) > 32_768
      )
        throw new Error("UNSUPPORTED_PAGE");
      status = info.statusCode;
      const headers = new Map<string, string>();
      for (let i = 0; i < info.headers.length; i += 2)
        headers.set(info.headers[i].toLowerCase(), info.headers[i + 1]);
      location = headers.get("location") || "";
      if (status >= 300 && status < 400) {
        done = true;
        return 1;
      }
      if (
        status !== 200 ||
        !/(?:text\/html|application\/xhtml\+xml|application\/json)/i.test(
          headers.get("content-type") || "",
        )
      )
        throw new Error("UNREADABLE_PAGE");
      if (
        Number(headers.get("content-length") || 0) > MAX_PAGE_BYTES ||
        (headers.has("content-encoding") &&
          headers.get("content-encoding") !== "identity")
      )
        throw new Error("UNSUPPORTED_PAGE");
    };
    parser[HTTPParser.kOnBody] = (chunk, offset, length) => {
      size += length;
      if (size > MAX_PAGE_BYTES) throw new Error("PAGE_TOO_LARGE");
      chunks.push(Buffer.from(chunk.subarray(offset, offset + length)));
    };
    parser[HTTPParser.kOnMessageComplete] = () => {
      done = true;
    };
    const buffer = new Uint8Array(16_384);
    let wireBytes = 0;
    while (!done) {
      const count = await connection.read(buffer);
      if (signal.aborted) throw new Error("TIMEOUT");
      if (count === null) {
        const error = parser.finish();
        if (error || !done) throw new Error("UNREADABLE_PAGE");
        break;
      }
      wireBytes += count;
      if (wireBytes > MAX_WIRE_BYTES) throw new Error("PAGE_TOO_LARGE");
      const parsed = parser.execute(Buffer.from(buffer.subarray(0, count)));
      if (parsed instanceof Error) throw new Error("UNREADABLE_PAGE");
    }
    return { status, location, body: Buffer.concat(chunks).toString("utf8") };
  } finally {
    signal.removeEventListener("abort", close);
    close();
  }
}
export async function fetchPublicPage(
  input: string,
  resolve: (host: string) => Promise<string[]>,
  signal: AbortSignal,
): Promise<{ html: string; url: string }> {
  let next = input;
  for (let redirects = 0; redirects <= 4; redirects++) {
    const { url, addresses } = await resolvePublicUrl(next, resolve);
    if (signal.aborted) throw new Error("TIMEOUT");
    const address = addresses.find((a) => !a.includes(":")) || addresses[0];
    const result = await requestPinnedPage(url, address, signal);
    if (result.status >= 300 && result.status < 400) {
      if (!result.location || redirects === 4)
        throw new Error("REDIRECT_LIMIT");
      next = new URL(result.location, url).href;
      continue;
    }
    return { html: result.body, url: url.href };
  }
  throw new Error("REDIRECT_LIMIT");
}
