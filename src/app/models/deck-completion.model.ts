import { ComboLine } from './card-combo.model';
import { AddToDecklistPayload } from './decklist.model';

export interface DeckCompletionAdd {
  cardId: number;
  name: string;
  quantity: number;
  type: string;
  imageUrlSmall: string | null;
  reasonKey: string;
  reasonParams?: Record<string, string>;
  score: number;
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
  adds: DeckCompletionAdd[];
  comboLines: ComboLine[];
  payloads: AddToDecklistPayload[];
}
