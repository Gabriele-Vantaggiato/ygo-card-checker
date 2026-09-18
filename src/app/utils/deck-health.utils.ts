import { DecklistCard } from '../models/decklist.model';
import { CARD_ROLES, CardRole, SemanticCardProfile } from '../models/semantic-card.model';
import { DeckHealthReport, DeckHealthWarning } from '../models/deck-health.model';

const MAX_GARNET_RATIO = 0.2;
const MAX_NORMAL_SUMMON_RELIANT_RATIO = 0.4;
const MIN_HANDTRAPS = 3;
const SCORE_PENALTY = {
  noStarters: 25,
  noBoardbreakers: 20,
  fewHandtraps: 10,
  tooManyGarnets: 15,
  tooManyNormalSummonReliant: 15,
} as const;

function mainDeckCards(deck: readonly DecklistCard[]): DecklistCard[] {
  return deck.filter((card) => (card.section ?? 'main') === 'main');
}

function isNormalSummonReliant(card: DecklistCard, profile: SemanticCardProfile | undefined): boolean {
  if (!card.type.includes('Monster')) {
    return false;
  }
  const roles = profile?.roles ?? [];
  const outcomes = profile?.outcomes ?? [];
  const triggers = profile?.triggers ?? [];
  return (
    !roles.includes('extender') &&
    !outcomes.includes('special_summon') &&
    !triggers.includes('on_special_summon')
  );
}

export function analyzeDeckHealth(
  deck: readonly DecklistCard[],
  semanticProfiles: ReadonlyMap<number, SemanticCardProfile>,
): DeckHealthReport {
  const main = mainDeckCards(deck);
  const mainCount = main.reduce((sum, card) => sum + card.quantity, 0) || 1;

  const roleCounts = Object.fromEntries(CARD_ROLES.map((role) => [role, 0])) as Record<CardRole, number>;
  let normalSummonRelianceCount = 0;

  for (const card of main) {
    const profile = semanticProfiles.get(card.id);
    for (const role of profile?.roles ?? []) {
      roleCounts[role] += card.quantity;
    }
    if (isNormalSummonReliant(card, profile)) {
      normalSummonRelianceCount += card.quantity;
    }
  }

  const warnings: DeckHealthWarning[] = [];
  let score = 100;

  if (roleCounts.starter === 0) {
    score -= SCORE_PENALTY.noStarters;
    warnings.push({ id: 'no-starters', severity: 'critical', messageKey: 'deckHealth.warning.noStarters' });
  }

  if (roleCounts.boardbreaker === 0) {
    score -= SCORE_PENALTY.noBoardbreakers;
    warnings.push({
      id: 'no-boardbreakers',
      severity: 'critical',
      messageKey: 'deckHealth.warning.lackBoardbreakers',
    });
  }

  if (roleCounts.handtrap < MIN_HANDTRAPS) {
    score -= SCORE_PENALTY.fewHandtraps;
    warnings.push({
      id: 'few-handtraps',
      severity: 'warning',
      messageKey: 'deckHealth.warning.fewHandtraps',
      messageParams: { count: String(roleCounts.handtrap), min: String(MIN_HANDTRAPS) },
    });
  }

  if (roleCounts.garnet / mainCount > MAX_GARNET_RATIO) {
    score -= SCORE_PENALTY.tooManyGarnets;
    warnings.push({
      id: 'too-many-garnets',
      severity: 'warning',
      messageKey: 'deckHealth.warning.tooManyGarnets',
      messageParams: { count: String(roleCounts.garnet) },
    });
  }

  if (normalSummonRelianceCount / mainCount > MAX_NORMAL_SUMMON_RELIANT_RATIO) {
    score -= SCORE_PENALTY.tooManyNormalSummonReliant;
    warnings.push({
      id: 'too-many-normal-summon-reliant',
      severity: 'warning',
      messageKey: 'deckHealth.warning.tooManyNormalSummonReliant',
      messageParams: { count: String(normalSummonRelianceCount) },
    });
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    roleCounts,
    normalSummonRelianceCount,
    warnings,
  };
}
