import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type CachedEntry = {
  url: string;
  isObjectUrl: boolean;
  expiresAt: number;
};

type StoredBufferRecord = {
  path: string;
  buffer: ArrayBuffer;
  type: string;
  lastAccessed: number;
};

const LEGACY_DB_NAME = "ours-photo-cache-v1";
const DB_NAME = "ours-photo-cache-v2";
const STORE_NAME = "blobs";
const MAX_CACHED_BLOBS = 120;
const MAX_BLOB_BYTES = 12 * 1024 * 1024;
const MAX_MEMORY_CACHE = 60;
const MAX_BG_CACHE_CONCURRENCY = 3;
const SIGNED_URL_TTL_MS = 50 * 60 * 1000; // refresh 10m before 1h expiry
const IDB_TIMEOUT_MS = 1200;

const memoryCache = new Map<string, CachedEntry>();
const inflight = new Map<string, Promise<string | null>>();
const backgroundCaching = new Set<string>();
const bgQueue: Array<{ path: string; signedUrl: string }> = [];
let bgActiveCount = 0;
const prefetchedExternal = new Set<string>();
const listeners = new Map<string, Set<(url: string | null) => void>>();

function setMemoryCache(path: string, entry: CachedEntry): void {
  const prev = memoryCache.get(path);
  if (prev && prev.url !== entry.url) {
    revokeEntry(prev);
  }
  memoryCache.delete(path);
  memoryCache.set(path, entry);
  while (memoryCache.size > MAX_MEMORY_CACHE) {
    const oldestKey = memoryCache.keys().next().value;
    if (!oldestKey) break;
    revokeEntry(memoryCache.get(oldestKey));
    memoryCache.delete(oldestKey);
  }
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
let legacyCleaned = false;

function notifyPath(path: string, url: string | null): void {
  const subs = listeners.get(path);
  if (!subs) return;
  for (const fn of subs) fn(url);
}

function subscribePath(
  path: string,
  fn: (url: string | null) => void,
): () => void {
  let subs = listeners.get(path);
  if (!subs) {
    subs = new Set();
    listeners.set(path, subs);
  }
  subs.add(fn);
  return () => {
    subs?.delete(fn);
    if (subs && subs.size === 0) listeners.delete(path);
  };
}

function revokeEntry(entry: CachedEntry | undefined): void {
  if (entry?.isObjectUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
    try {
      URL.revokeObjectURL(entry.url);
    } catch {
      // ignore
    }
  }
}

function normalizeMimeType(rawType: string | null | undefined, path: string): string {
  const clean = (rawType ?? "").split(";")[0].trim().toLowerCase();
  if (clean.startsWith("image/")) return clean;
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".avif")) return "image/avif";
  return "image/webp";
}

function isValidImageResponse(contentType: string | null, blobType: string): boolean {
  const ct = (contentType ?? "").split(";")[0].trim().toLowerCase();
  const bt = (blobType ?? "").split(";")[0].trim().toLowerCase();
  if (ct.startsWith("text/") || ct === "application/json" || ct === "application/xml") {
    return false;
  }
  if (bt.startsWith("text/") || bt === "application/json" || bt === "application/xml") {
    return false;
  }
  return ct.startsWith("image/") || bt.startsWith("image/") || ct === "application/octet-stream" || (!ct && !bt);
}

function cleanStoragePath(path: string): string {
  return path.replace(/^\/+/, "");
}

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!legacyCleaned) {
    legacyCleaned = true;
    try {
      // Wipe v1 DB that stored raw Blob objects (unreliable in iOS Safari WebKit)
      indexedDB.deleteDatabase(LEGACY_DB_NAME);
    } catch {
      // ignore
    }
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (!db) dbPromise = null;
      resolve(db);
    };
    const timer = window.setTimeout(() => finish(null), IDB_TIMEOUT_MS);

    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "path" });
          store.createIndex("lastAccessed", "lastAccessed", { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        finish(db);
      };
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
  return dbPromise;
}

async function readStoredBlob(path: string): Promise<Blob | null> {
  const db = await openCacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(blob);
    };
    const timer = window.setTimeout(() => finish(null), IDB_TIMEOUT_MS);

    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(path);
      getReq.onsuccess = () => {
        const record = getReq.result as StoredBufferRecord | undefined;
        if (
          !record ||
          !(record.buffer instanceof ArrayBuffer) ||
          record.buffer.byteLength === 0
        ) {
          finish(null);
          return;
        }
        const mime = normalizeMimeType(record.type, path);
        finish(new Blob([record.buffer], { type: mime }));
      };
      getReq.onerror = () => finish(null);
      tx.onerror = () => finish(null);
      tx.onabort = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

async function writeStoredBuffer(
  path: string,
  buffer: ArrayBuffer,
  type: string,
): Promise<void> {
  if (!buffer || buffer.byteLength <= 0 || buffer.byteLength >= MAX_BLOB_BYTES) {
    return;
  }
  const db = await openCacheDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, IDB_TIMEOUT_MS * 2);

    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({
        path,
        buffer,
        type: normalizeMimeType(type, path),
        lastAccessed: Date.now(),
      } satisfies StoredBufferRecord);
      const countReq = store.count();
      countReq.onsuccess = () => {
        const excess = countReq.result - MAX_CACHED_BLOBS;
        if (excess <= 0) return;
        const index = store.index("lastAccessed");
        let removed = 0;
        const cursorReq = index.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || removed >= excess) return;
          cursor.delete();
          removed++;
          cursor.continue();
        };
      };
      tx.oncomplete = finish;
      tx.onerror = finish;
      tx.onabort = finish;
    } catch {
      finish();
    }
  });
}

async function deleteStoredBuffer(path: string): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

function getImmediateUrl(path: string | null): string | null {
  if (!path || path.startsWith("illustration:")) return null;
  if (
    path.startsWith("data:image/") ||
    path.startsWith("https://") ||
    path.startsWith("http://")
  ) {
    return path;
  }
  const cached = memoryCache.get(path);
  if (!cached) return null;
  if (cached.isObjectUrl || cached.expiresAt > Date.now()) {
    return cached.url;
  }
  return null;
}

function canCreateObjectUrl(): boolean {
  return (
    typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
  );
}

function drainBackgroundQueue(): void {
  while (bgActiveCount < MAX_BG_CACHE_CONCURRENCY && bgQueue.length > 0) {
    const next = bgQueue.shift();
    if (!next) break;
    bgActiveCount++;
    void (async () => {
      try {
        const signal =
          typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
            ? AbortSignal.timeout(15_000)
            : undefined;
        const response = await fetch(next.signedUrl, signal ? { signal } : undefined);
        if (!response.ok) return;
        const contentType = response.headers.get("content-type");
        const blob = await response.blob();
        if (
          blob.size <= 0 ||
          blob.size >= MAX_BLOB_BYTES ||
          !isValidImageResponse(contentType, blob.type)
        ) {
          return;
        }
        const mime = normalizeMimeType(contentType || blob.type, next.path);
        const buffer = await blob.arrayBuffer();
        if (buffer.byteLength <= 0) return;
        await writeStoredBuffer(next.path, buffer, mime);
      } catch {
        // Signed URL already renders the image directly; skip disk cache silently
      } finally {
        backgroundCaching.delete(next.path);
        bgActiveCount--;
        drainBackgroundQueue();
      }
    })();
  }
}

function cacheBlobInBackground(path: string, signedUrl: string): void {
  if (
    !canCreateObjectUrl() ||
    typeof fetch !== "function" ||
    backgroundCaching.has(path)
  ) {
    return;
  }
  backgroundCaching.add(path);
  bgQueue.push({ path, signedUrl });
  drainBackgroundQueue();
}

async function fetchDirectSignedUrl(path: string): Promise<string | null> {
  if (!supabase) return null;
  const clean = cleanStoragePath(path);
  if (!clean) return null;
  try {
    const { data, error } = await supabase.storage
      .from("photos")
      .createSignedUrl(clean, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

async function resolveStorageImage(
  path: string,
  options?: { skipDiskCache?: boolean },
): Promise<string | null> {
  if (!options?.skipDiskCache) {
    const immediate = getImmediateUrl(path);
    if (immediate) return immediate;
  }

  const existing = inflight.get(path);
  if (existing && !options?.skipDiskCache) return existing;

  const task = (async (): Promise<string | null> => {
    // 1. Instant local disk hit from IndexedDB ArrayBuffer cache (iOS Safari safe)
    if (!options?.skipDiskCache && canCreateObjectUrl()) {
      const stored = await readStoredBlob(path);
      if (stored && stored.size > 0) {
        const objectUrl = URL.createObjectURL(stored);
        setMemoryCache(path, {
          url: objectUrl,
          isObjectUrl: true,
          expiresAt: Number.POSITIVE_INFINITY,
        });
        return objectUrl;
      }
    }

    // 2. Request signed URL from Supabase Storage and return IMMEDIATELY for fastest paint
    const signedUrl = await fetchDirectSignedUrl(path);
    if (!signedUrl) return null;

    setMemoryCache(path, {
      url: signedUrl,
      isObjectUrl: false,
      expiresAt: Date.now() + SIGNED_URL_TTL_MS,
    });

    // 3. Persist ArrayBuffer to IndexedDB in background for 0ms loads on future sessions
    cacheBlobInBackground(path, signedUrl);

    return signedUrl;
  })().finally(() => {
    if (inflight.get(path) === task) {
      inflight.delete(path);
    }
  });

  inflight.set(path, task);
  return task;
}

/**
 * Self-healing recovery when an <img> fails to load (e.g. revoked blob URL after iOS
 * backgrounding or an expired signed URL). Evicts bad cache entries and fetches a fresh
 * signed URL directly from Supabase Storage.
 */
export async function recoverImage(path: string | null): Promise<string | null> {
  if (
    !path ||
    path.startsWith("illustration:") ||
    path.startsWith("data:image/") ||
    path.startsWith("https://") ||
    path.startsWith("http://")
  ) {
    return null;
  }
  revokeEntry(memoryCache.get(path));
  memoryCache.delete(path);
  inflight.delete(path);
  void deleteStoredBuffer(path);

  const fresh = await resolveStorageImage(path, { skipDiskCache: true });
  notifyPath(path, fresh);
  return fresh;
}

/**
 * Rewrites oversized third-party media URLs (Wikimedia, TVMaze, TMDB, Amazon/IMDb)
 * to crisp, lightweight thumbnails for fast mobile loading. Callers should fall back
 * to the original rawUrl on <img> onError just in case a host lacks that size variant.
 */
export function optimizeExternalImageUrl(
  rawUrl: string,
  variant: "thumb" | "detail" = "thumb",
): string {
  const trimmed = rawUrl.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();

    // TMDB: swap original / huge sizes for w342 (list) or w500 (detail)
    if (host === "image.tmdb.org") {
      const target = variant === "detail" ? "w500" : "w342";
      const nextPath = parsed.pathname.replace(
        /^\/t\/p\/(?:original|w780|w1280)\//i,
        `/t/p/${target}/`,
      );
      if (nextPath !== parsed.pathname) {
        parsed.pathname = nextPath;
        return parsed.toString();
      }
      return trimmed;
    }

    // TVMaze: use medium_portrait (~15 KB) instead of multi-MB original_untouched
    if (host === "static.tvmaze.com" && variant === "thumb") {
      const nextPath = parsed.pathname.replace(
        /^\/uploads\/images\/original_untouched\//i,
        "/uploads/images/medium_portrait/",
      );
      if (nextPath !== parsed.pathname) {
        parsed.pathname = nextPath;
        return parsed.toString();
      }
      return trimmed;
    }

    // Wikimedia / Wikipedia: downscale oversized thumbnails or request 320px/640px thumb
    if (host === "upload.wikimedia.org") {
      const targetPx = variant === "detail" ? 640 : 320;
      const thumbMatch = parsed.pathname.match(
        /^(.*\/thumb\/.+?\/)(\d+)px-([^/]+)$/i,
      );
      if (thumbMatch) {
        const currentPx = Number(thumbMatch[2]);
        if (Number.isFinite(currentPx) && currentPx > targetPx + 80) {
          parsed.pathname = `${thumbMatch[1]}${targetPx}px-${thumbMatch[3]}`;
          return parsed.toString();
        }
        return trimmed;
      }
      const rawWikiMatch = parsed.pathname.match(
        /^\/wikipedia\/(commons|uk|en)\/([0-9a-f]\/[0-9a-f]{2}\/([^/]+\.(?:jpe?g|png|webp)))$/i,
      );
      if (rawWikiMatch) {
        parsed.pathname = `/wikipedia/${rawWikiMatch[1]}/thumb/${rawWikiMatch[2]}/${targetPx}px-${rawWikiMatch[3]}`;
        return parsed.toString();
      }
      return trimmed;
    }

    // IMDb / Amazon posters: resize full _V1_.jpg down to UX360 / UX600
    if (host === "m.media-amazon.com") {
      const targetPx = variant === "detail" ? 600 : 360;
      const nextPath = parsed.pathname.replace(
        /\._V1_\.(jpe?g|png|webp)$/i,
        `._V1_UX${targetPx}_.$1`,
      );
      if (nextPath !== parsed.pathname) {
        parsed.pathname = nextPath;
        return parsed.toString();
      }
      return trimmed;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

export function prefetchImages(paths: Array<string | null | undefined>): void {
  if (!supabase) return;
  const unique = Array.from(
    new Set(
      paths.filter(
        (p): p is string =>
          Boolean(p) &&
          !p!.startsWith("illustration:") &&
          !p!.startsWith("data:image/") &&
          !p!.startsWith("https://") &&
          !p!.startsWith("http://") &&
          !getImmediateUrl(p!),
      ),
    ),
  );
  if (!unique.length) return;

  void (async () => {
    // 1. Hydrate everything already in IndexedDB locally (0 network calls)
    const missing: string[] = [];
    if (canCreateObjectUrl()) {
      await Promise.all(
        unique.map(async (path) => {
          if (getImmediateUrl(path)) return;
          const stored = await readStoredBlob(path);
          if (stored && stored.size > 0) {
            const objectUrl = URL.createObjectURL(stored);
            setMemoryCache(path, {
              url: objectUrl,
              isObjectUrl: true,
              expiresAt: Number.POSITIVE_INFINITY,
            });
            notifyPath(path, objectUrl);
          } else {
            missing.push(path);
          }
        }),
      );
    } else {
      missing.push(...unique);
    }

    if (!missing.length || !supabase) return;

    // 2. Batch-sign all remaining storage paths in ONE HTTP call instead of N sequential calls
    const cleanToRaw = new Map<string, string>();
    const cleanPaths: string[] = [];
    for (const raw of missing) {
      const clean = cleanStoragePath(raw);
      if (!clean || cleanToRaw.has(clean)) continue;
      cleanToRaw.set(clean, raw);
      cleanPaths.push(clean);
    }
    if (!cleanPaths.length) return;

    try {
      const { data, error } = await supabase.storage
        .from("photos")
        .createSignedUrls(cleanPaths, 3600);
      if (!error && Array.isArray(data)) {
        for (const item of data) {
          if (!item?.path || !item?.signedUrl) continue;
          const rawPath = cleanToRaw.get(item.path) ?? item.path;
          if (!getImmediateUrl(rawPath)) {
            setMemoryCache(rawPath, {
              url: item.signedUrl,
              isObjectUrl: false,
              expiresAt: Date.now() + SIGNED_URL_TTL_MS,
            });
            notifyPath(rawPath, item.signedUrl);
          }
          cacheBlobInBackground(rawPath, item.signedUrl);
        }
        return;
      }
    } catch {
      // Fall back to individual signing below
    }

    // Fallback if createSignedUrls is unavailable
    let index = 0;
    const concurrency = 3;
    const worker = async () => {
      while (index < missing.length) {
        const next = missing[index++];
        if (!next) continue;
        try {
          await resolveStorageImage(next);
        } catch {
          // ignore prefetch failure
        }
      }
    };
    for (let i = 0; i < Math.min(concurrency, missing.length); i++) {
      void worker();
    }
  })();
}

export function prefetchExternalUrls(
  urls: Array<string | null | undefined>,
): void {
  if (typeof Image === "undefined") return;
  const unique = Array.from(
    new Set(
      urls
        .filter((u): u is string => Boolean(u) && /^https?:\/\//i.test(u!))
        .map((u) => optimizeExternalImageUrl(u, "thumb"))
        .filter((u) => !prefetchedExternal.has(u)),
    ),
  ).slice(0, 36);
  for (const url of unique) {
    prefetchedExternal.add(url);
    const img = new Image();
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = url;
  }
}

export function primeImageCache(path: string, blob: Blob): void {
  if (!path || !blob || blob.size <= 0) return;
  if (canCreateObjectUrl()) {
    const objectUrl = URL.createObjectURL(blob);
    setMemoryCache(path, {
      url: objectUrl,
      isObjectUrl: true,
      expiresAt: Number.POSITIVE_INFINITY,
    });
    notifyPath(path, objectUrl);
  }
  const mime = normalizeMimeType(blob.type, path);
  void blob
    .arrayBuffer()
    .then((buffer) => writeStoredBuffer(path, buffer, mime))
    .catch(() => {
      // ignore disk prime failure
    });
}

export async function clearImageCache(): Promise<void> {
  for (const entry of memoryCache.values()) {
    revokeEntry(entry);
  }
  memoryCache.clear();
  inflight.clear();
  backgroundCaching.clear();
  bgQueue.length = 0;
  prefetchedExternal.clear();
  const db = await openCacheDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

let sharedLifecycleInstalled = false;
let sharedRefreshTimer: number | null = null;

function ensureSharedImageLifecycle(): void {
  if (sharedLifecycleInstalled || typeof window === "undefined") return;
  sharedLifecycleInstalled = true;
  const refreshStale = (onlyMissing: boolean) => {
    for (const path of listeners.keys()) {
      const current = memoryCache.get(path);
      const stale =
        !current || (!current.isObjectUrl && current.expiresAt <= Date.now());
      if (onlyMissing ? !getImmediateUrl(path) : stale) {
        if (stale) memoryCache.delete(path);
        void resolveStorageImage(path).then((resolved) => {
          if (resolved) notifyPath(path, resolved);
        });
      }
    }
  };
  window.addEventListener("online", () => refreshStale(true));
  sharedRefreshTimer = window.setInterval(
    () => refreshStale(false),
    45 * 60 * 1000,
  );
  void sharedRefreshTimer;
}

export function useImage(path: string | null) {
  const [url, setUrl] = useState<string | null>(() => getImmediateUrl(path));

  useEffect(() => {
    const immediate = getImmediateUrl(path);
    setUrl(immediate);
    if (
      !path ||
      path.startsWith("illustration:") ||
      path.startsWith("data:image/") ||
      path.startsWith("https://") ||
      path.startsWith("http://")
    ) {
      return;
    }

    ensureSharedImageLifecycle();

    let active = true;
    const unsubscribe = subscribePath(path, (nextUrl) => {
      if (active) setUrl(nextUrl);
    });

    if (!immediate) {
      void resolveStorageImage(path).then((resolved) => {
        if (active && resolved) setUrl(resolved);
      });
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [path]);

  return url;
}
