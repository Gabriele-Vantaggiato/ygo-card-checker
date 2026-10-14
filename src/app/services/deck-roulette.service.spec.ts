import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  DeckRouletteService,
  EMPTY_ROULETTE_FILTERS,
  RouletteDeck,
  filterRouletteDecks,
  listRouletteArchetypes,
} from './deck-roulette.service';

const deck = (id: string): RouletteDeck => ({
  id,
  name: id,
  source: 'community',
  coverCardId: null,
  main: [1],
  extra: [],
  side: [],
});

describe('DeckRouletteService', () => {
  let service: DeckRouletteService;
  const pool = [deck('a'), deck('b'), deck('c')];

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(DeckRouletteService);
  });

  it('returns null for an empty pool', () => {
    expect(service.draw('goat', [])).toBeNull();
  });

  it('never repeats a deck until the pool is exhausted', () => {
    const picks = [0, 1, 2].map(() => service.draw('goat', pool)!.id);
    expect(new Set(picks).size).toBe(3);
  });

  it('resets history after the whole pool was drawn', () => {
    for (let i = 0; i < 3; i++) service.draw('goat', pool);
    expect(service.draw('goat', pool)).not.toBeNull();
  });

  it('encodes a ydke url with the three sections', () => {
    expect(service.toYdkeUrl(deck('a'))).toMatch(/^ydke:\/\/.*!.*!.*!$/);
  });

  it('rejects decks using mechanics the format predates', () => {
    expect(service.isAllowedInFormat({ mechanics: ['pendulum'] }, 'hat')).toBeFalse();
    expect(service.isAllowedInFormat({ mechanics: ['xyz'] }, 'tengu')).toBeTrue();
    expect(service.isAllowedInFormat({ mechanics: ['synchro'] }, 'goat')).toBeFalse();
    expect(service.isAllowedInFormat({ mechanics: ['pendulum', 'link'] }, 'tcg')).toBeTrue();
  });
});

describe('roulette filters', () => {
  const mk = (id: string, archetype: string, keyCards: string[], source: RouletteDeck['source'] = 'tournament'): RouletteDeck => ({
    id, name: `${archetype} — Event`, source, coverCardId: null, archetype, keyCards, main: [1], extra: [], side: [],
  });
  const pool = [
    mk('a', 'Chaos Turbo', ['Chaos Sorcerer', "Gravekeeper's Spy"]),
    mk('b', 'Warrior', ['Dark Blade the Dragon Knight'], 'community'),
    mk('c', 'Chaos Turbo', ['Black Luster Soldier - Envoy of the Beginning']),
  ];

  it('returns everything with empty filters', () => {
    expect(filterRouletteDecks(pool, EMPTY_ROULETTE_FILTERS).length).toBe(3);
  });

  it('matches archetype, key cards and ignores case/accents', () => {
    expect(filterRouletteDecks(pool, { ...EMPTY_ROULETTE_FILTERS, query: 'CHAOS' }).map((d) => d.id)).toEqual(['a', 'c']);
    expect(filterRouletteDecks(pool, { ...EMPTY_ROULETTE_FILTERS, query: 'gravekeeper' }).map((d) => d.id)).toEqual(['a']);
  });

  it('requires every term to match', () => {
    expect(filterRouletteDecks(pool, { ...EMPTY_ROULETTE_FILTERS, query: 'chaos luster' }).map((d) => d.id)).toEqual(['c']);
  });

  it('combines archetype and source filters', () => {
    expect(filterRouletteDecks(pool, { query: '', archetype: 'Warrior', source: 'community' }).length).toBe(1);
    expect(filterRouletteDecks(pool, { query: '', archetype: 'Warrior', source: 'tournament' }).length).toBe(0);
  });

  it('lists archetypes by count', () => {
    expect(listRouletteArchetypes(pool)).toEqual([
      { name: 'Chaos Turbo', count: 2 },
      { name: 'Warrior', count: 1 },
    ]);
  });
});
