import { CardKnowledgeEntry, CardKnowledgeIndex, CardKnowledgeRosterMember } from '../models/card-knowledge.model';
import { CompletionScoringProfile } from './completion-prompt.utils';
import { retrieveDatasetSynergies } from './synergy-retrieval.utils';

function entry(overrides: Partial<CardKnowledgeEntry> = {}): CardKnowledgeEntry {
  return { tags: [], series: [], mentions: [], effects: [], related: [], ...overrides };
}

function profile(): CompletionScoringProfile {
  return {
    tagBoosts: {},
    relationBoosts: {},
    nameKeywords: [],
    archetypeKeywords: [],
    cardIdBoosts: {},
    matchupKeys: [],
    directionMultiplier: 1,
    preferGenericStaples: false,
    preferCombo: false,
    preferArchetype: false,
  };
}

describe('retrieveDatasetSynergies — mentions_photon/mentions_galaxy false positives', () => {
  it('does not connect two unrelated real archetypes that both happen to use the word "Photon"', () => {
    // Galaxy-Eyes Photon Dragon (archetype "Galaxy-Eyes") vs Cyber Laser Dragon
    // (archetype "Photon" — the *different*, unrelated 2008 Cyber Dragon support line).
    // Both get tagged mentions_photon purely from a shared English word, not a real
    // archetype relationship — the trigger/response pair must not treat that as synergy.
    const sourceEntry = entry({
      tags: ['mentions_photon', 'mentions_galaxy'],
      series: ['Galaxy-Eyes'],
      race: 'Dragon',
    });
    const candidateEntry = entry({
      tags: ['mentions_photon', 'destroys'],
      series: [],
      race: 'Machine',
    });
    const index: CardKnowledgeIndex = {
      version: 1,
      generatedAt: '',
      cardCount: 2,
      entries: { '1': sourceEntry, '2': candidateEntry },
    };
    const roster = new Map<number, CardKnowledgeRosterMember>([
      [
        2,
        {
          id: 2,
          name: 'Cyber Laser Dragon',
          type: 'Effect Monster',
          race: 'Machine',
          attribute: 'LIGHT',
          archetype: 'Photon',
          tcgDate: null,
          banTcg: null,
          imageSmall: '',
        },
      ],
    ]);

    const results = retrieveDatasetSynergies(1, sourceEntry, index, profile(), new Set([1]), roster, {
      minScore: 0.1,
    });

    expect(results.some((r) => r.id === 2)).toBeFalse();
  });
});
