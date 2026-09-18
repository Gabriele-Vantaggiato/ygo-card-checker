import { CardKnowledgeRosterMember } from '../models/card-knowledge.model';
import { CardRestrictions, CardRole, SemanticCardProfile } from '../models/semantic-card.model';
import { GetSuggestionsOptions, RecommendedCard, SynergyIndex } from '../models/deck-recommendation.model';

const DEFAULT_LIMIT = 20;

/** Deckbuilding rule-of-thumb soft caps used to steer role balancing (Pillar 5). */
const ROLE_SOFT_CAP: Partial<Record<CardRole, number>> = { starter: 9 };
const ROLE_SOFT_MIN: Partial<Record<CardRole, number>> = { handtrap: 6, extender: 6, boardbreaker: 3 };
const ROLE_OVER_CAP_MULTIPLIER = 0.6;
const ROLE_UNDER_MIN_MULTIPLIER = 1.3;

/** Merges every active restriction found among the cards currently in the deck. */
export function aggregateActiveRestrictions(
  deckCardIds: Iterable<number>,
  semanticProfiles: ReadonlyMap<number, SemanticCardProfile>,
): CardRestrictions {
  const merged: CardRestrictions = {};
  for (const cardId of deckCardIds) {
    const restrictions = semanticProfiles.get(cardId)?.restrictions;
    if (!restrictions) {
      continue;
    }
    Object.assign(merged, restrictions);
  }
  return merged;
}

/**
 * CRITICAL FILTERING (Pillar 5): a candidate violating an active restriction — e.g. a
 * LIGHT monster when the deck locks Special Summons to DARK — is dropped outright,
 * never merely deprioritized.
 */
export function violatesRestrictions(
  candidate: Pick<CardKnowledgeRosterMember, 'attribute' | 'race' | 'archetype'>,
  restrictions: CardRestrictions,
): boolean {
  if (restrictions.restrictsSummonToAttribute && candidate.attribute) {
    if (candidate.attribute.toUpperCase() !== restrictions.restrictsSummonToAttribute.toUpperCase()) {
      return true;
    }
  }
  if (restrictions.restrictsSummonToRace && candidate.race) {
    if (candidate.race.toLowerCase() !== restrictions.restrictsSummonToRace.toLowerCase()) {
      return true;
    }
  }
  if (restrictions.restrictsSummonToArchetype && candidate.archetype) {
    if (candidate.archetype.toLowerCase() !== restrictions.restrictsSummonToArchetype.toLowerCase()) {
      return true;
    }
  }
  return false;
}

export function countRoles(
  deckCardIds: Iterable<number>,
  semanticProfiles: ReadonlyMap<number, SemanticCardProfile>,
): Map<CardRole, number> {
  const counts = new Map<CardRole, number>();
  for (const cardId of deckCardIds) {
    const roles = semanticProfiles.get(cardId)?.roles ?? [];
    for (const role of roles) {
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
  }
  return counts;
}

/** Boosts under-represented roles (handtraps/extenders) and deprioritizes over-capped ones (starters). */
export function computeRoleBoost(roles: CardRole[], deckRoleCounts: ReadonlyMap<CardRole, number>): number {
  let boost = 1;
  for (const role of roles) {
    const count = deckRoleCounts.get(role) ?? 0;
    const softCap = ROLE_SOFT_CAP[role];
    const softMin = ROLE_SOFT_MIN[role];
    if (softCap !== undefined && count >= softCap) {
      boost *= ROLE_OVER_CAP_MULTIPLIER;
    }
    if (softMin !== undefined && count < softMin) {
      boost *= ROLE_UNDER_MIN_MULTIPLIER;
    }
  }
  return boost;
}

export function getSuggestions(
  deckCardIdsWithQuantity: ReadonlyMap<number, number>,
  synergyIndex: SynergyIndex,
  semanticProfiles: ReadonlyMap<number, SemanticCardProfile>,
  roster: ReadonlyMap<number, CardKnowledgeRosterMember>,
  options: GetSuggestionsOptions = {},
): RecommendedCard[] {
  const deckCardIds = [...deckCardIdsWithQuantity.keys()];
  const restrictions = aggregateActiveRestrictions(deckCardIds, semanticProfiles);
  const deckRoleCounts = countRoles(deckCardIds, semanticProfiles);
  const excludeCardIds = options.excludeCardIds ?? new Set<number>();

  const scoreByCandidate = new Map<number, number>();
  for (const sourceId of deckCardIds) {
    const partners = synergyIndex.partners[String(sourceId)] ?? [];
    for (const partner of partners) {
      if (deckCardIdsWithQuantity.has(partner.cardId) || excludeCardIds.has(partner.cardId)) {
        continue;
      }
      scoreByCandidate.set(partner.cardId, (scoreByCandidate.get(partner.cardId) ?? 0) + partner.deckCount);
    }
  }

  const results: RecommendedCard[] = [];
  for (const [candidateId, deckCount] of scoreByCandidate) {
    const rosterEntry = roster.get(candidateId);
    if (!rosterEntry) {
      continue;
    }
    if (violatesRestrictions(rosterEntry, restrictions)) {
      continue;
    }

    const roles = semanticProfiles.get(candidateId)?.roles ?? [];
    const roleBoost = computeRoleBoost(roles, deckRoleCounts);

    results.push({
      cardId: candidateId,
      name: rosterEntry.name,
      imageSmall: rosterEntry.imageSmall,
      score: deckCount * roleBoost,
      deckCount,
      roles,
      roleBoost,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, options.limit ?? DEFAULT_LIMIT);
}
