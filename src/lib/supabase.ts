import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key && !url.includes("YOUR_PROJECT"));
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
  return path;
}

// PostgREST returns at most 1,000 rows by default. Page history explicitly.
export async function readAll<T>(
  table: string,
  filters: Record<string, string> = {},
  order = "created_at",
  ascending = true,
): Promise<T[]> {
  if (!supabase) return [];
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase
      .from(table)
      .select("*")
      .order(order, { ascending })
      .order("id")
      .range(offset, offset + 499);
    for (const [key, value] of Object.entries(filters))
      query = query.eq(key, value);
    const page = (await checked(query)) as unknown as T[];
    result.push(...page);
    if (page.length < 500) return result;
  }
}
