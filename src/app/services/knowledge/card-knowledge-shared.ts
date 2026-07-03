import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CardKnowledgeEntry,
  CardKnowledgeRelated,
  CardRelatedGroup,
  CardRelatedSuggestion,
  FormatLegalityIndex,
} from '../../models/card-knowledge.model';
import { YgoCard } from '../../models/ygo-card.model';
import { BanlistStatus, YgoFormat } from '../../models/ygo-format.model';
import { maxCopiesForStatus } from '../../models/decklist.model';
import { relationGroupOrder, tagLabelKey } from '../../utils/knowledge-display.utils';
import { isPlayableInFormat, maxCopiesInFormat } from '../../utils/format-legality.utils';
import { CompletionScoringProfile, scoreForCompletion } from '../../utils/completion-prompt.utils';
import { RELATION_GROUP_KEYS, RELATION_LABEL_KEYS } from '../../utils/knowledge-constants';
import { CardLegalityFacade } from '../card-legality.facade';

export function applyFormatToSuggestions(
  suggestions: CardRelatedSuggestion[],
  format: YgoFormat,
  formatIndex: FormatLegalityIndex | null,
): CardRelatedSuggestion[] {
  if (!formatIndex) {
    return suggestions;
  }
  return suggestions
    .filter((item) => isPlayableInFormat(formatIndex, item.cardId, format.id))
    .map((item) => ({
      ...item,
      maxCopies: maxCopiesInFormat(formatIndex, item.cardId, format.id) ?? item.maxCopies,
    }));
}

export function filterSuggestions$(
  related: readonly CardKnowledgeRelated[],
  format: YgoFormat,
  formatIndex: FormatLegalityIndex | null,
  toSuggestion: (item: CardKnowledgeRelated) => CardRelatedSuggestion,
  cardLegality: CardLegalityFacade,
): Observable<CardRelatedSuggestion[]> {
  if (formatIndex) {
    return of(
      related
        .filter((item) => isPlayableInFormat(formatIndex, item.id, format.id))
        .map((item) => ({
          ...toSuggestion(item),
          maxCopies: maxCopiesInFormat(formatIndex, item.id, format.id) ?? undefined,
        })),
    );
  }

  const stubs = related.map((item) => toYgoCard(item));
  return cardLegality.evaluateMany$(stubs, format).pipe(
    map((legality) =>
      related
        .filter((item) => {
          const verdict = legality.get(item.id)?.verdict;
          return verdict === 'legal' || verdict === 'restricted';
        })
        .map((item) => {
          const result = legality.get(item.id);
          return {
            ...toSuggestion(item),
            maxCopies: result ? maxCopiesForStatus(result.banlistStatus) : undefined,
          };
        }),
    ),
  );
}

export function groupSuggestions(suggestions: CardRelatedSuggestion[]): CardRelatedGroup[] {
  const grouped = new Map<string, CardRelatedSuggestion[]>();
  for (const suggestion of suggestions) {
    const bucket = grouped.get(suggestion.relation) ?? [];
    bucket.push(suggestion);
    grouped.set(suggestion.relation, bucket);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => relationGroupOrder(a) - relationGroupOrder(b))
    .map(([relation, items]) => ({
      relation,
      labelKey: RELATION_GROUP_KEYS[relation] ?? 'knowledge.group.other',
      suggestions: items,
    }));
}

export function toSuggestion(
  related: CardKnowledgeRelated,
  sourceName: string,
  translate: (key: string) => string,
): CardRelatedSuggestion {
  let reasonKey = RELATION_LABEL_KEYS[related.relation] ?? 'knowledge.reason.related';
  let reasonParams: Record<string, string> | undefined;

  if (related.mechanicTrigger) {
    reasonKey = 'knowledge.reason.mechanicSynergy';
    reasonParams = { trigger: translate(tagLabelKey(related.mechanicTrigger)) };
  } else if (related.relation === 'mentions_card' || related.relation === 'search_target') {
    reasonParams = { name: sourceName };
  } else if (related.relation === 'shared_mention' && related.archetype) {
    reasonParams = { series: related.archetype };
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

export function applyStrategyToSuggestions(
  suggestions: CardRelatedSuggestion[],
  entries: Record<string, CardKnowledgeEntry>,
  profile: CompletionScoringProfile,
  section: 'main' | 'extra' | 'side',
): CardRelatedSuggestion[] {
  return [...suggestions]
    .map((suggestion) => ({
      ...suggestion,
      score: scoreForCompletion(suggestion, entries[String(suggestion.cardId)], profile, section),
    }))
    .sort(
      (a, b) =>
        relationGroupOrder(a.relation) - relationGroupOrder(b.relation) ||
        b.score - a.score ||
        a.name.localeCompare(b.name),
    );
}

export function mergeSuggestionPools(
  primary: CardRelatedSuggestion[],
  extra: CardRelatedSuggestion[],
): CardRelatedSuggestion[] {
  const merged = new Map<number, CardRelatedSuggestion>();
  for (const item of [...primary, ...extra]) {
    const existing = merged.get(item.cardId);
    if (!existing || item.score > existing.score) {
      merged.set(item.cardId, item);
    }
  }
  return [...merged.values()];
}

function toYgoCard(related: CardKnowledgeRelated): YgoCard {
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
