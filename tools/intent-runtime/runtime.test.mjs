import test from 'node:test';
import assert from 'node:assert/strict';
import {sample,parseDeck,checkDeck,probability,optimize,combo,demoPlan,validatePlan,execute} from './kernel.mjs';
import {createServer,planWithAI} from './server.mjs';
import {composeDeckWorkspace, dashboardPrompt, editPrompt, examplePrompt} from './deck-workspace.mjs';
import {cardImage} from './card-image.mjs';
import {interpretWorkspace} from './workspace-model.mjs';
import { Readable } from 'node:stream';

test('workspace model accepts only ChatGPT login and a supported view', async () => {
  const run = async (args, prompt) => {
    if (args[0] === 'login') return 'Logged in using ChatGPT';
    assert.ok(args.includes('read-only'));
    assert.match(prompt, /mostrami le illustrazioni/);
    return '{"view":"dashboard"}';
  };
  assert.equal(await interpretWorkspace('mostrami le illustrazioni', run), dashboardPrompt);
  await assert.rejects(interpretWorkspace('test', async () => 'Logged in using an API key'), /richiesto/);
  await assert.rejects(interpretWorkspace('test', async args =>
    args[0] === 'login' ? 'Logged in using ChatGPT' : '{"view":"other"}'), /non corrisponde/);
});

test('dashboard builds image, probability and co-occurrence blocks from the deck', async () => {
  const grants = new Set(['deck.read','hand.analyze','deck.suggest']);
  const options = { starters:'Geargiarmor, Geargiarsenal', hand:5 };
  const dictated = dashboardPrompt.toLowerCase().replace(/[,.]/g, '');
  const view = composeDeckWorkspace(dictated, sample, grants, options);
  assert.deepEqual(view.blocks.map(block => block.slot), ['deck','analysis','full']);
  const cards = view.blocks[0].groups[0].cards;
  assert.ok(cards.some(card => card.name === 'Geargiarmor' && card.id > 0));
  const formatter = new Intl.NumberFormat('it', {style:'percent',maximumFractionDigits:2});
  assert.equal(view.blocks[1].items[1].value, formatter.format(probability(40,4,5)));
  const suggestions = view.blocks[2].groups[0].cards;
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.every(card => card.partner && !cards.some(existing => existing.id === card.id)));
  assert.equal(composeDeckWorkspace(dashboardPrompt, sample, grants).blocks[1].type, 'notice');
  assert.throws(() => composeDeckWorkspace(dashboardPrompt, sample, grants, {starters:'Scrap Beast'}), /Main Deck/);
  assert.throws(() => composeDeckWorkspace(dashboardPrompt, sample, new Set(['deck.read']), options), /negato/);
  const fixture = await cardImage(89631139);
  assert.deepEqual([...fixture.subarray(0, 2)], [255, 216]);
});

test('deck workspace serves the UI and enforces the API contract', async () => {
  const [handle] = createServer().listeners('request');
  async function request(method, url, input, origin) {
    const request = Readable.from(input ? [Buffer.from(JSON.stringify(input))] : []);
    Object.assign(request, {method, url, headers: {
      host: '127.0.0.1:4173', 'content-type': 'application/json', origin
    }});
    let status;
    let body;
    await handle(request, {
      writeHead(code) { status = code; },
      end(value) { body = String(value); }
    });
    return {status, body};
  }
  const page = await request('GET', '/decklist');
  assert.equal(page.status, 200);
  assert.match(page.body, /Come vuoi costruire la pagina/);
  for (const asset of ['/workspace.js', '/workspace.css']) {
    assert.equal((await request('GET', asset)).status, 200);
  }
  const input = {intent: examplePrompt, deck: sample};
  const result = await request('POST', '/api/workspace', input);
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.body).capability, 'deck.read');
  const dashboard = await request('POST', '/api/workspace', {
    intent: dashboardPrompt, deck: sample, starters: 'Geargiarmor, Geargiarsenal', hand: 5
  });
  assert.equal(dashboard.status, 200);
  assert.equal(JSON.parse(dashboard.body).layout.variant, 'dashboard');
  const image = await request('GET', '/card-images/89631139.jpg');
  assert.equal(image.status, 200);
  assert.equal((await request('GET', '/intent-api/api/status')).status, 200);
  assert.equal((await request('POST', '/api/workspace', input, 'https://example.com')).status, 403);
  assert.equal((await request('POST', '/api/workspace', {...input, deck: '1 Fake Card'})).status, 400);
});

test('deck workspace validates the grant and builds distinct declarative layouts', () => {
  const deck = '#main\n3 Scrap Chimera\n1 Scrap Beast\n#extra\n1 Scrap Dragon';
  const grants = new Set(['deck.read']);
  const first = composeDeckWorkspace(examplePrompt, deck, grants);
  assert.deepEqual(first, composeDeckWorkspace(examplePrompt, deck, grants));
  assert.deepEqual(first.layout, { columns: 2, theme: 'dark' });
  assert.deepEqual(first.blocks[0].items.map(item => item.value), [4, 1, 0]);
  assert.deepEqual(first.blocks[1].rows, [['Scrap Beast', 1], ['Scrap Chimera', 3]]);
  const second = composeDeckWorkspace(editPrompt.replace('.', ', senza riepilogo.'), deck, grants);
  assert.deepEqual(second.layout, { columns: 1, theme: 'light' });
  assert.deepEqual(second.blocks.map(block => block.title), ['Main Deck', 'Extra Deck']);
  assert.deepEqual(second.blocks[0].rows, [['Scrap Chimera', 3], ['Scrap Beast', 1]]);
  assert.throws(() => composeDeckWorkspace(examplePrompt, deck, new Set()), /negato/);
  assert.throws(() => composeDeckWorkspace('Suggerisci una combo', deck, grants), /fuori/);
});

test('probability agrees with exact combinatorics and boundaries',()=>{
  const choose=(n,k)=>{let x=1;for(let i=1;i<=k;i++)x=x*(n-i+1)/i;return x;};
  assert.ok(Math.abs(probability(40,4,5)-(1-choose(36,5)/choose(40,5)))<1e-12);
  assert.equal(probability(40,0),0);assert.equal(probability(40,40),1);assert.throws(()=>probability(40,41));
});
test('parser rejects unknown cards, bad quantities and resolves Extra',()=>{
  assert.throws(()=>parseDeck('3 Fake Card'));assert.throws(()=>parseDeck('4 Geargiarmor'));assert.throws(()=>parseDeck('0 Geargiarmor'));
  assert.equal(parseDeck('1 Scrap Dragon')[0].section,'extra');assert.throws(()=>parseDeck('#extra\n1 Geargiarmor'));
});
test('legality counts copies across Main and Side',()=>{
  assert.equal(checkDeck(parseDeck(sample)).valid,true);
  assert.equal(checkDeck(parseDeck(sample+'\n#side\n2 Geargiarmor')).valid,false);
  assert.equal(checkDeck(parseDeck(sample.replace('2 Geargiarmor','1 Geargiarmor'))).valid,false);
});
test('optimization preserves size, legality and improves the specified metric',()=>{
  const r=optimize(sample);assert.equal(r.size,40);assert.equal(r.validation.totals.main,40);assert.equal(r.validation.valid,true);
  assert.equal(r.before,4);assert.equal(r.after,6);assert.equal(r.changes.length,2);assert.ok(r.probabilityAfter>r.probabilityBefore);
  assert.ok(optimize(sample,6).probabilityBefore>r.probabilityBefore);assert.throws(()=>optimize(sample,7));
});
test('combo conserves cards and consumes normal summon',()=>{
  const r=combo();assert.equal(r.complete,true);assert.equal(r.steps.length,4);
  for(const s of r.steps){const cards=['hand','field','grave','extra'].flatMap(k=>s.state[k]);assert.equal(cards.length,3);assert.equal(new Set(cards).size,3);}
  assert.equal(r.steps[3].state.normalUsed,true);assert.deepEqual(r.steps[3].state.field,['Scrap Dragon']);
});
test('Beast in hand cannot be revived; negation stops before Synchro',()=>{
  for(const input of [{beastInGrave:false},{negate:true}]) {const r=combo(input);assert.equal(r.complete,false);assert.equal(r.steps.length,2);assert.ok(!r.steps.at(-1).state.field.includes('Scrap Dragon'));}
});
test('plans compose and unknown intent fails visibly',()=>{
  const p=demoPlan('combo Scrap e ottimizza Geargia');assert.equal(p.tools.length,2);assert.equal(execute(p,{deck:sample,hand:5}).trace.length,2);
  assert.throws(()=>demoPlan('calcola fattura'));assert.throws(()=>validatePlan({tools:['shell'],views:['audit']}));assert.throws(()=>validatePlan({tools:['combo'],views:['metrics']}));
});
test('HTTP routes validate origin, payload, methods and complete both flows',async()=>{
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const status=await (await fetch(base+'/api/status')).json();assert.equal(status.sample,sample);
    assert.match(await (await fetch(base+'/decklist')).text(), /Come vuoi costruire la pagina/);
    const workspace = await fetch(base+'/api/workspace', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({intent:status.examplePrompt,deck:status.sample})
    });
    assert.equal(workspace.status, 200);
    assert.equal((await workspace.json()).capability, 'deck.read');
    const post=(body,headers={})=>fetch(base+'/api/run',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
    for(const intent of ['combo Scrap','ottimizza Geargia']) {const response=await post({intent,mode:'demo',deck:sample,hand:5});assert.equal(response.status,200);assert.equal((await response.json()).mode,'demo');}
    assert.equal((await post({intent:'combo',mode:'demo'},{Origin:'https://example.com'})).status,403);
    assert.equal((await post({intent:'combo',mode:'invalid'})).status,400);
    assert.equal((await fetch(base+'/server.mjs')).status,404);
    assert.equal((await fetch(base+'/',{method:'POST'})).status,404);
    assert.equal((await post({intent:'x'.repeat(33000),mode:'demo'})).status,413);
  }finally{await new Promise(r=>server.close(r));}
});
test('AI adapter validates model output, rejects provider errors; mocked transport only',async()=>{
  const oldKey=process.env.AI_GATEWAY_API_KEY,oldModel=process.env.INTENT_MODEL;
  process.env.AI_GATEWAY_API_KEY='test-only';process.env.INTENT_MODEL='test/model';
  try{
    const p=await planWithAI('combo',async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({tools:['combo'],views:['timeline']})}}]})}));assert.ok(p.views.includes('audit'));
    await assert.rejects(()=>planWithAI('combo',async()=>({ok:false,status:401})),/401/);
    await assert.rejects(()=>planWithAI('combo',async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"tools":["shell"],"views":["audit"]}'}}]})})));
  }finally{if(oldKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=oldKey;if(oldModel===undefined)delete process.env.INTENT_MODEL;else process.env.INTENT_MODEL=oldModel;}
});
