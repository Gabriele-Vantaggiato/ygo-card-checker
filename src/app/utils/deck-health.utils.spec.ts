import { analyzeDeckHealth } from './deck-health.utils';
import { DecklistCard } from '../models/decklist.model';
import { SemanticCardProfile } from '../models/semantic-card.model';

function card(id: number, overrides: Partial<DecklistCard> = {}): DecklistCard {
  return { id, name: `Card ${id}`, type: 'Effect Monster', imageUrlSmall: null, quantity: 1, section: 'main', ...overrides };
}

function profile(overrides: Partial<SemanticCardProfile> = {}): SemanticCardProfile {
  return {
    roles: [],
    triggers: [],
    outcomes: [],
    costFlags: { discardsForCost: false, tributesForCost: false, banishesForCost: false },
    restrictions: {},
    mentionsCardIds: [],
    ...overrides,
  };
}

describe('analyzeDeckHealth', () => {
  it('warns when the deck has no starters', () => {
    const deck = [card(1)];
    const profiles = new Map([[1, profile({ roles: ['boardbreaker'] })]]);
    const report = analyzeDeckHealth(deck, profiles);
    expect(report.warnings.some((w) => w.id === 'no-starters')).toBe(true);
  });

  it('warns when the deck has no boardbreakers', () => {
    const deck = [card(1)];
    const profiles = new Map([[1, profile({ roles: ['starter'] })]]);
    const report = analyzeDeckHealth(deck, profiles);
    expect(report.warnings.some((w) => w.id === 'no-boardbreakers')).toBe(true);
  });

  it('scores a balanced deck higher than an unbalanced one', () => {
    const balancedDeck = [
      card(1, { quantity: 3 }),
      card(2, { quantity: 3 }),
      card(3, { quantity: 3 }),
    ];
    const balancedProfiles = new Map([
      [1, profile({ roles: ['starter'] })],
      [2, profile({ roles: ['boardbreaker'] })],
      [3, profile({ roles: ['handtrap'] })],
    ]);
    const balanced = analyzeDeckHealth(balancedDeck, balancedProfiles);

    const unbalancedDeck = [card(4, { quantity: 3 })];
    const unbalancedProfiles = new Map([[4, profile()]]);
    const unbalanced = analyzeDeckHealth(unbalancedDeck, unbalancedProfiles);

    expect(balanced.score).toBeGreaterThan(unbalanced.score);
  });

  it('counts monsters with no alternate summon route as Normal-Summon reliant', () => {
    const deck = [card(1, { quantity: 3, type: 'Normal Monster' })];
    const report = analyzeDeckHealth(deck, new Map());
    expect(report.normalSummonRelianceCount).toBe(3);
  });

  it('ignores extra and side deck cards for role counts', () => {
    const deck = [card(1, { section: 'extra', quantity: 3 })];
    const profiles = new Map([[1, profile({ roles: ['starter'] })]]);
    const report = analyzeDeckHealth(deck, profiles);
    expect(report.roleCounts.starter).toBe(0);
  });
});
