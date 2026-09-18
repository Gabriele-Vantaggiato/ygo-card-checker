import { computeRoleBoost, getSuggestions, violatesRestrictions } from './deck-recommendation.utils';
import { CardRole, SemanticCardProfile } from '../models/semantic-card.model';
import { CardKnowledgeRosterMember } from '../models/card-knowledge.model';
import { SynergyIndex } from '../models/deck-recommendation.model';

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

function roster(id: number, overrides: Partial<CardKnowledgeRosterMember> = {}): CardKnowledgeRosterMember {
  return {
    id,
    name: `Card ${id}`,
    type: 'Effect Monster',
    race: null,
    attribute: null,
    archetype: null,
    tcgDate: null,
    banTcg: null,
    imageSmall: '',
    ...overrides,
  };
}

describe('violatesRestrictions', () => {
  it('rejects a candidate whose attribute conflicts with an active lock', () => {
    const candidate = roster(1, { attribute: 'LIGHT' });
    expect(violatesRestrictions(candidate, { restrictsSummonToAttribute: 'DARK' })).toBe(true);
  });

  it('allows a candidate matching the active lock', () => {
    const candidate = roster(1, { attribute: 'DARK' });
    expect(violatesRestrictions(candidate, { restrictsSummonToAttribute: 'DARK' })).toBe(false);
  });

  it('allows a candidate when no restriction is active', () => {
    expect(violatesRestrictions(roster(1, { attribute: 'LIGHT' }), {})).toBe(false);
  });
});

describe('computeRoleBoost', () => {
  it('deprioritizes a starter once the deck is over the soft cap', () => {
    const deckRoleCounts = new Map<CardRole, number>([['starter', 9]]);
    expect(computeRoleBoost(['starter'], deckRoleCounts)).toBeLessThan(1);
  });

  it('boosts a handtrap when the deck is under the soft minimum', () => {
    const deckRoleCounts = new Map<CardRole, number>([['handtrap', 1]]);
    expect(computeRoleBoost(['handtrap'], deckRoleCounts)).toBeGreaterThan(1);
  });
});

describe('getSuggestions', () => {
  it('excludes candidates that violate a restriction already active in the deck', () => {
    const deck = new Map([[1, 1]]);
    const synergyIndex: SynergyIndex = {
      version: 1,
      generatedAt: '',
      totalDecks: 10,
      partners: { '1': [{ cardId: 2, deckCount: 5 }] },
    };
    const semanticProfiles = new Map([[1, profile({ restrictions: { restrictsSummonToAttribute: 'DARK' } })]]);
    const rosterMap = new Map([
      [1, roster(1)],
      [2, roster(2, { attribute: 'LIGHT' })],
    ]);

    expect(getSuggestions(deck, synergyIndex, semanticProfiles, rosterMap)).toEqual([]);
  });

  it('ranks co-occurring cards by tournament deck count', () => {
    const deck = new Map([[1, 1]]);
    const synergyIndex: SynergyIndex = {
      version: 1,
      generatedAt: '',
      totalDecks: 10,
      partners: {
        '1': [
          { cardId: 2, deckCount: 3 },
          { cardId: 3, deckCount: 9 },
        ],
      },
    };
    const semanticProfiles = new Map<number, SemanticCardProfile>();
    const rosterMap = new Map([
      [1, roster(1)],
      [2, roster(2)],
      [3, roster(3)],
    ]);

    const suggestions = getSuggestions(deck, synergyIndex, semanticProfiles, rosterMap);
    expect(suggestions.map((s) => s.cardId)).toEqual([3, 2]);
  });
});
