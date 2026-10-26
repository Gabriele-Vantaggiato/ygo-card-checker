import { Injectable } from '@angular/core';

const DB_NAME = 'ygo-checker-collection';
const DB_VERSION = 1;
const STORE = 'kv';

/** Tiny key/value store for the collection snapshot and the offline queue. Never throws. */
@Injectable({ providedIn: 'root' })
export class CollectionCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  async get<T>(key: string): Promise<T | null> {
    try {
      const db = await this.openDb();
      return await new Promise<T | null>((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        req.onerror = () => reject(req.error ?? new Error('idb get failed'));
        req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      });
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('idb put failed'));
        tx.onabort = () => reject(tx.error ?? new Error('idb put aborted'));
      });
    } catch {
      // cache is best-effort
    }
  }

  private openDb(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('indexedDB unavailable'));
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => {
          this.dbPromise = null;
          reject(req.error ?? new Error('idb open failed'));
        };
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) {
            req.result.createObjectStore(STORE);
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
          };
          resolve(db);
        };
      });
    }
    return this.dbPromise;
  }
}
