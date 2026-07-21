import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { YgoCard } from '../models/ygo-card.model';
import { Lang } from './i18n.service';

const DB_NAME = 'ygo-checker-card-cache';
const DB_VERSION = 1;
const STORE = 'cards';

/**
 * Persistent passcode→card cache (IndexedDB) keyed by UI language.
 * Makes repeat scans instant across sessions without shipping full card text.
 */
@Injectable({ providedIn: 'root' })
export class CardIdbCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  get$(id: number, lang: Lang): Observable<YgoCard | null> {
    return from(this.read(id, lang)).pipe(
      map((card) => card),
      catchError(() => of(null)),
    );
  }

  put(card: YgoCard, lang: Lang): void {
    void this.write(card, lang).catch(() => undefined);
  }

  private key(id: number, lang: Lang): string {
    return `${lang}:${id}`;
  }

  private openDb(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('indexedDB unavailable'));
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error ?? new Error('idb open failed'));
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
      });
    }
    return this.dbPromise;
  }

  private async read(id: number, lang: Lang): Promise<YgoCard | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(this.key(id, lang));
      req.onerror = () => reject(req.error ?? new Error('idb get failed'));
      req.onsuccess = () => resolve((req.result as YgoCard | undefined) ?? null);
    });
  }

  private async write(card: YgoCard, lang: Lang): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(card, this.key(card.id, lang));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('idb put failed'));
    });
  }
}
