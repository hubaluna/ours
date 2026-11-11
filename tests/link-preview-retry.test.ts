import { describe, expect, it, vi } from "vitest";
import { retryLinkPreview422 } from "../src/lib/link-preview-retry";

describe("recipe link preview retry", () => {
  it("retries exactly once after an HTTP 422 page-fetch failure", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { context: new Response(null, { status: 422 }) },
      })
      .mockResolvedValueOnce({ data: { title: "Панкейки" }, error: null });
    const delay = vi.fn(async () => {});

    await expect(retryLinkPreview422(request, delay)).resolves.toEqual({
      data: { title: "Панкейки" },
      error: null,
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledOnce();
    expect(delay).toHaveBeenCalledWith(300);
  });

  it.each([401, 403, 429, 500])("does not retry HTTP %i", async (status) => {
    const response = {
      data: null,
      error: { context: new Response(null, { status }) },
    };
    const request = vi.fn().mockResolvedValue(response);
    const delay = vi.fn(async () => {});

    await expect(retryLinkPreview422(request, delay)).resolves.toBe(response);
    expect(request).toHaveBeenCalledOnce();
    expect(delay).not.toHaveBeenCalled();
  });
});
