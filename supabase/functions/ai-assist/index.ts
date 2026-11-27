import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import {
  bytesToBase64,
  callGeminiJson,
  hasGeminiKey,
  pickConfidentCategory,
  type GeminiCategoryOption,
} from "../_shared/gemini.ts";
import { groceryCategory } from "../_shared/grocery-category.ts";

const allowedOrigins = (
  Deno.env.get("ALLOWED_ORIGINS") || "https://hubaluna.github.io"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsFor(request: Request) {
  const reqOrigin = request.headers.get("Origin") ?? "";
  const origin = allowedOrigins.includes(reqOrigin)
    ? reqOrigin
    : (allowedOrigins[0] ?? "https://hubaluna.github.io");
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const VALID_UNITS = new Set(["шт.", "кг", "г", "л", "мл", "уп."]);
const VALID_CATEGORIES = new Set([
  "Овочі та фрукти",
  "М’ясо та риба",
  "Молочні продукти",
  "Бакалія",
  "Напої",
  "Побутові товари",
  "Інше",
]);

function normalizeUnit(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "шт" || s === "шт.") return "шт.";
  if (s === "уп" || s === "уп." || s === "пач" || s === "пачка") return "уп.";
  if (VALID_UNITS.has(s)) return s;
  return "шт.";
}

Deno.serve(async (request) => {
  const cors = corsFor(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401, headers: cors });
  }

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    },
  );
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) {
    return new Response("Unauthorized", { status: 401, headers: cors });
  }
  const membership = await client.rpc("current_couple");
  if (membership.error || !membership.data) {
    return new Response("Forbidden", { status: 403, headers: cors });
  }
  const budget = await client.rpc("consume_link_import");
  if (budget.error || !budget.data) {
    return new Response("Too many requests", { status: 429, headers: cors });
  }
  if (!hasGeminiKey()) {
    return Response.json(
      { ok: false, error: "AI assistant not configured" },
      { status: 503, headers: cors },
    );
  }

  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const action = String(form.get("action") ?? "").trim();
      const image = form.get("image");
      if (
        !(image instanceof File) ||
        !["image/jpeg", "image/png", "image/webp"].includes(image.type) ||
        image.size > 8 * 1024 * 1024
      ) {
        return Response.json(
          { ok: false, error: "Invalid image" },
          { status: 400, headers: cors },
        );
      }

      const imageBase64 = bytesToBase64(new Uint8Array(await image.arrayBuffer()));

      if (action === "receipt") {
        let categories: GeminiCategoryOption[] = [];
        try {
          const rawCats = JSON.parse(String(form.get("categories") ?? "[]"));
          if (Array.isArray(rawCats)) {
            categories = rawCats
              .filter(
                (c): c is GeminiCategoryOption =>
                  Boolean(c) &&
                  typeof c.id === "string" &&
                  typeof c.name === "string",
              )
              .slice(0, 40);
          }
        } catch {
          categories = [];
        }
        const allowedIds = new Set(categories.map((c) => c.id));
        const catLines = categories
          .map((c) => `- ${c.id}: ${c.name}`)
          .join("\n");

        const prompt = [
          `Read this store receipt photo (usually in Ukrainian) and extract transaction fields.`,
          categories.length ? `Allowed expense categories (use EXACT id):\n${catLines}` : "",
          `Rules:`,
          `- "amount": total paid amount as positive number (UAH), or null if unreadable.`,
          `- "merchant": clean store/place name (e.g. "Сільпо", "АТБ", "Аптека АНЦ").`,
          `- "occurred_on": date in YYYY-MM-DD format if clearly visible, otherwise null.`,
          `- "note": short summary of 2-4 main items bought (Ukrainian, max 120 chars), or "".`,
          `- "category_id": pick from allowed categories ONLY if confidence >= 0.85, otherwise null.`,
          `- "confidence": number 0..1 for category_id.`,
          `- Return JSON ONLY: {"amount": number | null, "merchant": string, "occurred_on": string | null, "note": string, "category_id": string | null, "confidence": number}`,
        ]
          .filter(Boolean)
          .join("\n");

        const parsed = await callGeminiJson<{
          amount?: unknown;
          merchant?: unknown;
          occurred_on?: unknown;
          note?: unknown;
          category_id?: unknown;
          confidence?: unknown;
        }>({
          prompt,
          imageBase64,
          imageMimeType: image.type,
          timeoutMs: 18_000,
        });

        const amountNum = Number(parsed?.amount);
        const amount =
          Number.isFinite(amountNum) && amountNum > 0 && amountNum < 100_000_000
            ? Math.round(amountNum * 100) / 100
            : null;
        const occurredRaw =
          typeof parsed?.occurred_on === "string"
            ? parsed.occurred_on.trim()
            : "";
        const occurred_on = /^\d{4}-\d{2}-\d{2}$/.test(occurredRaw)
          ? occurredRaw
          : null;
        const category_key = pickConfidentCategory(parsed, allowedIds);

        return Response.json(
          {
            ok: true,
            amount,
            merchant:
              typeof parsed?.merchant === "string"
                ? parsed.merchant.trim().slice(0, 120)
                : "",
            occurred_on,
            note:
              typeof parsed?.note === "string"
                ? parsed.note.trim().slice(0, 200)
                : "",
            category_key,
          },
          { headers: cors },
        );
      }

      if (action === "recipe_photo") {
        const prompt = [
          `Read this recipe photo (cookbook page, screenshot, or handwritten note) and extract a structured Ukrainian recipe.`,
          `Rules:`,
          `- "title": dish title in Ukrainian.`,
          `- "ingredients": array of single-line ingredients with amounts (e.g. "200 г борошна", "2 шт. яйця").`,
          `- "instructions": array of concise cooking steps in Ukrainian (without numbering).`,
          `- "base_servings": integer 1..12 or null.`,
          `- "total_time_minutes": integer 1..1440 or null.`,
          `- Return JSON ONLY: {"title": string, "ingredients": string[], "instructions": string[], "base_servings": number | null, "total_time_minutes": number | null}`,
        ].join("\n");

        const parsed = await callGeminiJson<{
          title?: unknown;
          ingredients?: unknown;
          instructions?: unknown;
          base_servings?: unknown;
          total_time_minutes?: unknown;
        }>({
          prompt,
          imageBase64,
          imageMimeType: image.type,
          timeoutMs: 18_000,
        });

        const ingredients = Array.isArray(parsed?.ingredients)
          ? parsed.ingredients
              .map((s) => String(s ?? "").trim())
              .filter(Boolean)
              .slice(0, 60)
          : [];
        const instructions = Array.isArray(parsed?.instructions)
          ? parsed.instructions
              .map((s) => String(s ?? "").trim())
              .filter(Boolean)
              .slice(0, 40)
          : [];
        const servings = Number(parsed?.base_servings);
        const minutes = Number(parsed?.total_time_minutes);

        return Response.json(
          {
            ok: true,
            title:
              typeof parsed?.title === "string"
                ? parsed.title.trim().slice(0, 160)
                : "",
            ingredients,
            instructions,
            base_servings:
              Number.isInteger(servings) && servings >= 1 && servings <= 12
                ? servings
                : null,
            total_time_minutes:
              Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440
                ? minutes
                : null,
          },
          { headers: cors },
        );
      }

      return Response.json(
        { ok: false, error: "Unsupported action" },
        { status: 400, headers: cors },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      action?: string;
      text?: string;
    } | null;

    if (body?.action === "shopping_text") {
      const text = String(body.text ?? "").trim().slice(0, 600);
      if (!text) {
        return Response.json(
          { ok: false, error: "Empty text" },
          { status: 400, headers: cors },
        );
      }
      const prompt = [
        `Turn this Ukrainian shopping/meal request into a practical grocery shopping list.`,
        `Request: "${text}"`,
        `Rules:`,
        `- If the user mentions a dish (e.g. "на борщ", "вівсянка з бананом", "паста карбонара на трьох"), list the needed grocery ingredients.`,
        `- If the user lists products directly, extract each product cleanly.`,
        `- Allowed units: "шт.", "кг", "г", "л", "мл", "уп."`,
        `- Allowed categories: "Овочі та фрукти", "М’ясо та риба", "Молочні продукти", "Бакалія", "Напої", "Побутові товари", "Інше"`,
        `- Max 25 items.`,
        `- Return JSON ONLY: {"items": [{"name": string, "quantity": number | null, "unit": string, "category": string}]}`,
      ].join("\n");

      const parsed = await callGeminiJson<{
        items?: Array<{
          name?: unknown;
          quantity?: unknown;
          unit?: unknown;
          category?: unknown;
        }>;
      }>({
        prompt,
        timeoutMs: 12_000,
      });

      const items = Array.isArray(parsed?.items)
        ? parsed.items
            .map((entry) => {
              const name = String(entry?.name ?? "").trim().slice(0, 120);
              if (!name) return null;
              const qtyNum = Number(entry?.quantity);
              const quantity =
                Number.isFinite(qtyNum) && qtyNum > 0 && qtyNum < 10000
                  ? Math.round(qtyNum * 100) / 100
                  : 1;
              const rawCat = String(entry?.category ?? "").trim();
              const category = VALID_CATEGORIES.has(rawCat)
                ? rawCat
                : groceryCategory(name);
              return {
                name,
                quantity,
                unit: normalizeUnit(entry?.unit),
                category,
              };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .slice(0, 25)
        : [];

      return Response.json({ ok: true, items }, { headers: cors });
    }

    return Response.json(
      { ok: false, error: "Unsupported action" },
      { status: 400, headers: cors },
    );
  } catch (err) {
    console.error(
      "[ai-assist] failed:",
      err instanceof Error ? err.message : "unknown",
    );
    return Response.json(
      { ok: false, error: "AI assistant temporarily unavailable" },
      { status: 502, headers: cors },
    );
  }
});
