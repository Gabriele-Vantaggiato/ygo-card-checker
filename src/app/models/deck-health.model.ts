/** Pillar 6: deck health validator. */
import { CardRole } from './semantic-card.model';

export type DeckHealthSeverity = 'info' | 'warning' | 'critical';

export interface DeckHealthWarning {
  id: string;
  severity: DeckHealthSeverity;
  messageKey: string;
  messageParams?: Record<string, string>;
}

export interface DeckHealthReport {
  score: number;
  roleCounts: Record<CardRole, number>;
  normalSummonRelianceCount: number;
  warnings: DeckHealthWarning[];
}
