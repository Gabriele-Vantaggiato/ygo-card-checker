import { tagLabelKey, toDisplayTags } from './knowledge-display.utils';

describe('knowledge-display.utils — BabelCDB category tags', () => {
  it('resolves a proper label key for each verified category tag, not the generic fallback', () => {
    const categoryTags = [
      'category_destroy',
      'category_send_to_gy',
      'category_return_to_hand',
      'category_return_to_deck',
      'category_banish',
      'category_draw',
      'category_position_change',
      'category_lp_damage',
      'category_lp_recovery',
      'category_special_summon',
      'category_control_change',
      'category_negate',
      'category_random',
    ];
    for (const tag of categoryTags) {
      expect(tagLabelKey(tag)).not.toBe('knowledge.tag.generic');
      expect(tagLabelKey(tag)).toContain('knowledge.tag.category');
    }
  });

  it('surfaces a category tag in displayTags when no higher-priority rule tag is present', () => {
    const tags = toDisplayTags(['category_special_summon']);
    expect(tags).toEqual([{ id: 'category_special_summon', labelKey: 'knowledge.tag.categorySpecialSummon' }]);
  });

  it('ranks rule-engine tags above category tags when both are present', () => {
    const tags = toDisplayTags(['category_special_summon', 'ss_from_deck']);
    expect(tags.map((t) => t.id)).toEqual(['ss_from_deck', 'category_special_summon']);
  });
});
