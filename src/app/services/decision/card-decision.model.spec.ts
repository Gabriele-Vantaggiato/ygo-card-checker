import { blendDecisionRanking, DecisionCandidate } from './card-decision.model';

const candidates: DecisionCandidate[] = [1, 2, 3, 4].map(cardId => ({ cardId, text: `card ${cardId}` }));
const scores = [0.70, 0.94, 0.80, 0.72].map((score, i) => ({ cardId: i + 1, score }));
describe('card decision boundary', () => {
  it('combines semantic relevance with the existing order without introducing or dropping IDs', () => {
    const ranked = blendDecisionRanking(candidates, scores);
    expect(ranked[0].cardId).toBe(2);
    expect(ranked.map(c => c.cardId).sort()).toEqual([1, 2, 3, 4]);
    expect(candidates.map(c => c.cardId)).toEqual([1, 2, 3, 4]);
  });
  it('abstains on almost tied results instead of treating cosine similarity as confidence', () => {
    expect(blendDecisionRanking(candidates, scores.map(c => ({ ...c, score: 0.9 })))).toEqual([]);
    expect(blendDecisionRanking(candidates, [0.8586, 0.8343, 0.8618, 0.8318]
      .map((score, i) => ({ cardId: i + 1, score })))).toEqual([]);
  });
  it('rejects missing, duplicate, invented IDs and non-finite or out-of-range scores', () => {
    for (const raw of [null, {}, scores.slice(1), [...scores.slice(1), scores[1]],
      [...scores.slice(1), { cardId: 999, score: 0.99 }],
      scores.map(c => ({ ...c, score: NaN })), scores.map(c => ({ ...c, score: 2 }))]) {
      expect(blendDecisionRanking(candidates, raw)).toEqual([]);
    }
  });
});
