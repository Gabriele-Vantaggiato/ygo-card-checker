import type { ComboPayoffParsed, StructuredEffect } from './effect-parser';
import type {
  EffectAction,
  EffectOp,
  EffectRole,
  EffectScript,
  EffectStep,
  InterruptTag,
} from './effect-script-types';

export interface EffectInput {
  kind: string;
  payload: Record<string, unknown>;
}

const INTERRUPT_BY_NAME: Array<{ pattern: RegExp; tag: InterruptTag }> = [
  { pattern: /maxx\s*"?c"?/i, tag: 'maxx_c' },
  { pattern: /effect veiler/i, tag: 'veiler' },
  { pattern: /bottomless trap hole/i, tag: 'bottomless' },
  { pattern: /trap hole nightmare/i, tag: 'nightmare' },
  { pattern: /solemn warning/i, tag: 'warning' },
];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function asStructuredEffect(input: EffectInput): StructuredEffect | null {
  const payload = { kind: input.kind, ...input.payload } as StructuredEffect;
  if (!payload.kind) {
    return null;
  }
  return payload;
}

function inferInterrupts(name: string, tags: string[]): InterruptTag[] {
  const found: InterruptTag[] = [];
  for (const { pattern, tag } of INTERRUPT_BY_NAME) {
    if (pattern.test(name)) {
      found.push(tag);
    }
  }
  if (tags.includes('hand_trap')) {
    if (name.toLowerCase().includes('veiler')) {
      found.push('veiler');
    }
    if (/maxx/i.test(name)) {
      found.push('maxx_c');
    }
  }
  return found.length > 0 ? unique(found) : ['none'];
}

function inferTimings(tags: string[], effects: StructuredEffect[], cardType: string): string[] {
  const timings = new Set<string>();
  if (tags.includes('quick_effect') || tags.includes('hand_trap')) {
    timings.add('quick');
  }
  if (tags.includes('trigger_effect')) {
    timings.add('trigger');
  }
  for (const effect of effects) {
    switch (effect.kind) {
      case 'add_from_deck':
        timings.add('activate');
        break;
      case 'special_summon_deck':
      case 'special_summon_gy':
      case 'tribute_special_summon':
        timings.add('special_summon');
        break;
      case 'self_summon_hand_tribute_atk':
      case 'tribute_summon':
        timings.add('normal_summon');
        break;
      case 'synchro_summon':
      case 'xyz_summon':
        timings.add('activate');
        break;
      default:
        break;
    }
  }
  if (/trap/i.test(cardType)) {
    timings.add('activate');
  }
  if (/spell/i.test(cardType) && timings.size === 0) {
    timings.add('activate');
  }
  if (timings.size === 0) {
    timings.add('passive');
  }
  return [...timings];
}

function inferRoles(
  tags: string[],
  effects: StructuredEffect[],
  cardType: string,
  isExtraDeck: boolean,
): EffectRole[] {
  const roles = new Set<EffectRole>();

  if (isExtraDeck) {
    roles.add('extra');
  }
  if (tags.includes('hand_trap')) {
    roles.add('handtrap');
  }
  if (tags.includes('draw')) {
    roles.add('draw');
  }
  if (/trap/i.test(cardType)) {
    roles.add('trap');
  }

  const hasSearch = tags.includes('searches_deck') || effects.some((e) => e.kind === 'add_from_deck');
  const hasDeckSs = effects.some((e) => e.kind === 'special_summon_deck');
  const hasGySs = effects.some((e) => e.kind === 'special_summon_gy');
  const hasSelfSummon = effects.some(
    (e) => e.kind === 'self_summon_hand_tribute_atk' || e.kind === 'tribute_summon',
  );
  const hasControl = effects.some((e) => e.kind === 'control');

  if (hasSearch || hasDeckSs || hasSelfSummon) {
    roles.add('starter');
  }
  if (hasGySs || hasControl || tags.includes('revives_from_gy') || tags.includes('ss_from_gy')) {
    roles.add('extender');
  }
  if (tags.includes('special_summons') && !roles.has('starter')) {
    roles.add('extender');
  }
  if (tags.includes('searches_deck') && tags.includes('special_summons')) {
    roles.add('engine');
  }

  if (roles.size === 0) {
    roles.add('tech');
  }
  return [...roles];
}

function payoffToActions(payoff: ComboPayoffParsed): EffectAction[] {
  switch (payoff.kind) {
    case 'add_from_deck':
      return [
        {
          op: payoff.toHand ? 'add' : 'set',
          from: 'deck',
          to: payoff.toHand ? 'hand' : 'spellTrap',
          filter: payoff.names.join(' | '),
          qty: 1,
        },
      ];
    case 'special_summon_deck':
      return [
        {
          op: 'ss',
          from: 'deck',
          to: 'monster',
          filter: payoff.names.join(' | '),
          qty: 1,
          note: payoff.position !== 'any' ? payoff.position : undefined,
        },
      ];
    case 'special_summon_gy':
      return [
        {
          op: 'ss',
          from: 'gy',
          to: 'monster',
          filter: payoff.names.join(' | '),
          qty: 1,
        },
      ];
    case 'self_summon_hand_tribute_atk':
      return [
        {
          op: 'ns',
          from: 'hand',
          to: 'monster',
          note: `tribute ${payoff.tributeCount}, min ATK ${payoff.minAtk}`,
          qty: 1,
        },
      ];
    case 'tribute_summon':
      return [
        {
          op: 'ns',
          from: 'hand',
          to: 'monster',
          filter: payoff.names.join(' | '),
          note: `tribute ${payoff.tributeCount}`,
          qty: 1,
        },
      ];
    case 'tribute_special_summon':
      return [
        {
          op: 'ss',
          from: payoff.fromHandOrDeck ? 'hand_or_deck' : 'hand',
          to: 'monster',
          filter: payoff.summonNames.join(' | '),
          note: `tribute ${payoff.tributeNames.join(' | ')}`,
          qty: 1,
        },
      ];
    case 'synchro_summon':
      return [{ op: 'synchro', filter: payoff.names.join(' | '), qty: 1 }];
    case 'xyz_summon':
      return [{ op: 'xyz', filter: payoff.names.join(' | '), qty: 1 }];
    default:
      return [{ op: 'note', note: payoff.kind }];
  }
}

function effectToStep(effect: StructuredEffect, index: number): EffectStep {
  const id = `${slug(effect.kind)}-${index + 1}`;
  if (effect.kind === 'control') {
    return {
      id,
      when: 'requirement',
      actions: [
        {
          op: 'note',
          note: `control Level ${effect.minLevel}+ ${effect.names.join(' | ')}`,
        },
      ],
      produces: ['field_state'],
    };
  }

  const actions = payoffToActions(effect);
  const when =
    effect.kind === 'add_from_deck'
      ? 'activate'
      : effect.kind === 'special_summon_gy'
        ? 'gy_effect'
        : effect.kind === 'self_summon_hand_tribute_atk'
          ? 'normal_summon'
          : effect.kind === 'special_summon_deck'
            ? 'special_summon'
            : effect.kind;

  const produces: string[] = [];
  if (actions.some((a) => a.op === 'add' || a.op === 'search')) {
    produces.push('hand_add');
  }
  if (actions.some((a) => a.op === 'ss')) {
    produces.push('field_body');
  }

  return { id, when, actions, produces: produces.length > 0 ? produces : undefined };
}

function actionToLua(action: EffectAction): string {
  const filter = action.filter ? `"${action.filter}"` : 'nil';
  const qty = action.qty ?? 1;
  switch (action.op) {
    case 'search':
    case 'add':
      return `  ${action.op}_deck(${filter}, ${qty})`;
    case 'ss':
      return `  ss_from_${action.from ?? 'deck'}(${filter}, ${qty})`;
    case 'ns':
      return `  normal_summon(${filter}, ${qty})`;
    case 'set':
      return `  set_from_deck(${filter}, ${qty})`;
    case 'destroy':
      return `  destroy(${filter}, ${qty})`;
    case 'draw':
      return `  draw(${qty})`;
    case 'banish':
      return `  banish(${filter}, ${qty})`;
    case 'negate':
      return `  negate(${filter})`;
    case 'xyz':
    case 'synchro':
      return `  ${action.op}_summon(${filter})`;
    case 'note':
      return `  -- ${action.note ?? 'effect'}`;
    default:
      return `  -- ${action.op}`;
  }
}

function stepToLua(step: EffectStep): string {
  const lines = [`function on_${slug(step.when)}(card)`];
  if (step.cost?.length) {
    lines.push(`  require(${step.cost.map((c) => `"${c}"`).join(', ')})`);
  }
  for (const action of step.actions) {
    lines.push(actionToLua(action));
  }
  lines.push('end');
  return lines.join('\n');
}

export function generateLuaSource(name: string, steps: EffectStep[]): string {
  if (steps.length === 0) {
    return `-- ${name}\n-- no structured steps`;
  }
  const header = `-- ${name}`;
  const bodies = steps.map(stepToLua);
  return [header, ...bodies].join('\n\n');
}

export function effectsToScript(
  cardId: number,
  name: string,
  effects: EffectInput[],
  tags: string[],
  options?: { cardType?: string; isExtraDeck?: boolean; luaSource?: string },
): EffectScript {
  const cardType = options?.cardType ?? '';
  const isExtraDeck = options?.isExtraDeck ?? false;
  const structured = effects
    .map(asStructuredEffect)
    .filter((effect): effect is StructuredEffect => effect !== null);

  let steps = structured.map((effect, index) => effectToStep(effect, index));
  if (steps.length === 0) {
    steps = stepsFromTags(tags);
  }
  const roles = inferRoles(tags, structured, cardType, isExtraDeck);
  const interrupts = inferInterrupts(name, tags);
  const timings = inferTimings(tags, structured, cardType);
  const luaSource = options?.luaSource?.trim() || generateLuaSource(name, steps);

  const confidence =
    structured.length > 0
      ? Math.min(0.95, 0.45 + structured.length * 0.12)
      : steps.length > 0
        ? 0.55
        : tags.length > 0
          ? 0.35
          : 0.2;

  return {
    cardId,
    name,
    roles,
    interrupts,
    timings,
    steps,
    luaSource,
    source: options?.luaSource ? 'manual' : 'auto',
    confidence,
  };
}

function stepsFromTags(tags: readonly string[]): EffectStep[] {
  const tagSet = new Set(tags);
  const steps: EffectStep[] = [];

  if (
    (tagSet.has('hand_to_gy') || tagSet.has('sends_to_gy') || tagSet.has('discards')) &&
    (tagSet.has('ss_from_gy') || tagSet.has('revives_from_gy'))
  ) {
    steps.push({
      id: 'tag-hand-cost-ss-gy',
      when: 'ignition',
      cost: ['send_or_discard_to_gy'],
      actions: [
        { op: 'discard', from: 'hand', to: 'gy', qty: 1, note: 'cost/setup' },
        { op: 'ss', from: 'gy', to: 'monster', filter: 'eligible monster in GY', qty: 1 },
      ],
      produces: ['hand_to_gy', 'ss_from_gy'],
    });
    return steps;
  }

  if (tagSet.has('gy_effect') && (tagSet.has('ss_from_gy') || tagSet.has('revives_from_gy'))) {
    steps.push({
      id: 'tag-gy-effect-ss',
      when: 'gy',
      actions: [{ op: 'ss', from: 'gy', to: 'monster', filter: 'GY target', qty: 1 }],
      produces: ['gy_effect', 'ss_from_gy'],
    });
    return steps;
  }

  if (tagSet.has('hand_to_gy') || (tagSet.has('sends_to_gy') && tagSet.has('discards'))) {
    steps.push({
      id: 'tag-hand-to-gy',
      when: 'cost',
      actions: [{ op: 'discard', from: 'hand', to: 'gy', qty: 1 }],
      produces: ['hand_to_gy'],
    });
  }

  if (tagSet.has('ss_from_gy') || tagSet.has('revives_from_gy')) {
    steps.push({
      id: 'tag-ss-gy',
      when: 'activate',
      actions: [{ op: 'ss', from: 'gy', to: 'monster', filter: 'GY', qty: 1 }],
      produces: ['ss_from_gy'],
    });
  }

  return steps;
}

export function mergeScripts(auto: EffectScript, override: EffectScript | undefined): EffectScript {
  if (!override) {
    return auto;
  }
  if (override.source !== 'hat' && override.source !== 'manual') {
    return auto;
  }

  return {
    ...auto,
    roles: override.roles.length > 0 ? override.roles : auto.roles,
    steps: override.steps.length > 0 ? override.steps : auto.steps,
    luaSource: override.luaSource.trim().length > 0 ? override.luaSource : auto.luaSource,
    interrupts: override.interrupts.length > 0 ? override.interrupts : auto.interrupts,
    timings: override.timings.length > 0 ? override.timings : auto.timings,
    source: override.source,
    confidence: Math.max(auto.confidence, override.confidence),
  };
}
