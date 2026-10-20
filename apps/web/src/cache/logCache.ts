import type { ImportSuccess } from "../workers/protocol.ts";

const DB_NAME = "meseta_ledger_cache";
const STORE_NAME = "parsed_logs";
const DB_VERSION = 1;

interface CachedEntry {
  cacheKey: string;
  fileName: string;
  size: number;
  readChat: boolean;
  timestamp: number;
  parsed: ImportSuccess;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memoryCache = new Map<string, ImportSuccess>();

function getDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export function buildCacheKey(fileName: string, size: number, readChat: boolean): string {
  return `${fileName}:${size}:chat=${readChat}`;
}

export async function getCachedParsedLog(cacheKey: string): Promise<ImportSuccess | null> {
  // 1. メモリキャッシュを最優先チェック（同期即時）
  const inMemory = memoryCache.get(cacheKey);
  if (inMemory) return inMemory;

  // 2. IndexedDB から復元
  const db = await getDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);
      req.onsuccess = () => {
        const entry = req.result as CachedEntry | undefined;
        if (entry?.parsed) {
          memoryCache.set(cacheKey, entry.parsed);
          resolve(entry.parsed);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setCachedParsedLog(
  cacheKey: string,
  fileName: string,
  size: number,
  readChat: boolean,
  parsed: ImportSuccess,
): Promise<void> {
  memoryCache.set(cacheKey, parsed);

  const db = await getDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const entry: CachedEntry = {
        cacheKey,
        fileName,
        size,
        readChat,
        timestamp: Date.now(),
        parsed,
      };
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
