import {
  autoCategorizeMerchant,
  isGenericOrEmptyMerchant,
  normalizeMerchantName,
  parseApplePayAmount,
  SKARBO_EXPENSE_CATEGORIES,
  SKARBO_INCOME_CATEGORIES,
  type BudgetKind,
  type MerchantRuleLike,
} from "../_shared/budget-categorizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-ours-budget-token",
};

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function kyivDate(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Supabase REST error ${response.status}: ${errorText}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function extractToken(request: Request, body?: Record<string, unknown>): string {
  const auth = request.headers.get("authorization") ?? "";
  let token = "";
  if (auth) {
    const trimmed = auth.trim();
    const bearerMatch = /^Bearer\s+(.+)$/i.exec(trimmed);
    if (bearerMatch) {
      token = bearerMatch[1].trim();
    } else {
      token = trimmed;
    }
  }
  if (!token) {
    token = request.headers.get("x-ours-budget-token")?.trim() ?? "";
  }
  if (!token && body && typeof body.token === "string") {
    token = body.token.trim();
  }
  if (!token) {
    try {
      const url = new URL(request.url);
      const qToken = url.searchParams.get("token");
      if (qToken) token = qToken.trim();
    } catch {
      // ignore
    }
  }
  return token.replace(/^["']|["']$/g, "").trim();
}

function parseOccurredDate(raw: unknown): {
  occurredOn: string;
  occurredAt: string;
} {
  if (typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return {
        occurredOn: trimmed,
        occurredAt: new Date().toISOString(),
      };
    }
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) {
      const date = new Date(parsed);
      return {
        occurredOn: kyivDate(date),
        occurredAt: date.toISOString(),
      };
    }
  }
  const now = new Date();
  return {
    occurredOn: kyivDate(now),
    occurredAt: now.toISOString(),
  };
}

async function parseRequestBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  try {
    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const formData = await request.formData();
      const result: Record<string, unknown> = {};
      for (const [key, value] of formData.entries()) {
        result[key] = typeof value === "string" ? value : (value as File).name;
      }
      return result;
    }
  } catch {
    // fallback to text/json
  }

  const text = await request.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // If not JSON, try parsing as URL search params (e.g. key=value&key2=value2)
    try {
      const params = new URLSearchParams(text);
      const result: Record<string, unknown> = {};
      let count = 0;
      for (const [k, v] of params.entries()) {
        result[k] = v;
        count++;
      }
      if (count > 0) return result;
    } catch {
      // ignore
    }
  }
  return {};
}

function normalizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    normalized[key.toLowerCase().trim()] = value;
  }
  return normalized;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

type CustomCategoryRow = {
  id: string;
  name: string;
  emoji: string;
  sort_order?: number;
};

export function findCategoryMatch(
  rawInput: string,
  kind: BudgetKind,
  customCats: CustomCategoryRow[],
): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // 1. Direct ID match (custom UUID or standard ID)
  const byCustomId = customCats.find((c) => c.id === trimmed);
  if (byCustomId) return byCustomId.id;

  const standardCats =
    kind === "income" ? SKARBO_INCOME_CATEGORIES : SKARBO_EXPENSE_CATEGORIES;
  const byStandardId = standardCats.find(
    (c) => c.id.toLowerCase() === trimmed.toLowerCase(),
  );
  if (byStandardId) return byStandardId.id;

  // 2. Exact match with emoji + name (e.g. "🥑 Продукти")
  const trimmedLower = trimmed.toLowerCase();
  for (const c of customCats) {
    const formatted = `${c.emoji || "📦"} ${c.name}`.trim().toLowerCase();
    if (trimmedLower === formatted) return c.id;
  }
  for (const c of standardCats) {
    const formatted = `${c.emoji} ${c.name}`.trim().toLowerCase();
    if (trimmedLower === formatted) return c.id;
  }

  // 3. Strip leading emojis, symbols, whitespace to get just the text
  const cleanInput = trimmed
    .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}\uFE0F\u200D\s]+/u, "")
    .trim()
    .toLowerCase();

  if (cleanInput) {
    for (const c of customCats) {
      if (cleanInput === c.name.trim().toLowerCase()) return c.id;
    }
    for (const c of standardCats) {
      if (cleanInput === c.name.trim().toLowerCase()) return c.id;
    }
  }

  // 4. Exact emoji-only match (if input is just an emoji)
  for (const c of customCats) {
    if (c.emoji && trimmed === c.emoji.trim()) return c.id;
  }
  for (const c of standardCats) {
    if (c.emoji && trimmed === c.emoji.trim()) return c.id;
  }

  return null;
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBody = request.method === "POST" ? await parseRequestBody(request) : {};
  const body = normalizeBody(rawBody);

  const token = extractToken(request, body);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    console.error("[expense-ingest] 401 Unauthorized: token malformed or missing", {
      method: request.method,
      hasAuth: Boolean(request.headers.get("authorization")),
      tokenLength: token.length,
      tokenHint: token ? token.slice(-4) : "empty",
    });
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const resolved = await rest<{ user_id: string; couple_id: string }[]>(
      "rpc/resolve_budget_ingest_token",
      {
        method: "POST",
        body: JSON.stringify({ p_token: token }),
      },
    );
    const identity = resolved[0];
    if (!identity) {
      console.error("[expense-ingest] 401 Unauthorized: token not found in database", {
        tokenHint: token.slice(-4),
      });
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (request.method === "GET") {
      let customCategories: CustomCategoryRow[] = [];
      try {
        customCategories = await rest<CustomCategoryRow[]>(
          `budget_categories?couple_id=eq.${identity.couple_id}&kind=eq.expense&select=id,name,emoji,sort_order&order=sort_order.asc,name.asc`,
        );
      } catch (e) {
        console.warn("[expense-ingest] Failed to fetch custom categories for GET:", e);
      }

      const categorySet = new Set<string>();
      const categories: string[] = [];
      for (const c of SKARBO_EXPENSE_CATEGORIES) {
        const label = `${c.emoji} ${c.name}`.trim();
        if (!categorySet.has(label)) {
          categorySet.add(label);
          categories.push(label);
        }
      }
      for (const c of customCategories ?? []) {
        const label = `${c.emoji || "📦"} ${c.name}`.trim();
        if (!categorySet.has(label)) {
          categorySet.add(label);
          categories.push(label);
        }
      }

      return jsonResponse({ categories }, 200);
    }

    const rawAmount =
      body.amount ??
      body.сума ??
      body.sum ??
      body.price ??
      body.ціна ??
      body.value;
    const amount = parseApplePayAmount(rawAmount);
    if (amount === null) {
      console.error("[expense-ingest] 400 Invalid amount:", {
        rawAmount,
        availableKeys: Object.keys(body),
      });
      return jsonResponse({ error: "Invalid amount" }, 400);
    }

    const cardLabel = String(
      body.card ?? body.картка ?? body.card_label ?? body.account ?? "",
    )
      .trim()
      .slice(0, 60);
    const note = String(
      body.note ?? body.нотатка ?? body.коментар ?? body.comment ?? "",
    )
      .trim()
      .slice(0, 500);

    const isManual =
      cardLabel.toLowerCase() === "вручну" ||
      cardLabel.toLowerCase() === "manual";

    const rawMerchant =
      body.merchant ??
      body.name ??
      body.продавець ??
      body.назва ??
      body.store ??
      body.магазин ??
      body.payee;

    let merchant = "";
    if (rawMerchant !== undefined && rawMerchant !== null && String(rawMerchant).trim() !== "") {
      merchant = String(rawMerchant).trim().slice(0, 160);
    }

    if (!merchant) {
      if (isManual) {
        merchant = note ? note.slice(0, 160) : "Вручну";
      } else {
        merchant = "Apple Pay";
      }
    } else if (isManual && merchant.toLowerCase() === "apple pay") {
      merchant = note ? note.slice(0, 160) : "Вручну";
    }

    const kind: BudgetKind =
      body.kind === "income" || body.тип === "income" ? "income" : "expense";
    const { occurredOn, occurredAt } = parseOccurredDate(
      body.date ?? body.дата ?? body.time ?? body.час,
    );

    // Prevent accidental double-triggers from iOS Shortcuts within 45 seconds.
    const cutoff = new Date(Date.now() - 45_000).toISOString();
    const recent = await rest<
      {
        id: string;
        merchant: string;
        amount: number;
        status: string;
        category_key: string | null;
      }[]
    >(
      `budget_transactions?couple_id=eq.${identity.couple_id}&user_id=eq.${identity.user_id}&source=eq.apple_pay&amount=eq.${amount}&created_at=gte.${encodeURIComponent(cutoff)}&select=id,merchant,amount,status,category_key&limit=5`,
    ).catch(() => []);

    const normMerchant = normalizeMerchantName(merchant);
    const duplicate = recent.find(
      (row) => normalizeMerchantName(row.merchant) === normMerchant,
    );
    if (duplicate) {
      console.log("[expense-ingest] 200 Duplicate ignored:", {
        duplicateId: duplicate.id,
        merchant,
        amount,
      });
      return jsonResponse({
        ok: true,
        duplicate: true,
        id: duplicate.id,
        status: duplicate.status,
        category_key: duplicate.category_key,
      });
    }

    let customCategories: CustomCategoryRow[] = [];
    try {
      customCategories = await rest<CustomCategoryRow[]>(
        `budget_categories?couple_id=eq.${identity.couple_id}&kind=eq.${kind}&select=id,name,emoji,sort_order`,
      );
    } catch (e) {
      console.warn("[expense-ingest] Failed to fetch custom categories for matching:", e);
    }

    const rawCategory =
      body.category ??
      body.категорія ??
      body.cat ??
      body.category_key;

    let matchedCategoryKey: string | null = null;
    let matchedBy: string = "unmatched";

    if (rawCategory && typeof rawCategory === "string" && rawCategory.trim()) {
      const explicitKey = findCategoryMatch(rawCategory, kind, customCategories);
      if (explicitKey) {
        matchedCategoryKey = explicitKey;
        matchedBy = "user_choice";
      }
    }

    if (!matchedCategoryKey && !isGenericOrEmptyMerchant(merchant)) {
      const rules = await rest<(MerchantRuleLike & { id?: string })[]>(
        `budget_merchant_rules?couple_id=eq.${identity.couple_id}&select=id,merchant_pattern,normalized_pattern,category_key,kind`,
      ).catch((e) => {
        console.warn("[expense-ingest] Failed to fetch merchant rules:", e);
        return [];
      });

      // Filter out and delete any bogus rules for empty pattern or "Apple Pay"
      const bogusRules = (rules || []).filter(
        (r) => isGenericOrEmptyMerchant(r.normalized_pattern || r.merchant_pattern),
      );
      if (bogusRules.length > 0) {
        const ids = bogusRules.map((r) => r.id).filter(Boolean);
        if (ids.length > 0) {
          rest(`budget_merchant_rules?id=in.(${ids.join(",")})`, {
            method: "DELETE",
          }).catch(() => {});
        }
      }

      const validRules = (rules || []).filter(
        (r) => !isGenericOrEmptyMerchant(r.normalized_pattern || r.merchant_pattern),
      );

      const match = autoCategorizeMerchant(merchant, validRules, kind);
      if (match.category_key) {
        matchedCategoryKey = match.category_key;
        matchedBy = match.matched_by;
      }
    }

    const status = matchedCategoryKey ? "confirmed" : "needs_review";

    // Privacy logic: is_private = not share_income_with_partner for ALL transactions (both expenses and incomes),
    // default to true if settings missing or error occurs.
    let isPrivate = true;
    try {
      const settings = await rest<{ share_income_with_partner: boolean }[]>(
        `budget_settings?user_id=eq.${identity.user_id}&select=share_income_with_partner&limit=1`,
      );
      if (
        settings &&
        settings.length > 0 &&
        typeof settings[0].share_income_with_partner === "boolean"
      ) {
        isPrivate = !settings[0].share_income_with_partner;
      }
    } catch (err) {
      console.warn(
        "[expense-ingest] Failed to fetch budget_settings, defaulting is_private to true:",
        err,
      );
      isPrivate = true;
    }

    const inserted = await rest<
      {
        id: string;
        status: string;
        category_key: string | null;
      }[]
    >("budget_transactions", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        couple_id: identity.couple_id,
        user_id: identity.user_id,
        kind,
        amount,
        merchant,
        note,
        category_key: matchedCategoryKey,
        status,
        source: "apple_pay",
        is_private: isPrivate,
        card_label: cardLabel,
        occurred_on: occurredOn,
        occurred_at: occurredAt,
      }),
    });

    const created = inserted[0];
    console.log("[expense-ingest] 201 Created:", {
      id: created?.id,
      merchant,
      amount,
      status: created?.status ?? status,
      matched_by: matchedBy,
      category_key: created?.category_key ?? matchedCategoryKey,
      is_private: isPrivate,
    });

    return jsonResponse(
      {
        ok: true,
        duplicate: false,
        id: created?.id ?? null,
        status: created?.status ?? status,
        category_key: created?.category_key ?? matchedCategoryKey,
        matched_by: matchedBy,
      },
      201,
    );
  } catch (err) {
    console.error("[expense-ingest] 503 Internal Error:", err);
    return jsonResponse({ error: "Budget ingest unavailable" }, 503);
  }
}

if (import.meta.main) Deno.serve(handleRequest);
