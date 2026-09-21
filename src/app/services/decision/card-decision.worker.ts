/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers';
import { DECISION_MODEL, DECISION_REVISION, DecisionRequest, DecisionResponse } from './card-decision.model';

env.allowLocalModels = false;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.wasmPaths = new URL('assets/onnx/', self.location.origin + '/').href;
const extractor = () => pipeline('feature-extraction', DECISION_MODEL, {
  revision: DECISION_REVISION, dtype: 'q8', device: 'wasm',
});
let model: ReturnType<typeof extractor> | undefined;
const cache = new Map<string, number[]>();
const cancelled = new Set<number>();
let queue = Promise.resolve();
const send = (response: DecisionResponse) => postMessage(response);

async function embed(text: string): Promise<number[]> {
  const cached = cache.get(text);
  if (cached) return cached;
  const encoder = await (model ??= extractor());
  const tensor = await encoder(text, { pooling: 'mean', normalize: true, truncation: true });
  const vector = Array.from(tensor.data, Number);
  if (cache.size >= 128) cache.delete(cache.keys().next().value!);
  cache.set(text, vector);
  return vector;
}

addEventListener('message', ({ data }: MessageEvent<DecisionRequest>) => {
  if (data.kind === 'cancel') { cancelled.add(data.id); return; }
  // ONNX sessions and queues are bounded by the service. Never overlap inference.
  queue = queue.then(async () => {
    try {
      if (cancelled.has(data.id)) return;
      if (!model) send({ kind: 'loading', id: data.id });
      const query = await embed(`query: ${data.query}`);
      const scores = [];
      for (const candidate of data.candidates) {
        if (cancelled.has(data.id)) return;
        const vector = await embed(`passage: ${candidate.text}`);
        const score = vector.reduce((sum, value, i) => sum + value * query[i], 0);
        scores.push({ cardId: candidate.cardId, score });
      }
      if (!cancelled.has(data.id)) send({ kind: 'result', id: data.id, scores });
    } catch {
      model = undefined;
      if (!cancelled.has(data.id)) send({ kind: 'error', id: data.id });
    } finally { cancelled.delete(data.id); }
  });
});
