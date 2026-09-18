import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Decklist } from '../models/decklist.model';
import { DeckHealthReport } from '../models/deck-health.model';
import { SemanticIndexService } from './semantic-index.service';
import { analyzeDeckHealth } from '../utils/deck-health.utils';

/** Pillar 6 service. */
@Injectable({ providedIn: 'root' })
export class DeckHealthAnalyzerService {
  private readonly semanticIndexService = inject(SemanticIndexService);

  analyze(deck: Decklist): Observable<DeckHealthReport> {
    return this.semanticIndexService.profileMap$.pipe(
      map((semanticProfiles) => analyzeDeckHealth(deck.cards, semanticProfiles)),
    );
  }
}
