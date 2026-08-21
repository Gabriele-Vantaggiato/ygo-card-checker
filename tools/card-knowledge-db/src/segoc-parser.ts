export type SegocEffectType = 'activate' | 'ignition' | 'trigger' | 'quick' | 'continuous' | 'none';

export type TriggerEvent =
  | 'destroyed'
  | 'to_grave'
  | 'removed'
  | 'leaves_field'
  | 'summon_success'
  | 'flip_summon_success'
  | 'special_summon_success'
  | 'discarded'
  | 'drawn'
  | 'damage'
  | 'control_changed'
  | 'battle_destroyed'
  | 'other';

export interface SegocProfile {
  effectType: SegocEffectType;
  spellSpeed: number | null;
  missedTimingRisk: boolean;
  triggerEvents: TriggerEvent[];
}

/** The 3 fields `parseSegocProfile` can determine from Lua alone. `spellSpeed` is separate —
 * see `deriveSpellSpeed` below — because it is never written into card scripts (verified: zero
 * literal `SPELL_SPEED` occurrences across the 13,527-script MDPro3 library). */
export type LuaSegocProfile = Omit<SegocProfile, 'spellSpeed'>;

const EVENT_MAP: Record<string, TriggerEvent> = {
  EVENT_DESTROYED: 'destroyed',
  EVENT_TO_GRAVE: 'to_grave',
  EVENT_REMOVE: 'removed',
  EVENT_LEAVE_FIELD: 'leaves_field',
  EVENT_LEAVE_FIELD_P: 'leaves_field',
  EVENT_SUMMON_SUCCESS: 'summon_success',
  EVENT_FLIP_SUMMON_SUCCESS: 'flip_summon_success',
  EVENT_SPSUMMON_SUCCESS: 'special_summon_success',
  EVENT_DISCARD: 'discarded',
  EVENT_DRAW: 'drawn',
  EVENT_DAMAGE: 'damage',
  EVENT_CONTROL_CHANGED: 'control_changed',
  EVENT_BATTLE_DESTROYED: 'battle_destroyed',
};

/** One `local eN=Effect.CreateEffect(c)` ... `c:RegisterEffect(eN)` block. */
interface EffectBlock {
  text: string;
}

/** Splits a card's Lua source into individual effect blocks for per-block SEGOC scanning. */
function splitEffectBlocks(lua: string): EffectBlock[] {
  const blocks: EffectBlock[] = [];
  const starts: number[] = [];
  const startRe = /local\s+\w+\s*=\s*Effect\.CreateEffect\(/g;
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(lua)) !== null) {
    starts.push(m.index);
  }
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : lua.length;
    blocks.push({ text: lua.slice(from, to) });
  }
  return blocks;
}

function blockEffectType(block: string): SegocEffectType {
  // A block can carry multiple EFFECT_TYPE_* flags added together (e.g. TRIGGER_O+CONTINUOUS);
  // priority order matches what's most relevant to show as the card's single badge.
  if (/EFFECT_TYPE_TRIGGER_[OF]/.test(block)) return 'trigger';
  if (/EFFECT_TYPE_QUICK_[OF]/.test(block)) return 'quick';
  if (/EFFECT_TYPE_IGNITION/.test(block)) return 'ignition';
  if (/EFFECT_TYPE_CONTINUOUS/.test(block)) return 'continuous';
  if (/EFFECT_TYPE_ACTIVATE/.test(block)) return 'activate';
  return 'none';
}

function blockTriggerEvents(block: string): TriggerEvent[] {
  const out: TriggerEvent[] = [];
  const re = /SetCode\(\s*(EVENT_[A-Z_]+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    out.push(EVENT_MAP[m[1]] ?? 'other');
  }
  return out;
}

function blockIsWhenTrigger(block: string): boolean {
  const isTrigger = /EFFECT_TYPE_TRIGGER_[OF]/.test(block);
  if (!isTrigger) return false;
  return !/SetProperty\([^)]*EFFECT_FLAG_DELAY/.test(block);
}

const TYPE_PRIORITY: SegocEffectType[] = ['trigger', 'quick', 'ignition', 'continuous', 'activate', 'none'];

export function parseSegocProfile(lua: string): LuaSegocProfile {
  const blocks = splitEffectBlocks(lua);
  if (blocks.length === 0) {
    return { effectType: 'none', missedTimingRisk: false, triggerEvents: [] };
  }

  const types = blocks.map((b) => blockEffectType(b.text));
  const effectType = TYPE_PRIORITY.find((t) => types.includes(t)) ?? 'none';

  const missedTimingRisk = blocks.some((b) => blockIsWhenTrigger(b.text));

  const events = new Set<TriggerEvent>();
  for (const b of blocks) {
    if (blockEffectType(b.text) !== 'trigger') continue;
    for (const ev of blockTriggerEvents(b.text)) {
      events.add(ev);
    }
  }

  return {
    effectType,
    missedTimingRisk,
    triggerEvents: [...events],
  };
}

/**
 * Spell Speed is engine-internal, never present in card scripts — derived from the card's
 * `type` string (as already stored in this pipeline's `cards` table) plus its already-parsed
 * `effectType`. Returns `null` for vanilla cards (no effect block at all).
 */
export function deriveSpellSpeed(cardType: string, effectType: SegocEffectType): number | null {
  if (effectType === 'none') return null;
  if (cardType.includes('Counter Trap')) return 3;
  if (cardType.includes('Quick-Play Spell')) return 2;
  if (cardType.includes('Trap')) return 2; // Normal Trap, Continuous Trap
  if (effectType === 'quick') return 2; // monster quick effect (QUICK_O/QUICK_F)
  return 1;
}
