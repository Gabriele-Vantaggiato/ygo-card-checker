import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { CardAssistanceService } from './card-assistance.service';
import { CardKnowledgeIndexService } from './card-knowledge-index.service';
import { EffectScriptService } from './effect-script.service';
import { I18nService } from './i18n.service';
import { AssistanceEngine } from '../utils/assistance-engine';
import { knowledgeFixture, scriptFixture, boardFixture } from '../testing/assistance.fixtures';
import { CardKnowledgeIndex } from '../models/card-knowledge.model';

describe('live assistance wiring', () => {
  let service: CardAssistanceService;
  let related: BehaviorSubject<CardKnowledgeIndex | null>;
  beforeEach(() => {
    const index = knowledgeFixture(); related = new BehaviorSubject<CardKnowledgeIndex | null>(index);
    TestBed.configureTestingModule({ providers: [
      { provide: CardKnowledgeIndexService, useValue: { related$: related, segoc$: of({}),
        formatLegality$: of({ version: 1, generatedAt: '', formats: ['test'], playable: { '1': ['test'], '2': ['test'] }, maxCopies: { '1': { test: 1 }, '2': { test: 3 } } }),
        engineFor: (value: CardKnowledgeIndex) => new AssistanceEngine(value),
      } },
      { provide: EffectScriptService, useValue: { ensureStudyLoaded$: () => of({ scripts: { '1': scriptFixture() } }) } },
      { provide: I18nService, useValue: { t: (key: string, params: unknown) => key + JSON.stringify(params ?? {}) } },
    ] });
    service = TestBed.inject(CardAssistanceService);
  });
  it('updates after board moves and does not call a forbidden card a compatible target', () => {
    expect(service.analyze(boardFixture(), 'test').messages.join()).toContain('resources_present');
    expect(service.analyze({ ...boardFixture(), deck: [] }, 'test').messages.join()).toContain('missing_resources');
    expect(service.analyze({ ...boardFixture(), hand: [3] }, 'test').messages.join()).toContain('notPlayable');
  });
  it('checks format copy limits in preparation', () => {
    const report = service.prepare([1, 1, 2], 'test');
    expect(report.messages.join()).toContain('tooMany');
    expect(report.messages.join()).toContain('"count":"1"');
  });
  it('does not conceal missing data or unknown formats', () => {
    expect(service.analyze(boardFixture(), 'missing').messages.join()).toContain('formatUnknown');
    related.next(null);
    expect(service.analyze(boardFixture(), 'test').ready).toBeFalse();
  });
});
