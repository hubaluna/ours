// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAppCache,
  readAppCache,
  readStoredSupabaseSession,
  writeAppCache,
} from "../src/lib/app-cache";
import { readDemo } from "../src/lib/demo";
import { formatLastSeen } from "../src/lib/utils";

describe("app offline cache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes, reads, and clears cached coupleId and data", () => {
    const empty = { ...readDemo(), shopping: [], profiles: [] };
    const sample = readDemo();

    expect(readAppCache("user-1", empty)).toBeNull();

    writeAppCache("user-1", "couple-abc", sample);
    const restored = readAppCache("user-1", empty);

    expect(restored).not.toBeNull();
    expect(restored?.coupleId).toBe("couple-abc");
    expect(restored?.data.shopping).toEqual(sample.shopping);
    expect(restored?.data.profiles).toEqual(sample.profiles);
    expect(restored?.savedAt).toBeGreaterThan(0);

    clearAppCache("user-1");
    expect(readAppCache("user-1", empty)).toBeNull();
  });

  it("ignores corrupted cache entries", () => {
    const empty = readDemo();
    localStorage.setItem("ours-app-cache-v1:user-2", "{not-json");
    expect(readAppCache("user-2", empty)).toBeNull();

    localStorage.setItem(
      "ours-app-cache-v1:user-2",
      JSON.stringify({ coupleId: "", data: {} }),
    );
    expect(readAppCache("user-2", empty)).toBeNull();
  });

  it("reads stored Supabase session from localStorage for offline startup", () => {
    expect(readStoredSupabaseSession()).toBeNull();

    localStorage.setItem(
      "sb-example-auth-token",
      JSON.stringify({
        access_token: "token-123",
        refresh_token: "refresh-123",
        user: { id: "user-42", email: "test@example.com" },
      }),
    );

    const session = readStoredSupabaseSession();
    expect(session?.access_token).toBe("token-123");
    expect(session?.user.id).toBe("user-42");
  });

  it("formats partner last seen time in Ukrainian", () => {
    const now = new Date("2026-11-26T14:00:00Z"); // 16:00 Kyiv
    expect(formatLastSeen(null, now)).toBeNull();
    expect(formatLastSeen("2026-11-26T13:59:30Z", now)).toBe(
      "зараз у застосунку",
    );
    expect(formatLastSeen("2026-11-26T12:15:00Z", now)).toBe(
      "сьогодні о 14:15",
    );
    expect(formatLastSeen("2026-11-25T18:30:00Z", now)).toBe("вчора о 20:30");
    expect(formatLastSeen("2026-11-20T10:05:00Z", now)).toContain("12:05");
  });
});
