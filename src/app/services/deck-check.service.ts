import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Decklist } from '../models/decklist.model';
import { YgoFormat } from '../models/ygo-format.model';
import { CardCheck, DeckIssue, checkDeck } from '../utils/deck-check.utils';
import { CardLegalityFacade } from './card-legality.facade';
import { I18nService } from './i18n.service';
import { YgoApiService } from './ygo-api.service';

export interface DeckCheckResult {
  deckId: string;
  deckName: string;
  cardCount: number;
  issues: DeckIssue[];
}

/** Re-evaluates every saved deck against one format (cards keep the legality of when they were added). */
@Injectable({ providedIn: 'root' })
export class DeckCheckService {
  private readonly ygoApi = inject(YgoApiService);
  private readonly cardLegality = inject(CardLegalityFacade);
  private readonly i18n = inject(I18nService);

  checkDecks$(decks: readonly Decklist[], format: YgoFormat): Observable<DeckCheckResult[]> {
    const ids = [...new Set(decks.flatMap((deck) => deck.cards.map((card) => card.id)))];
    const checks$: Observable<Map<number, CardCheck>> =
      ids.length === 0
        ? of(new Map())
        : this.ygoApi.getCardsByIds$(ids, this.i18n.lang()).pipe(
            switchMap((cards) => this.cardLegality.evaluateMany$(cards, format)),
            map((results) => {
              const checks = new Map<number, CardCheck>();
              for (const [id, result] of results) {
                checks.set(id, { banlistStatus: result.banlistStatus, verdict: result.verdict });
              }
              return checks;
            }),
          );

    return checks$.pipe(
      map((checks) =>
        decks.map((deck) => ({
          deckId: deck.id,
          deckName: deck.name,
          cardCount: deck.cards.reduce((sum, card) => sum + card.quantity, 0),
          issues: checkDeck(deck.cards, checks),
        })),
      ),
    );
  }
}
