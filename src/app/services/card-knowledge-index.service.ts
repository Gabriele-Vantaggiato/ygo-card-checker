import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import {
  CardKnowledgeIndex,
  CardKnowledgeRosterMember,
  FormatLegalityIndex,
} from '../models/card-knowledge.model';
import { ComboIndex } from '../models/card-combo.model';
import {
  buildCardRosterMap,
  buildTagDocumentFrequency,
  buildTagToCardIdsIndex,
} from '../utils/synergy-retrieval.utils';

const RELATED_URL = 'assets/data/card-knowledge/related.json';
const COMBOS_URL = 'assets/data/card-knowledge/combos.json';
const FORMAT_LEGALITY_URL = 'assets/data/card-knowledge/format-legality.json';

@Injectable({ providedIn: 'root' })
export class CardKnowledgeIndexService {
  private readonly http = inject(HttpClient);

  readonly related$ = this.load<CardKnowledgeIndex>(RELATED_URL);
  readonly combos$ = this.load<ComboIndex>(COMBOS_URL);
  readonly formatLegality$ = this.load<FormatLegalityIndex>(FORMAT_LEGALITY_URL);

  private rosterCache: Map<number, CardKnowledgeRosterMember> | null = null;
  private rosterIndexRef: CardKnowledgeIndex | null = null;
  private tagDfCache: Map<string, number> | null = null;
  private tagDfIndexRef: CardKnowledgeIndex | null = null;
  private tagIndexCache: Map<string, number[]> | null = null;
  private tagIndexRef: CardKnowledgeIndex | null = null;

  rosterFor(index: CardKnowledgeIndex): Map<number, CardKnowledgeRosterMember> {
    if (this.rosterCache && this.rosterIndexRef === index) {
      return this.rosterCache;
    }
    this.rosterIndexRef = index;
    this.rosterCache = buildCardRosterMap(index);
    return this.rosterCache;
  }

  tagDfFor(index: CardKnowledgeIndex): Map<string, number> {
    if (this.tagDfCache && this.tagDfIndexRef === index) {
      return this.tagDfCache;
    }
    this.tagDfIndexRef = index;
    this.tagDfCache = buildTagDocumentFrequency(index);
    return this.tagDfCache;
  }

  tagIndexFor(index: CardKnowledgeIndex): Map<string, number[]> {
    if (this.tagIndexCache && this.tagIndexRef === index) {
      return this.tagIndexCache;
    }
    this.tagIndexRef = index;
    this.tagIndexCache = buildTagToCardIdsIndex(index);
    return this.tagIndexCache;
  }

  private load<T>(url: string): Observable<T | null> {
    return this.http.get<T>(url).pipe(
      catchError(() => of(null)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
