export const MIN_AI_CATEGORY_CONFIDENCE = 0.85;

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TEXT_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_VISION_MODEL = "gemini-2.5-flash";

export type GeminiCategoryOption = {
  id: string;
  name: string;
};

export function hasGeminiKey(): boolean {
  try {
    return Boolean(Deno.env.get("GEMINI_API_KEY")?.trim());
  } catch {
    return false;
  }
}

export function extractJsonFromGeminiText(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function pickConfidentCategory(
  result: { category_id?: unknown; confidence?: unknown } | null | undefined,
  allowedIds: ReadonlySet<string>,
  minConfidence = MIN_AI_CATEGORY_CONFIDENCE,
): string | null {
  if (!result || typeof result !== "object") return null;
  const id = typeof result.category_id === "string" ? result.category_id.trim() : "";
  const confidence = Number(result.confidence);
  if (!id || !Number.isFinite(confidence) || confidence < minConfidence) {
    return null;
  }
  return allowedIds.has(id) ? id : null;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function callGeminiJson<T>({
  prompt,
  imageBase64,
  imageMimeType,
  model,
  timeoutMs = 12_000,
  signal,
}: {
  prompt: string;
  imageBase64?: string;
  imageMimeType?: string;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<T | null> {
  let apiKey: string;
  try {
    apiKey = Deno.env.get("GEMINI_API_KEY")?.trim() ?? "";
  } catch {
    return null;
  }
  if (!apiKey) return null;

  const chosenModel =
    model ?? (imageBase64 ? DEFAULT_VISION_MODEL : DEFAULT_TEXT_MODEL);

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (imageBase64 && imageMimeType) {
    parts.push({
      inline_data: {
        mime_type: imageMimeType,
        data: imageBase64,
      },
    });
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal =
    signal && "any" in AbortSignal
      ? AbortSignal.any([signal, timeoutSignal])
      : signal || timeoutSignal;

  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/${encodeURIComponent(chosenModel)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
        signal: combinedSignal,
      },
    );
    if (!response.ok) {
      console.warn(
        `[gemini] HTTP ${response.status} for model ${chosenModel}`,
      );
      return null;
    }
    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text =
      payload.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? "";
    const parsed = extractJsonFromGeminiText(text);
    return parsed && typeof parsed === "object" ? (parsed as T) : null;
  } catch (err) {
    console.warn(
      "[gemini] request failed:",
      err instanceof Error ? err.message : "unknown",
    );
    return null;
  }
}

export async function classifyMerchantWithGemini({
  merchant,
  amount,
  note,
  kind,
  categories,
}: {
  merchant: string;
  amount: number;
  note?: string;
  kind: "expense" | "income";
  categories: GeminiCategoryOption[];
}): Promise<{ categoryId: string; confidence: number } | null> {
  if (!merchant.trim() || !categories.length) return null;
  const allowedIds = new Set(categories.map((c) => c.id));
  const listText = categories.map((c) => `- ${c.id}: ${c.name}`).join("\n");
  const prompt = [
    `You classify a Ukrainian bank/Apple Pay ${kind} transaction into one of the user's categories.`,
    `Merchant: "${merchant.slice(0, 160)}"`,
    `Amount: ${amount} UAH`,
    note ? `Note: "${note.slice(0, 200)}"` : "",
    `Allowed categories (use EXACT id):`,
    listText,
    `Rules:`,
    `- Be STRICT. Only pick a category if you are genuinely confident (>= 0.85) what this merchant is.`,
    `- For ambiguous FOP/ФОП names, generic personal names, unknown abbreviations, or mixed marketplaces (e.g. Rozetka, Prom, Epicentr where item type is unknown), return category_id: null and low confidence.`,
    `- Return JSON ONLY: {"category_id": string | null, "confidence": number}`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await callGeminiJson<{
    category_id?: string | null;
    confidence?: number;
  }>({
    prompt,
    timeoutMs: 8_000,
  });

  const picked = pickConfidentCategory(res, allowedIds);
  if (!picked) return null;
  return { categoryId: picked, confidence: Number(res?.confidence ?? 0) };
}

export async function refineMovieWithGemini({
  url,
  title,
  description,
  provider,
  signal,
}: {
  url: string;
  title: string;
  description: string;
  provider?: string;
  signal?: AbortSignal;
}): Promise<{
  title: string;
  year: number | null;
  synopsis_uk: string;
} | null> {
  const combined = `${title} ${description}`.trim();
  if (!combined) return null;
  const prompt = [
    `Extract the exact movie or TV series referenced by this social post / webpage.`,
    `URL: ${url.slice(0, 400)}`,
    provider ? `Provider: ${provider}` : "",
    `Raw title: ${title.slice(0, 240)}`,
    `Raw description: ${description.slice(0, 1000)}`,
    `Rules:`,
    `- Strip hashtags, clickbait, review phrases ("огляд", "трейлер", "назва фільму", "part 1", etc.).`,
    `- Return the canonical movie/series title (preferably Ukrainian or original English if better known), release year (number or null), and a short 1-2 sentence Ukrainian synopsis (empty string if unsure).`,
    `- If no specific movie or series can be identified, return {"title": "", "year": null, "synopsis_uk": ""}.`,
    `- Return JSON ONLY: {"title": string, "year": number | null, "synopsis_uk": string}`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await callGeminiJson<{
    title?: unknown;
    year?: unknown;
    synopsis_uk?: unknown;
  }>({
    prompt,
    timeoutMs: 8_000,
    signal,
  });
  if (!res || typeof res.title !== "string" || !res.title.trim()) return null;
  const parsedYear = Number(res.year);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2035
      ? parsedYear
      : null;
  return {
    title: res.title.trim().slice(0, 160),
    year,
    synopsis_uk:
      typeof res.synopsis_uk === "string"
        ? res.synopsis_uk.trim().slice(0, 400)
        : "",
  };
}

export async function parseRecipeTextWithGemini({
  title,
  text,
  signal,
}: {
  title: string;
  text: string;
  signal?: AbortSignal;
}): Promise<{
  title: string;
  ingredients: string[];
  instructions: string[];
  base_servings: number | null;
  total_time_minutes: number | null;
} | null> {
  if (!text.trim()) return null;
  const prompt = [
    `Parse this recipe caption/article into structured Ukrainian JSON.`,
    title ? `Title hint: ${title.slice(0, 160)}` : "",
    `Text:\n${text.slice(0, 3500)}`,
    `Rules:`,
    `- "ingredients": array of clean single-line ingredients with quantities in Ukrainian (e.g. "200 г курячого філе", "2 шт. яйця"). Max 50 items.`,
    `- "instructions": array of concise step-by-step instructions in Ukrainian (without numbering prefixes). Max 30 items.`,
    `- "base_servings": integer 1..12 or null.`,
    `- "total_time_minutes": integer 1..1440 or null.`,
    `- If the text is not a recipe and has no ingredients, return empty arrays.`,
    `- Return JSON ONLY: {"title": string, "ingredients": string[], "instructions": string[], "base_servings": number | null, "total_time_minutes": number | null}`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await callGeminiJson<{
    title?: unknown;
    ingredients?: unknown;
    instructions?: unknown;
    base_servings?: unknown;
    total_time_minutes?: unknown;
  }>({
    prompt,
    timeoutMs: 10_000,
    signal,
  });
  if (!res) return null;
  const ingredients = Array.isArray(res.ingredients)
    ? res.ingredients
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .slice(0, 50)
    : [];
  const instructions = Array.isArray(res.instructions)
    ? res.instructions
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .slice(0, 30)
    : [];
  if (!ingredients.length && !instructions.length) return null;
  const servings = Number(res.base_servings);
  const minutes = Number(res.total_time_minutes);
  return {
    title:
      typeof res.title === "string" && res.title.trim()
        ? res.title.trim().slice(0, 160)
        : title.slice(0, 160),
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
  };
}

export async function identifyPlantWithGemini({
  imageBase64,
  imageMimeType,
}: {
  imageBase64: string;
  imageMimeType: string;
}): Promise<{
  recognized: boolean;
  name: string;
  species: string;
  confidence: number;
  interval: number;
  light: string;
  notes: string;
} | null> {
  const prompt = [
    `Identify the houseplant in this photo and provide brief Ukrainian care advice.`,
    `Rules:`,
    `- "recognized": true only if you clearly see a plant and confidence >= 0.6.`,
    `- "name": common Ukrainian name (e.g. "Монстера делікатесна", "Фікус Бенджаміна").`,
    `- "species": scientific Latin name.`,
    `- "confidence": number 0..1.`,
    `- "interval": recommended soil-check / watering interval in days (integer 2..30).`,
    `- "light": short Ukrainian lighting label (e.g. "Яскраве розсіяне світло", "Півтінь", "Пряме сонце").`,
    `- "notes": 1-2 short practical care sentences in Ukrainian (use polite "ви" or neutral tone).`,
    `- Return JSON ONLY: {"recognized": boolean, "name": string, "species": string, "confidence": number, "interval": number, "light": string, "notes": string}`,
  ].join("\n");

  const res = await callGeminiJson<{
    recognized?: unknown;
    name?: unknown;
    species?: unknown;
    confidence?: unknown;
    interval?: unknown;
    light?: unknown;
    notes?: unknown;
  }>({
    prompt,
    imageBase64,
    imageMimeType,
    model: DEFAULT_VISION_MODEL,
    timeoutMs: 16_000,
  });
  if (!res || !res.recognized) return null;
  const confidence = Number(res.confidence ?? 0);
  const name = typeof res.name === "string" ? res.name.trim().slice(0, 100) : "";
  const species =
    typeof res.species === "string" ? res.species.trim().slice(0, 120) : "";
  if (!name || confidence < 0.6) return null;
  const intervalRaw = Math.round(Number(res.interval) || 7);
  return {
    recognized: true,
    name,
    species: species || name,
    confidence,
    interval: Math.min(30, Math.max(2, intervalRaw)),
    light: typeof res.light === "string" ? res.light.trim().slice(0, 80) : "",
    notes: typeof res.notes === "string" ? res.notes.trim().slice(0, 400) : "",
  };
}
