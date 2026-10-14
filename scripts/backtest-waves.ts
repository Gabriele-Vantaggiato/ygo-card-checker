/**
 * Backtest of wave-by-wave completion against the one-shot completion.
 * For every pool deck (leave-one-out) the user "types" about a quarter of the main deck; the rest of the
 * deck (main, extra, side) is rebuilt (a) in one shot, (b) wave by wave taking the recommended choices.
 *
 * Run: npx tsx scripts/backtest-waves.ts [--formats hat,edison] [--keep 0.25]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import type { RouletteDeck } from '../src/app/services/deck-roulette.service';
import { metaMapFromRecord } from '../src/app/utils/card-meta.utils';
import { CompetitiveContext, scoreDeck, seededRandom } from '../src/app/utils/competitive-score.utils';
import { buildFormatCardStats, buildFormatStaples } from '../src/app/utils/format-staples.utils';
import { completeFromPool } from '../src/app/utils/pool-completion.utils';
import { WaveContext, simulateWaves } from '../src/app/utils/wave-planner.utils';

const DIR = join(__dirname, '../src/assets/data/deck-roulette');
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const FORMATS = arg('formats', 'hat,edison').split(',');
const KEEP = Number(arg('keep', '0.25'));
const LIMIT = Number(arg('limit', '150'));

const meta = metaMapFromRecord(JSON.parse(readFileSync(join(DIR, 'cards.json'), 'utf8')).cards);
const links = new Map(
  Object.entries(JSON.parse(readFileSync(join(DIR, 'synergy.json'), 'utf8')).links as Record<string, Array<[number, number, number]>>).map(([id, row]) => [Number(id), row]),
);
const usageAll = JSON.parse(readFileSync(join(DIR, 'usage.json'), 'utf8')).usage as Record<string, Record<string, number>>;

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
const section = (deck: ReadonlyMap<string, number>, name: string): number[] => {
  const out: number[] = [];
  for (const [key, qty] of deck) if (key.startsWith(`${name}:`)) for (let i = 0; i < qty; i++) out.push(Number(key.split(':')[1]));
  return out;
};

for (const formatId of FORMATS) {
  const pool: RouletteDeck[] = JSON.parse(readFileSync(join(DIR, `${formatId}.json`), 'utf8')).decks;
  const usage = new Map(Object.entries(usageAll[formatId] ?? {}).map(([id, v]) => [Number(id), v]));
  const competitive: CompetitiveContext = { meta, links, usage };

  const agg = { n: 0, stopped: new Map<string, number>(), waves: 0, choices: 0, oneRecallMain: 0, waveRecallMain: 0, oneRecallExtra: 0, waveRecallExtra: 0, oneOverall: 0, waveOverall: 0, oneBrick: 0, waveBrick: 0, complete: 0 };

  for (const [index, target] of pool.slice(0, LIMIT).entries()) {
    const others = pool.filter((d) => d.id !== target.id);
    const random = seededRandom(1000 + index);
    const kept: number[] = [];
    for (const id of target.main) if (random() < KEEP) kept.push(id);
    if (kept.length < 4) continue;
    const initial = new Map<string, number>();
    for (const id of kept) initial.set(`main:${id}`, (initial.get(`main:${id}`) ?? 0) + 1);

    const ctx: WaveContext = {
      pool: others,
      meta,
      links,
      usage,
      staples: buildFormatStaples(others),
      stats: buildFormatCardStats(others),
      targets: { main: 40, extra: 15, side: 15 },
      ...(arg('optimize', '1') === '1' ? { competitive, optimizer: { lambda: Number(arg('lambda', '2')) } } : {}),
    };

    // (a) one shot
    const gaps = { main: Math.max(0, 40 - kept.length), extra: 15, side: 15 };
    const oneShot = completeFromPool(initial, others, gaps, { meta, competitive, staples: ctx.staples });
    const oneMain = [...kept];
    const oneExtra: number[] = [];
    for (const add of oneShot?.adds ?? []) for (let i = 0; i < add.quantity; i++) (add.section === 'main' ? oneMain : add.section === 'extra' ? oneExtra : []).push(add.cardId);

    // (b) waves
    const sim = simulateWaves(initial, ctx);
    const waveMain = section(sim.deck, 'main');
    const waveExtra = section(sim.deck, 'extra');

    agg.n++;
    agg.stopped.set(sim.stopped, (agg.stopped.get(sim.stopped) ?? 0) + 1);
    agg.waves += sim.waves.length;
    agg.choices += sim.waves.filter((w) => w.choice).length;
    if (waveMain.length >= 40) agg.complete++;
    const realMain = counts(target.main);
    const realExtra = counts(target.extra);
    const hiddenMain = Math.max(target.main.length - kept.length, 1);
    agg.oneRecallMain += (overlap(realMain, counts(oneMain)) - overlap(realMain, counts(kept))) / hiddenMain;
    agg.waveRecallMain += (overlap(realMain, counts(waveMain)) - overlap(realMain, counts(kept))) / hiddenMain;
    agg.oneRecallExtra += overlap(realExtra, counts(oneExtra)) / Math.max(target.extra.length, 1);
    agg.waveRecallExtra += overlap(realExtra, counts(waveExtra)) / Math.max(target.extra.length, 1);
    const one = scoreDeck(oneMain, competitive, { samples: 300 });
    const wave = scoreDeck(waveMain, competitive, { samples: 300 });
    agg.oneOverall += one.overall;
    agg.waveOverall += wave.overall;
    agg.oneBrick += one.brickRate;
    agg.waveBrick += wave.brickRate;
  }

  const f = (x: number, d = 3) => (x / Math.max(agg.n, 1)).toFixed(d);
  const pct = (x: number) => ((x / Math.max(agg.n, 1)) * 100).toFixed(1) + '%';
  console.log(`\n== ${formatId}: ${agg.n} decks, user starts with ~${Math.round(KEEP * 100)}% of the main deck`);
  console.log(`waves per deck ${f(agg.waves, 1)}, choices per deck ${f(agg.choices, 2)}, reached 40 main ${pct(agg.complete)}, stop reasons ${[...agg.stopped].map(([k, v]) => `${k}:${v}`).join(' ')}`);
  console.log(`                    main recall   extra recall   brick   overall`);
  console.log(`one-shot            ${pct(agg.oneRecallMain).padStart(10)}   ${pct(agg.oneRecallExtra).padStart(11)}   ${f(agg.oneBrick)}   ${f(agg.oneOverall)}`);
  console.log(`waves (default)     ${pct(agg.waveRecallMain).padStart(10)}   ${pct(agg.waveRecallExtra).padStart(11)}   ${f(agg.waveBrick)}   ${f(agg.waveOverall)}`);
}
