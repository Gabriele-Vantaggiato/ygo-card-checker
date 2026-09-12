import { readFile, mkdir, writeFile } from 'node:fs/promises';
const source = new URL('../../src/assets/data/effect-scripts/scripts.json', import.meta.url);
const destination = new URL('../../public/assets/data/effect-scripts/study.json', import.meta.url);
const index = JSON.parse(await readFile(source, 'utf8'));
const scripts = Object.fromEntries(Object.entries(index.scripts).map(([id, script]) => [id, { ...script, luaSource: '' }]));
await mkdir(new URL('.', destination), { recursive: true });
await writeFile(destination, JSON.stringify({ ...index, scripts }));
console.log(`Prepared study metadata for ${Object.keys(scripts).length} cards.`);
