import type { EffectAction, EffectRole, EffectScript, EffectStep } from './effect-script-types';

export interface MdproParseResult {
  roles: EffectRole[];
  timings: string[];
  steps: EffectStep[];
  signals: string[];
}

/** Lightweight structural parse of EDOPro/MDPro card Lua (not a full Lua VM). */
export function parseMdproLua(cardId: number, name: string, lua: string): MdproParseResult {
  const signals = new Set<string>();
  const steps: EffectStep[] = [];
  const timings = new Set<string>();
  const roles = new Set<EffectRole>();

  const hasHandToGraveCost =
    /LOCATION_HAND/.test(lua) &&
    (/SendtoGrave/.test(lua) || /IsAbleToGraveAsCost/.test(lua) || /REASON_COST/.test(lua));
  const hasGraveRange = /SetRange\(\s*LOCATION_GRAVE\s*\)/.test(lua);
  const hasSpecialSummon = /SpecialSummon|CATEGORY_SPECIAL_SUMMON/.test(lua);
  const summonsFromGrave =
    hasSpecialSummon && (/LOCATION_GRAVE/.test(lua) || /IsExistingTarget\([^)]*LOCATION_GRAVE/.test(lua));
  const discards = /DiscardHand|SendtoGrave\([^)]*LOCATION_HAND/.test(lua);

  if (hasHandToGraveCost || discards) {
    signals.add('hand_to_gy');
    signals.add('sends_to_gy');
    roles.add('extender');
    timings.add('activate');
  }
  if (summonsFromGrave) {
    signals.add('ss_from_gy');
    signals.add('revives_from_gy');
    roles.add('extender');
    timings.add('special_summon');
  }
  if (hasGraveRange) {
    signals.add('gy_effect');
    signals.add('gy_interaction');
    roles.add('extender');
    timings.add('gy');
  }
  if (hasSpecialSummon) {
    signals.add('special_summons');
  }

  if (hasHandToGraveCost && summonsFromGrave) {
    roles.add('starter');
    const actions: EffectAction[] = [
      { op: 'discard', from: 'hand', to: 'gy', filter: 'monster', qty: 1, note: 'cost' },
      { op: 'ss', from: 'gy', to: 'monster', filter: extractRaceFilter(lua) ?? 'monster in GY', qty: 1 },
    ];
    steps.push({
      id: 'mdpro-hand-cost-ss-gy',
      when: 'ignition',
      cost: ['send_monster_hand_to_gy'],
      actions,
      produces: ['gy_body', 'ss_from_gy'],
    });
  } else if (hasGraveRange && summonsFromGrave) {
    steps.push({
      id: 'mdpro-gy-ss',
      when: 'gy',
      cost: [/bfgcost|Remove\(/.test(lua) ? 'banish_self_from_gy' : undefined].filter(Boolean) as string[],
      actions: [
        { op: 'ss', from: 'gy', to: 'monster', filter: extractRaceFilter(lua) ?? 'monster in GY', qty: 1 },
      ],
      produces: ['ss_from_gy', 'gy_effect'],
    });
  } else if (summonsFromGrave) {
    steps.push({
      id: 'mdpro-ss-gy',
      when: 'activate',
      actions: [
        { op: 'ss', from: 'gy', to: 'monster', filter: extractRaceFilter(lua) ?? 'monster in GY', qty: 1 },
      ],
      produces: ['ss_from_gy'],
    });
  } else if (hasHandToGraveCost) {
    steps.push({
      id: 'mdpro-hand-to-gy',
      when: 'cost',
      actions: [{ op: 'discard', from: 'hand', to: 'gy', qty: 1 }],
      produces: ['hand_to_gy'],
    });
  }

  if (roles.size === 0) {
    roles.add('tech');
  }

  return {
    roles: [...roles],
    timings: [...timings],
    steps,
    signals: [...signals],
  };
}

export function mdproToEffectScript(
  cardId: number,
  name: string,
  lua: string,
  parse: MdproParseResult,
): EffectScript {
  return {
    cardId,
    name,
    roles: parse.roles,
    interrupts: ['none'],
    timings: parse.timings,
    steps: parse.steps,
    luaSource: lua.trim(),
    source: 'manual',
    confidence: parse.steps.length > 0 ? 0.95 : 0.55,
  };
}

function extractRaceFilter(lua: string): string | null {
  const race = lua.match(/IsRace\(\s*RACE_([A-Z0-9_]+)\s*\)/);
  if (!race?.[1]) {
    return null;
  }
  const label = race[1]
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return `${label} monster`;
}
