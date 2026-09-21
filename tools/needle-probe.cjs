const fs = require('node:fs');
const path = require('node:path');
// Research-only: download pinned assets as described in docs/DECISION-MODEL.md.
const base = path.resolve(process.argv[2] || 'tmp/needle3');
const createNeedle = require(path.join(base, 'needle.js'));
(async () => {
  const m = await createNeedle({ wasmBinary: fs.readFileSync(path.join(base, 'needle.wasm')) });
  const weights = fs.readFileSync(path.join(base, 'needle3.cact'));
  const p = m._malloc(weights.length);
  m.HEAPU8.set(weights, p);
  console.log('load', m._needle_load(p, BigInt(weights.length)));
  const tools = [{ name: 'set_deck_goal', description: 'Classify the requested Yu-Gi-Oh deck improvement. consistency: draw or search cards; combo: extend combos or summon; removal: remove opposing cards; disruption: negate or interrupt opponent; graveyard: recover your cards from graveyard; archetype: focus on the same archetype; balanced: no preference; unsupported: unrelated request.', parameters: { type: 'object', properties: { goal: { type: 'string', enum: ['consistency','combo','removal','disruption','graveyard','archetype','balanced','unsupported'] } }, required: ['goal'] } }];
  console.log('init', m.ccall('needle_init', 'number', ['string', 'string', 'number'], ['', JSON.stringify(tools), 0]));
  const out = m._malloc(65536);
  for (const query of ['I want to draw and search more cards.', 'Voglio pescare e cercare carte dal deck.', 'Voglio negare gli effetti del mio avversario.', 'I need to destroy opposing spells and traps.', 'Vorrei recuperare i miei mostri dal cimitero.', 'What is the weather tomorrow?']) {
    m._needle_reset();
    const start = Date.now();
    m.ccall('needle_complete', 'number', ['string', 'number', 'number', 'number'], [query, 96, out, 65536]);
    console.log(query, m.UTF8ToString(out), 'ms', Date.now() - start);
  }
})();
