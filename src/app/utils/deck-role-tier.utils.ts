import { EffectRole } from '../models/effect-script.model';

/** Shared main/extra/side targets for deck-completion and Assist quantity scaling. */
export const DEFAULT_TARGET_MAIN = 40;
export const MIN_TARGET_MAIN = 40;
export const MAX_TARGET_MAIN = 60;
export const TARGET_EXTRA = 15;
export const DEFAULT_TARGET_SIDE = 15;

export type RoleTier = 'core' | 'support' | 'tech';

const SCRIPT_ROLE_TIER: Partial<Record<EffectRole, RoleTier>> = {
  starter: 'core',
  engine: 'core',
  extender: 'support',
  draw: 'support',
  handtrap: 'support',
  trap: 'tech',
  tech: 'tech',
  extra: 'tech',
};

const RELATION_TIER_FALLBACK: Record<string, RoleTier> = {
  gy_synergy: 'core',
  engine: 'core',
  mechanic_synergy: 'support',
  archetype: 'support',
  series: 'support',
  matchup: 'tech',
  mentions_card: 'tech',
};

/** Fullness fraction (current/target) at which suggested copies start tapering toward 1. */
const TIER_TAPER_THRESHOLD: Record<RoleTier, number> = {
  core: 0.85,
  support: 0.7,
  tech: 0.45,
};

/** Script roles win when present; otherwise fall back to the suggestion's relation. */
export function resolveRoleTier(relation: string, scriptRoles: readonly EffectRole[]): RoleTier {
  for (const role of scriptRoles) {
    const tier = SCRIPT_ROLE_TIER[role];
    if (tier) {
      return tier;
    }
  }
  return RELATION_TIER_FALLBACK[relation] ?? 'support';
}

/**
 * Max copies to suggest given how full the deck section already is.
 * Below the tier's taper threshold, stays at formatMax; above it, interpolates
 * linearly down to 1 copy as fullness approaches 1 (deck complete).
 */
export function scaledMaxCopies(formatMax: number, tier: RoleTier, fullness: number): number {
  if (formatMax <= 1) {
    return formatMax;
  }
  const threshold = TIER_TAPER_THRESHOLD[tier];
  if (fullness <= threshold) {
    return formatMax;
  }
  const t = Math.min(1, (fullness - threshold) / (1 - threshold));
  const scaled = formatMax - t * (formatMax - 1);
  return Math.max(1, Math.round(scaled));
}
