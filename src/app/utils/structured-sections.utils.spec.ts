import type { RouletteDeck } from '../services/deck-roulette.service';
import { buildFormatCardStats, buildFormatStaples, typicalCopies } from './format-staples.utils';
import { StructuredSlot, selectStructuredSection } from './structured-sections.utils';

const deck = (id: string, archetype: string, extra: number[], side: number[] = [], main: number[] = []): RouletteDeck => ({
  id,
  name: id,
  archetype,
  source: 'tournament',
  coverCardId: null,
  main,
  extra,
  side,
});

const makeSlot = (cardId: number, copy: number, probability: number): StructuredSlot => ({ cardId, copy, probability });

describe('format staples', () => {
  // card 900 is an extra staple (6 archetypes); card 901 is only played by one archetype
  const archetypes = ['A', 'B', 'C', 'D', 'E', 'F'];
  const pool = archetypes.flatMap((a, i) => [
    deck(`${a}1`, a, [900, 901 + (a === 'A' ? 0 : 100 + i)]),
    deck(`${a}2`, a, [900, 901 + (a === 'A' ? 0 : 100 + i)]),
  ]);

  it('keeps only cards played across several archetypes', () => {
    const { extra } = buildFormatStaples(pool, { minShare: 0.1, minArchetypes: 5 });
    expect([...extra.keys()]).toEqual([900]);
    expect(extra.get(900)!.share).toBe(1);
    expect(extra.get(900)!.archetypes).toBe(6);
  });

  it('reports the share of decks playing at least k copies', () => {
    const decks = [deck('x1', 'A', [5, 5, 5]), deck('x2', 'B', [5, 5]), deck('x3', 'C', [5]), deck('x4', 'D', [])];
    const entry = buildFormatStaples(decks, { minShare: 0.1, minArchetypes: 1 }).extra.get(5)!;
    expect(entry.copyShare).toEqual([0.75, 0.5, 0.25]);
  });

  it('derives the typical copies from how players run a card', () => {
    expect(typicalCopies({ share: 0.5, copyShare: [0.5, 0.45, 0.4] })).toBe(3);
    expect(typicalCopies({ share: 0.5, copyShare: [0.5, 0.3, 0.05] })).toBe(2);
    expect(typicalCopies({ share: 0.5, copyShare: [0.5, 0.05, 0] })).toBe(1);
    expect(typicalCopies({ share: 0, copyShare: [0, 0, 0] })).toBe(1);
  });

  it('builds per-card statistics for every section', () => {
    const stats = buildFormatCardStats([deck('m1', 'A', [], [7, 7], [1, 1, 1]), deck('m2', 'B', [], [], [1])]);
    expect(stats.main.get(1)!.copyShare).toEqual([1, 0.5, 0.5]);
    expect(stats.side.get(7)!.share).toBe(0.5);
    expect(stats.extra.size).toBe(0);
  });
});

describe('selectStructuredSection', () => {
  const stapleEntry = (cardId: number, share: number, copyShare: [number, number, number]) => ({ cardId, share, copyShare, archetypes: 6 });
  const staples = new Map([
    [900, stapleEntry(900, 0.9, [0.9, 0.1, 0.0])],
    [901, stapleEntry(901, 0.6, [0.6, 0.1, 0.0])],
    [902, stapleEntry(902, 0.3, [0.3, 0.0, 0.0])],
  ]);
  const base = {
    section: 'extra' as const,
    have: () => 0,
    makeSlot,
  };

  it('fills with recurring cards when no similar deck exists, one copy each', () => {
    const picks = selectStructuredSection({ ...base, slots: [], gap: 3, matchedSections: [], weights: [], staples });
    expect(picks.map((p) => p.slot.cardId)).toEqual([900, 901, 902]);
    expect(picks.every((p) => p.slot.copy === 1 && p.staple)).toBeTrue();
  });

  it('splits slots between staples and archetype cards in the proportion similar decks use', () => {
    // similar decks play 2 staples out of 4 extra cards -> half of the slots are staples
    const matched = [[900, 901, 11, 12]];
    const slots = [11, 12, 13, 14].map((id, i) => makeSlot(id, 1, 0.9 - i * 0.1));
    const picks = selectStructuredSection({ ...base, slots, gap: 4, matchedSections: matched, weights: [1], staples });
    const staplePicks = picks.filter((p) => p.staple).map((p) => p.slot.cardId);
    expect(staplePicks.sort()).toEqual([900, 901]);
    expect(picks.filter((p) => !p.staple).map((p) => p.slot.cardId).sort()).toEqual([11, 12]);
  });

  it('lets the other group fill the section when one runs out of candidates', () => {
    const picks = selectStructuredSection({ ...base, slots: [makeSlot(11, 1, 0.9)], gap: 4, matchedSections: [[11, 11, 11, 11]], weights: [1], staples });
    expect(picks.length).toBe(4);
    expect(new Set(picks.map((p) => p.slot.cardId))).toEqual(new Set([11, 900, 901, 902]));
  });

  it('never exceeds the gap and keeps copies of a card consecutive', () => {
    const sideStaples = new Map([[500, stapleEntry(500, 0.8, [0.8, 0.7, 0.6])]]);
    const picks = selectStructuredSection({ ...base, section: 'side', slots: [], gap: 2, matchedSections: [], weights: [], staples: sideStaples });
    expect(picks.map((p) => p.slot.copy)).toEqual([1, 2]);
  });

  it('skips copies the user already has', () => {
    const picks = selectStructuredSection({ ...base, have: (id) => (id === 900 ? 1 : 0), slots: [], gap: 2, matchedSections: [], weights: [], staples });
    expect(picks.map((p) => p.slot.cardId)).not.toContain(900);
  });

  it('demotes cards the adjust function penalises', () => {
    const picks = selectStructuredSection({ ...base, adjust: (slot) => (slot.cardId === 900 ? 0.1 : 1), slots: [], gap: 1, matchedSections: [], weights: [], staples });
    expect(picks[0].slot.cardId).toBe(901);
  });

  it('returns nothing for an empty gap', () => {
    expect(selectStructuredSection({ ...base, slots: [], gap: 0, matchedSections: [], weights: [], staples })).toEqual([]);
  });
});
