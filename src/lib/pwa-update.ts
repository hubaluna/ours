/**
 * Utilities for on-demand Service Worker updates and cache invalidation.
 */

export type AppUpdateResult =
  | "reloading"
  | "up_to_date"
  | "offline"
  | "unsupported";

/**
 * Checks for a new Service Worker release upstream, purges stale
 * precaches if found or requested, and reloads the app.
 */
export async function forceAppUpdate(options?: {
  updateServiceWorker?: (reloadPage?: boolean) => Promise<void>;
}): Promise<AppUpdateResult> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return "unsupported";
  }

  if (typeof navigator.onLine === "boolean" && !navigator.onLine) {
    return "offline";
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    let hasUpdate = false;

    if (reg) {
      if (reg.waiting) {
        hasUpdate = true;
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      await reg.update().catch(() => {});

      if (reg.waiting || reg.installing) {
        hasUpdate = true;
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      }
    }

    if (options?.updateServiceWorker && hasUpdate) {
      await options.updateServiceWorker(true);
      return "reloading";
    }

    if (hasUpdate) {
      await purgeStaticAssetCaches();
      window.location.reload();
      return "reloading";
    }

    return "up_to_date";
  } catch {
    return "up_to_date";
  }
}

/**
 * Purges workbox and static precaches without touching user data in IndexedDB or localStorage.
 */
export async function purgeStaticAssetCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const names = await caches.keys();
    for (const name of names) {
      if (
        name.includes("workbox") ||
        name.includes("ours-precache") ||
        name.includes("precache") ||
        name.includes("assets")
      ) {
        await caches.delete(name);
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Purges static caches and immediately reloads the page.
 */
export async function hardReloadApp(options?: {
  updateServiceWorker?: (reloadPage?: boolean) => Promise<void>;
}): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }
  } catch {
    /* ignore */
  }

  await purgeStaticAssetCaches();

  if (options?.updateServiceWorker) {
    try {
      await options.updateServiceWorker(true);
      return;
    } catch {
      /* fallback to location.reload */
    }
  }

  window.location.reload();
}
