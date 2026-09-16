import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { CardComboService } from './card-combo.service';
import { CardKnowledgeIndexService } from './card-knowledge-index.service';
import { EffectScriptService } from './effect-script.service';
import { CardLegalityFacade } from './card-legality.facade';
import { SynergyRetrievalService } from './synergy-retrieval.service';
import { DeckStrategyStore } from '../features/decklist/stores/deck-strategy.store';
import { AssistanceEngine } from '../utils/assistance-engine';
import { knowledgeFixture, scriptFixture } from '../testing/assistance.fixtures';
import { buildCompletionProfile } from '../utils/completion-prompt.utils';
import { ComboEntry } from '../models/card-combo.model';
import { YgoCard } from '../models/ygo-card.model';
import { YgoFormat } from '../models/ygo-format.model';

const format: YgoFormat = { id: 'test', name: { it: 'Test', en: 'Test' }, description: { it: '', en: '' }, banlistId: null, banlistEffectiveDate: null, cardPoolEndDate: null, cardPoolStartDate: '', banlistSource: 'local' };
const card: YgoCard = { id: 1, name: 'Source', type: 'Effect Monster', desc: '', card_images: [] };

describe('combo completeness and legality', () => {
  let forbidden: Set<number>;
  let entry: ComboEntry;
  let script = scriptFixture();
  beforeEach(() => {
    forbidden = new Set(); script = scriptFixture();
    entry = { requirements: [], payoffs: [], enablers: [], targets: [], lines: [] };
    const index = knowledgeFixture(); const engine = new AssistanceEngine(index);
    TestBed.configureTestingModule({ providers: [
      { provide: CardKnowledgeIndexService, useValue: { related$: of(index), combos$: of({ entries: { '1': entry } }), engineFor: () => engine } },
      { provide: EffectScriptService, useValue: { ensureLoaded$: () => of({}), getScript: () => script } },
      { provide: CardLegalityFacade, useValue: { evaluateMany$: (cards: YgoCard[]) => of(new Map(cards.map(c => [c.id, { verdict: forbidden.has(c.id) ? 'forbidden' : 'legal' }]))) } },
      { provide: SynergyRetrievalService, useValue: { retrieve$: () => of([]) } },
      { provide: DeckStrategyStore, useValue: { ragResult$: of({ profile: buildCompletionProfile('combo', '') }) } },
    ] });
  });
  it('filters script-generated targets through the same legality gate', async () => {
    forbidden.add(2);
    const result = await firstValueFrom(TestBed.inject(CardComboService).findCombos$(card, format));
    expect(result.lines).toEqual([]); expect(result.script).toBeDefined();
  });
  it('rejects the whole line when a required enabler is forbidden', async () => {
    script.steps = []; forbidden.add(3);
    entry.lines = [{ id: 'needs-enabler', steps: [
      { role: 'enabler', cardId: 3, name: 'Required', imageSmall: '', reasonKey: '' },
      { role: 'source', cardId: 1, name: 'Source', imageSmall: '', reasonKey: '' },
      { role: 'target', cardId: 2, name: 'Target', imageSmall: '', reasonKey: '' },
    ] }];
    expect((await firstValueFrom(TestBed.inject(CardComboService).findCombos$(card, format))).lines).toEqual([]);
  });
  it('keeps alternative targets in separate candidate lines', async () => {
    script = scriptFixture('Target | Sibling');
    const result = await firstValueFrom(TestBed.inject(CardComboService).findCombos$(card, format));
    expect(result.lines.length).toBe(2);
    expect(result.lines.every(line => line.steps.length === 2 && line.status === 'candidate')).toBeTrue();
  });
  it('does not surface lines from a forbidden source', async () => {
    forbidden.add(1);
    expect((await firstValueFrom(TestBed.inject(CardComboService).findCombos$(card, format))).lines).toEqual([]);
  });
});
