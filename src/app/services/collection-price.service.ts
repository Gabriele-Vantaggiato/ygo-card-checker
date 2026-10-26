import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { extractCardmarketEur } from '../utils/collection.utils';
import { YgoApiService } from './ygo-api.service';

const STORAGE_KEY = 'ygo-collection-prices-v1';
const TTL_MS = 24 * 60 * 60 * 1000;

interface StoredPrices {
  savedAt: number;
  entries: [number, number | null][];
}

/** Cardmarket EUR price per passcode, cached in localStorage for 24 hours. */
@Injectable({ providedIn: 'root' })
export class CollectionPriceService {
  private readonly api = inject(YgoApiService);

  readonly prices = signal<ReadonlyMap<number, number | null>>(this.hydrate());

  async ensure(passcodes: readonly number[]): Promise<void> {
    const known = this.prices();
    const missing = [...new Set(passcodes)].filter((id) => id > 0 && !known.has(id));
    if (missing.length === 0) {
      return;
    }
    try {
      const cards = await firstValueFrom(this.api.getCardsByIds$(missing, 'en'));
      const next = new Map(known);
      for (const id of missing) {
        next.set(id, null);
      }
      for (const card of cards) {
        next.set(card.id, extractCardmarketEur(card));
      }
      this.prices.set(next);
      this.persist(next);
    } catch {
      // prices are optional: leave them unknown and retry on the next ensure()
    }
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
