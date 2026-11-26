/**
 * Utilities for reliable on-demand Service Worker updates and cache invalidation,
 * designed to work around GitHub Pages HTTP caching (max-age=600) and iOS Safari PWA quirks.
 */

export type AppUpdateResult =
  | "reloading"
  | "up_to_date"
  | "offline"
  | "unsupported";

function getCurrentBuildId(): string {
  return typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "";
}

function getBasePath(): string {
  try {
    const base = import.meta.env?.BASE_URL;
    if (typeof base === "string" && base) {
      return base.endsWith("/") ? base : `${base}/`;
    }
  } catch {
    /* ignore */
  }
  return "/";
}

async function fetchRemoteBuildId(): Promise<string | null> {
  if (typeof fetch !== "function") return null;
  const urls = [`${getBasePath()}version.json?t=${Date.now()}`];
  if (typeof window !== "undefined" && window.location) {
    try {
      urls.push(
        new URL("version.json", window.location.href).href + `?t=${Date.now()}`,
      );
    } catch {
      /* ignore */
    }
  }
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("json")) continue;
      const data = (await res.json()) as { buildId?: unknown };
      if (typeof data?.buildId === "string" && data.buildId) {
        return data.buildId;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

async function bustSwScriptHttpCache(): Promise<void> {
  if (typeof fetch !== "function") return;
  const urls = [`${getBasePath()}sw.js?t=${Date.now()}`];
  if (typeof window !== "undefined" && window.location) {
    try {
      urls.push(
        new URL("sw.js", window.location.href).href + `?t=${Date.now()}`,
      );
    } catch {
      /* ignore */
    }
  }
  for (const url of urls) {
    try {
      await fetch(url, {
        cache: "reload",
        headers: { "Cache-Control": "no-cache, no-store" },
      });
    } catch {
      /* ignore */
    }
  }
}

function waitForInstallingWorker(
  worker: ServiceWorker,
  timeoutMs = 6000,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (worker.state === "installed" || worker.state === "activated") {
      resolve(true);
      return;
    }
    if (worker.state === "redundant") {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      worker.removeEventListener("statechange", onState);
      resolve(ok);
    };
    const onState = () => {
      if (worker.state === "installed" || worker.state === "activated") {
        finish(true);
      } else if (worker.state === "redundant") {
        finish(false);
      }
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    worker.addEventListener("statechange", onState);
  });
}

async function hasActivePushSubscription(
  reg: ServiceWorkerRegistration,
): Promise<boolean> {
  try {
    if (!reg.pushManager?.getSubscription) return false;
    const sub = await reg.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
}

function navigateCacheBusted(): void {
  if (typeof window === "undefined") return;
  try {
    const next = new URL(window.location.href);
    next.searchParams.set("_v", String(Date.now()));
    window.location.replace(next.toString());
  } catch {
    try {
      window.location.reload();
    } catch {
      /* ignore in jsdom */
    }
  }
}

/**
 * Checks for a new release both via non-cached version.json and Service Worker update(),
 * waits for an installing SW to finish, activates it, purges stale precaches, and reloads.
 */
export async function forceAppUpdate(options?: {
  updateServiceWorker?: (reloadPage?: boolean) => Promise<void>;
  currentBuildId?: string;
}): Promise<AppUpdateResult> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return "unsupported";
  }

  if (typeof navigator.onLine === "boolean" && !navigator.onLine) {
    return "offline";
  }

  let controllerChanged = false;
  const onControllerChange = () => {
    controllerChanged = true;
  };
  navigator.serviceWorker.addEventListener?.(
    "controllerchange",
    onControllerChange,
  );

  try {
    const localBuildId = options?.currentBuildId ?? getCurrentBuildId();
    const [remoteBuildId, reg] = await Promise.all([
      fetchRemoteBuildId(),
      navigator.serviceWorker.getRegistration(),
    ]);

    const remoteIsNewer = Boolean(
      localBuildId && remoteBuildId && remoteBuildId !== localBuildId,
    );

    let hasSwUpdate = false;

    if (reg) {
      if (reg.waiting) {
        hasSwUpdate = true;
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      // Attach updatefound listener BEFORE triggering update to capture installing worker reliably
      const updateFoundPromise = new Promise<ServiceWorker | null>((resolve) => {
        if (typeof reg.addEventListener !== "function") {
          resolve(reg.installing ?? null);
          return;
        }
        const onUpdate = () => {
          reg.removeEventListener?.("updatefound", onUpdate);
          resolve(reg.installing ?? null);
        };
        reg.addEventListener("updatefound", onUpdate);
        window.setTimeout(() => {
          reg.removeEventListener?.("updatefound", onUpdate);
          resolve(reg.installing ?? null);
        }, 2500);
      });

      // Bust browser HTTP cache for sw.js (especially on GitHub Pages max-age=600)
      await bustSwScriptHttpCache();
      await reg.update().catch(() => {});

      const installing = reg.installing || (await updateFoundPromise);
      if (installing) {
        hasSwUpdate = true;
        await waitForInstallingWorker(installing, 8000);
      }

      if (reg.waiting) {
        hasSwUpdate = true;
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }

    const hasUpdate = hasSwUpdate || controllerChanged || remoteIsNewer;

    if (!hasUpdate) {
      return "up_to_date";
    }

    // Wait for the new controller if a SW was waiting or installing
    if (
      hasSwUpdate &&
      !controllerChanged &&
      typeof navigator.serviceWorker?.addEventListener === "function"
    ) {
      await new Promise<void>((resolve) => {
        const onCtrl = () => {
          navigator.serviceWorker.removeEventListener?.(
            "controllerchange",
            onCtrl,
          );
          resolve();
        };
        navigator.serviceWorker.addEventListener?.(
          "controllerchange",
          onCtrl,
        );
        window.setTimeout(() => {
          navigator.serviceWorker.removeEventListener?.(
            "controllerchange",
            onCtrl,
          );
          resolve();
        }, 1500);
      });
    }

    // If server has a newer build but SW didn't detect it, clear stale SW & precaches
    if (remoteIsNewer && !hasSwUpdate && !controllerChanged) {
      await purgeStaticAssetCaches();
      if (reg && !(await hasActivePushSubscription(reg))) {
        await reg.unregister?.().catch(() => {});
      }
    } else if (!hasSwUpdate && !controllerChanged) {
      await purgeStaticAssetCaches();
    }

    if (options?.updateServiceWorker && hasSwUpdate) {
      try {
        await options.updateServiceWorker(true);
      } catch {
        /* fall through to cache-busted reload */
      }
    }

    navigateCacheBusted();
    return "reloading";
  } catch {
    return "up_to_date";
  } finally {
    navigator.serviceWorker.removeEventListener?.(
      "controllerchange",
      onControllerChange,
    );
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
 * Purges static caches, refreshes/unregisters stale Service Workers (preserving active Push),
 * and ALWAYS forces a cache-busted reload of the app.
 */
export async function hardReloadApp(options?: {
  updateServiceWorker?: (reloadPage?: boolean) => Promise<void>;
}): Promise<void> {
  if (typeof window === "undefined") return;

  await purgeStaticAssetCaches();

  let hadWaiting = false;
  try {
    if ("serviceWorker" in navigator) {
      await bustSwScriptHttpCache();
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const readWaiting = (
          registration: ServiceWorkerRegistration,
        ): ServiceWorker | null => registration.waiting;

        const initialWaiting = readWaiting(reg);
        if (initialWaiting) {
          hadWaiting = true;
          initialWaiting.postMessage({ type: "SKIP_WAITING" });
        } else {
          await reg.update().catch(() => {});
          if (reg.installing) {
            await waitForInstallingWorker(reg.installing, 3500);
          }
          const updatedWaiting = readWaiting(reg);
          if (updatedWaiting) {
            hadWaiting = true;
            updatedWaiting.postMessage({ type: "SKIP_WAITING" });
          } else if (!(await hasActivePushSubscription(reg))) {
            // Unregistering forces a 100% fresh index.html + sw.js fetch on iOS Safari
            await reg.unregister?.().catch(() => {});
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  if (options?.updateServiceWorker) {
    try {
      await options.updateServiceWorker(true);
    } catch {
      /* fallback below */
    }
    if (hadWaiting) {
      window.setTimeout(() => navigateCacheBusted(), 250);
      return;
    }
  }

  navigateCacheBusted();
}
