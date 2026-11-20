import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type CachedEntry = {
  url: string;
  isObjectUrl: boolean;
  expiresAt: number;
};

type StoredBlobRecord = {
  path: string;
  blob: Blob;
  lastAccessed: number;
};

const DB_NAME = "ours-photo-cache-v1";
const STORE_NAME = "blobs";
const MAX_CACHED_BLOBS = 120;
const SIGNED_URL_TTL_MS = 50 * 60 * 1000; // refresh 10m before 1h expiry

const memoryCache = new Map<string, CachedEntry>();
const inflight = new Map<string, Promise<string | null>>();
const prefetchedExternal = new Set<string>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "path" });
          store.createIndex("lastAccessed", "lastAccessed", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function readStoredBlob(path: string): Promise<Blob | null> {
  const db = await openCacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(path);
      getReq.onsuccess = () => {
        const record = getReq.result as StoredBlobRecord | undefined;
        if (!record?.blob) {
          resolve(null);
          return;
        }
        try {
          store.put({
            path: record.path,
            blob: record.blob,
            lastAccessed: Date.now(),
          });
        } catch {
          // ignore LRU touch failure
        }
        resolve(record.blob);
      };
      getReq.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeStoredBlob(path: string, blob: Blob): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({ path, blob, lastAccessed: Date.now() } satisfies StoredBlobRecord);
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
  if (path.startsWith("data:image/")) return path;
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

async function resolveStorageImage(path: string): Promise<string | null> {
  const immediate = getImmediateUrl(path);
  if (immediate) return immediate;

  const existing = inflight.get(path);
  if (existing) return existing;

  const task = (async (): Promise<string | null> => {
    // 1. Instant local disk hit from IndexedDB blob cache (0 network calls)
    if (canCreateObjectUrl()) {
      const stored = await readStoredBlob(path);
      if (stored) {
        const objectUrl = URL.createObjectURL(stored);
        memoryCache.set(path, {
          url: objectUrl,
          isObjectUrl: true,
          expiresAt: Number.POSITIVE_INFINITY,
        });
        return objectUrl;
      }
    }

    // 2. Fetch signed URL once from Supabase Storage
    if (!supabase) return null;
    const { data } = await supabase.storage
      .from("photos")
      .createSignedUrl(path, 3600);
    const signedUrl = data?.signedUrl ?? null;
    if (!signedUrl) return null;

    // 3. Cache signed URL immediately; try downloading blob for persistent disk cache
    memoryCache.set(path, {
      url: signedUrl,
      isObjectUrl: false,
      expiresAt: Date.now() + SIGNED_URL_TTL_MS,
    });

    if (canCreateObjectUrl() && typeof fetch === "function") {
      try {
        const response = await fetch(signedUrl);
        if (response.ok) {
          const blob = await response.blob();
          if (blob.size > 0 && blob.size < 12 * 1024 * 1024) {
            void writeStoredBlob(path, blob);
            const objectUrl = URL.createObjectURL(blob);
            memoryCache.set(path, {
              url: objectUrl,
              isObjectUrl: true,
              expiresAt: Number.POSITIVE_INFINITY,
            });
            return objectUrl;
          }
        }
      } catch {
        // Fallback to signedUrl already cached in memory
      }
    }

    return signedUrl;
  })().finally(() => {
    inflight.delete(path);
  });

  inflight.set(path, task);
  return task;
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
          !getImmediateUrl(p!),
      ),
    ),
  );
  if (!unique.length) return;

  let index = 0;
  const concurrency = 3;
  const worker = async () => {
    while (index < unique.length) {
      const next = unique[index++];
      if (!next) continue;
      try {
        await resolveStorageImage(next);
      } catch {
        // ignore prefetch failure
      }
    }
  };
  for (let i = 0; i < Math.min(concurrency, unique.length); i++) {
    void worker();
  }
}

export function prefetchExternalUrls(
  urls: Array<string | null | undefined>,
): void {
  if (typeof Image === "undefined") return;
  const unique = Array.from(
    new Set(
      urls.filter(
        (u): u is string =>
          Boolean(u) &&
          /^https?:\/\//i.test(u!) &&
          !prefetchedExternal.has(u!),
      ),
    ),
  ).slice(0, 24);
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
    const prev = memoryCache.get(path);
    if (prev?.isObjectUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
      try {
        URL.revokeObjectURL(prev.url);
      } catch {
        // ignore
      }
    }
    memoryCache.set(path, {
      url: objectUrl,
      isObjectUrl: true,
      expiresAt: Number.POSITIVE_INFINITY,
    });
  }
  void writeStoredBlob(path, blob);
}

export async function clearImageCache(): Promise<void> {
  for (const entry of memoryCache.values()) {
    if (entry.isObjectUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
      try {
        URL.revokeObjectURL(entry.url);
      } catch {
        // ignore
      }
    }
  }
  memoryCache.clear();
  inflight.clear();
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

export function useImage(path: string | null) {
  const [url, setUrl] = useState<string | null>(() => getImmediateUrl(path));

  useEffect(() => {
    const immediate = getImmediateUrl(path);
    setUrl(immediate);
    if (!path || path.startsWith("illustration:") || path.startsWith("data:image/")) {
      return;
    }
    if (immediate) return;

    let active = true;
    const load = () => {
      void resolveStorageImage(path).then((resolved) => {
        if (active && resolved) setUrl(resolved);
      });
    };
    load();

    // Only refresh if entry fell back to a time-limited signed URL
    const timer = window.setInterval(() => {
      const current = memoryCache.get(path);
      if (!current || (!current.isObjectUrl && current.expiresAt <= Date.now())) {
        memoryCache.delete(path);
        load();
      }
    }, 45 * 60 * 1000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [path]);

  return url;
}
