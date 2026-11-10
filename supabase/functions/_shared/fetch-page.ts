import { Buffer } from "node:buffer";
import { request } from "node:https";
import { resolvePublicUrl } from "./url-safety.ts";
export const MAX_PAGE_BYTES = 1_500_000;
// Lookup is pinned to validated public DNS answers. TLS still verifies the
// ORIGINAL hostname; neither redirects nor DNS rebinding can target a LAN.
export async function fetchPublicPage(
  input: string,
  resolve: (host: string) => Promise<string[]>,
  signal: AbortSignal,
): Promise<{ html: string; url: string }> {
  let next = input;
  for (let redirects = 0; redirects <= 4; redirects++) {
    const { url, addresses } = await resolvePublicUrl(next, resolve);
    if (signal.aborted) throw new Error("TIMEOUT");
    const result = await new Promise<{
      status: number;
      location: string;
      type: string;
      body: string;
    }>((accept, reject) => {
      const address = addresses.find((a) => !a.includes(":")) || addresses[0];
      const req = request(
        url,
        {
          method: "GET",
          agent: false,
          servername: url.hostname,
          signal,
          headers: {
            Accept: "text/html,application/xhtml+xml,application/json",
            "Accept-Encoding": "identity",
            "User-Agent": "ours-link-preview/2.0",
          },
          lookup: ((
            _host: unknown,
            options: unknown,
            callback: (...args: unknown[]) => void,
          ) => {
            const family = address.includes(":") ? 6 : 4;
            if (
              options &&
              typeof options === "object" &&
              "all" in options &&
              options.all
            )
              callback(null, [{ address, family }]);
            else callback(null, address, family);
          }) as never,
        },
        (res) => {
          const status = res.statusCode || 0,
            location = String(res.headers.location || ""),
            type = String(res.headers["content-type"] || "");
          if (status >= 300 && status < 400) {
            res.destroy();
            accept({ status, location, type, body: "" });
            return;
          }
          if (
            status !== 200 ||
            !/(?:text\/html|application\/xhtml\+xml|application\/json)/i.test(
              type,
            )
          ) {
            res.destroy();
            reject(new Error("UNREADABLE_PAGE"));
            return;
          }
          if (
            Number(res.headers["content-length"] || 0) > MAX_PAGE_BYTES ||
            (res.headers["content-encoding"] &&
              res.headers["content-encoding"] !== "identity")
          ) {
            res.destroy();
            reject(new Error("UNSUPPORTED_PAGE"));
            return;
          }
          let size = 0;
          const chunks: Uint8Array[] = [];
          res.on("data", (chunk: Uint8Array) => {
            size += chunk.length;
            if (size > MAX_PAGE_BYTES) {
              res.destroy();
              reject(new Error("PAGE_TOO_LARGE"));
            } else chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () =>
            accept({
              status,
              location,
              type,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
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
