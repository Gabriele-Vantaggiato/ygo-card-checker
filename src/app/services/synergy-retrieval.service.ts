import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CardKnowledgeIndex, CardKnowledgeRelated } from '../models/card-knowledge.model';
import { CompletionScoringProfile } from '../utils/completion-prompt.utils';
import {
  DatasetSynergyOptions,
  retrieveDatasetSynergies,
} from '../utils/synergy-retrieval.utils';
import { mergeRelatedById } from '../utils/mechanic-synergy.utils';
import { CardKnowledgeIndexService } from './card-knowledge-index.service';
import { CompletionRagService } from './completion-rag.service';

@Injectable({ providedIn: 'root' })
export class SynergyRetrievalService {
  private readonly indexService = inject(CardKnowledgeIndexService);
  private readonly completionRag = inject(CompletionRagService);

  retrieve$(
    sourceId: number,
    profile: CompletionScoringProfile,
    excludeIds: ReadonlySet<number>,
    options?: DatasetSynergyOptions,
  ): Observable<CardKnowledgeRelated[]> {
    return this.indexService.related$.pipe(
      map((index) => {
        if (!index) {
          return [];
        }
        const sourceEntry = index.entries[String(sourceId)];
        if (!sourceEntry) {
          return [];
        }

        const roster = this.indexService.rosterFor(index);
        const tagDf = this.indexService.tagDfFor(index);
        const tagIndex = this.indexService.tagIndexFor(index);
        const dataset = retrieveDatasetSynergies(
          sourceId,
          sourceEntry,
          index,
          profile,
          excludeIds,
          roster,
          { ...options, minScore: options?.minScore ?? 0.48, tagDf, tagIndex },
        );

        const matchup = this.completionRag
          .toMatchupSuggestions(index, profile, excludeIds)
          .map((item) => ({
            id: item.cardId,
            name: item.name,
            relation: 'matchup',
            score: item.score * (profile.cardIdBoosts[item.cardId] ?? 1.2),
            archetype: item.archetype,
            tcgDate: null,
            banTcg: null,
            imageSmall: item.imageSmall,
          }));

        const precomputed = (sourceEntry.related ?? []).map((item) => ({
          ...item,
          score: item.score * 1.05,
        }));

        return mergeRelatedById(dataset, [...precomputed, ...matchup])
          .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
          .slice(0, options?.limit ?? 64);
      }),
      catchError(() => of([])),
    );
  }
}
