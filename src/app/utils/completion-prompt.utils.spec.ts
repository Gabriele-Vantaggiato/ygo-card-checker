import { CardKnowledgeEntry, CardRelatedSuggestion } from '../models/card-knowledge.model';
import { buildCompletionProfile, scoreForCompletion } from './completion-prompt.utils';

function suggestion(overrides: Partial<CardRelatedSuggestion> = {}): CardRelatedSuggestion {
  return {
    cardId: 1,
    name: 'Test Card',
    relation: 'engine',
    score: 1,
    archetype: null,
    imageSmall: '',
    reasonKey: 'x',
    ...overrides,
  };
}

function entryWithTags(tags: string[]): CardKnowledgeEntry {
  return {
    name: 'Test Card',
    tags,
    series: [],
    mentions: [],
    effects: [],
    related: [],
    type: 'Trap Card',
    race: null,
    attribute: null,
    level: null,
    atk: null,
    def: null,
    setcodes: [],
    isExtraDeck: false,
  };
}

describe('completion-prompt.utils — Babel category-tag coverage', () => {
  it('boosts a side-deck candidate whose only bounce signal is the Babel category tag', () => {
    // "bounce_to_hand" is regex-derived and misses this card; "category_return_to_hand"
    // is the BabelCDB-verified equivalent and should count the same for side-tech scoring.
    const profile = buildCompletionProfile('side_meta', '');
    const withCategoryOnly = scoreForCompletion(
      suggestion(),
      entryWithTags(['category_return_to_hand']),
      profile,
      'side',
    );
    const withNoTags = scoreForCompletion(suggestion(), entryWithTags([]), profile, 'side');
    expect(withCategoryOnly).toBeGreaterThan(withNoTags);
  });

  it('boosts a card matching a counter-rule via its Babel category tag alone', () => {
    // The "weak against artifact" counter rule boosts 'banishes'; a card whose regex
    // extraction missed that verb but carries 'category_banish' should still qualify.
    const profile = buildCompletionProfile('staples', 'debole contro artifact');
    const withCategoryOnly = scoreForCompletion(
      suggestion(),
      entryWithTags(['category_banish']),
      profile,
      'main',
    );
    const withNoTags = scoreForCompletion(suggestion(), entryWithTags([]), profile, 'main');
    expect(withCategoryOnly).toBeGreaterThan(withNoTags);
  });
});
