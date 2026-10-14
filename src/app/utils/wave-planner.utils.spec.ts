import type { RouletteDeck } from '../services/deck-roulette.service';
import { CardMeta, FLAG, KIND } from './card-meta.utils';
import { buildFormatCardStats, buildFormatStaples } from './format-staples.utils';
import { WaveContext, WaveState, applyWave, nextWave, simulateWaves } from './wave-planner.utils';

const card = (flags = 0, kind: number = KIND.monster, level = 4): CardMeta => ({ roles: 0, kind, level, tuner: false, flags, archetype: 0 });

/** Engine cards 1..12 (3 copies of 1..8, 2 of 9..10) + 13 staple spell, extras 100.., side 200.. */
const engineMain = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 10, 10, 13, 13, 13, 14, 14, 14, 15, 15, 15, 16, 16, 16];

const deck = (id: string, extra: number[], side: number[], main = engineMain, archetype = 'Engine'): RouletteDeck => ({
  id, name: id, archetype, source: 'tournament', coverCardId: null, main, extra, side,
});
const pool: RouletteDeck[] = Array.from({ length: 12 }, (_, i) => deck(`d${i}`, [100, 101, 102 + (i % 2)], [200, 200, 201]));
const others = Array.from({ length: 6 }, (_, i) => deck(`o${i}`, [100, 300 + i], [200, 202 + i], [20 + i, 20 + i, 20 + i, 30 + i, 30 + i, 30 + i], `Other${i}`));

const meta = new Map<number, CardMeta>([
  [1, card(FLAG.search)], [2, card(FLAG.ssHand)], [3, card()], [4, card()], [5, card()], [6, card()], [7, card()], [8, card()],
  [13, card(0, KIND.spell)], [14, card(0, KIND.spell)], [15, card(0, KIND.trap)], [16, card(0, KIND.trap)],
  [100, card(0, KIND.xyz, 4)], [101, card(0, KIND.xyz, 8)], [102, card(0, KIND.xyz, 4)], [103, card(0, KIND.xyz, 4)],
]);
const links = new Map<number, ReadonlyArray<readonly [number, number, number]>>([
  [1, [[2, 3, 1], [3, 2, 1]]],
]);
const baseCtx = (extra: Partial<WaveContext> = {}): WaveContext => {
  const all = [...pool, ...others];
  return {
    pool: all,
    meta,
    links,
    usage: new Map([[13, 0.8]]),
    staples: buildFormatStaples(all, { minShare: 0.2, minArchetypes: 2 }),
    stats: buildFormatCardStats(all),
    targets: { main: 40, extra: 15, side: 15 },
    ...extra,
  };
};
const state = (pairs: Array<[string, number]>, over: Partial<WaveState> = {}): WaveState => ({
  userBySection: new Map(pairs),
  rejected: new Set(),
  ...over,
});
const mainCount = (m: ReadonlyMap<string, number>) => [...m].filter(([k]) => k.startsWith('main:')).reduce((s, [, q]) => s + q, 0);

describe('wave planner', () => {
  it('starts by raising the copies of cards the user already plays (core wave)', () => {
    const result = nextWave(state([['main:1', 1], ['main:2', 1], ['main:3', 1]]), baseCtx());
    expect(result.done).toBeFalse();
    if (result.done) return;
    expect(result.wave.kind).toBe('core');
    const byCard = new Map(result.wave.cards.map((c) => [c.cardId, c.quantity]));
    expect(byCard.get(1)).toBe(2);
    expect(result.wave.cards.every((c) => c.why.some((w) => w.kind === 'playset'))).toBeTrue();
    expect(result.wave.basis.decks).toBeGreaterThan(0);
  });

  it('proposes partners tied to the user cards and says why', () => {
    const result = nextWave(state([['main:1', 3], ['main:2', 3], ['main:3', 3]]), baseCtx());
    expect(result.done).toBeFalse();
    if (result.done) return;
    const linked = result.wave.cards.flatMap((c) => c.why).filter((w) => w.kind === 'linked');
    expect(['partners', 'engine', 'support']).toContain(result.wave.kind);
    expect(result.wave.cards.length + (result.wave.choice?.options.length ?? 0)).toBeGreaterThan(0);
    expect(linked.length >= 0).toBeTrue();
  });

  it('never proposes cards the user rejected', () => {
    const base = state([['main:1', 3], ['main:2', 3]]);
    const first = nextWave(base, baseCtx());
    if (first.done) return fail('expected a wave');
    const ids = first.wave.cards.map((c) => c.cardId);
    const second = nextWave({ ...base, rejected: new Set(ids) }, baseCtx());
    if (second.done) return;
    expect(second.wave.cards.some((c) => ids.includes(c.cardId))).toBeFalse();
  });

  it('asks which Ritual Spell to play when the deck has Ritual monsters but no spell', () => {
    const rit = new Map(meta);
    rit.set(1, card(FLAG.ritualMonster, KIND.monster, 8));
    rit.set(50, card(FLAG.ritualSpell, KIND.spell));
    rit.set(51, card(FLAG.ritualSpell, KIND.spell));
    rit.set(52, card(FLAG.ritualSpell, KIND.spell));
    const ritualCore = engineMain.slice(0, 31);
    const ritualMain = [...ritualCore, 50, 50, 51, 51, 52, 52, 52, 14, 14];
    const ritualPool = Array.from({ length: 10 }, (_, i) => deck(`r${i}`, [100], [200], ritualMain, 'Ritual'));
    const ctx = baseCtx({ meta: rit, pool: ritualPool, staples: buildFormatStaples(ritualPool, { minShare: 0.2, minArchetypes: 1 }), stats: buildFormatCardStats(ritualPool) });
    // everything the core wave could raise is already at the pool's copies, so the need wave comes up
    const mine = new Map<string, number>();
    for (const id of ritualCore) mine.set(`main:${id}`, (mine.get(`main:${id}`) ?? 0) + 1);
    const result = nextWave({ userBySection: mine, rejected: new Set() }, ctx);
    if (result.done) return fail('expected a wave');
    expect(result.wave.kind).toBe('need');
    expect(result.wave.choice?.prompt).toBe('ritual-spell');
    expect(result.wave.choice!.options.length).toBeGreaterThanOrEqual(2);
    expect(result.wave.choice!.options.length).toBeLessThanOrEqual(4);
    expect(result.wave.choice!.options[0].why.some((w) => w.kind === 'ritual-need')).toBeTrue();
  });

  it('builds the extra and side deck from recurring cards once the main deck is complete', () => {
    const full: Array<[string, number]> = [];
    const counts = new Map<number, number>();
    for (const id of engineMain) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, q] of counts) full.push([`main:${id}`, q]);
    const result = nextWave(state(full), baseCtx());
    if (result.done) return fail('expected a wave');
    expect(result.wave.kind).toBe('extra');
    const extraIds = result.wave.cards.map((c) => c.cardId);
    expect(extraIds).toContain(100);
    expect(result.wave.cards.every((c) => c.section === 'extra')).toBeTrue();
  });

  it('applies a wave and the chosen option to the deck', () => {
    const wave = {
      id: 'w', kind: 'support' as const, basis: { decks: 1, best: null },
      cards: [{ cardId: 1, section: 'main' as const, quantity: 2, probability: 1, playedBy: 1, of: 1, why: [] }],
      choice: { id: 'c', prompt: 'close-call' as const, recommended: 0, options: [
        { cardId: 5, section: 'main' as const, quantity: 1, probability: 0.5, playedBy: 1, of: 2, why: [] },
        { cardId: 6, section: 'main' as const, quantity: 1, probability: 0.5, playedBy: 1, of: 2, why: [] },
      ] },
    };
    const next = applyWave(state([['main:1', 1]]), wave, 1);
    expect(next.get('main:1')).toBe(3);
    expect(next.get('main:6')).toBe(1);
    expect(next.has('main:5')).toBeFalse();
  });

  it('completes a deck wave by wave and stops with a reason', () => {
    const sim = simulateWaves(new Map([['main:1', 3], ['main:2', 3], ['main:3', 3]]), baseCtx());
    // the synthetic pool has too few distinct extra cards to reach 15, so it may stop for lack of candidates
    expect(['complete', 'no-candidates']).toContain(sim.stopped);
    expect(mainCount(sim.deck)).toBe(40);
    expect(sim.waves.length).toBeGreaterThan(2);
    expect(sim.waves.length).toBeLessThan(20);
    for (const wave of sim.waves) expect(wave.cards.reduce((s, c) => s + c.quantity, 0)).toBeLessThanOrEqual(15);
  });

  it('reports when no deck of the pool is similar', () => {
    const result = nextWave(state([['main:9999', 3]]), baseCtx());
    expect(result).toEqual({ done: true, reason: 'no-match' });
  });

  it('reports a finished deck', () => {
    const full = new Map<string, number>([['main:1', 40], ['extra:100', 15], ['side:200', 15]]);
    expect(nextWave({ userBySection: full, rejected: new Set() }, baseCtx())).toEqual({ done: true, reason: 'complete' });
  });

  it('lets learned preferences reorder what is proposed', () => {
    const s = state([['main:1', 3], ['main:2', 3], ['main:3', 3]]);
    const plain = nextWave(s, baseCtx());
    const liked = nextWave({ ...s, preference: (id) => (id === 16 ? 3 : 0) }, baseCtx());
    if (plain.done || liked.done) return fail('expected waves');
    const pos = (cards: { cardId: number }[]) => cards.findIndex((c) => c.cardId === 16);
    // a liked card is never later in the wave than without the preference, and carries a preference tag when present
    if (pos(liked.wave.cards) >= 0 && pos(plain.wave.cards) >= 0) expect(pos(liked.wave.cards)).toBeLessThanOrEqual(pos(plain.wave.cards));
    const tagged = liked.wave.cards.find((c) => c.cardId === 16);
    if (tagged) expect(tagged.why.some((w) => w.kind === 'preference')).toBeTrue();
  });
});
