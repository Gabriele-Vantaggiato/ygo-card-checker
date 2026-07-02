import { ComboLine } from './card-combo.model';
import { AddToDecklistPayload } from './decklist.model';
import { DeckCompletionDirection } from '../utils/completion-prompt.utils';

export interface DeckCompletionOptions {
  targetMain: number;
  includeSide: boolean;
  targetSide: number;
  direction: DeckCompletionDirection;
  prompt: string;
  useOllama?: boolean;
}

export interface DeckCompletionAdd {
  cardId: number;
  name: string;
  quantity: number;
  type: string;
  imageUrlSmall: string | null;
  reasonKey: string;
  reasonParams?: Record<string, string>;
  score: number;
  section?: 'main' | 'extra' | 'side';
}

export type DeckCompletionStatus =
  | 'ready'
  | 'already_complete'
  | 'empty_deck'
  | 'no_candidates'
  | 'unavailable';

export interface DeckCompletionPlan {
  status: DeckCompletionStatus;
  targetMain: number;
  currentMain: number;
  gap: number;
  currentExtra?: number;
  extraGap?: number;
  targetSide?: number;
  currentSide?: number;
  sideGap?: number;
  direction: DeckCompletionDirection;
  promptSummary?: string | null;
  ragSources?: string[];
  ollamaUsed?: boolean;
  matchupKeys?: string[];
  adds: DeckCompletionAdd[];
  comboLines: ComboLine[];
  payloads: AddToDecklistPayload[];
}
