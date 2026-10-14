/**
 * Backtest of Extra and Side Deck completion. For every pool deck (leave-one-out, so no leakage) the full
 * main deck is given and the Extra (15) and Side (15) are rebuilt from scratch from the OTHER decks.
 * Compares the legacy fill (copy of the closest decks) with the structured fill (staples + archetype cards).
 *
 * Run: npx tsx scripts/backtest-sections.ts [--formats hat,edison]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import type { RouletteDeck } from '../src/app/services/deck-roulette.service';
import { metaMapFromRecord } from '../src/app/utils/card-meta.utils';
import { buildMonsterPool, isExtraReachable } from '../src/app/utils/extra-reachability.utils';
import { buildFormatStaples, stapleShareOf } from '../src/app/utils/format-staples.utils';
import { completeFromPool } from '../src/app/utils/pool-completion.utils';

const DIR = join(__dirname, '../src/assets/data/deck-roulette');
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const FORMATS = arg('formats', 'hat,edison').split(',');
const meta = metaMapFromRecord(JSON.parse(readFileSync(join(DIR, 'cards.json'), 'utf8')).cards);

const counts = (ids: readonly number[]): Map<number, number> => {
  const m = new Map<number, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
};
const overlap = (a: Map<number, number>, b: Map<number, number>): number => {
  let sum = 0;
  for (const [id, qty] of a) sum += Math.min(qty, b.get(id) ?? 0);
  return sum;
};

interface Tally { recall: number; stapleShare: number; threeOf: number; distinct: number; clone: number; reach: number; reachDen: number; n: number }
const emptyTally = (): Tally => ({ recall: 0, stapleShare: 0, threeOf: 0, distinct: 0, clone: 0, reach: 0, reachDen: 0, n: 0 });

for (const formatId of FORMATS) {
  const pool: RouletteDeck[] = JSON.parse(readFileSync(join(DIR, `${formatId}.json`), 'utf8')).decks;
  const results: Record<string, Record<'extra' | 'side', Tally>> = {
    real: { extra: emptyTally(), side: emptyTally() },
    legacy: { extra: emptyTally(), side: emptyTally() },
    structured: { extra: emptyTally(), side: emptyTally() },
  };

  for (const target of pool) {
    const others = pool.filter((d) => d.id !== target.id);
    const staples = buildFormatStaples(others); // from the other decks only: no leakage
    const partial = new Map<string, number>();
    for (const id of target.main) partial.set(`main:${id}`, (partial.get(`main:${id}`) ?? 0) + 1);
    const monsters = buildMonsterPool(counts(target.main), meta);

    for (const [mode, opts] of [['legacy', { meta }], ['structured', { meta, staples }]] as const) {
      const result = completeFromPool(partial, others, { main: 0, extra: 15, side: 15 }, opts);
      for (const section of ['extra', 'side'] as const) {
        const realCards = target[section];
        const proposed: number[] = [];
        for (const add of result?.adds ?? []) if (add.section === section) for (let i = 0; i < add.quantity; i++) proposed.push(add.cardId);
        const t = results[mode][section];
        t.n++;
        t.recall += realCards.length ? overlap(counts(realCards), counts(proposed)) / realCards.length : 0;
        t.stapleShare += stapleShareOf(proposed, staples[section]);
        const c = counts(proposed);
        t.distinct += c.size;
        t.threeOf += c.size ? [...c.values()].filter((q) => q >= 3).length / c.size : 0;
        // clone-ness: overlap with the single closest other deck's section (1 = a pure copy of one deck)
        let best = 0;
        for (const d of others) best = Math.max(best, overlap(counts(proposed), counts(d[section])));
        t.clone += proposed.length ? best / proposed.length : 0;
        if (section === 'extra') {
          for (const id of proposed) {
            t.reachDen++;
            if (isExtraReachable(meta.get(id), monsters)) t.reach++;
          }
        }
      }
    }
    for (const section of ['extra', 'side'] as const) {
      const t = results.real[section];
      t.n++;
      t.stapleShare += stapleShareOf(target[section], staples[section]);
      const c = counts(target[section]);
      t.distinct += c.size;
      t.threeOf += c.size ? [...c.values()].filter((q) => q >= 3).length / c.size : 0;
    }
  }

  console.log(`\n== ${formatId} (${pool.length} decks, leave-one-out)        recall  staples  3x-share  distinct  clone  reach`);
  for (const section of ['extra', 'side'] as const) {
    for (const mode of ['real', 'legacy', 'structured'] as const) {
      const t = results[mode][section];
      const f = (x: number, d = 2) => (x / Math.max(t.n, 1)).toFixed(d);
      console.log(
        `${section.padEnd(6)} ${mode.padEnd(11)} ` +
          `${mode === 'real' ? '  -   ' : (t.recall / Math.max(t.n, 1) * 100).toFixed(1).padStart(5) + '%'}  ` +
          `${(t.stapleShare / Math.max(t.n, 1) * 100).toFixed(0).padStart(5)}%  ${(t.threeOf / Math.max(t.n, 1) * 100).toFixed(0).padStart(6)}%  ` +
          `${f(t.distinct, 1).padStart(7)}  ${mode === 'real' ? '  -  ' : f(t.clone).padStart(5)}  ` +
          `${section === 'extra' && t.reachDen ? ((t.reach / t.reachDen) * 100).toFixed(1) + '%' : ''}`,
      );
    }
  }
}
