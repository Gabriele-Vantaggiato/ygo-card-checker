/** Pillar 4: actionable combo flows, gated by a ComboEngine or explicit key cards. */

export interface FlowKeyCard {
  cardId: number;
  name: string;
}

export interface ComboFlow {
  key: string;
  title: string;
  engineKey: string | null;
  keyCards: FlowKeyCard[];
  steps: string[];
}

export interface ComboFlowIndex {
  version: number;
  generatedAt: string;
  flows: ComboFlow[];
}
