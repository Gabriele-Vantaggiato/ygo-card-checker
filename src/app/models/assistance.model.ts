import { EffectAction } from './effect-script.model';
export type AssistanceZone = 'hand' | 'deck' | 'extra' | 'monsters' | 'spellTraps' | 'gy' | 'banish';
export type AssistanceBoard = Record<AssistanceZone, readonly number[]>;
export interface AssistanceCandidate {
  sourceId: number;
  targetId: number;
  stepId: string;
  action: EffectAction;
  evidence: 'exact_name' | 'setcode' | 'structured_filter' | 'series';
  score: number;
}
export interface ResourceAdvice {
  sourceId: number;
  stepId: string;
  targetIds: number[];
  /** Resource compatibility is not activation legality. */
  status: 'resources_present' | 'missing_resources' | 'unknown';
  checks: string[];
}
export interface SegocProfile {
  effectType: string;
  spellSpeed: number | null;
  missedTimingRisk: boolean;
  triggerEvents: string[];
}
export interface SegocIndex {
  generatedAt?: string;
  profiles: Record<string, SegocProfile>;
}
export interface TriggerOverlap {
  cardIds: number[];
  event: string;
  potential: true;
}
