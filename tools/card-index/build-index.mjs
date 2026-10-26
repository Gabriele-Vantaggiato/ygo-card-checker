// Offline builder for the image-embedding card index (see README.md in this folder).
//
//   node --import tsx tools/card-index/build-index.mjs --out public/assets/card-index/card-index.bin
//        [--cache tools/card-index/.cache] [--limit N] [--aug 3] [--concurrency 1] [--threads T]
//        [--refresh-cards] [--sample-seed 1234]
//
// Resumable: every card image and every per-image embedding result is persisted in the cache dir,
// so re-running the same command after a crash / Ctrl+C only processes what is missing.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { initEmbedder, embedFull, embedArt, degrade, augSeed, MODEL_ID, DTYPE, DIM } from './embedder.mjs';
import { encodeIndex, quantizeInt8 } from '../../src/app/utils/card-index.format.ts';

const CARDINFO_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const IMG_URL = (id) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`;
const USER_AGENT = 'ygo-card-checker-index-builder/1.0';
const REQUEST_GAP_MS = 120;
const AUG_LEVELS = ['mild', 'medium']; // k-th augmentation uses AUG_LEVELS[k % 2] (spike 05)

function parseArgs(argv) {
  const opts = { cache: 'tools/card-index/.cache', aug: 3, concurrency: 1, limit: 0, sampleSeed: 1234 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      return v;
    };
    if (a === '--out') opts.out = val();
    else if (a === '--cache') opts.cache = val();
    else if (a === '--limit') opts.limit = Number(val());
    else if (a === '--aug') opts.aug = Number(val());
    else if (a === '--concurrency') opts.concurrency = Math.max(1, Number(val()));
    else if (a === '--threads') opts.threads = Number(val());
    else if (a === '--sample-seed') opts.sampleSeed = Number(val());
    else if (a === '--refresh-cards') opts.refreshCards = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!opts.out) throw new Error('--out <file.bin> is required');
  return opts;
}

const recipeTag = (aug) =>
  `dinov2s-q8|224fill|L2[L2cls,L2meanpatch]|full+art(.11-.89,.18-.72)|mean(clean+${aug}aug mild/medium)->L2|batch1`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtDur = (s) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m${String(s % 60).padStart(2, '0')}s`;
};

function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

async function fetchRetry(url, tries = 4) {
  let last;
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (r.status === 404) return { status: 404 };
      if (r.ok) return { status: 200, body: Buffer.from(await r.arrayBuffer()) };
      last = new Error(`HTTP ${r.status}`);
      if (r.status !== 429 && r.status < 500) break;
    } catch (e) {
      last = e;
    }
    await sleep(1000 * 2 ** t);
  }
  throw new Error(`${url}: ${last?.message ?? last}`);
}

async function loadCards(cacheDir, refresh) {
  const file = path.join(cacheDir, 'cardinfo.json');
  if (!refresh && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).data;
  console.log(`fetching card list ${CARDINFO_URL}`);
  const { status, body } = await fetchRetry(CARDINFO_URL);
  if (status !== 200) throw new Error(`card list HTTP ${status}`);
  writeAtomic(file, body);
  return JSON.parse(body.toString('utf8')).data;
}

/** One row per card image: first image = the card's own row, extra images = alternate-art rows. */
function planRows(cards, limit, seed) {
  let list = cards.filter((c) => c.card_images?.length);
  if (limit > 0 && limit < list.length) {
    // deterministic random subset (same shuffle as the spike's sampler)
    let s = seed >>> 0;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    list = list.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    list = list.slice(0, limit);
  }
  const rows = [];
  for (const c of list) {
    c.card_images.forEach((img, k) => rows.push({ cardId: c.id, imageId: img.id, alt: k > 0, name: c.name }));
  }
  return { rows, cards: list.length };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cacheDir = path.resolve(opts.cache);
  const imgDir = path.join(cacheDir, 'img');
  const tag = recipeTag(opts.aug);
  const embDir = path.join(cacheDir, `emb-${createHash('sha1').update(tag).digest('hex').slice(0, 10)}`);
  for (const d of [cacheDir, imgDir, embDir]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(embDir, 'RECIPE.txt'), tag + '\n');
  const missingFile = path.join(cacheDir, 'missing-images.json');
  const missing = new Set(fs.existsSync(missingFile) ? JSON.parse(fs.readFileSync(missingFile, 'utf8')) : []);

  const cards = await loadCards(cacheDir, opts.refreshCards);
  const { rows, cards: nCards } = planRows(cards, opts.limit, opts.sampleSeed);
  const altRows = rows.filter((r) => r.alt).length;
  console.log(`${nCards} cards, ${rows.length} rows (${altRows} alternate-art rows), aug=${opts.aug}, concurrency=${opts.concurrency}`);
  console.log(`cache: ${cacheDir}`);

  const embFile = (r) => path.join(embDir, `${r.imageId}.f32`);
  const imgFile = (r) => path.join(imgDir, `${r.imageId}.jpg`);
  const todo = rows.filter((r) => !missing.has(r.imageId) && !fs.existsSync(embFile(r)));
  console.log(`${rows.length - todo.length} rows already cached, ${todo.length} to process`);

  let stopping = false;
  process.on('SIGINT', () => {
    if (stopping) process.exit(130);
    stopping = true;
    console.log('\nSIGINT: finishing in-flight cards, progress is saved; re-run the same command to resume.');
  });

  if (todo.length) await initEmbedder({ cacheDir: path.join(cacheDir, 'hf'), threads: opts.threads });

  // Downloader: a single polite producer that prefetches images ahead of the embed workers.
  const PREFETCH = 24;
  const ready = new Map(); // index in todo -> Promise<Buffer|null>
  let nextDl = 0;
  let lastReq = 0;
  let dlChain = Promise.resolve();
  const download = (i) => {
    const r = todo[i];
    const p = (dlChain = dlChain.then(async () => {
      const f = imgFile(r);
      if (fs.existsSync(f) && fs.statSync(f).size > 0) return fs.readFileSync(f);
      const wait = lastReq + REQUEST_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastReq = Date.now();
      const res = await fetchRetry(IMG_URL(r.imageId));
      if (res.status === 404) return null;
      writeAtomic(f, res.body);
      return res.body;
    }).catch((e) => ({ error: e })));
    ready.set(i, p);
  };
  const pump = (upTo) => {
    while (nextDl < todo.length && nextDl <= upTo) download(nextDl++);
  };

  const t0 = Date.now();
  let done = 0, failed = 0, cursor = 0;
  const reportEvery = 50;
  const worker = async () => {
    while (!stopping) {
      const i = cursor++;
      if (i >= todo.length) return;
      pump(i + PREFETCH);
      const r = todo[i];
      const got = await ready.get(i);
      ready.delete(i);
      if (got === null) {
        missing.add(r.imageId);
        writeAtomic(missingFile, JSON.stringify([...missing]));
        console.log(`  404 image ${r.imageId} (card ${r.cardId} ${r.name}) - skipped`);
      } else if (got?.error) {
        failed++;
        console.log(`  download failed ${r.imageId}: ${got.error.message} - will retry on next run`);
      } else {
        try {
          const vec = await embedRow(got, r.imageId, opts.aug);
          writeAtomic(embFile(r), Buffer.from(vec.buffer));
        } catch (e) {
          failed++;
          console.log(`  embed failed ${r.imageId}: ${e.message}`);
        }
      }
      done++;
      if (done % reportEvery === 0 || done === todo.length) {
        const el = (Date.now() - t0) / 1000;
        const rate = done / el;
        console.log(`  ${done}/${todo.length}  ${(rate * 60).toFixed(1)} rows/min  elapsed ${fmtDur(el)}  ETA ${fmtDur((todo.length - done) / rate)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency }, worker));
  await dlChain.catch(() => {});
  const elapsed = (Date.now() - t0) / 1000;
  if (todo.length) console.log(`processed ${done} rows in ${fmtDur(elapsed)} (${((done / elapsed) * 60).toFixed(1)} rows/min)`);
  if (stopping) {
    console.log('stopped before completion: index NOT written. Re-run to resume.');
    process.exit(130);
  }
  if (failed) {
    console.log(`${failed} rows failed (network/embedding): index NOT written. Re-run to retry them.`);
    process.exit(1);
  }

  // Assemble the index from the cache.
  const present = rows.filter((r) => fs.existsSync(embFile(r)));
  const skipped = rows.filter((r) => !fs.existsSync(embFile(r)));
  const count = present.length;
  const index = {
    meta: { version: 1, model: MODEL_ID, dtype: DTYPE, dim: DIM, count, recipe: tag },
    ids: new Uint32Array(count),
    fullScale: new Float32Array(count),
    artScale: new Float32Array(count),
    full: new Int8Array(count * DIM),
    art: new Int8Array(count * DIM),
  };
  present.forEach((r, i) => {
    const buf = fs.readFileSync(embFile(r));
    const v = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    if (v.length !== 2 * DIM) throw new Error(`corrupt cache entry ${embFile(r)}`);
    const f = quantizeInt8(v.subarray(0, DIM));
    const a = quantizeInt8(v.subarray(DIM));
    index.ids[i] = r.cardId;
    index.full.set(f.q, i * DIM);
    index.art.set(a.q, i * DIM);
    index.fullScale[i] = f.scale;
    index.artScale[i] = a.scale;
  });
  const bin = encodeIndex(index);
  const outFile = path.resolve(opts.out);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  writeAtomic(outFile, bin);
  const meta = {
    ...index.meta,
    cards: new Set(present.map((r) => r.cardId)).size,
    altRows: present.filter((r) => r.alt).length,
    skipped: skipped.map((r) => ({ cardId: r.cardId, imageId: r.imageId, name: r.name })),
    aug: opts.aug,
    limit: opts.limit || null,
    bytes: bin.byteLength,
    sha256: createHash('sha256').update(bin).digest('hex'),
    builtAt: new Date().toISOString(),
  };
  writeAtomic(outFile.replace(/\.bin$/, '') + '.meta.json', JSON.stringify(meta, null, 2) + '\n');
  console.log(`wrote ${outFile} (${(bin.byteLength / 1048576).toFixed(2)} MB, ${count} rows, ${meta.cards} cards, ${meta.altRows} alt rows, ${skipped.length} skipped)`);
  if (skipped.length) console.log('skipped (404):', skipped.map((r) => `${r.imageId} ${r.name}`).join('; '));
}

/**
 * Index vector for one reference image: L2(clean + sum of `aug` degraded copies), per kind,
 * exactly as the spike's mean-vector index (05/08). Returns [full(768), art(768)].
 */
async function embedRow(buf, imageId, aug) {
  const full = Float32Array.from(await embedFull(buf));
  const art = Float32Array.from(await embedArt(buf));
  for (let k = 0; k < aug; k++) {
    const frame = await degrade(buf, AUG_LEVELS[k % 2], augSeed(imageId, k));
    const f = await embedFull(frame);
    const a = await embedArt(frame);
    for (let q = 0; q < DIM; q++) {
      full[q] += f[q];
      art[q] += a[q];
    }
  }
  const out = new Float32Array(2 * DIM);
  out.set(l2(full));
  out.set(l2(art), DIM);
  return out;
}

function l2(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
