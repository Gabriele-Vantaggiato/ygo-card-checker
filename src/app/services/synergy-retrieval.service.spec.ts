import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { SynergyRetrievalService } from './synergy-retrieval.service';
import { CardKnowledgeIndexService } from './card-knowledge-index.service';
import { EffectScriptService } from './effect-script.service';
import { CompletionRagService } from './completion-rag.service';
import { AssistanceEngine } from '../utils/assistance-engine';
import { knowledgeFixture, scriptFixture } from '../testing/assistance.fixtures';
import { buildCompletionProfile } from '../utils/completion-prompt.utils';

describe('evidence retrieval', () => {
  beforeEach(() => {
    const index = knowledgeFixture(); const engine = new AssistanceEngine(index);
    index.entries['1'].related = [{ ...index.catalog!['3'], relation: 'gy_synergy', score: 0.4 }];
    TestBed.configureTestingModule({ providers: [
      { provide: CardKnowledgeIndexService, useValue: { related$: of(index), engineFor: () => engine,
        rosterFor: () => engine.catalog, tagDfFor: () => new Map(), tagIndexFor: () => new Map() } },
      { provide: EffectScriptService, useValue: { ensureStudyLoaded$: () => of({ scripts: { '1': scriptFixture() } }) } },
      { provide: CompletionRagService, useValue: { toMatchupSuggestions: () => [] } },
    ] });
  });
  it('ranks an explicit target above a weak cimitero category and excludes source', async () => {
    const hits = await firstValueFrom(TestBed.inject(SynergyRetrievalService).retrieve$(1, buildCompletionProfile('combo', ''), new Set([1])));
    expect(hits[0].id).toBe(2);
    expect(hits.map(hit => hit.id)).not.toContain(1);
    expect(hits.map(hit => hit.id)).toContain(4);
  });
  it('filters format legality before truncation so forbidden results cannot exhaust the pool', async () => {
    const hits = await firstValueFrom(TestBed.inject(SynergyRetrievalService).retrieve$(1, buildCompletionProfile('combo', ''), new Set([1]), { limit: 1, isPlayable: id => id === 4 }));
    expect(hits.map(hit => hit.id)).toEqual([4]);
  });
});
