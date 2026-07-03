import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { CardKnowledgeIndex, CardKnowledgeRosterMember, CardRelatedSuggestion } from '../models/card-knowledge.model';
import {
  CompletionRagResult,
  CompletionScoringProfile,
  DeckCompletionDirection,
  buildCompletionProfile,
  mergeCompletionProfiles,
  profileSummary,
} from '../utils/completion-prompt.utils';
import { detectMatchupKeys } from '../utils/matchup.utils';
import { CardKnowledgeIndexService } from './card-knowledge-index.service';
import { OllamaCompletionIntent, OllamaService } from './ollama.service';

@Injectable({ providedIn: 'root' })
export class CompletionRagService {
  private readonly indexService = inject(CardKnowledgeIndexService);
  private readonly ollama = inject(OllamaService);

  buildProfile$(
    direction: DeckCompletionDirection,
    prompt: string,
    useOllama: boolean,
  ): Observable<CompletionRagResult> {
    return this.indexService.related$.pipe(
      switchMap((index) => {
        const base = buildCompletionProfile(direction, prompt);
        const catalog = index?.matchupCatalog ?? [];
        const ruleKeys = detectMatchupKeys(prompt, catalog);
        let profile = this.enrichFromMatchups(base, index, ruleKeys);
        const sources: CompletionRagResult['sources'] = ['rules'];

        if (ruleKeys.length > 0) {
          sources.push('matchup');
        }

        if (!useOllama || prompt.trim().length < 8) {
          return of({
            profile,
            summary: profileSummary(profile),
            sources,
            ollamaUsed: false,
          });
        }

        return this.ollama.isAvailable$().pipe(
          switchMap((available) => {
            if (!available) {
              return of({
                profile,
                summary: profileSummary(profile),
                sources,
                ollamaUsed: false,
              });
            }

            return this.ollama.parseCompletionIntent$(prompt, direction, catalog).pipe(
              map((intent) => {
                if (!intent) {
                  return {
                    profile,
                    summary: profileSummary(profile),
                    sources,
                    ollamaUsed: false,
                  };
                }

                profile = this.mergeOllamaIntent(profile, intent, index);
                return {
                  profile,
                  summary: profileSummary(profile),
                  sources: [...sources, 'ollama'] as CompletionRagResult['sources'],
                  ollamaUsed: true,
                };
              }),
            );
          }),
        );
      }),
    );
  }

  toMatchupSuggestions(
    index: CardKnowledgeIndex | null,
    profile: CompletionScoringProfile,
    deckCardIds: ReadonlySet<number>,
  ): CardRelatedSuggestion[] {
    const members = this.matchupMembers(index, profile, deckCardIds);
    return members.map((member) => ({
      cardId: member.id,
      name: member.name,
      relation: 'engine',
      score: 1.05 * (profile.cardIdBoosts[member.id] ?? 1),
      archetype: member.archetype,
      imageSmall: member.imageSmall,
      reasonKey: 'decklist.completion.reason.matchup',
      reasonParams: {
        matchup: profile.matchupKeys[0] ?? 'meta',
      },
    }));
  }

  private matchupMembers(
    index: CardKnowledgeIndex | null,
    profile: CompletionScoringProfile,
    deckCardIds: ReadonlySet<number>,
  ): CardKnowledgeRosterMember[] {
    if (!index?.matchupIndex) {
      return [];
    }

    const merged = new Map<number, CardKnowledgeRosterMember>();
    for (const key of profile.matchupKeys) {
      for (const member of index.matchupIndex[key] ?? []) {
        if (deckCardIds.has(member.id) || merged.has(member.id)) {
          continue;
        }
        merged.set(member.id, member);
      }
    }

    return [...merged.values()].sort((a, b) => {
      const boostA = profile.cardIdBoosts[a.id] ?? 1;
      const boostB = profile.cardIdBoosts[b.id] ?? 1;
      return boostB - boostA || a.name.localeCompare(b.name);
    });
  }

  private enrichFromMatchups(
    profile: CompletionScoringProfile,
    index: CardKnowledgeIndex | null,
    matchupKeys: string[],
  ): CompletionScoringProfile {
    if (!index?.matchupIndex || matchupKeys.length === 0) {
      return profile;
    }

    const cardIdBoosts: Record<number, number> = { ...profile.cardIdBoosts };
    for (const key of matchupKeys) {
      for (const member of index.matchupIndex[key] ?? []) {
        cardIdBoosts[member.id] = Math.max(cardIdBoosts[member.id] ?? 1, 1.85);
      }
    }

    return mergeCompletionProfiles(profile, {
      matchupKeys,
      cardIdBoosts,
    });
  }

  private mergeOllamaIntent(
    profile: CompletionScoringProfile,
    intent: OllamaCompletionIntent,
    index: CardKnowledgeIndex | null,
  ): CompletionScoringProfile {
    const tagBoosts: Record<string, number> = {};
    for (const tag of intent.tags) {
      tagBoosts[tag] = 1.5;
    }

    let merged = mergeCompletionProfiles(profile, {
      matchupKeys: intent.matchups,
      tagBoosts,
      nameKeywords: intent.keywords.map((k) => k.toLowerCase()),
      preferCombo: intent.comboFocus ? true : profile.preferCombo,
    });

    merged = this.enrichFromMatchups(merged, index, [
      ...new Set([...merged.matchupKeys, ...intent.matchups]),
    ]);

    for (const key of intent.matchups) {
      for (const member of index?.matchupIndex?.[key] ?? []) {
        merged.cardIdBoosts[member.id] = Math.max(merged.cardIdBoosts[member.id] ?? 1, 2.1);
      }
    }

    return merged;
  }
}
