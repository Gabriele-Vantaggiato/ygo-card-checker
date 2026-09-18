import { getAvailableFlows } from './combo-flow.utils';
import { ComboFlow } from '../models/combo-flow.model';
import { DetectedEngine, ComboEngine } from '../models/combo-engine.model';

const artifactEngine: ComboEngine = {
  key: 'artifact',
  name: 'Artifact',
  description: null,
  minCardsThreshold: 2,
  cards: [],
};

const engineGatedFlow: ComboFlow = {
  key: 'artifact-loop',
  title: 'Artifact Sanctum loop',
  engineKey: 'artifact',
  keyCards: [],
  steps: ['step 1'],
};

const keyCardGatedFlow: ComboFlow = {
  key: 'foolish-mathematician',
  title: 'Foolish Burial into Mathematician',
  engineKey: null,
  keyCards: [
    { cardId: 100, name: 'Foolish Burial' },
    { cardId: 101, name: 'Mathematician' },
  ],
  steps: ['step 1', 'step 2'],
};

describe('getAvailableFlows', () => {
  it('surfaces an engine-gated flow only when its engine was detected', () => {
    const detected: DetectedEngine[] = [
      { engine: artifactEngine, matchedCardIds: [1, 2], matchedCount: 2, completeness: 1 },
    ];
    expect(getAvailableFlows(new Set(), [engineGatedFlow], detected)).toEqual([engineGatedFlow]);
    expect(getAvailableFlows(new Set(), [engineGatedFlow], [])).toEqual([]);
  });

  it('surfaces a key-card-gated flow only when every key card is present', () => {
    expect(getAvailableFlows(new Set([100, 101]), [keyCardGatedFlow], [])).toEqual([keyCardGatedFlow]);
    expect(getAvailableFlows(new Set([100]), [keyCardGatedFlow], [])).toEqual([]);
  });
});
