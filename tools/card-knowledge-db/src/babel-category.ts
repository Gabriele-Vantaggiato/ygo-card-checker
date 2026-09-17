/**
 * BabelCDB `datas.category` bitmask decoder — deliberately partial.
 *
 * This field's bit assignment does NOT match the current upstream
 * `constant.lua` `CATEGORY_*` values (verified empirically: e.g. Mystical
 * Space Typhoon's official script calls only `SetCategory(CATEGORY_DESTROY)`
 * = 0x1, but its stored `category` is 2). The DB was compiled against a
 * different/historical enum ordering we don't have a source for.
 *
 * Each bit below was instead reverse-engineered by statistically correlating
 * `datas.category` against official card scripts' `SetCategory`/
 * `SetOperationInfo` category arguments, restricted to cards unambiguous on
 * BOTH sides (single db bit AND a single distinct script category). Two
 * correlation passes were run: an initial ~300-card sample, then a follow-up
 * ~3000-card sample that both raised confidence on the original bits and
 * surfaced new ones (bit1 turned out to ALSO mean "destroy", alongside two
 * entirely new tags: bit17 "negate" and bit29 "random"). Two script
 * categories that mean the same thing in-app (send-to-GY vs deck-mill;
 * coin-toss vs dice-roll) are folded into one tag, with the combined
 * agreement rate as confidence.
 *
 * Only bits with a decent sample (n≥24) and high agreement (≥80%) are
 * included; the rest of the 32 bits are genuinely unknown and intentionally
 * omitted rather than guessed. `confidence` is carried through to
 * `card_tags.confidence` so downstream consumers can weight these below
 * hand-tuned 'rule' tags. Re-run the correlation with an even larger sample
 * (or the full 4700-card single-bit pool) to raise confidence further or
 * fill in the remaining bits — several (level/ATK/DEF change, equip,
 * flip, leave-GY) showed a real but sub-threshold signal worth revisiting.
 */
export interface CategoryBitInfo {
  tag: string;
  confidence: number;
}

export const KNOWN_CATEGORY_BITS: ReadonlyMap<number, CategoryBitInfo> = new Map([
  [0, { tag: 'category_destroy', confidence: 106 / 110 }],
  [1, { tag: 'category_destroy', confidence: 51 / 51 }],
  [2, { tag: 'category_send_to_gy', confidence: (30 + 18) / 50 }], // TOGRAVE + DECKDES (mill)
  [5, { tag: 'category_return_to_hand', confidence: 120 / 124 }],
  [6, { tag: 'category_return_to_deck', confidence: 34 / 36 }],
  [7, { tag: 'category_banish', confidence: 93 / 104 }],
  [8, { tag: 'category_draw', confidence: 94 / 97 }],
  [12, { tag: 'category_position_change', confidence: 71 / 77 }],
  [17, { tag: 'category_negate', confidence: 26 / 32 }],
  [18, { tag: 'category_lp_damage', confidence: 124 / 127 }],
  [19, { tag: 'category_lp_recovery', confidence: 53 / 53 }],
  [20, { tag: 'category_special_summon', confidence: 717 / 774 }],
  [29, { tag: 'category_random', confidence: 10 / 10 }], // COIN + DICE
  [30, { tag: 'category_control_change', confidence: 51 / 52 }],
]);

export function decodeCategoryTags(category: number): CategoryBitInfo[] {
  if (!Number.isFinite(category) || category <= 0) {
    return [];
  }
  const byTag = new Map<string, number>();
  for (const [bit, info] of KNOWN_CATEGORY_BITS) {
    if ((category & (1 << bit)) === 0) continue;
    const existing = byTag.get(info.tag);
    if (existing === undefined || info.confidence > existing) {
      byTag.set(info.tag, info.confidence);
    }
  }
  return [...byTag.entries()].map(([tag, confidence]) => ({ tag, confidence }));
}
