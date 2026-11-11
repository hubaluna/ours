type PreviewResponse<T> = {
  data: T | null;
  error: { context?: unknown } | null;
};

function statusOf(error: PreviewResponse<unknown>["error"]): number | null {
  if (!error?.context || typeof error.context !== "object") return null;
  const status = (error.context as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

/** Retry one transient page-fetch failure without repeating auth or rate-limit errors. */
export async function retryLinkPreview422<T>(
  request: () => Promise<PreviewResponse<T>>,
  delay: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<PreviewResponse<T>> {
  const first = await request();
  if (!first.error || statusOf(first.error) !== 422) return first;
  await delay(300);
  return request();
}
