import { readFileSync } from 'node:fs';

const data = new URL('../../src/assets/data/', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('passcode-catalog.json', data))).cards;
const legality = JSON.parse(readFileSync(new URL('card-knowledge/format-legality.json', data)));
const names = new Map(catalog.map(c => [c.n.toLowerCase(), c]));
export const source = { catalog: 'src/assets/data/passcode-catalog.json', legality: 'src/assets/data/card-knowledge/format-legality.json', generatedAt: legality.generatedAt };
export const sample = `#main
2 Geargiarmor
2 Geargiarsenal
3 Geargiaccelerator
2 Geargiano
2 Geargiano Mk-II
3 Traptrix Myrmeleo
2 Traptrix Dionaea
3 Artifact Moralltach
1 Artifact Beagalltach
3 Artifact Sanctum
3 Artifact Ignition
3 Mystical Space Typhoon
3 Fiendish Chain
2 Dimensional Prison
2 Mirror Force
1 Book of Moon
1 Bottomless Trap Hole
1 Torrential Tribute
1 Geargiagear`;

export function parseDeck(text) {
  if (typeof text !== 'string' || text.length > 20000) throw Error('Lista non valida o troppo lunga.');
  let section = 'main'; const rows = new Map();
  for (const line of text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    if (['#main', '#extra', '#side'].includes(line.toLowerCase())) { section = line.slice(1).toLowerCase(); continue; }
    const match = /^(\d+)x?\s+(.+)$/i.exec(line);
    if (!match || +match[1] < 1 || +match[1] > 3) throw Error(`Riga non valida (1–3 copie): ${line}`);
    const card = names.get(match[2].toLowerCase());
    if (!card) throw Error(`Carta sconosciuta: ${match[2]}. Usa il nome inglese esatto.`);
    const zone = section === 'main' && /Fusion|Synchro|XYZ|Link/.test(card.t) ? 'extra' : section;
    if (zone === 'extra' && !/Fusion|Synchro|XYZ|Link/.test(card.t)) throw Error(`Carta non ammessa in Extra: ${card.n}`);
    const key = `${zone}:${card.i}`;
    rows.set(key, { id: card.i, name: card.n, section: zone, quantity: (rows.get(key)?.quantity ?? 0) + +match[1] });
  }
  return [...rows.values()];
}
export function checkDeck(rows) {
  const errors = []; const totals = {main:0, extra:0, side:0}; const copies = new Map();
  for (const row of rows) { totals[row.section] += row.quantity; copies.set(row.id, (copies.get(row.id) ?? 0) + row.quantity); }
  if (totals.main < 40 || totals.main > 60) errors.push('Main Deck: servono 40–60 carte.');
  if (totals.extra > 15 || totals.side > 15) errors.push('Extra e Side: massimo 15 carte ciascuno.');
  for (const [id, count] of copies) {
    const card = catalog.find(c => c.i === id);
    const max = legality.maxCopies[id]?.hat ?? 0;
    if (!legality.playable[id]?.includes('hat') || count > max) errors.push(`${card.n}: ${count} copie, limite HAT locale ${max}.`);
  }
  return {totals, errors, valid: errors.length === 0, source};
}
export function probability(size, starters, hand = 5) {
  if (![size, starters, hand].every(Number.isInteger) || size < 1 || starters < 0 || starters > size || hand < 1 || hand > size) throw Error('Parametri probabilità non validi.');
  let miss = 1;
  for (let i=0; i<hand; i++) miss *= Math.max(0, size - starters - i) / (size - i);
  return 1 - miss;
}
export function optimize(text, hand = 5) {
  if (![5,6].includes(hand)) throw Error('Scegli una mano di 5 o 6 carte.');
  const original = parseDeck(text); const beforeCheck = checkDeck(original);
  if (!beforeCheck.valid) throw Error(beforeCheck.errors.join(' '));
  const proposed = structuredClone(original); const changes = [];
  // Explicit, narrow heuristic. These roles are assumptions, not semantic inference.
  for (const name of ['Geargiarmor', 'Geargiarsenal']) {
    const starter = proposed.find(r => r.name === name && r.section === 'main');
    if (!starter) continue;
    while (starter.quantity < Math.min(3, legality.maxCopies[starter.id]?.hat ?? 0)) {
      const cut = proposed.find(r => ['Dimensional Prison','Fiendish Chain'].includes(r.name) && r.section === 'main' && r.quantity > 1);
      if (!cut) break;
      cut.quantity--; starter.quantity++; changes.push({remove:cut.name, add:name});
    }
  }
  const count = rows => rows.filter(r=>r.section === 'main' && ['Geargiarmor','Geargiarsenal'].includes(r.name)).reduce((n,r)=>n+r.quantity,0);
  const before = count(original), after = count(proposed), size = beforeCheck.totals.main;
  return {original, proposed, changes, before, after, size, hand, probabilityBefore:probability(size,before,hand), probabilityAfter:probability(size,after,hand), validation:checkDeck(proposed), warning:'Euristica Geargia: starter = Geargiarmor / Geargiarsenal. Misura soltanto la probabilità di pescarne almeno uno, non vittorie, swarm o forza del mazzo. Legalità secondo snapshot locale HAT, non certificazione ufficiale.'};
}
export function combo({beastInGrave = true, negate = false} = {}) {
  if (typeof beastInGrave !== 'boolean' || typeof negate !== 'boolean') throw Error('Stato combo non valido.');
  const state = {hand:['Scrap Chimera', ...(beastInGrave ? [] : ['Scrap Beast'])], field:[], grave:beastInGrave ? ['Scrap Beast'] : [], extra:['Scrap Dragon'], normalUsed:false};
  const steps = [{action:'Stato iniziale', state:structuredClone(state)}];
  state.hand.splice(state.hand.indexOf('Scrap Chimera'),1); state.field.push('Scrap Chimera'); state.normalUsed=true;
  steps.push({action:'Evocazione Normale di Scrap Chimera',state:structuredClone(state)});
  if (!beastInGrave || negate) return {steps, complete:false, reason:!beastInGrave ? 'Scrap Beast è in mano: manca un Tuner Scrap nel Cimitero. La seconda Evocazione Normale non è disponibile.' : 'Interruzione astratta: effetto di Chimera negato. Nessuna rianimazione; Synchro non disponibile.', scope:'Scenario limitato, non motore generale di duello.'};
  state.grave=[];state.field.push('Scrap Beast');
  steps.push({action:'Effetto di Chimera: Evocazione Speciale di Beast dal Cimitero',state:structuredClone(state)});
  state.field=['Scrap Dragon'];state.grave=['Scrap Chimera','Scrap Beast'];state.extra=[];
  steps.push({action:'Synchro Scrap Dragon: Beast Tuner livello 4 + Chimera livello 4',state:structuredClone(state)});
  return {steps,complete:true,reason:'Materiali Scrap e livello totale 8 verificati nello scenario. Nessun effetto di distruzione di Dragon simulato.',scope:'Solo queste transizioni; nessuna catena, priorità, costo o altra carta simulata.'};
}
export function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.tools) || plan.tools.length < 1 || plan.tools.length > 2 || new Set(plan.tools).size !== plan.tools.length || plan.tools.some(t=>!['combo','optimize'].includes(t))) throw Error('Piano AI non valido: strumenti non consentiti.');
  if (!Array.isArray(plan.views) || plan.views.length < 1 || plan.views.length > 4 || plan.views.some(v=>!['timeline','metrics','changes','audit'].includes(v))) throw Error('Piano AI non valido: viste non consentite.');
  if (plan.views.includes('timeline') && !plan.tools.includes('combo') || plan.views.some(v=>['metrics','changes'].includes(v)) && !plan.tools.includes('optimize')) throw Error('Vista senza dati verificabili.');
  if (plan.tools.includes('combo') && !plan.views.includes('timeline') || plan.tools.includes('optimize') && !plan.views.includes('metrics')) throw Error('Piano senza vista del risultato.');
  return {tools:plan.tools,views:[...new Set([...plan.views,'audit'])]};
}
export function demoPlan(intent) {
  const tools=[]; if (/combo|scrap|chimera/i.test(intent)) tools.push('combo'); if (/ottim|optimi|geargia|consisten/i.test(intent)) tools.push('optimize');
  if (!tools.length) throw Error('Demo limitata: chiedi una combo Scrap o ottimizzazione Geargia. Nessuna AI attiva.');
  return validatePlan({tools,views:[...(tools.includes('combo')?['timeline']:[]),...(tools.includes('optimize')?['metrics','changes']:[]),'audit']});
}
export function execute(plan,input) {
  plan=validatePlan(plan); const results={},trace=[];
  for (const tool of plan.tools) { results[tool]=tool==='combo'?combo(input):optimize(input.deck,input.hand); trace.push({tool,input:tool==='combo'?{beastInGrave:input.beastInGrave,negate:input.negate}:{hand:input.hand,deck:input.deck},result:results[tool]}); }
  return {plan,results,trace,source};
}
