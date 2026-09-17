import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { CardSearchIndexService, SearchIndexEntry, matchesAdvancedFilters } from './card-search-index.service';

const ENTRIES: SearchIndexEntry[] = [
  { id: 1, name: 'Ash Blossom & Joyous Spring', type: 'Effect Monster', race: 'Zombie', attribute: 'FIRE', level: 3, atk: 0, def: 1800, archetype: null, desc: 'You can discard this card; negate the activation of an effect that includes an effect to Special Summon a monster(s).', tags: ['category_special_summon'] },
  { id: 2, name: 'Blue-Eyes White Dragon', type: 'Normal Monster', race: 'Dragon', attribute: 'LIGHT', level: 8, atk: 3000, def: 2500, archetype: 'Blue-Eyes', desc: 'This legendary dragon is a powerful engine of destruction.', tags: [] },
  { id: 3, name: 'Mystic Mine', type: 'Trap Card', race: 'Continuous', attribute: null, level: null, atk: null, def: null, archetype: null, desc: 'While this card is face-up on the field, if any player would take Battle Damage, they take no damage instead.', tags: [] },
  { id: 4, name: 'Effect Veiler', type: 'Effect Monster', race: 'Spellcaster', attribute: 'LIGHT', level: 1, atk: 0, def: 0, archetype: null, desc: 'During your opponent\'s Main Phase 1: You can Tribute this card, then target 1 Effect Monster your opponent controls; negate its effects.', tags: ['category_destroy'] },
];

describe('CardSearchIndexService', () => {
  let service: CardSearchIndexService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CardSearchIndexService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('filterIndex', () => {
    it('matches a name substring case-insensitively', () => {
      const ids = service.filterIndex(ENTRIES, 'blue-eyes', {});
      expect(ids).toEqual([2]);
    });

    it('matches the query against effect text too, case-insensitively', () => {
      const ids = service.filterIndex(ENTRIES, 'special summon', {});
      expect(ids).toEqual([1]);
    });

    it('does not duplicate an id whose name and effect text both match the query', () => {
      const ids = service.filterIndex(ENTRIES, 'dragon', {});
      expect(ids).toEqual([2]); // "Blue-Eyes White Dragon" name AND its desc both contain "dragon"
    });

    it('filters by exact type', () => {
      const ids = service.filterIndex(ENTRIES, '', { type: 'Effect Monster' });
      expect(ids).toEqual([1, 4]);
    });

    it('filters by an inclusive ATK range', () => {
      const ids = service.filterIndex(ENTRIES, '', { atkMin: 1000, atkMax: 3000 });
      expect(ids).toEqual([2]);
    });

    it('excludes cards missing the stat once a range on it is active', () => {
      const ids = service.filterIndex(ENTRIES, '', { atkMin: 0 });
      expect(ids).not.toContain(3);
    });

    it('combines multiple filters with AND semantics', () => {
      const ids = service.filterIndex(ENTRIES, '', { attribute: 'LIGHT', levelMax: 1 });
      expect(ids).toEqual([4]);
    });

    it('returns ids sorted by name', () => {
      const ids = service.filterIndex(ENTRIES, '', { attribute: 'LIGHT' });
      expect(ids).toEqual([2, 4]); // "Blue-Eyes White Dragon" sorts before "Effect Veiler"
    });

    it('returns all ids when query and filters are empty', () => {
      const ids = service.filterIndex(ENTRIES, '', {});
      expect(ids.length).toBe(4);
    });

    it('filters by category tag', () => {
      const ids = service.filterIndex(ENTRIES, '', { categoryTag: 'category_special_summon' });
      expect(ids).toEqual([1]);
    });

    it('treats "GY" and "Graveyard" as synonyms so old and new card wording both match', () => {
      const mixedEntries: SearchIndexEntry[] = [
        { id: 10, name: 'Limit Reverse', type: 'Trap Card', race: 'Normal', attribute: null, level: null, atk: null, def: null, archetype: null, desc: 'Target 1 Normal Monster in your Graveyard; Special Summon it.', tags: [] },
        { id: 11, name: 'Modern Reviver', type: 'Trap Card', race: 'Normal', attribute: null, level: null, atk: null, def: null, archetype: null, desc: 'Target 1 monster in your GY; Special Summon it.', tags: [] },
      ];

      expect(service.filterIndex(mixedEntries, 'your gy', {})).toEqual([10, 11]);
      expect(service.filterIndex(mixedEntries, 'your graveyard', {})).toEqual([10, 11]);
    });
  });

  describe('sortIdsWithin', () => {
    it('keeps only ids present in the given set, sorted by name', () => {
      const ids = service.sortIdsWithin(ENTRIES, new Set([4, 2, 999]));
      expect(ids).toEqual([2, 4]);
    });

    it('returns an empty array when the set matches nothing', () => {
      const ids = service.sortIdsWithin(ENTRIES, new Set([999]));
      expect(ids).toEqual([]);
    });
  });

  describe('matchesAdvancedFilters (shared predicate, e.g. for live-API-hydrated cards)', () => {
    it('matches exact type/race/attribute/archetype filters', () => {
      expect(matchesAdvancedFilters(ENTRIES[1], { type: 'Normal Monster', archetype: 'Blue-Eyes' })).toBeTrue();
      expect(matchesAdvancedFilters(ENTRIES[1], { archetype: 'Dark Magician' })).toBeFalse();
    });

    it('matches inclusive numeric ranges and excludes cards missing the stat', () => {
      expect(matchesAdvancedFilters(ENTRIES[1], { atkMin: 1000, atkMax: 3000 })).toBeTrue();
      expect(matchesAdvancedFilters(ENTRIES[2], { atkMin: 0 })).toBeFalse(); // Mystic Mine has no atk
    });

    it('accepts a card shape with undefined optional fields (e.g. a hydrated YgoCard)', () => {
      const ygoCardLike = { type: 'Spell Card', race: undefined, attribute: undefined, archetype: undefined, level: undefined, atk: undefined, def: undefined };
      expect(matchesAdvancedFilters(ygoCardLike, { type: 'Spell Card' })).toBeTrue();
      expect(matchesAdvancedFilters(ygoCardLike, { levelMin: 1 })).toBeFalse();
    });

    it('matches categoryTag against the card tags list', () => {
      expect(matchesAdvancedFilters(ENTRIES[0], { categoryTag: 'category_special_summon' })).toBeTrue();
      expect(matchesAdvancedFilters(ENTRIES[0], { categoryTag: 'category_destroy' })).toBeFalse();
    });

    it('rejects a categoryTag filter for a card with no tags data at all (e.g. a live-API-hydrated card)', () => {
      const ygoCardLike = { type: 'Spell Card' };
      expect(matchesAdvancedFilters(ygoCardLike, { categoryTag: 'category_destroy' })).toBeFalse();
    });
  });

  describe('loadIndex$', () => {
    it('fetches the search index asset and caches it across calls', () => {
      let first: SearchIndexEntry[] | undefined;
      service.loadIndex$().subscribe((entries) => (first = entries));
      const req = http.expectOne('assets/data/card-knowledge/search-index.json');
      req.flush(ENTRIES);
      expect(first).toEqual(ENTRIES);

      let second: SearchIndexEntry[] | undefined;
      service.loadIndex$().subscribe((entries) => (second = entries));
      expect(second).toEqual(ENTRIES);
    });
  });
});
