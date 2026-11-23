import { createClient } from "@supabase/supabase-js";
import publicConfig from "./public-config.json";
import { primeImageCache } from "../hooks/useImage";
// Only PUBLIC client credentials belong in this file. Environment values win.
// Test runs must never connect to a real project, even after public setup.
const isTest = import.meta.env.MODE === "test";
const isPlaceholder = (value: string | undefined) =>
  !value || /YOUR_PROJECT|YOUR_PUBLISHABLE|YOUR_ANON/i.test(value);
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const url = isTest
  ? ""
  : (!isPlaceholder(envUrl) ? envUrl : publicConfig.supabaseUrl) || "";
const key = isTest
  ? ""
  : (!isPlaceholder(envKey) ? envKey : publicConfig.supabasePublishableKey) ||
    "";
export const supabasePublishableKey = key;
export const configured = Boolean(
  url && key && !isPlaceholder(url) && !isPlaceholder(key),
);
export const supabase = configured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;
export async function checked<T>(
  request: PromiseLike<{ data: T; error: unknown }>,
): Promise<T> {
  const { data, error } = await request;
  if (error) throw error;
  return data;
}
export async function uploadImage(
  file: File,
  userId: string,
  coupleId: string,
): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Оберіть фотографію JPEG, PNG або WebP.");
  if (file.size > 12 * 1024 * 1024)
    throw new Error("Фото має бути менше 12 МБ.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (v) =>
        v ? resolve(v) : reject(new Error("Не вдалося підготувати фото.")),
      "image/webp",
      0.82,
    ),
  );
  if (blob.size > 5 * 1024 * 1024)
    throw new Error("Фото завелике. Оберіть інше.");
  if (!supabase)
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  const path = `${coupleId}/${userId}/${crypto.randomUUID()}.webp`;
  await checked(
    supabase.storage
      .from("photos")
      .upload(path, blob, { contentType: "image/webp" }),
  );
  primeImageCache(path, blob);
  return path;
}

// PostgREST returns at most 1,000 rows by default. Page history explicitly.
export async function readAll<T>(
  table: string,
  filters: Record<string, string> = {},
  order = "created_at",
  ascending = true,
  limit?: number,
): Promise<T[]> {
  if (!supabase) return [];
  const result: T[] = [];
  const hasIdColumn =
    table !== "budget_settings" && table !== "budget_ingest_tokens";
  const batchSize = limit ? Math.min(500, limit) : 500;
  for (let offset = 0; ; offset += batchSize) {
    let query = supabase
      .from(table)
      .select("*")
      .order(order, { ascending });
    if (hasIdColumn && order !== "id") {
      query = query.order("id");
    }
    const end = limit
      ? Math.min(offset + batchSize - 1, limit - 1)
      : offset + batchSize - 1;
    query = query.range(offset, end);
    for (const [key, value] of Object.entries(filters))
      query = query.eq(key, value);
    const page = (await checked(query)) as unknown as T[];
    result.push(...page);
    if (page.length < batchSize || (limit && result.length >= limit)) {
      return limit ? result.slice(0, limit) : result;
    }
  }
}
