import {
  autoCategorizeMerchant,
  normalizeMerchantName,
  parseApplePayAmount,
  type BudgetKind,
  type MerchantRuleLike,
} from "../_shared/budget-categorizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    throw new Error(`Supabase REST error ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function extractToken(request: Request, body: Record<string, unknown>): string {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth.trim())?.[1]?.trim();
  const headerToken = request.headers.get("x-ours-budget-token")?.trim();
  const bodyToken = typeof body.token === "string" ? body.token.trim() : "";
  return bearer || headerToken || bodyToken || "";
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

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    body = raw as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const token = extractToken(request, body);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
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
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const rawAmount = body.amount ?? body.сума;
    const amount = parseApplePayAmount(rawAmount);
    if (amount === null) {
      return jsonResponse({ error: "Invalid amount" }, 400);
    }

    const rawMerchant =
      body.merchant ??
      body.name ??
      body.продавець ??
      body.назва ??
      "Apple Pay";
    const merchant = String(rawMerchant).trim().slice(0, 160) || "Apple Pay";
    const cardLabel = String(body.card ?? body.картка ?? "")
      .trim()
      .slice(0, 60);
    const note = String(body.note ?? body.нотатка ?? "")
      .trim()
      .slice(0, 500);
    const kind: BudgetKind =
      body.kind === "income" || body.тип === "income" ? "income" : "expense";
    const { occurredOn, occurredAt } = parseOccurredDate(
      body.date ?? body.дата,
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
    );
    const normMerchant = normalizeMerchantName(merchant);
    const duplicate = recent.find(
      (row) => normalizeMerchantName(row.merchant) === normMerchant,
    );
    if (duplicate) {
      return jsonResponse({
        ok: true,
        duplicate: true,
        id: duplicate.id,
        status: duplicate.status,
        category_key: duplicate.category_key,
      });
    }

    const rules = await rest<MerchantRuleLike[]>(
      `budget_merchant_rules?couple_id=eq.${identity.couple_id}&select=merchant_pattern,normalized_pattern,category_key,kind`,
    );
    const match = autoCategorizeMerchant(merchant, rules, kind);
    const status = match.category_key ? "confirmed" : "needs_review";

    let isPrivate = false;
    if (kind === "income") {
      const settings = await rest<{ share_income_with_partner: boolean }[]>(
        `budget_settings?user_id=eq.${identity.user_id}&select=share_income_with_partner&limit=1`,
      );
      isPrivate = !(settings[0]?.share_income_with_partner ?? false);
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
        category_key: match.category_key,
        status,
        source: "apple_pay",
        is_private: isPrivate,
        card_label: cardLabel,
        occurred_on: occurredOn,
        occurred_at: occurredAt,
      }),
    });

    const created = inserted[0];
    return jsonResponse(
      {
        ok: true,
        duplicate: false,
        id: created?.id ?? null,
        status: created?.status ?? status,
        category_key: created?.category_key ?? match.category_key,
        matched_by: match.matched_by,
      },
      201,
    );
  } catch {
    return jsonResponse({ error: "Budget ingest unavailable" }, 503);
  }
}

if (import.meta.main) Deno.serve(handleRequest);
