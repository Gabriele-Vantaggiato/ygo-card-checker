import { Injectable, inject } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { LegalityResult, YgoCard } from '../models/ygo-card.model';
import { YgoFormat } from '../models/ygo-format.model';
import { LegalityService } from './legality.service';

@Injectable({ providedIn: 'root' })
export class CardLegalityFacade {
  private readonly legalityService = inject(LegalityService);

  evaluate$(card: YgoCard, format: YgoFormat): Observable<LegalityResult> {
    if (this.legalityService.needsLocalBanlist(format)) {
      return this.legalityService.evaluateWithLocalBanlist$(card, format);
    }

    return of(
      this.legalityService.evaluate(
        card,
        format,
        this.legalityService.readBanlistFromCard(card, format),
      ),
    );
  }

  evaluateMany$(cards: readonly YgoCard[], format: YgoFormat): Observable<Map<number, LegalityResult>> {
    if (cards.length === 0) {
      return of(new Map());
    }

    return forkJoin(
      cards.map((card) =>
        this.evaluate$(card, format).pipe(
          map((result) => ({ cardId: card.id, result: result as LegalityResult | null })),
          catchError(() => of({ cardId: card.id, result: null as LegalityResult | null })),
        ),
      ),
    ).pipe(
      map((entries) => {
        const out = new Map<number, LegalityResult>();
        for (const { cardId, result } of entries) {
          if (result) {
            out.set(cardId, result);
          }
        }
        return out;
      }),
    );
  }
}
