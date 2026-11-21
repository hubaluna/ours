// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  forceAppUpdate,
  purgeStaticAssetCaches,
  hardReloadApp,
} from "../src/lib/pwa-update";

describe("pwa-update", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns offline when navigator is offline", async () => {
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: {},
      configurable: true,
    });
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      configurable: true,
    });

    const result = await forceAppUpdate();
    expect(result).toBe("offline");
  });

  it("returns unsupported when serviceWorker is missing", async () => {
    const originalSW = Reflect.get(window.navigator, "serviceWorker");
    Reflect.deleteProperty(window.navigator, "serviceWorker");
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });

    const result = await forceAppUpdate();
    expect(result).toBe("unsupported");

    if (originalSW) {
      Object.defineProperty(window.navigator, "serviceWorker", {
        value: originalSW,
        configurable: true,
      });
    }
  });

  it("updates service worker and triggers updateServiceWorker when update is found", async () => {
    const postMessage = vi.fn();
    const update = vi.fn().mockResolvedValue(undefined);
    const mockReg = {
      waiting: { postMessage },
      update,
    };
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(window.navigator, "serviceWorker", {
      value: {
        getRegistration: vi.fn().mockResolvedValue(mockReg),
      },
      configurable: true,
    });
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });

    const result = await forceAppUpdate({ updateServiceWorker });
    expect(result).toBe("reloading");
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("purges only workbox and precache entries", async () => {
    const deleted: string[] = [];
    const mockCaches = {
      keys: vi
        .fn()
        .mockResolvedValue([
          "workbox-precache-v1",
          "ours-precache",
          "user-images",
        ]),
      delete: vi.fn().mockImplementation((name: string) => {
        deleted.push(name);
        return Promise.resolve(true);
      }),
    };

    Object.defineProperty(window, "caches", {
      value: mockCaches,
      configurable: true,
    });

    await purgeStaticAssetCaches();
    expect(deleted).toContain("workbox-precache-v1");
    expect(deleted).toContain("ours-precache");
    expect(deleted).not.toContain("user-images");
  });

  it("detects a newer build via version.json even when SW reg.update finds no waiting worker", async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const update = vi.fn().mockResolvedValue(undefined);
    const mockReg = {
      waiting: null,
      installing: null,
      update,
      unregister,
    };

    Object.defineProperty(window.navigator, "serviceWorker", {
      value: {
        getRegistration: vi.fn().mockResolvedValue(mockReg),
      },
      configurable: true,
    });
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: () => Promise.resolve({ buildId: "build-new-2" }),
    } as unknown as Response);

    const result = await forceAppUpdate({ currentBuildId: "build-old-1" });
    expect(result).toBe("reloading");
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it("hardReloadApp calls updateServiceWorker or reloads window", async () => {
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
    const unregister = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: {
        getRegistration: vi.fn().mockResolvedValue({
          waiting: null,
          installing: null,
          update: vi.fn().mockResolvedValue(undefined),
          unregister,
        }),
      },
      configurable: true,
    });

    await hardReloadApp({ updateServiceWorker });
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    expect(unregister).toHaveBeenCalledTimes(1);
  });
});
