import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { extractCardmarketEur } from '../utils/collection.utils';
import { YgoCard } from '../models/ygo-card.model';

const STORAGE_KEY = 'ygo-collection-prices-v1';
const API_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const CHUNK_SIZE = 25;
const TTL_MS = 24 * 60 * 60 * 1000;

interface StoredPrices {
  savedAt: number;
  entries: [number, number | null][];
}

/** Cardmarket EUR price per passcode, cached in localStorage for 24 hours. */
@Injectable({ providedIn: 'root' })
export class CollectionPriceService {
  private readonly http = inject(HttpClient);

  readonly prices = signal<ReadonlyMap<number, number | null>>(this.hydrate());
  private readonly inFlight = new Set<number>();

  async ensure(passcodes: readonly number[]): Promise<void> {
    const missing = [...new Set(passcodes)].filter((id) => id > 0 && !this.known(id) && !this.inFlight.has(id));
    if (missing.length === 0) {
      return;
    }
    let anySucceeded = false;
    for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
      const chunk = missing.slice(i, i + CHUNK_SIZE);
      for (const id of chunk) {
        this.inFlight.add(id);
      }
      try {
        const res = await firstValueFrom(
          this.http.get<{ data?: YgoCard[] }>(`${API_URL}?id=${chunk.join(',')}`),
        );
        const cards = res?.data ?? [];
        // build from the current value (after the await) so concurrent calls don't overwrite each other
        const next = new Map(this.prices());
        for (const id of chunk) {
          next.set(id, null);
        }
        for (const card of cards) {
          next.set(card.id, extractCardmarketEur(card));
        }
        this.prices.set(next);
        anySucceeded = true;
      } catch (err) {
        // a 400 means "no card matches" for this API: treat as a successful empty result
        if (err instanceof HttpErrorResponse && err.status === 400) {
          const next = new Map(this.prices());
          for (const id of chunk) {
            next.set(id, null);
          }
          this.prices.set(next);
          anySucceeded = true;
        }
        // other failures: leave ids unknown so a later ensure() retries
      } finally {
        for (const id of chunk) {
          this.inFlight.delete(id);
        }
      }
    }
    if (anySucceeded) {
      this.persist(this.prices());
    }
  }

  private known(id: number): boolean {
    return untracked(() => this.prices().has(id));
  }

  private hydrate(): ReadonlyMap<number, number | null> {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as StoredPrices | null;
      if (stored && Date.now() - stored.savedAt < TTL_MS) {
        return new Map(stored.entries);
      }
    } catch {
      // corrupt or unavailable storage
    }
    return new Map();
  }

  private persist(prices: ReadonlyMap<number, number | null>): void {
    try {
      const stored: StoredPrices = { savedAt: Date.now(), entries: [...prices] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // storage full or unavailable
    }
  }
}
