import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { YgoFormat } from '../../models/ygo-format.model';
import { DeckRouletteService } from '../../services/deck-roulette.service';
import { I18nService } from '../../services/i18n.service';
import { YgoApiService } from '../../services/ygo-api.service';
import { buildFormatCardStats, buildFormatStaples } from '../../utils/format-staples.utils';
import { DeckBuilderAiService } from './deck-builder-ai.service';
import { GateCardFacts } from './deck-builder-gate.util';
import { WaveContext } from '../../utils/wave-planner.utils';

/** Smallest pool whose statistics are trusted for a guided completion. */
const MIN_POOL = 100;

/** What the UI needs to draw a card. */
export interface WaveCardInfo {
  id: number;
  name: string;
  type: string;
  imageUrlSmall: string | null;
  /** Level / rank / link rating line, e.g. "Lv 4", when the card has one. */
  stats: string | null;
  /** Effect text, in the interface language. */
  desc: string;
}

/** The AI's opinion on a choice: the options best first and a reason per card. */
export interface WaveAdvice {
  /** Card ids ordered from most to least suitable (only the ones the model ranked). */
  order: number[];
  reasons: ReadonlyMap<number, string>;
}

/** Prepares the data for the wave-by-wave completion and loads the cards it proposes. */
@Injectable({ providedIn: 'root' })
export class WaveCompletionService {
  private readonly roulette = inject(DeckRouletteService);
  private readonly ygoApi = inject(YgoApiService);
  private readonly i18n = inject(I18nService);
  private readonly ai = inject(DeckBuilderAiService);
  private readonly contexts = new WeakMap<object, Pick<WaveContext, 'staples' | 'stats'>>();

  /** The planner's context for a format, or null when the format has no pool or model data (use the classic completion). */
  context$(format: YgoFormat, targets: { main: number; extra: number; side: number }): Observable<WaveContext | null> {
    return combineLatest([
      this.roulette.loadPool$(format.id),
      this.roulette.loadCardMeta$(),
      this.roulette.loadCompetitiveContext$(format.id),
    ]).pipe(
      map(([pool, meta, competitive]) => {
        if (pool.length < MIN_POOL || meta.size === 0 || !competitive) return null;
        let derived = this.contexts.get(pool as object);
        if (!derived) {
          derived = { staples: buildFormatStaples(pool), stats: buildFormatCardStats(pool) };
          this.contexts.set(pool as object, derived);
        }
        return {
          pool,
          meta,
          links: competitive.links,
          usage: competitive.usage,
          staples: derived.staples,
          stats: derived.stats,
          targets,
          competitive,
          optimizer: { lambda: 4 },
        } satisfies WaveContext;
      }),
    );
  }

  /** Names, types and images for the given cards (missing ones are simply absent from the result). */
  cards$(ids: readonly number[]): Observable<Map<number, WaveCardInfo>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return of(new Map());
    return this.ygoApi.getCardsByIds$(unique, this.i18n.lang()).pipe(
      map((cards) => {
        const out = new Map<number, WaveCardInfo>();
        for (const card of cards) {
          const level = card.level;
          out.set(card.id, {
            id: card.id,
            name: card.name,
            type: card.type,
            imageUrlSmall: card.card_images[0]?.image_url_small ?? null,
            stats: level ? `${/Link/i.test(card.type) ? 'Link' : /XYZ/i.test(card.type) ? 'Rank' : 'Lv'} ${level}` : null,
            desc: card.desc ?? '',
          });
        }
        return out;
      }),
    );
  }

  /**
   * Asks the configured AI to read the options' effect texts and rank them for this deck. Resolves to null when
   * no provider answers, so the caller keeps the data-based recommendation. Nothing is sent unless this is called.
   */
  advise$(
    optionIds: readonly number[],
    info: ReadonlyMap<number, WaveCardInfo>,
    deckSummary: string,
    context: string,
  ): Observable<WaveAdvice | null> {
    const facts: GateCardFacts[] = [];
    for (const id of optionIds) {
      const c = info.get(id);
      if (!c) return of(null);
      facts.push({ id, name: c.name, desc: c.desc, archetype: null, setcodes: [], type: c.type, isExtraDeck: false, banTcg: null });
    }
    return this.ai.rankWithEffects$(facts, deckSummary, context, this.i18n.lang() === 'it' ? 'it' : 'en').pipe(
      map((suggestions) => {
        if (suggestions.length === 0) return null;
        return { order: suggestions.map((s) => s.cardId), reasons: new Map(suggestions.map((s) => [s.cardId, s.reason])) };
      }),
    );
  }
}
