import assert from 'node:assert/strict';
import { decodeCategoryTags, KNOWN_CATEGORY_BITS } from './babel-category';

// Mystical Space Typhoon: real BabelCDB category = 2 (bit1) — now verified
// (large-sample correlation confirmed bit1 is ALSO 'destroy', same as bit0).
assert.deepEqual(decodeCategoryTags(2), [{ tag: 'category_destroy', confidence: KNOWN_CATEGORY_BITS.get(1)!.confidence }]);

// Single verified bit, carrying its measured correlation purity as confidence.
assert.deepEqual(decodeCategoryTags(1), [{ tag: 'category_destroy', confidence: KNOWN_CATEGORY_BITS.get(0)!.confidence }]);
assert.deepEqual(decodeCategoryTags(1 << 20), [
  { tag: 'category_special_summon', confidence: KNOWN_CATEGORY_BITS.get(20)!.confidence },
]);

// Two different bits mapping to the SAME tag (destroy) must not duplicate the
// tag in the output — the higher-confidence bit wins.
const destroyResult = decodeCategoryTags(1 | 2);
assert.equal(destroyResult.length, 1);
assert.equal(destroyResult[0].tag, 'category_destroy');
assert.equal(
  destroyResult[0].confidence,
  Math.max(KNOWN_CATEGORY_BITS.get(0)!.confidence, KNOWN_CATEGORY_BITS.get(1)!.confidence),
);

// Combined distinct-tag bits, in declaration order, each with its own confidence.
const combined = decodeCategoryTags((1 << 20) | 1 | (1 << 5));
assert.deepEqual(
  combined.map((t) => t.tag),
  ['category_destroy', 'category_return_to_hand', 'category_special_summon'],
);

// Unverified bit (e.g. bit 13) contributes nothing even when combined with a known one.
assert.deepEqual(decodeCategoryTags(1 | (1 << 13)), [
  { tag: 'category_destroy', confidence: KNOWN_CATEGORY_BITS.get(0)!.confidence },
]);

// Every verified bit carries a confidence in (0, 1].
for (const [bit, { confidence }] of KNOWN_CATEGORY_BITS) {
  assert.ok(confidence > 0 && confidence <= 1, `bit ${bit} confidence out of range: ${confidence}`);
}

// The two newly-added tags from the expanded correlation pass.
assert.deepEqual(decodeCategoryTags(1 << 17), [
  { tag: 'category_negate', confidence: KNOWN_CATEGORY_BITS.get(17)!.confidence },
]);
assert.deepEqual(decodeCategoryTags(1 << 29), [
  { tag: 'category_random', confidence: KNOWN_CATEGORY_BITS.get(29)!.confidence },
]);

// Zero / negative / non-finite category values yield no tags.
assert.deepEqual(decodeCategoryTags(0), []);
assert.deepEqual(decodeCategoryTags(-5), []);
assert.deepEqual(decodeCategoryTags(NaN), []);

console.log('babel-category.test.ts OK');
