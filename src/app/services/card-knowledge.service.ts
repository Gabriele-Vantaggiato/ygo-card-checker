import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CardKnowledgeEffect,
  CardKnowledgeIndex,
  CardRelatedResult,
} from '../models/card-knowledge.model';
import { YgoCard } from '../models/ygo-card.model';
import { YgoFormat } from '../models/ygo-format.model';
import { CardKnowledgeIndexService } from './card-knowledge-index.service';
import { CardRelatedKnowledgeService } from './knowledge/card-related-knowledge.service';
import {
  effectLabelKey as effectLabelKeyFn,
  effectLabelParams as effectLabelParamsFn,
} from './knowledge/card-knowledge-labels';

export { effectLabelKey, effectLabelParams } from './knowledge/card-knowledge-labels';

@Injectable({ providedIn: 'root' })
export class CardKnowledgeService {
  private readonly indexService = inject(CardKnowledgeIndexService);
  private readonly relatedKnowledge = inject(CardRelatedKnowledgeService);

  findRelated$(card: YgoCard, format: YgoFormat): Observable<CardRelatedResult> {
    return this.relatedKnowledge.findRelated$(card, format);
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
