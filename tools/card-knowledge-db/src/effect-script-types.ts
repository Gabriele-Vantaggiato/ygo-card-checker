/** Tool-local mirror of src/app/models/effect-script.model.ts (keep in sync). */

export type EffectRole =
  | 'starter'
  | 'extender'
  | 'handtrap'
  | 'trap'
  | 'engine'
  | 'tech'
  | 'extra'
  | 'draw';

export type InterruptTag = 'veiler' | 'maxx_c' | 'bottomless' | 'nightmare' | 'warning' | 'none';

export type EffectOp =
  | 'search'
  | 'add'
  | 'ss'
  | 'ns'
  | 'set'
  | 'destroy'
  | 'draw'
  | 'discard'
  | 'banish'
  | 'negate'
  | 'note'
  | 'xyz'
  | 'synchro';

export interface EffectAction {
  op: EffectOp;
  from?: string;
  to?: string;
  filter?: string;
  qty?: number;
  note?: string;
}

export interface EffectStep {
  id: string;
  when: string;
  cost?: string[];
  actions: EffectAction[];
  produces?: string[];
}

export interface EffectScript {
  cardId: number;
  name: string;
  roles: EffectRole[];
  interrupts: InterruptTag[];
  timings: string[];
  steps: EffectStep[];
  luaSource: string;
  source: 'manual' | 'auto' | 'hat';
  confidence: number;
}

export interface EffectScriptIndex {
  version: number;
  generatedAt: string;
  cardCount: number;
  scripts: Record<string, EffectScript>;
}

export function emptyEffectScriptIndex(): EffectScriptIndex {
  return {
    version: 1,
    generatedAt: new Date(0).toISOString(),
    cardCount: 0,
    scripts: {},
  };
}
