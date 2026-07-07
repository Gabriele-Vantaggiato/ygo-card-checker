import { CardKnowledgeEntry, CardKnowledgeIndex, CardRelatedSuggestion } from '../models/card-knowledge.model';
import { Decklist } from '../models/decklist.model';
import { CompletionScoringProfile } from './completion-prompt.utils';
import { isMechanicTag } from './mechanic-synergy.utils';

export interface DeckFingerprint {
  totalQty: number;
  dominantArchetypes: string[];
  dominantSeries: string[];
  dominantTags: string[];
  /** True when the deck leans on one or two identifiable themes. */
  hasClearIdentity: boolean;
}

const MIN_IDENTITY_SHARE = 0.22;
const MIN_COMBINED_TOP2_SHARE = 0.38;

export function buildDeckFingerprint(deck: Decklist, index: CardKnowledgeIndex): DeckFingerprint {
  const archetypeWeights = new Map<string, number>();
  const seriesWeights = new Map<string, number>();
  const tagWeights = new Map<string, number>();
  let totalQty = 0;

  for (const card of deck.cards) {
    const qty = card.quantity;
    totalQty += qty;
    const entry = index.entries[String(card.id)];
    if (!entry) {
      continue;
    }

    for (const series of entry.series) {
      seriesWeights.set(series, (seriesWeights.get(series) ?? 0) + qty);
    }

    for (const tag of entry.tags) {
      if (isMechanicTag(tag)) {
        tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + qty);
      }
    }

    for (const related of entry.related) {
      if (related.archetype) {
        archetypeWeights.set(
          related.archetype,
          (archetypeWeights.get(related.archetype) ?? 0) + qty * 0.35,
        );
      }
    }

    for (const series of entry.series) {
      archetypeWeights.set(series, (archetypeWeights.get(series) ?? 0) + qty * 0.65);
    }
  }

  const dominantArchetypes = topWeightedKeys(archetypeWeights, 3);
  const dominantSeries = topWeightedKeys(seriesWeights, 4);
  const dominantTags = topWeightedKeys(tagWeights, 6);

  const topShare = totalQty > 0 ? (archetypeWeights.get(dominantArchetypes[0] ?? '') ?? 0) / totalQty : 0;
  const top2Share =
    totalQty > 0
      ? ((archetypeWeights.get(dominantArchetypes[0] ?? '') ?? 0) +
          (archetypeWeights.get(dominantArchetypes[1] ?? '') ?? 0)) /
        totalQty
      : 0;

  return {
    totalQty,
    dominantArchetypes,
    dominantSeries,
    dominantTags,
    hasClearIdentity: topShare >= MIN_IDENTITY_SHARE || top2Share >= MIN_COMBINED_TOP2_SHARE,
  };
}

export function fingerprintToProfile(fingerprint: DeckFingerprint): Partial<CompletionScoringProfile> {
  const tagBoosts: Record<string, number> = {};
  for (const tag of fingerprint.dominantTags.slice(0, 4)) {
    tagBoosts[tag] = 1.28;
  }

  return {
    archetypeKeywords: fingerprint.dominantArchetypes.map((value) => value.toLowerCase()),
    tagBoosts,
    preferArchetype: fingerprint.hasClearIdentity,
    preferGenericStaples: !fingerprint.hasClearIdentity,
  };
}

export function suggestionAffinityMultiplier(
  suggestion: CardRelatedSuggestion,
  entry: CardKnowledgeEntry | undefined,
  fingerprint: DeckFingerprint,
): number {
  if (!fingerprint.hasClearIdentity || fingerprint.totalQty === 0) {
    return 1;
  }

  let multiplier = 1;
  const archetype = suggestion.archetype?.toLowerCase() ?? '';
  const series = entry?.series ?? [];
  const tags = (entry?.tags ?? []).filter(isMechanicTag);

  const archetypeHit = fingerprint.dominantArchetypes.some((key) => tokensOverlap(key, archetype, suggestion.name));
  const seriesHit = series.some((token) => fingerprint.dominantSeries.includes(token));
  const tagHits = tags.filter((tag) => fingerprint.dominantTags.includes(tag)).length;

  if (archetypeHit) {
    multiplier *= 2.35;
  }
  if (seriesHit) {
    multiplier *= 1.9;
  }
  if (tagHits > 0) {
    multiplier *= 1 + tagHits * 0.14;
  }

  const genericEngine =
    !suggestion.archetype &&
    (suggestion.relation === 'engine' || suggestion.relation === 'gy_synergy') &&
    !archetypeHit &&
    !seriesHit &&
    tagHits === 0;

  if (genericEngine) {
    multiplier *= 0.22;
  } else if (!archetypeHit && !seriesHit && tagHits === 0 && suggestion.relation !== 'mentions_card') {
    multiplier *= 0.55;
  }

  return multiplier;
}

export function enrichSuggestionReasonForFingerprint(
  suggestion: CardRelatedSuggestion,
  entry: CardKnowledgeEntry | undefined,
  fingerprint: DeckFingerprint,
): CardRelatedSuggestion {
  if (!fingerprint.hasClearIdentity) {
    return suggestion;
  }

  const matchedArchetype = fingerprint.dominantArchetypes.find((key) =>
    tokensOverlap(key, suggestion.archetype ?? '', suggestion.name),
  );
  if (matchedArchetype) {
    return {
      ...suggestion,
      reasonKey: 'knowledge.reason.deckArchetypeFit',
      reasonParams: { archetype: matchedArchetype },
    };
  }

  const matchedSeries = entry?.series.find((token) => fingerprint.dominantSeries.includes(token));
  if (matchedSeries) {
    return {
      ...suggestion,
      reasonKey: 'knowledge.reason.deckSeriesFit',
      reasonParams: { series: matchedSeries },
    };
  }

  return suggestion;
}

function topWeightedKeys(weights: Map<string, number>, limit: number): string[] {
  return [...weights.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

function tokensOverlap(archetypeKey: string, archetype: string, name: string): boolean {
  const key = archetypeKey.toLowerCase();
  const arch = archetype.toLowerCase();
  const cardName = name.toLowerCase();
  return arch.includes(key) || key.includes(arch) || cardName.includes(key);
}
