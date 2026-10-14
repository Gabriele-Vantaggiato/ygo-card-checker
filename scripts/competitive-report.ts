/**
 * Calibration of the competitive deck model: does each component separate real tournament decks from
 * random ones in the right direction? AUC = P(real deck beats a random deck on that component).
 * Run: npx tsx scripts/competitive-report.ts [--formats hat,edison]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import type { RouletteDeck } from '../src/app/services/deck-roulette.service';
import { KIND, metaMapFromRecord } from '../src/app/utils/card-meta.utils';
import { CompetitiveContext, CompetitiveScore, scoreDeck, seededRandom } from '../src/app/utils/competitive-score.utils';

const DIR = join(__dirname, '../src/assets/data/deck-roulette');
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const FORMATS = arg('formats', 'hat,edison').split(',');

const meta = metaMapFromRecord(JSON.parse(readFileSync(join(DIR, 'cards.json'), 'utf8')).cards);
const links = new Map(
  Object.entries(JSON.parse(readFileSync(join(DIR, 'synergy.json'), 'utf8')).links as Record<string, Array<[number, number, number]>>).map(
    ([id, row]) => [Number(id), row],
  ),
);
const usageAll = JSON.parse(readFileSync(join(DIR, 'usage.json'), 'utf8')).usage as Record<string, Record<string, number>>;

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const auc = (real: number[], random: number[], lowerIsBetter = false): number => {
  let wins = 0;
  let total = 0;
  for (const a of real) {
    for (const b of random) {
      total++;
      if (lowerIsBetter ? a < b : a > b) wins++;
      else if (a === b) wins += 0.5;
    }
  }
  return wins / Math.max(total, 1);
};

const COMPONENTS: Array<[string, (s: CompetitiveScore) => number, boolean]> = [
  ['brickRate', (s) => s.brickRate, true],
  ['synergy.inTurn', (s) => s.synergy.inTurn, false],
  ['synergy.crossTurn', (s) => s.synergy.crossTurn, false],
  ['consistency', (s) => s.consistency, false],
  ['usage', (s) => s.usage, false],
  ['OVERALL', (s) => s.overall, false],
];

for (const formatId of FORMATS) {
  const decks: RouletteDeck[] = JSON.parse(readFileSync(join(DIR, `${formatId}.json`), 'utf8')).decks;
  const usage = new Map(Object.entries(usageAll[formatId] ?? {}).map(([id, v]) => [Number(id), v]));
  const ctx: CompetitiveContext = { meta, links, usage };
  const real = decks.filter((d) => d.source === 'tournament');

  // random baseline: 40 main-deck cards from the format's cards, max 3 copies each
  const mainCards = [...usage.keys()].filter((id) => {
    const m = meta.get(id);
    return m && (m.kind === KIND.monster || m.kind === KIND.spell || m.kind === KIND.trap);
  });
  const random = seededRandom(7);
  const randomDecks: number[][] = [];
  for (let n = 0; n < 150; n++) {
    const counts = new Map<number, number>();
    const deck: number[] = [];
    while (deck.length < 40) {
      const id = mainCards[Math.floor(random() * mainCards.length)];
      if ((counts.get(id) ?? 0) >= 3) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      deck.push(id);
    }
    randomDecks.push(deck);
  }

  const realScores = real.map((d) => scoreDeck(d.main, ctx));
  const randomScores = randomDecks.map((d) => scoreDeck(d, ctx));
  console.log(`\n== ${formatId}: real=${real.length} random=${randomDecks.length}    realMean / randomMean / AUC(real better)`);
  for (const [name, pick, lowerIsBetter] of COMPONENTS) {
    const a = realScores.map(pick);
    const b = randomScores.map(pick);
    console.log(`${name.padEnd(18)} ${mean(a).toFixed(3)} / ${mean(b).toFixed(3)} / ${auc(a, b, lowerIsBetter).toFixed(2)}`);
  }

  // do better-placed decks score better? (outcome check; noisy because top-cut decks are all strong)
  const placed = real.filter((d) => d.placement);
  const group = (min: number, max: number) => placed.filter((d) => d.placement! >= min && d.placement! <= max).map((d) => scoreDeck(d.main, ctx));
  const top = group(1, 2);
  const low = group(5, 99);
  if (top.length >= 10 && low.length >= 10) {
    console.log(`-- placement: top1-2 n=${top.length} vs 5th+ n=${low.length}    topMean / lowMean / AUC(top better)`);
    for (const [name, pick, lowerIsBetter] of COMPONENTS) {
      const a = top.map(pick);
      const b = low.map(pick);
      console.log(`${name.padEnd(18)} ${mean(a).toFixed(3)} / ${mean(b).toFixed(3)} / ${auc(a, b, lowerIsBetter).toFixed(2)}`);
    }
  }
}
