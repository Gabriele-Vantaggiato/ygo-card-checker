import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';

export interface CooccurrencePartner {
  id: number;
  weight: number;
}

/** Card id (string key) -> strongest real-deck co-occurrence partners, pre-sorted/capped. */
export type CooccurrenceIndex = Record<string, CooccurrencePartner[]>;

const INDEX_URL = 'assets/data/deck-builder/cooccurrence.json';

@Injectable({ providedIn: 'root' })
export class DeckCooccurrenceService {
  private readonly http = inject(HttpClient);
  private index$: Observable<CooccurrenceIndex> | null = null;

  loadIndex$(): Observable<CooccurrenceIndex> {
    if (!this.index$) {
      this.index$ = this.http
        .get<CooccurrenceIndex>(INDEX_URL)
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }
    return this.index$;
  }

  /** Strongest recorded co-occurrence weight between the candidate and any deck card. */
  scoreFor(candidateId: number, deckCardIds: readonly number[], index: CooccurrenceIndex): number {
    const partners = index[String(candidateId)];
    if (!partners) {
      return 0;
    }
    const deckIds = new Set(deckCardIds);
    let best = 0;
    for (const partner of partners) {
      if (deckIds.has(partner.id) && partner.weight > best) {
        best = partner.weight;
      }
    }
    return best;
  }
}
