import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import {
  CardKnowledgeIndex,
  CardKnowledgeRelated,
  CardRelatedResult,
  CardRelatedSuggestion,
} from '../models/card-knowledge.model';
import { YgoCard } from '../models/ygo-card.model';
import { BanlistStatus, YgoFormat } from '../models/ygo-format.model';
import { CardLegalityFacade } from './card-legality.facade';

const INDEX_URL = 'assets/data/card-knowledge/related.json';

const RELATION_LABEL_KEYS: Record<string, string> = {
  gy_synergy: 'knowledge.reason.gySynergy',
  engine: 'knowledge.reason.engine',
  series: 'knowledge.reason.series',
  archetype: 'knowledge.reason.archetype',
  mentions_card: 'knowledge.reason.mentionsCard',
};

@Injectable({ providedIn: 'root' })
export class CardKnowledgeService {
  private readonly http = inject(HttpClient);
  private readonly cardLegality = inject(CardLegalityFacade);

  private readonly index$ = this.http.get<CardKnowledgeIndex>(INDEX_URL).pipe(
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  findRelated$(card: YgoCard, format: YgoFormat): Observable<CardRelatedResult> {
    return this.index$.pipe(
      switchMap((index) => {
        if (!index) {
          return of({ tags: [], series: [], suggestions: [], available: false });
        }
        const entry = index.entries[String(card.id)];
        if (!entry || entry.related.length === 0) {
          return of({
            tags: entry?.tags ?? [],
            series: entry?.series ?? [],
            suggestions: [],
            available: true,
          });
        }

        const stubs = entry.related.map((related) => this.toYgoCard(related));
        return this.cardLegality.evaluateMany$(stubs, format).pipe(
          map((legality) => ({
            tags: entry.tags,
            series: entry.series,
            suggestions: entry.related
              .filter((related) => {
                const verdict = legality.get(related.id)?.verdict;
                return verdict === 'legal' || verdict === 'restricted';
              })
              .map((related) => this.toSuggestion(related, card.name))
              .sort((a, b) => b.score - a.score),
            available: true,
          })),
        );
      }),
    );
  }

  private toYgoCard(related: CardKnowledgeRelated): YgoCard {
    const banTcg = related.banTcg as BanlistStatus | null;
    return {
      id: related.id,
      name: related.name,
      type: 'Card',
      desc: '',
      archetype: related.archetype ?? undefined,
      card_images: [
        {
          id: related.id,
          image_url: related.imageSmall.replace('cards_small', 'cards'),
          image_url_small: related.imageSmall,
        },
      ],
      banlist_info: banTcg ? { ban_tcg: banTcg } : undefined,
      misc_info: related.tcgDate ? [{ tcg_date: related.tcgDate }] : undefined,
    };
  }

  private toSuggestion(related: CardKnowledgeRelated, sourceName: string): CardRelatedSuggestion {
    const reasonKey = RELATION_LABEL_KEYS[related.relation] ?? 'knowledge.reason.related';
    let reasonParams: Record<string, string> | undefined;
    if (related.relation === 'mentions_card') {
      reasonParams = { name: sourceName };
    } else if (related.archetype) {
      reasonParams = { series: related.archetype };
    }

    return {
      cardId: related.id,
      name: related.name,
      relation: related.relation,
      score: related.score,
      archetype: related.archetype,
      imageSmall: related.imageSmall,
      reasonKey,
      reasonParams,
    };
  }
}
