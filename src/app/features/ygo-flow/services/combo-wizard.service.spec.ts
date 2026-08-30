import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ComboIndex } from '../../../models/card-combo.model';
import { EffectScript } from '../../../models/effect-script.model';
import { FlowCard } from '../../../models/ygo-flow.model';
import { CardKnowledgeIndexService } from '../../../services/card-knowledge-index.service';
import { EffectScriptService } from '../../../services/effect-script.service';
import { ComboWizardService } from './combo-wizard.service';

/** Not on the legacy STARTER_PRIORITY list — isolates the dynamic (combo-richness) scoring path. */
const CURATED_STARTER_SCRIPT: EffectScript = {
  cardId: 55501234,
  name: 'Curated Combo Starter',
  roles: ['starter'],
  interrupts: [],
  timings: ['activate'],
  steps: [],
  luaSource: '',
  source: 'hat',
  confidence: 0.5,
};

const PLAIN_STARTER_SCRIPT: EffectScript = {
  cardId: 55505678,
  name: 'Plain Starter',
  roles: ['starter'],
  interrupts: [],
  timings: ['activate'],
  steps: [],
  luaSource: '',
  source: 'hat',
  confidence: 0.5,
};

const COMBO_INDEX: ComboIndex = {
  version: 1,
  generatedAt: '',
  cardCount: 1,
  entries: {
    [String(CURATED_STARTER_SCRIPT.cardId)]: {
      requirements: [],
      payoffs: [],
      enablers: [],
      targets: [
        { id: 100, name: 'Curated Target A', role: 'summon_target', score: 2, imageSmall: '' },
        { id: 101, name: 'Curated Target B', role: 'summon_target', score: 1, imageSmall: '' },
      ],
      lines: [],
    },
  },
};

class FakeCardKnowledgeIndexService {
  readonly combos$ = of(COMBO_INDEX);
}

const STARTER_SCRIPT: EffectScript = {
  cardId: 91812341,
  name: 'Traptrix Myrmeleo',
  roles: ['starter', 'engine'],
  interrupts: ['veiler', 'bottomless'],
  timings: ['normal_summon'],
  steps: [
    {
      id: 'ns-search',
      when: 'normal_summon',
      actions: [{ op: 'search', from: 'deck', to: 'hand', filter: 'Hole normal trap', qty: 1 }],
      produces: ['hole_trap'],
    },
  ],
  luaSource: '',
  source: 'hat',
  confidence: 1,
};

const TRAP_SCRIPT: EffectScript = {
  cardId: 29401950,
  name: 'Bottomless Trap Hole',
  roles: ['trap'],
  interrupts: ['bottomless'],
  timings: ['activate'],
  steps: [],
  luaSource: '',
  source: 'hat',
  confidence: 1,
};

const HANDTRAP_SCRIPT: EffectScript = {
  cardId: 23434538,
  name: 'Maxx "C"',
  roles: ['handtrap'],
  interrupts: ['maxx_c'],
  timings: ['quick'],
  steps: [],
  luaSource: '',
  source: 'hat',
  confidence: 1,
};

class FakeEffectScriptService {
  private readonly scripts = new Map<number, EffectScript>([
    [STARTER_SCRIPT.cardId, STARTER_SCRIPT],
    [TRAP_SCRIPT.cardId, TRAP_SCRIPT],
    [HANDTRAP_SCRIPT.cardId, HANDTRAP_SCRIPT],
    [CURATED_STARTER_SCRIPT.cardId, CURATED_STARTER_SCRIPT],
    [PLAIN_STARTER_SCRIPT.cardId, PLAIN_STARTER_SCRIPT],
  ]);

  getScript(cardId: number): EffectScript | undefined {
    return this.scripts.get(cardId);
  }

  isStarter(cardId: number): boolean {
    return this.getScript(cardId)?.roles.includes('starter') ?? false;
  }
}

function flowCard(passcode: number, name: string, index: number): FlowCard {
  return {
    uid: `${passcode}-${index}`,
    passcode,
    name,
    type: 'Effect Monster',
    desc: '',
    imageSmall: '',
    image: '',
    role: 'untagged',
  };
}

describe('ComboWizardService', () => {
  let service: ComboWizardService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ComboWizardService,
        { provide: EffectScriptService, useClass: FakeEffectScriptService },
        { provide: CardKnowledgeIndexService, useClass: FakeCardKnowledgeIndexService },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ComboWizardService);
  });

  it('builds a combo line when the hand contains a known starter', () => {
    const hand: FlowCard[] = [
      flowCard(91812341, 'Traptrix Myrmeleo', 0),
      flowCard(29401950, 'Bottomless Trap Hole', 1),
      flowCard(1, 'Vanilla Beater A', 2),
      flowCard(2, 'Vanilla Beater B', 3),
      flowCard(3, 'Vanilla Beater C', 4),
    ];

    const analysis = service.analyzeHand(hand);

    expect(analysis.kind).toBe('combo');
    expect(analysis.starters.length).toBe(1);
    expect(analysis.starters[0]?.passcode).toBe(91812341);
    // Activation line + the starter's normal-summon step.
    expect(analysis.lines.length).toBeGreaterThanOrEqual(2);
  });

  it('flags a brick hand with no starters and offers trap-based advice', () => {
    const hand: FlowCard[] = [
      flowCard(29401950, 'Bottomless Trap Hole', 0),
      flowCard(23434538, 'Maxx "C"', 1),
      flowCard(1, 'Vanilla Beater A', 2),
      flowCard(2, 'Vanilla Beater B', 3),
      flowCard(3, 'Vanilla Beater C', 4),
    ];

    const analysis = service.analyzeHand(hand);

    expect(analysis.kind).toBe('brick');
    expect(analysis.starters).toEqual([]);
    expect(analysis.lines).toEqual([]);
    expect(analysis.advice.length).toBeGreaterThan(0);
  });

  it('flags a brick hand with nothing playable at all', () => {
    const hand: FlowCard[] = [
      flowCard(1, 'Vanilla Beater A', 0),
      flowCard(2, 'Vanilla Beater B', 1),
      flowCard(3, 'Vanilla Beater C', 2),
      flowCard(4, 'Vanilla Beater D', 3),
      flowCard(5, 'Vanilla Beater E', 4),
    ];

    const analysis = service.analyzeHand(hand);

    expect(analysis.kind).toBe('brick');
    expect(analysis.advice.length).toBe(1);
  });

  it('ranks Myrmeleo ahead of other starters across the deck in analyzeAllStarters', () => {
    const main: FlowCard[] = [
      flowCard(91812341, 'Traptrix Myrmeleo', 0),
      flowCard(98645731, 'Pot of Duality', 1),
    ];

    const analyses = service.analyzeAllStarters({ main });

    expect(analyses.length).toBe(1); // Duality has no registered script in this fake index.
    expect(analyses[0]?.starters[0]?.passcode).toBe(91812341);
  });

  it('appends curated combo-library targets not already covered by the script steps', () => {
    const hand: FlowCard[] = [flowCard(CURATED_STARTER_SCRIPT.cardId, CURATED_STARTER_SCRIPT.name, 0)];

    const analysis = service.analyzeHand(hand);

    const curatedLine = analysis.lines.find((line) => line.detail.includes('Curated Target A'));
    expect(curatedLine).toBeTruthy();
    expect(curatedLine?.detail).toContain('Curated Target B');
  });

  it('ranks a starter with a richer curated combo entry ahead of an equally-confident plain starter', () => {
    const main: FlowCard[] = [
      flowCard(PLAIN_STARTER_SCRIPT.cardId, PLAIN_STARTER_SCRIPT.name, 0),
      flowCard(CURATED_STARTER_SCRIPT.cardId, CURATED_STARTER_SCRIPT.name, 1),
    ];

    const analyses = service.analyzeAllStarters({ main });

    expect(analyses[0]?.starters[0]?.passcode).toBe(CURATED_STARTER_SCRIPT.cardId);
  });
});
