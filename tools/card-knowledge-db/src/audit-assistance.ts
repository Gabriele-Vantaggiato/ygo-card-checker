import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AssistanceEngine } from '../../../src/app/utils/assistance-engine';
import type { CardKnowledgeIndex } from '../../../src/app/models/card-knowledge.model';
import type { EffectScriptIndex } from '../../../src/app/models/effect-script.model';
import { REPO_ROOT } from './database';
const read = (path: string) => JSON.parse(readFileSync(join(REPO_ROOT, 'src/assets/data', path), 'utf8'));
const knowledge = read('card-knowledge/related.json') as CardKnowledgeIndex;
const scripts = read('effect-scripts/scripts.json') as EffectScriptIndex;
const segoc = read('effect-scripts/segoc-profiles.json') as Record<string, unknown>;
const combos = read('card-knowledge/combos.json') as { generatedAt: string; entries: Record<string, { lines: unknown[] }> };
const engine = new AssistanceEngine(knowledge);
let actions = 0, recognized = 0, matched = 0, structuredCards = 0;
const unknown = new Map<string, number>();
const start = performance.now();
for (const script of Object.values(scripts.scripts)) {
  if (script.steps.length) structuredCards++;
  for (const step of script.steps) for (const action of step.actions) {
    if (!['search', 'add', 'ss', 'set'].includes(action.op)) continue;
    actions++;
    const hits = engine.actionTargets(action, script.cardId);
    if (hits === null) unknown.set(action.filter || '(no filter)', (unknown.get(action.filter || '(no filter)') ?? 0) + 1);
    else { recognized++; if (hits.length) matched++; }
  }
}
const report = {
  generatedAt: new Date().toISOString(),
  inputs: { knowledge: knowledge.generatedAt, scripts: scripts.generatedAt, combos: combos.generatedAt },
  catalogCards: engine.catalog.size,
  babelMembershipCards: Object.values(knowledge.entries).filter(entry => entry.setcodes?.length).length,
  structuredCards, segocProfiles: Object.keys(segoc).length,
  comboCards: Object.keys(combos.entries).length,
  comboCardsWithLines: Object.values(combos.entries).filter(entry => entry.lines.length).length,
  targetActions: actions, recognizedTargetFilters: recognized, filtersWithCatalogTargets: matched,
  unknownTargetFilters: actions - recognized,
  commonUnknownFilters: [...unknown].sort((a, b) => b[1] - a[1]).slice(0, 25),
  scanMs: Math.round(performance.now() - start),
  interpretation: 'Coverage of parsed data and target predicates, not a measured combo accuracy rate or proof of activation legality.',
};
mkdirSync(join(REPO_ROOT, 'docs'), { recursive: true });
writeFileSync(join(REPO_ROOT, 'docs/assistance-coverage.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
