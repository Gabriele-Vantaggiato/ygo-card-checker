import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { CardKnowledgeIndex, CardKnowledgeRelated } from '../models/card-knowledge.model';
import { CompletionScoringProfile } from '../utils/completion-prompt.utils';
import {
  DatasetSynergyOptions,
  buildCardRosterMap,
  buildTagDocumentFrequency,
  buildTagToCardIdsIndex,
  retrieveDatasetSynergies,
} from '../utils/synergy-retrieval.utils';
import { mergeRelatedById } from '../utils/mechanic-synergy.utils';
import { CompletionRagService } from './completion-rag.service';

const INDEX_URL = 'assets/data/card-knowledge/related.json';

@Injectable({ providedIn: 'root' })
export class SynergyRetrievalService {
  private readonly http = inject(HttpClient);
  private readonly completionRag = inject(CompletionRagService);

  private readonly index$ = this.http.get<CardKnowledgeIndex>(INDEX_URL).pipe(
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  private rosterCache: Map<number, import('../models/card-knowledge.model').CardKnowledgeRosterMember> | null =
    null;
  private rosterIndexRef: CardKnowledgeIndex | null = null;
  private tagDfCache: Map<string, number> | null = null;
  private tagDfIndexRef: CardKnowledgeIndex | null = null;
  private tagIndexCache: Map<string, number[]> | null = null;
  private tagIndexRef: CardKnowledgeIndex | null = null;

  retrieve$(
    sourceId: number,
    profile: CompletionScoringProfile,
    excludeIds: ReadonlySet<number>,
    options?: DatasetSynergyOptions,
  ): Observable<CardKnowledgeRelated[]> {
    return this.index$.pipe(
      map((index) => {
        if (!index) {
          return [];
        }
        const sourceEntry = index.entries[String(sourceId)];
        if (!sourceEntry) {
          return [];
        }

        const roster = this.rosterFor(index);
        const tagDf = this.tagDfFor(index);
        const tagIndex = this.tagIndexFor(index);
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

  private rosterFor(index: CardKnowledgeIndex) {
    if (this.rosterCache && this.rosterIndexRef === index) {
      return this.rosterCache;
    }
    this.rosterIndexRef = index;
    this.rosterCache = buildCardRosterMap(index);
    return this.rosterCache;
  }

  private tagDfFor(index: CardKnowledgeIndex): Map<string, number> {
    if (this.tagDfCache && this.tagDfIndexRef === index) {
      return this.tagDfCache;
    }
    this.tagDfIndexRef = index;
    this.tagDfCache = buildTagDocumentFrequency(index);
    return this.tagDfCache;
  }

  private tagIndexFor(index: CardKnowledgeIndex): Map<string, number[]> {
    if (this.tagIndexCache && this.tagIndexRef === index) {
      return this.tagIndexCache;
    }
    this.tagIndexRef = index;
    this.tagIndexCache = buildTagToCardIdsIndex(index);
    return this.tagIndexCache;
  }
}
