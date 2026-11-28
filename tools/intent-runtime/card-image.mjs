import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { catalogCard } from './kernel.mjs';

const cache = new URL('../../tmp/intent-card-images/', import.meta.url);
const fixtures = new URL('../../src/test-fixtures/cards/', import.meta.url);
const landing = new URL('../../public/assets/landing/', import.meta.url);
const pending = new Map();

async function loadImage(id) {
  for (const directory of [fixtures, landing, cache]) {
    try { return await readFile(new URL(`${id}.jpg`, directory)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const response = await fetch(`https://images.ygoprodeck.com/images/cards_small/${id}.jpg`, { signal: AbortSignal.timeout(4500) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/jpeg')) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 250000) return null;
  await mkdir(cache, { recursive: true });
  await writeFile(new URL(`${id}.jpg`, cache), bytes);
  return bytes;
}

export function cardImage(id) {
  if (!catalogCard(id)) return null;
  if (!pending.has(id)) pending.set(id, loadImage(id).finally(() => pending.delete(id)));
  return pending.get(id);
}
