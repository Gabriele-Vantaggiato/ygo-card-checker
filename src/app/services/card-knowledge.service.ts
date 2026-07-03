import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CardKnowledgeEffect,
  CardKnowledgeIndex,
  CardRelatedResult,
  CardRelatedSuggestion,
  DeckRelatedResult,
} from '../models/card-knowledge.model';
import { Decklist } from '../models/decklist.model';
import { YgoCard } from '../models/ygo-card.model';
import { YgoFormat } from '../models/ygo-format.model';
import { CardKnowledgeIndexService } from './card-knowledge-index.service';
import { CardRelatedKnowledgeService } from './knowledge/card-related-knowledge.service';
import {
  DeckSuggestionOptions,
  DeckSuggestionService,
} from './knowledge/deck-suggestion.service';
import {
  effectLabelKey as effectLabelKeyFn,
  effectLabelParams as effectLabelParamsFn,
} from './knowledge/card-knowledge-labels';

export type { DeckSuggestionOptions } from './knowledge/deck-suggestion.service';
export { effectLabelKey, effectLabelParams } from './knowledge/card-knowledge-labels';

@Injectable({ providedIn: 'root' })
export class CardKnowledgeService {
  private readonly indexService = inject(CardKnowledgeIndexService);
  private readonly relatedKnowledge = inject(CardRelatedKnowledgeService);
  private readonly deckSuggestions = inject(DeckSuggestionService);

  findRelated$(card: YgoCard, format: YgoFormat): Observable<CardRelatedResult> {
    return this.relatedKnowledge.findRelated$(card, format);
  }

  findRelatedForDeck$(deck: Decklist, format: YgoFormat): Observable<DeckRelatedResult> {
    return this.deckSuggestions.findRelatedForDeck$(deck, format);
  }

  rankDeckSuggestions$(
    deck: Decklist,
    format: YgoFormat,
    limit = 80,
    options?: DeckSuggestionOptions,
  ): Observable<CardRelatedSuggestion[]> {
    return this.deckSuggestions.rankDeckSuggestions$(deck, format, limit, options);
  }

  rankSideStapleSuggestions$(
    deck: Decklist,
    format: YgoFormat,
    limit?: number,
  ): Observable<CardRelatedSuggestion[]> {
    return this.deckSuggestions.rankSideStapleSuggestions$(deck, format, limit);
  }

  knowledgeIndex$(): Observable<CardKnowledgeIndex | null> {
    return this.indexService.related$;
  }

  effectLabelKey(effect: CardKnowledgeEffect): string {
    return effectLabelKeyFn(effect);
  }

  effectLabelParams(effect: CardKnowledgeEffect): Record<string, string> | undefined {
    return effectLabelParamsFn(effect);
  }
}
