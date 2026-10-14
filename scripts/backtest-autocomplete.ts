/**
 * Backtest for the pool-based deck autocomplete.
 * For every pool deck: hide a fraction of its main+extra copies, complete the rest using the OTHER
 * pool decks (leave-one-out, no leakage) and measure how many hidden copies come back.
 *
 * Run: npx tsx scripts/backtest-autocomplete.ts [--fraction 0.3] [--formats goat,edison,hat]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import type { RouletteDeck } from '../src/app/services/deck-roulette.service';
import { completeFromPool } from '../src/app/utils/pool-completion.utils';
import { CARD_ROLES, countRoles, metaMapFromRecord } from '../src/app/utils/card-meta.utils';
import { buildMonsterPool, isExtraReachable } from '../src/app/utils/extra-reachability.utils';
import { CompetitiveContext, scoreDeck } from '../src/app/utils/competitive-score.utils';

const DATA = join(__dirname, '../src/assets/data/deck-roulette');
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const FRACTION = Number(arg('fraction', '0.3'));
const FORMATS = arg('formats', 'goat,edison,hat,tengu').split(',');
const SEEDS = Number(arg('seeds', '3'));
const META = metaMapFromRecord(JSON.parse(readFileSync(join(DATA, 'cards.json'), 'utf8')).cards);
const USE_META = arg('meta', '1') === '1';
const OPTIMIZE = arg('optimize', '0') === '1';
const LAMBDA = Number(arg('lambda', '0.8'));
const SYNERGY = new Map(
  Object.entries(JSON.parse(readFileSync(join(DATA, 'synergy.json'), 'utf8')).links as Record<string, Array<[number, number, number]>>).map(([id, row]) => [Number(id), row]),
);
const USAGE_ALL = JSON.parse(readFileSync(join(DATA, 'usage.json'), 'utf8')).usage as Record<string, Record<string, number>>;
const OPTIONS = {
  ...(USE_META ? { meta: META } : {}),
  unreachablePenalty: Number(arg('penalty', '0.35')),
  gamma: Number(arg('gamma', '8')),
  limit: Number(arg('limit', '8')),
  minCoverage: Number(arg('min-coverage', '0.35')),
};

/** Deterministic PRNG so runs are comparable between algorithm versions. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Section = 'main' | 'extra';
const key = (section: Section, id: number): string => `${section}:${id}`;

function toCounts(deck: RouletteDeck): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of deck.main) counts.set(key('main', id), (counts.get(key('main', id)) ?? 0) + 1);
  for (const id of deck.extra) counts.set(key('extra', id), (counts.get(key('extra', id)) ?? 0) + 1);
  return counts;
}

function multisetOverlap(a: Map<string, number>, b: Map<string, number>): number {
  let overlap = 0;
  for (const [k, qty] of a) overlap += Math.min(qty, b.get(k) ?? 0);
  return overlap;
}

/** Popularity baseline: most played cards of the pool, ignoring the user's deck identity. */
function popularityAdds(pool: readonly RouletteDeck[], have: Map<string, number>, gaps: { main: number; extra: number }) {
  const freq = new Map<string, number>();
  for (const d of pool) {
    for (const [k, qty] of toCounts(d)) freq.set(k, (freq.get(k) ?? 0) + qty);
  }
  const adds = new Map<string, number>();
  const room = { ...gaps };
  for (const [k] of [...freq.entries()].sort((x, y) => y[1] - x[1])) {
    const section = k.split(':')[0] as Section;
    if (room[section] <= 0) continue;
    const q = Math.min(3 - (have.get(k) ?? 0), room[section]);
    if (q <= 0) continue;
    adds.set(k, q);
    room[section] -= q;
  }
  return adds;
}

let grandBrick = 0;
let grandSyn = 0;
let grandOverall = 0;
let grandRecall = 0;
let grandRole = 0;
let grandReachNum = 0;
let grandReachDen = 0;
let grandBase = 0;
let grandN = 0;

for (const formatId of FORMATS) {
  const file = join(DATA, `${formatId}.json`);
  let pool: RouletteDeck[];
  try {
    pool = JSON.parse(readFileSync(file, 'utf8')).decks;
  } catch {
    continue;
  }
  if (pool.length < 10) {
    console.log(`${formatId}: pool too small (${pool.length}), skipped`);
    continue;
  }

  let recallSum = 0;
  let brickSum = 0;
  let synSum = 0;
  let overallSum = 0;
  const usageMap = new Map(Object.entries(USAGE_ALL[formatId] ?? {}).map(([id, v]) => [Number(id), v]));
  const competitive: CompetitiveContext = { meta: META, links: SYNERGY, usage: usageMap };
  let roleErrSum = 0;
  let reachNum = 0;
  let reachDen = 0;
  let baseSum = 0;
  let fallbackCount = 0;
  let n = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    for (const [index, target] of pool.entries()) {
      const random = mulberry32(seed * 100003 + index);
      const full = toCounts(target);
      const hidden = new Map<string, number>();
      const partial = new Map<string, number>();
      for (const [k, qty] of full) {
        let keep = 0;
        for (let i = 0; i < qty; i++) if (random() >= FRACTION) keep++;
        if (keep > 0) partial.set(k, keep);
        if (qty - keep > 0) hidden.set(k, qty - keep);
      }
      const gaps = { main: 0, extra: 0, side: 0 };
      for (const [k, qty] of hidden) gaps[k.startsWith('main') ? 'main' : 'extra'] += qty;
      const hiddenTotal = gaps.main + gaps.extra;
      if (hiddenTotal === 0 || partial.size === 0) continue;

      const others = pool.filter((d) => d.id !== target.id);
      const result = completeFromPool(partial, others, gaps, { ...OPTIONS, ...(OPTIMIZE ? { competitive, optimizer: { lambda: LAMBDA } } : {}) });
      if (!result) {
        fallbackCount++;
        n++;
        continue; // counted as recall 0 (engine fallback would take over in the app)
      }
      const proposed = new Map<string, number>();
      for (const add of result.adds) {
        if (add.section === 'side') continue;
        proposed.set(key(add.section, add.cardId), (proposed.get(key(add.section, add.cardId)) ?? 0) + add.quantity);
      }
      recallSum += multisetOverlap(hidden, proposed) / hiddenTotal;
      const mainIds: number[] = [];
      for (const [k, qty] of partial) if (k.startsWith('main:')) for (let i = 0; i < qty; i++) mainIds.push(Number(k.slice(5)));
      for (const add of result.adds) if (add.section === 'main') for (let i = 0; i < add.quantity; i++) mainIds.push(add.cardId);
      const sc = scoreDeck(mainIds, competitive);
      brickSum += sc.brickRate;
      synSum += sc.synergy.inTurn;
      overallSum += sc.overall;
      // role profile error: completed main vs the real main (role copies, normalised by main size)
      const completedMain: Array<[number, number]> = [];
      for (const [k, qty] of partial) if (k.startsWith('main:')) completedMain.push([Number(k.slice(5)), qty]);
      for (const add of result.adds) if (add.section === 'main') completedMain.push([add.cardId, add.quantity]);
      const realMain: Array<[number, number]> = [];
      for (const [k, qty] of full) if (k.startsWith('main:')) realMain.push([Number(k.slice(5)), qty]);
      const got = countRoles(completedMain, META);
      const real = countRoles(realMain, META);
      roleErrSum += CARD_ROLES.reduce((sum, r) => sum + Math.abs(got[r] - real[r]), 0) / Math.max(realMain.reduce((a, [, q]) => a + q, 0), 1);
      // extra reachability of the proposed extra cards given the completed main
      const monsters = buildMonsterPool(completedMain, META);
      for (const add of result.adds) {
        if (add.section !== 'extra') continue;
        reachDen += add.quantity;
        if (isExtraReachable(META.get(add.cardId), monsters)) reachNum += add.quantity;
      }
      baseSum += multisetOverlap(hidden, popularityAdds(others, partial, gaps)) / hiddenTotal;
      n++;
    }
  }
  grandRecall += recallSum;
  grandBrick += brickSum;
  grandSyn += synSum;
  grandOverall += overallSum;
  grandRole += roleErrSum;
  grandReachNum += reachNum;
  grandReachDen += reachDen;
  grandBase += baseSum;
  grandN += n;
  console.log(
    `${formatId.padEnd(7)} decks=${String(pool.length).padStart(3)} cases=${String(n).padStart(4)} ` +
      `recall=${((recallSum / n) * 100).toFixed(1)}%  popularity-baseline=${((baseSum / n) * 100).toFixed(1)}%  ` +
      `no-match=${((fallbackCount / n) * 100).toFixed(1)}%  brick=${(brickSum / n).toFixed(3)} inTurn=${(synSum / n).toFixed(3)} overall=${(overallSum / n).toFixed(3)}  roleErr=${(roleErrSum / n).toFixed(3)}  extraReach=${reachDen ? ((reachNum / reachDen) * 100).toFixed(1) : '-'}%`,
  );
}
if (grandN > 0) {
  console.log(`ALL     recall=${((grandRecall / grandN) * 100).toFixed(1)}%  brick=${(grandBrick / grandN).toFixed(3)} inTurn=${(grandSyn / grandN).toFixed(3)} overall=${(grandOverall / grandN).toFixed(3)}  baseline=${((grandBase / grandN) * 100).toFixed(1)}%  roleErr=${(grandRole / grandN).toFixed(3)}  extraReach=${grandReachDen ? ((grandReachNum / grandReachDen) * 100).toFixed(1) : '-'}%  (hidden ${FRACTION}, meta ${USE_META ? 'on' : 'off'}, optimise ${OPTIMIZE ? 'on' : 'off'})`);
}
