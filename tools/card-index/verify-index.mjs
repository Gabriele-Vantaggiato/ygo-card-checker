// Sanity check for a built card index: simulate webcam frames of N indexed cards at three
// difficulty levels, embed them exactly like the runtime (embedFull/embedArt, batch 1) and
// report top-1 / top-5 via the shared searchIndex().
//
//   node --import tsx tools/card-index/verify-index.mjs --index <card-index.bin>
//        [--cache tools/card-index/.cache] [--n 200] [--src full|small] [--seed 7] [--query-dtype q8|fp16|fp32]
//
// --src full (default) builds queries from the full-size card image (421x614, different
// resampling than the 268x391 reference the index was built from, as in the spike);
// --src small reuses the cached reference images (no downloads, slightly optimistic).
import fs from 'node:fs';
import path from 'node:path';
import { initEmbedder, embedFull, embedArt, degrade, augSeed, mix32 } from './embedder.mjs';
import { decodeIndex, searchIndex } from '../../src/app/utils/card-index.format.ts';

const USER_AGENT = 'ygo-card-checker-index-builder/1.0';
const opts = { cache: 'tools/card-index/.cache', n: 200, src: 'full', seed: 7 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], v = argv[++i];
  if (a === '--index') opts.index = v;
  else if (a === '--cache') opts.cache = v;
  else if (a === '--n') opts.n = Number(v);
  else if (a === '--src') opts.src = v;
  else if (a === '--seed') opts.seed = Number(v);
  else if (a === '--query-dtype') opts.queryDtype = v;
  else throw new Error(`unknown argument ${a}`);
}
if (!opts.index) throw new Error('--index <card-index.bin> is required');
const cacheDir = path.resolve(opts.cache);

const file = fs.readFileSync(path.resolve(opts.index));
const index = decodeIndex(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
console.log(`index: ${index.meta.count} rows, dim ${index.meta.dim}, ${index.meta.model} ${index.meta.dtype}`);
console.log(`recipe: ${index.meta.recipe}`);

// Distinct card ids; the primary image of a card has image id === card id.
const cardIds = [...new Set(index.ids)];
let s = mix32(opts.seed);
const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
for (let i = cardIds.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [cardIds[i], cardIds[j]] = [cardIds[j], cardIds[i]];
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sourceImage(id) {
  if (opts.src === 'small') {
    const f = path.join(cacheDir, 'img', `${id}.jpg`);
    return fs.existsSync(f) ? fs.readFileSync(f) : null;
  }
  const dir = path.join(cacheDir, 'img-full');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${id}.jpg`);
  if (fs.existsSync(f) && fs.statSync(f).size > 0) return fs.readFileSync(f);
  await sleep(120);
  const r = await fetch(`https://images.ygoprodeck.com/images/cards/${id}.jpg`, { headers: { 'User-Agent': USER_AGENT } });
  if (!r.ok) return null;
  const b = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(f, b);
  return b;
}

await initEmbedder({ cacheDir: path.join(cacheDir, 'hf'), dtype: opts.queryDtype ?? index.meta.dtype });
const LEVELS = ['mild', 'medium', 'harsh'];
const stats = Object.fromEntries(LEVELS.map((l) => [l, { top1: 0, top5: 0, top1Full: 0, n: 0 }]));
let used = 0, msEmbed = 0, msSearch = 0, searches = 0;
for (const id of cardIds) {
  if (used >= opts.n) break;
  const src = await sourceImage(id);
  if (!src) continue;
  used++;
  for (const [li, lvl] of LEVELS.entries()) {
    const frame = await degrade(src, lvl, augSeed(id, li, 1000 + opts.seed));
    const t0 = performance.now();
    const qf = await embedFull(frame);
    const qa = await embedArt(frame);
    const t1 = performance.now();
    const hits = searchIndex(index, qf, qa, 5);
    const t2 = performance.now();
    const fullOnly = searchIndex(index, qf, null, 1);
    msEmbed += t1 - t0;
    msSearch += t2 - t1;
    searches++;
    const st = stats[lvl];
    st.n++;
    if (hits[0]?.id === id) st.top1++;
    if (hits.some((h) => h.id === id)) st.top5++;
    if (fullOnly[0]?.id === id) st.top1Full++;
  }
  if (used % 50 === 0) console.log(`  ${used}/${opts.n} queries`);
}
const pct = (x, n) => +((100 * x) / n).toFixed(1);
console.table(LEVELS.map((l) => ({ level: l, N: stats[l].n, top1: pct(stats[l].top1, stats[l].n), top5: pct(stats[l].top5, stats[l].n), top1_fullOnly: pct(stats[l].top1Full, stats[l].n) })));
console.log(`src=${opts.src}; query dtype ${opts.queryDtype ?? index.meta.dtype}; avg embed (full+art) ${(msEmbed / searches).toFixed(0)} ms, avg search ${(msSearch / searches).toFixed(2)} ms over ${index.meta.count} rows`);
