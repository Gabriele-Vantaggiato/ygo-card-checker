import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ReplayStore } from './replay.store';
import { Yrp3dParserService } from '../services/yrp3d-parser.service';
import { PasscodeCatalogService } from '../../../services/passcode-catalog.service';
import { ReplayRestrictionCatalogService } from '../../../services/replay-restriction-catalog.service';
import { GeminiCoachService } from '../../../services/gemini-coach.service';
import { I18nService } from '../../../services/i18n.service';
import { ComboWizardService } from '../../ygo-flow/services/combo-wizard.service';
import { ReplayLineMemoryService } from '../../../services/replay-line-memory.service';
import { lineReplay } from '../../../testing/replay-line.fixtures';
import { ParsedReplay } from '../../../models/replay.model';

describe('ReplayStore engine integration', () => {
  let store: ReplayStore;
  let memory: ReplayLineMemoryService;
  let resolveParse: (value: ParsedReplay) => void;
  beforeEach(() => {
    localStorage.removeItem('ygo-replay-lines-v1');
    TestBed.configureTestingModule({providers:[ReplayStore,
      {provide:Yrp3dParserService,useValue:{maxBytes:1000,parseFile:()=>new Promise<ParsedReplay>(resolve=>resolveParse=resolve)}},
      {provide:PasscodeCatalogService,useValue:{ensureLoaded$:()=>of(new Map()),get:()=>null}},
      {provide:ReplayRestrictionCatalogService,useValue:{ensureLoaded$:()=>of(null),catalog:()=>({version:1,coverageNote:'test',kinds:[],cards:{}})}},
      {provide:GeminiCoachService,useValue:{isUnlocked:()=>false}},
      {provide:I18nService,useValue:{lang:()=> 'en'}},
      {provide:ComboWizardService,useValue:{ensureReady$:()=>of([]),recommendReplayLine:()=>({actions:[{kind:'normal_summon',cardId:2}],games:3})}},
    ]});
    store=TestBed.inject(ReplayStore); memory=TestBed.inject(ReplayLineMemoryService);
    store.setFile('primary',new File(['test'],'test.yrp3d'));
  });
  afterEach(()=>memory.clear());
  async function start() { const pending=store.analyze(); for(let i=0;i<5;i++) await Promise.resolve(); return {pending}; }
  it('connects comparisons, findings, memory and multi-game coach brief',async()=>{
    const first=await start(); resolveParse(lineReplay()); await first.pending;
    expect(store.primaryAnalysis()!.findings.some(f=>f.kind==='suboptimal_line')).toBeTrue();
    expect(store.coachBrief()!.lineComparisons![0].provenMisplay).toBeFalse();
    expect(memory.observations().length).toBe(1);
    const second=await start(); resolveParse(lineReplay({sha256:'b'.repeat(64)})); await second.pending;
    expect(store.coachBrief()!.recentGames!.length).toBe(2);
  });
  it('does not repopulate erased evidence when an old parse finishes',async()=>{
    const first=await start(); store.clearLearning(); resolveParse(lineReplay()); await first.pending;
    expect(memory.observations().length).toBe(0); expect(store.analyses().length).toBe(0); expect(store.busy()).toBeFalse();
  });
});
