import { pipeline, env } from '@huggingface/transformers';
import assert from 'node:assert/strict';
import { DECISION_MODEL, DECISION_REVISION, blendDecisionRanking } from '../src/app/services/decision/card-decision.model.ts';
env.cacheDir = './tmp/model-cache';
const model = await pipeline('feature-extraction', DECISION_MODEL, {
  revision: DECISION_REVISION, dtype: 'q8', device: 'cpu',
});
const passages = [
  'passage: Destroy one Spell or Trap on the field.',
  'passage: Add one monster from your Deck to your hand.',
  'passage: Negate the activation of an opponent monster effect.',
  'passage: Special Summon one monster from your Graveyard.',
];
const vectors = (await model(passages, { pooling: 'mean', normalize: true })).tolist();
for (const [query, expected] of [['Voglio rimuovere magie e trappole avversarie', null], ['I need to find monsters in my deck', 1], ['Voglio negare gli effetti dei mostri avversari', 2], ['Voglio evocare mostri dal cimitero', 3]]) {
  const q = (await model(`query: ${query}`, { pooling: 'mean', normalize: true })).tolist()[0];
  const scores = vectors.map(v => v.reduce((sum, x, i) => sum + x * q[i], 0));
  const best = scores.indexOf(Math.max(...scores));
  const accepted = blendDecisionRanking(passages.map((text, cardId) => ({ cardId, text })),
    scores.map((score, cardId) => ({ cardId, score })));
  if (expected === null) assert.equal(accepted.length, 0, 'Ambiguous example must abstain');
  else { assert.equal(best, expected); assert.ok(accepted.length); }
  console.log(JSON.stringify({ query, expectedSemanticWinner: expected, semanticWinner: best,
    scores, policy: accepted.length ? 'hybrid' : 'baseline', pass: true }));
}
