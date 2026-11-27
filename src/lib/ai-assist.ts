import { supabase, supabasePublishableKey, supabaseUrl } from "./supabase";

export type AiReceiptResult = {
  amount: number | null;
  merchant: string;
  occurred_on: string | null;
  note: string;
  category_key: string | null;
};

export type AiRecipePhotoResult = {
  title: string;
  ingredients: string[];
  instructions: string[];
  base_servings: number | null;
  total_time_minutes: number | null;
};

export type AiShoppingItem = {
  name: string;
  quantity: number | null;
  unit: string;
  category: string;
};

async function authHeaders(): Promise<Record<string, string> | null> {
  if (!supabase || !supabaseUrl || !supabasePublishableKey) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    apikey: supabasePublishableKey,
  };
}

function endpointUrl(): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/ai-assist`;
}

export async function parseReceiptPhoto(
  file: File,
  categories: Array<{ id: string; name: string }>,
): Promise<{ data: AiReceiptResult | null; error: string | null }> {
  if (!navigator.onLine) {
    return { data: null, error: "Для розпізнавання чека потрібен інтернет." };
  }
  const headers = await authHeaders();
  if (!headers) {
    return {
      data: null,
      error: "Увійдіть у спільний простір, щоб розпізнавати чеки.",
    };
  }
  const form = new FormData();
  form.append("action", "receipt");
  form.append("image", file);
  form.append("categories", JSON.stringify(categories));
  try {
    const res = await fetch(endpointUrl(), {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(22_000),
    });
    if (res.status === 429) {
      return { data: null, error: "Забагато запитів. Спробуйте за хвилину." };
    }
    if (!res.ok) {
      return {
        data: null,
        error: "Розпізнавання чека зараз недоступне. Внесіть дані вручну.",
      };
    }
    const payload = (await res.json()) as Partial<AiReceiptResult> & {
      ok?: boolean;
    };
    if (!payload.ok) {
      return { data: null, error: "Не вдалося розпізнати чек." };
    }
    return {
      data: {
        amount: typeof payload.amount === "number" ? payload.amount : null,
        merchant: String(payload.merchant ?? ""),
        occurred_on:
          typeof payload.occurred_on === "string" ? payload.occurred_on : null,
        note: String(payload.note ?? ""),
        category_key:
          typeof payload.category_key === "string"
            ? payload.category_key
            : null,
      },
      error: null,
    };
  } catch {
    return {
      data: null,
      error: "Не вдалося розпізнати чек. Перевірте інтернет.",
    };
  }
}

export async function parseRecipePhoto(
  file: File,
): Promise<{ data: AiRecipePhotoResult | null; error: string | null }> {
  if (!navigator.onLine) {
    return { data: null, error: "Для розпізнавання рецепта потрібен інтернет." };
  }
  const headers = await authHeaders();
  if (!headers) {
    return {
      data: null,
      error: "Увійдіть у спільний простір, щоб розпізнавати фото рецептів.",
    };
  }
  const form = new FormData();
  form.append("action", "recipe_photo");
  form.append("image", file);
  try {
    const res = await fetch(endpointUrl(), {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(22_000),
    });
    if (res.status === 429) {
      return { data: null, error: "Забагато запитів. Спробуйте за хвилину." };
    }
    if (!res.ok) {
      return {
        data: null,
        error: "Розпізнавання фото зараз недоступне. Заповніть рецепт вручну.",
      };
    }
    const payload = (await res.json()) as Partial<AiRecipePhotoResult> & {
      ok?: boolean;
    };
    if (!payload.ok) {
      return { data: null, error: "Не вдалося прочитати рецепт із фото." };
    }
    return {
      data: {
        title: String(payload.title ?? ""),
        ingredients: Array.isArray(payload.ingredients)
          ? payload.ingredients.map(String)
          : [],
        instructions: Array.isArray(payload.instructions)
          ? payload.instructions.map(String)
          : [],
        base_servings:
          typeof payload.base_servings === "number"
            ? payload.base_servings
            : null,
        total_time_minutes:
          typeof payload.total_time_minutes === "number"
            ? payload.total_time_minutes
            : null,
      },
      error: null,
    };
  } catch {
    return {
      data: null,
      error: "Не вдалося прочитати фото. Перевірте інтернет.",
    };
  }
}

export async function parseShoppingPhrase(
  text: string,
): Promise<{ items: AiShoppingItem[]; error: string | null }> {
  if (!navigator.onLine) {
    return { items: [], error: "Для розумного розбору потрібен інтернет." };
  }
  const headers = await authHeaders();
  if (!headers) {
    return {
      items: [],
      error: "Увійдіть у спільний простір, щоб скористатися розбором.",
    };
  }
  try {
    const res = await fetch(endpointUrl(), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "shopping_text", text }),
      signal: AbortSignal.timeout(16_000),
    });
    if (res.status === 429) {
      return { items: [], error: "Забагато запитів. Спробуйте за хвилину." };
    }
    if (!res.ok) {
      return {
        items: [],
        error: "Розумний розбір зараз недоступний. Додайте товари через кому.",
      };
    }
    const payload = (await res.json()) as {
      ok?: boolean;
      items?: AiShoppingItem[];
    };
    if (!payload.ok || !Array.isArray(payload.items) || !payload.items.length) {
      return { items: [], error: "Не вдалося виділити продукти з фрази." };
    }
    return { items: payload.items, error: null };
  } catch {
    return {
      items: [],
      error: "Не вдалося розібрати фразу. Перевірте інтернет.",
    };
  }
}
