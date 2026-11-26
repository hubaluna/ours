import type { Session } from "@supabase/supabase-js";
import type { Data } from "./types";

export type CachedAppState = {
  coupleId: string;
  data: Data;
  savedAt: number;
};

const appCacheKey = (scope: string) => `ours-app-cache-v1:${scope || "anon"}`;

export function readAppCache(scope: string, fallback: Data): CachedAppState | null {
  try {
    const raw = localStorage.getItem(appCacheKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedAppState> | null;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.coupleId !== "string" ||
      !parsed.coupleId.trim() ||
      !parsed.data ||
      typeof parsed.data !== "object"
    ) {
      return null;
    }
    const merged: Data = {
      ...fallback,
      ...parsed.data,
    };
    return {
      coupleId: parsed.coupleId,
      data: merged,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeAppCache(scope: string, coupleId: string, data: Data): void {
  if (!coupleId) return;
  const payload: CachedAppState = {
    coupleId,
    data,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(appCacheKey(scope), JSON.stringify(payload));
  } catch {
    // Fallback to a compact snapshot without large history/activity logs if storage is tight.
    try {
      const compact: CachedAppState = {
        coupleId,
        savedAt: payload.savedAt,
        data: {
          ...data,
          history: data.history.slice(0, 30),
          activities: data.activities.slice(0, 30),
          reads: data.reads.slice(0, 30),
          plantCare: data.plantCare.slice(0, 50),
          recipeCooks: data.recipeCooks.slice(0, 30),
          budgetTransactions: data.budgetTransactions.slice(0, 200),
        },
      };
      localStorage.setItem(appCacheKey(scope), JSON.stringify(compact));
    } catch {
      /* ignore storage quota errors */
    }
  }
}

export function clearAppCache(scope: string): void {
  try {
    localStorage.removeItem(appCacheKey(scope));
  } catch {
    /* ignore */
  }
}

export function readStoredSupabaseSession(): Session | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      const candidate =
        parsed && typeof parsed === "object"
          ? ("currentSession" in parsed
              ? (parsed as { currentSession?: unknown }).currentSession
              : parsed)
          : null;
      if (
        candidate &&
        typeof candidate === "object" &&
        "user" in candidate &&
        "access_token" in candidate &&
        typeof (candidate as { access_token?: unknown }).access_token === "string" &&
        typeof (candidate as { user?: { id?: unknown } }).user?.id === "string"
      ) {
        return candidate as Session;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}
