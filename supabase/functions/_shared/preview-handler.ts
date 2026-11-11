import { publicUrl } from "./urls.ts";
import type { ImportKind, LinkMetadata } from "./metadata.ts";
type Dependencies = {
  origins: string[];
  authorize: (token: string) => Promise<200 | 401 | 403 | 429>;
  load: (
    url: string,
    kind: ImportKind,
    signal: AbortSignal,
    query?: string,
  ) => Promise<LinkMetadata>;
};
async function readBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0,
    text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) {
        await reader.cancel();
        throw new Error("REQUEST_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
export function createPreviewHandler({
  origins,
  authorize,
  load,
}: Dependencies) {
  return async (req: Request) => {
    const origin = req.headers.get("Origin") || "";
    const headers = {
      "Access-Control-Allow-Origin": origins.includes(origin) ? origin : "null",
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    };
    const reply = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), { status, headers });
    if (!origins.includes(origin))
      return reply(403, { error: "ORIGIN_DENIED" });
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST")
      return reply(405, { error: "METHOD_NOT_ALLOWED" });
    const token = req.headers.get("Authorization") || "";
    if (!token.startsWith("Bearer ") || token.length > 8000)
      return reply(401, { error: "SIGN_IN_REQUIRED" });
    try {
      const status = await authorize(token);
      if (status !== 200)
        return reply(status, {
          error:
            status === 401
              ? "SIGN_IN_REQUIRED"
              : status === 403
                ? "SPACE_REQUIRED"
                : "TRY_LATER",
        });
      let input: { url?: string; kind?: ImportKind; query?: string };
      try {
        input = JSON.parse(await readBody(req));
      } catch (e) {
        return reply(
          e instanceof Error && e.message === "REQUEST_TOO_LARGE" ? 413 : 400,
          { error: "INVALID_REQUEST" },
        );
      }
      if (
        !input ||
        typeof input.url !== "string" ||
        !["movie", "wish", "recipe"].includes(input.kind || "") ||
        !publicUrl(input.url) ||
        (input.query !== undefined &&
          (typeof input.query !== "string" || input.query.length > 160))
      )
        return reply(400, { error: "INVALID_URL" });
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 20000);
      try {
        return reply(200, {
          data: await load(
            input.url,
            input.kind!,
            controller.signal,
            input.query,
          ),
        });
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return reply(422, {
        error: "CANNOT_READ_LINK",
        message: "Не вдалося прочитати сторінку. Спробуйте вставити її текст.",
      });
    }
  };
}
