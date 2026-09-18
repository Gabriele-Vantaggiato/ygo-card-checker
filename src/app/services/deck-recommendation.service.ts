import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { GetSuggestionsOptions, RecommendedCard, SynergyIndex } from '../models/deck-recommendation.model';
import { CardKnowledgeIndexService } from './card-knowledge-index.service';
import { SemanticIndexService } from './semantic-index.service';
import { getSuggestions } from '../utils/deck-recommendation.utils';

const SYNERGIES_URL = 'assets/data/card-knowledge/synergies.json';

/** Pillar 5 service. */
@Injectable({ providedIn: 'root' })
export class DeckRecommendationService {
  private readonly http = inject(HttpClient);
  private readonly cardKnowledgeIndexService = inject(CardKnowledgeIndexService);
  private readonly semanticIndexService = inject(SemanticIndexService);

  readonly synergies$ = this.http.get<SynergyIndex>(SYNERGIES_URL).pipe(
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  getSuggestions(
    deckQuantities: ReadonlyMap<number, number>,
    options: GetSuggestionsOptions = {},
  ): Observable<RecommendedCard[]> {
    return combineLatest([
      this.synergies$,
      this.semanticIndexService.profileMap$,
      this.cardKnowledgeIndexService.related$,
    ]).pipe(
      map(([synergyIndex, semanticProfiles, relatedIndex]) => {
        if (!synergyIndex || !relatedIndex) {
          return [];
        }
        const roster = this.cardKnowledgeIndexService.rosterFor(relatedIndex);
        return getSuggestions(deckQuantities, synergyIndex, semanticProfiles, roster, options);
      }),
    );
  }
}
