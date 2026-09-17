import { CardRelatedSuggestion } from '../models/card-knowledge.model';
import {
  buildDeckIdentitySummary,
  DeckFingerprint,
  suggestionAffinityMultiplier,
} from './deck-fingerprint.utils';

function fingerprint(overrides: Partial<DeckFingerprint> = {}): DeckFingerprint {
  return {
    totalQty: 40,
    dominantArchetypes: ['Galaxy'],
    dominantSeries: ['Galaxy'],
    dominantTags: [],
    dominantRaces: ['Dragon'],
    dominantAttributes: [],
    hasClearIdentity: true,
    ...overrides,
  };
}

function suggestion(overrides: Partial<CardRelatedSuggestion> = {}): CardRelatedSuggestion {
  return {
    cardId: 1,
    name: 'Armed Dragon LV3',
    relation: 'search_target',
    score: 1,
    archetype: null,
    imageSmall: '',
    reasonKey: 'x',
    ...overrides,
  };
}

describe('suggestionAffinityMultiplier', () => {
  it('suppresses an off-identity search_target suggestion as strongly as a generic engine one', () => {
    // search_target is how catalog-wide script "evidence" candidates get labeled — same
    // blast radius as a generic engine staple, so it deserves the same 0.22x suppression
    // once a deck has a clear identity and the candidate matches none of it.
    const engineMultiplier = suggestionAffinityMultiplier(
      suggestion({ relation: 'engine' }),
      undefined,
      fingerprint(),
    );
    const searchTargetMultiplier = suggestionAffinityMultiplier(
      suggestion({ relation: 'search_target' }),
      undefined,
      fingerprint(),
    );
    expect(searchTargetMultiplier).toBeCloseTo(engineMultiplier, 5);
  });

  it('does not suppress a search_target suggestion that actually matches the deck archetype', () => {
    const multiplier = suggestionAffinityMultiplier(
      suggestion({ relation: 'search_target', archetype: 'Galaxy' }),
      undefined,
      fingerprint(),
    );
    expect(multiplier).toBeGreaterThan(1);
  });
});

describe('buildDeckIdentitySummary', () => {
  it('surfaces the dominant archetype/series and race when the deck has a clear identity', () => {
    const identity = buildDeckIdentitySummary(fingerprint());
    expect(identity.hasClearIdentity).toBeTrue();
    expect(identity.archetypes).toEqual(['Galaxy']);
    expect(identity.dominantRace).toBe('Dragon');
  });

  it('reports no clear identity for a generic staple pile', () => {
    const identity = buildDeckIdentitySummary(
      fingerprint({ hasClearIdentity: false, dominantArchetypes: [], dominantRaces: [] }),
    );
    expect(identity.hasClearIdentity).toBeFalse();
    expect(identity.archetypes).toEqual([]);
    expect(identity.dominantRace).toBeNull();
  });
});
