import { CardKnowledgeIndex } from '../models/card-knowledge.model';
import { EffectScript } from '../models/effect-script.model';
import {
  collectScriptDeckSynergies,
  isCompatibleMonsterPartner,
} from './script-deck-synergy.utils';

describe('collectScriptDeckSynergies', () => {
  const mezuki = {
    id: 92609649,
    name: 'Mezuki',
    type: 'Effect Monster',
    race: 'Zombie',
    attribute: 'EARTH',
    archetype: null,
    tcgDate: '2008-01-01',
    banTcg: null,
    imageSmall: 'mezuki.jpg',
  };
  const goblin = {
    id: 6368038,
    name: 'Goblin Zombie',
    type: 'Effect Monster',
    race: 'Zombie',
    attribute: 'DARK',
    archetype: null,
    tcgDate: '2007-01-01',
    banTcg: null,
    imageSmall: 'goblin.jpg',
  };
  const athena = {
    id: 48964966,
    name: 'Athena',
    type: 'Effect Monster',
    race: 'Fairy',
    attribute: 'LIGHT',
    archetype: null,
    tcgDate: '2008-01-01',
    banTcg: null,
    imageSmall: 'athena.jpg',
  };

  const index = {
    version: 1,
    generatedAt: '',
    entries: {
      '82693917': {
        id: 82693917,
        name: 'Zombie Master',
        tags: ['hand_to_gy', 'ss_from_gy'],
        series: ['Zombie'],
        mentions: [],
        effects: [],
        related: [],
        race: 'Zombie',
        attribute: 'DARK',
        type: 'Effect Monster',
      },
      '92609649': {
        id: 92609649,
        name: 'Mezuki',
        tags: ['gy_effect', 'ss_from_gy'],
        series: ['Zombie'],
        mentions: [],
        effects: [],
        related: [],
        race: 'Zombie',
        attribute: 'EARTH',
        type: 'Effect Monster',
      },
      '6368038': {
        id: 6368038,
        name: 'Goblin Zombie',
        tags: ['sends_to_gy', 'searches_monster'],
        series: ['Zombie'],
        mentions: [],
        effects: [],
        related: [],
        race: 'Zombie',
        attribute: 'DARK',
        type: 'Effect Monster',
      },
      '48964966': {
        id: 48964966,
        name: 'Athena',
        tags: ['gy_effect', 'ss_from_gy'],
        series: [],
        mentions: [],
        effects: [],
        related: [],
        race: 'Fairy',
        attribute: 'LIGHT',
        type: 'Effect Monster',
      },
    },
    raceIndex: {
      Zombie: [mezuki, goblin],
      Fairy: [athena],
    },
    mechanicIndex: {
      gy_effect: [mezuki, athena],
      ss_from_gy: [mezuki, athena],
      revives_from_gy: [mezuki],
      self_to_gy: [mezuki],
      gy_interaction: [goblin, athena],
      sends_to_gy: [goblin],
      searches_monster: [goblin],
      hand_to_gy: [],
      mills: [],
    },
  } as unknown as CardKnowledgeIndex;

  const zombieMasterScript: EffectScript = {
    cardId: 82693917,
    name: 'Zombie Master',
    roles: ['extender'],
    interrupts: [],
    timings: ['ignition'],
    steps: [
      {
        id: '1',
        when: 'ignition',
        actions: [
          { op: 'discard', from: 'hand', to: 'gy', filter: 'Zombie monster' },
          { op: 'ss', from: 'gy', filter: 'Zombie monster' },
        ],
        produces: ['hand_to_gy', 'ss_from_gy'],
      },
    ],
    luaSource: '-- stub',
    source: 'hat',
    confidence: 1,
  };

  it('suggests Mezuki-class partners not already in the deck', () => {
    const hits = collectScriptDeckSynergies(
      [{ id: 82693917, name: 'Zombie Master', quantity: 3 }],
      index,
      { '82693917': zombieMasterScript },
      new Set([82693917]),
      20,
      { deckRaces: new Set(['zombie']), deckAttributes: new Set(['dark']) },
    );

    expect(hits.some((hit) => hit.name === 'Mezuki')).toBe(true);
    expect(hits.every((hit) => hit.id !== 82693917)).toBe(true);
    expect(hits[0]?.relation).toBe('gy_synergy');
    const mezukiHit = hits.find((hit) => hit.name === 'Mezuki');
    expect(mezukiHit?.score).toBeGreaterThan(0.8);
  });

  it('surfaces Goblin Zombie via raceIndex even when missing from gy_effect bucket', () => {
    const hits = collectScriptDeckSynergies(
      [{ id: 82693917, name: 'Zombie Master', quantity: 3 }],
      index,
      { '82693917': zombieMasterScript },
      new Set([82693917]),
      40,
      { deckRaces: new Set(['zombie']) },
    );

    expect(hits.some((hit) => hit.name === 'Goblin Zombie')).toBe(true);
    expect(hits.some((hit) => hit.name === 'Mezuki')).toBe(true);
    expect(hits.every((hit) => hit.name !== 'Athena')).toBe(true);
  });

  it('excludes cards already in the deck', () => {
    const hits = collectScriptDeckSynergies(
      [
        { id: 82693917, name: 'Zombie Master', quantity: 2 },
        { id: 92609649, name: 'Mezuki', quantity: 2 },
      ],
      index,
      { '82693917': zombieMasterScript },
      new Set([82693917, 92609649]),
      20,
      { deckRaces: new Set(['zombie']) },
    );

    expect(hits.every((hit) => hit.name !== 'Mezuki')).toBe(true);
  });
});
