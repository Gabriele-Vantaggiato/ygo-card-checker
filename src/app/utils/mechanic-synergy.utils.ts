import {
  CardKnowledgeIndex,
  CardKnowledgeRelated,
  CardKnowledgeRosterMember,
} from '../models/card-knowledge.model';

const FORMAT_TAG_PREFIXES = ['format:', 'copies:', 'mention:'] as const;

/** Keep in sync with tools/card-knowledge-db/src/mechanic-tags.ts ENRICHMENT_TRIGGER_TAGS */
const ENRICHMENT_TRIGGER_TAGS = new Set([
  'mills',
  'sends_to_gy',
  'self_to_gy',
  'discards',
  'gy_interaction',
  'searches_monster',
  'searches_spell',
  'searches_trap',
]);

/** Cross-archetype only for explicit GY enablers → generic draw spells. */
const CROSS_ARCHETYPE_TRIGGERS = new Set(['mills', 'sends_to_gy', 'self_to_gy']);

const CROSS_ARCHETYPE_RESPONSES = new Set(['draw']);

/** Search payoffs stay within the same archetype/series roster. */
const ARCHETYPE_SCOPED_TRIGGERS = new Set([
  'searches_monster',
  'searches_spell',
  'searches_trap',
]);

export const MECHANIC_SYNERGY_BASE_SCORE = 0.82;
export const CROSS_ARCHETYPE_BOOST = 0.2;
export const MAX_MECHANIC_CANDIDATES_PER_PAIR = 24;

export function isMechanicTag(tag: string): boolean {
  return !FORMAT_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix));
}

export function enrichmentTriggerTags(tags: readonly string[]): string[] {
  return [...new Set(tags.filter((tag) => isMechanicTag(tag) && ENRICHMENT_TRIGGER_TAGS.has(tag)))];
}

export function mergeRelatedById(
  primary: readonly CardKnowledgeRelated[],
  extra: readonly CardKnowledgeRelated[],
): CardKnowledgeRelated[] {
  const merged = new Map<number, CardKnowledgeRelated>();
  for (const item of [...primary, ...extra]) {
    const existing = merged.get(item.id);
    if (!existing || item.score > existing.score) {
      merged.set(item.id, item);
    }
  }
  return [...merged.values()];
}

export function rosterMemberToRelated(
  member: CardKnowledgeRosterMember,
  relation: string,
  score: number,
  mechanicTrigger?: string,
): CardKnowledgeRelated {
  return {
    id: member.id,
    name: member.name,
    relation,
    score,
    archetype: member.archetype,
    tcgDate: member.tcgDate,
    banTcg: member.banTcg,
    imageSmall: member.imageSmall,
    mechanicTrigger,
  };
}

function isCrossArchetype(
  sourceSeries: readonly string[],
  candidate: CardKnowledgeRosterMember,
): boolean {
  if (!candidate.archetype) {
    return true;
  }
  return !sourceSeries.some(
    (token) => token.toLowerCase() === candidate.archetype!.toLowerCase(),
  );
}

function scoreMechanicCandidate(
  triggerWeight: number,
  sourceSeries: readonly string[],
  candidate: CardKnowledgeRosterMember,
): number {
  let score = MECHANIC_SYNERGY_BASE_SCORE + Math.min(triggerWeight * 0.04, 0.28);
  if (isCrossArchetype(sourceSeries, candidate)) {
    score += CROSS_ARCHETYPE_BOOST;
  }
  return score;
}

function sortMechanicCandidates(
  weight: number,
  sourceSeries: readonly string[],
  members: CardKnowledgeRosterMember[],
): CardKnowledgeRosterMember[] {
  return [...members].sort((a, b) => {
    const scoreA = scoreMechanicCandidate(weight, sourceSeries, a);
    const scoreB = scoreMechanicCandidate(weight, sourceSeries, b);
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    const stapleA = a.archetype ? 0 : 1;
    const stapleB = b.archetype ? 0 : 1;
    if (stapleA !== stapleB) {
      return stapleB - stapleA;
    }
    return a.name.localeCompare(b.name);
  });
}

function isAllowedMechanicCandidate(
  trigger: string,
  response: string,
  sourceSeries: readonly string[],
  candidate: CardKnowledgeRosterMember,
): boolean {
  const cross = isCrossArchetype(sourceSeries, candidate);
  if (!cross) {
    return true;
  }
  if (ARCHETYPE_SCOPED_TRIGGERS.has(trigger)) {
    return false;
  }
  if (!CROSS_ARCHETYPE_TRIGGERS.has(trigger) || !CROSS_ARCHETYPE_RESPONSES.has(response)) {
    return false;
  }
  return (
    !candidate.archetype &&
    (candidate.type === 'Spell Card' || candidate.type === 'Trap Card')
  );
}

export function buildMechanicSynergyRelated(
  tags: readonly string[],
  sourceSeries: readonly string[],
  excludeIds: ReadonlySet<number>,
  index: CardKnowledgeIndex,
  triggerWeights?: ReadonlyMap<string, number>,
): CardKnowledgeRelated[] {
  const pairs = (index.mechanicSynergies ?? []).filter((pair) =>
    ENRICHMENT_TRIGGER_TAGS.has(pair.trigger),
  );
  const mechanicIndex = index.mechanicIndex ?? {};
  if (pairs.length === 0) {
    return [];
  }

  const triggerSet = new Set(enrichmentTriggerTags(tags));
  if (triggerSet.size === 0) {
    return [];
  }

  const related: CardKnowledgeRelated[] = [];

  for (const pair of pairs) {
    if (!triggerSet.has(pair.trigger)) {
      continue;
    }

    const weight = triggerWeights?.get(pair.trigger) ?? 1;
    const roster = mechanicIndex[pair.response] ?? [];
    const candidates = sortMechanicCandidates(weight, sourceSeries, roster).slice(
      0,
      MAX_MECHANIC_CANDIDATES_PER_PAIR,
    );

    for (const member of candidates) {
      if (excludeIds.has(member.id)) {
        continue;
      }
      if (!isAllowedMechanicCandidate(pair.trigger, pair.response, sourceSeries, member)) {
        continue;
      }
      related.push(
        rosterMemberToRelated(
          member,
          pair.relation,
          scoreMechanicCandidate(weight, sourceSeries, member),
          pair.trigger,
        ),
      );
    }
  }

  return related;
}

export function buildDeckTriggerWeights(
  deckCards: ReadonlyArray<{ id: number; quantity: number }>,
  index: CardKnowledgeIndex,
): Map<string, number> {
  const weights = new Map<string, number>();
  for (const card of deckCards) {
    const entry = index.entries[String(card.id)];
    if (!entry) {
      continue;
    }
    for (const tag of enrichmentTriggerTags(entry.tags)) {
      weights.set(tag, (weights.get(tag) ?? 0) + card.quantity);
    }
  }
  return weights;
}
