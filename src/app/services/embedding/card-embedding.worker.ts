/// <reference lib="webworker" />
import { env, AutoProcessor, AutoModel, Tensor } from '@huggingface/transformers';
import { MODEL_INPUT_SIZE, poolTokens, rgbaToChw } from '../../utils/embedding-preprocess.utils';

export interface RgbaImage { rgba: Uint8ClampedArray; width: number; height: number }
export type EmbeddingRequest =
  | { type: 'load' }
  | { type: 'embed'; id: number; full: RgbaImage; art: RgbaImage };
export type EmbeddingResponse =
  | { type: 'progress'; progress: number }
  | { type: 'ready'; backend: 'webgpu' | 'wasm' }
  | { type: 'embedded'; id: number; full: Float32Array; art: Float32Array }
  | { type: 'error'; id?: number; message: string };

// Recipe (must match tools/card-index/embedder.mjs): squash to 224, processor mean/std, batch 1,
// [L2(CLS), L2(mean patch)] -> L2.
const MODEL_ID = 'onnx-community/dinov2-small';

env.allowLocalModels = false;
// ONNX wasm binaries are copied to assets/onnx by angular.json (same as the decision worker).
env.backends.onnx.wasm!.wasmPaths = new URL('assets/onnx/', self.location.origin + '/').href;

const send = (msg: EmbeddingResponse, transfer: Transferable[] = []) => postMessage(msg, transfer);

interface Loaded {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  mean: number[];
  std: number[];
  backend: 'webgpu' | 'wasm';
}
let loaded: Promise<Loaded> | undefined;

type ProgressInfo = { status?: string; file?: string; loaded?: number; total?: number };

/**
 * Aggregates per-file byte progress into one monotonic 0..1 value. Files appear one by one (the
 * small processor files finish before the large model file shows up), so the raw ratio can drop:
 * only a new maximum is reported. `reset()` starts over for a new download attempt (wasm retry).
 */
function progressTracker() {
  const files = new Map<string, { loaded: number; total: number }>();
  let best = 0;
  return {
    callback: (p: ProgressInfo) => {
      if (p.status !== 'progress' || !p.file || !p.total) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let l = 0;
      let t = 0;
      for (const f of files.values()) { l += f.loaded; t += f.total; }
      const ratio = t ? Math.min(1, l / t) : 0;
      if (ratio > best) {
        best = ratio;
        send({ type: 'progress', progress: ratio });
      }
    },
    reset: () => { files.clear(); best = 0; },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadWasmModel(progress_callback?: (p: ProgressInfo) => void): Promise<any> {
  return AutoModel.from_pretrained(MODEL_ID, { device: 'wasm', dtype: 'q8', progress_callback });
}

async function webgpuAvailable(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try { return !!(await gpu.requestAdapter()); } catch { return false; }
}

function load(): Promise<Loaded> {
  return (loaded ??= (async () => {
    const tracker = progressTracker();
    const progress_callback = tracker.callback;
    const proc = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });
    const ip = (proc as unknown as { image_processor?: { image_mean: number[]; image_std: number[] } }).image_processor
      ?? (proc as unknown as { image_mean: number[]; image_std: number[] });
    let backend: 'webgpu' | 'wasm' = 'wasm';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let model: any;
    if (await webgpuAvailable()) {
      try {
        model = await AutoModel.from_pretrained(MODEL_ID, { device: 'webgpu', dtype: 'fp16', progress_callback });
        backend = 'webgpu';
      } catch (e) {
        console.warn('[card-embedding] webgpu load failed, falling back to wasm q8', e);
      }
    }
    if (!model) {
      // a failed webgpu fp16 attempt leaves its bytes in the aggregate: start over for the q8 file
      tracker.reset();
      model = await loadWasmModel(progress_callback);
    }
    send({ type: 'ready', backend });
    return { model, mean: ip.image_mean, std: ip.image_std, backend };
  })().catch(e => { loaded = undefined; throw e; }));
}

async function embedOne(l: Loaded, img: RgbaImage): Promise<Float32Array> {
  const S = MODEL_INPUT_SIZE;
  const chw = rgbaToChw(img.rgba, img.width, img.height, l.mean, l.std);
  const out = await l.model({ pixel_values: new Tensor('float32', chw, [1, 3, S, S]) });
  const h = out.last_hidden_state;
  const [, tokens, dim] = h.dims as number[];
  return poolTokens(Float32Array.from(h.data as ArrayLike<number>), tokens, dim);
}

/** Embeds the request's two images (batch 1 on purpose: q8 dynamic quantization spans the whole batch). */
async function embedPair(l: Loaded, data: { full: RgbaImage; art: RgbaImage }): Promise<{ full: Float32Array; art: Float32Array }> {
  const full = await embedOne(l, data.full);
  const art = await embedOne(l, data.art);
  return { full, art };
}

/**
 * Replaces a webgpu model that failed at inference time with the wasm q8 one (once: the replacement
 * is wasm, so a further failure is reported). No progress is sent: the service is already 'ready'.
 */
function switchToWasm(current: Loaded): Promise<Loaded> {
  const next = (async () => {
    const model = await loadWasmModel();
    try { await current.model.dispose?.(); } catch { /* best effort */ }
    send({ type: 'ready', backend: 'wasm' });
    return { ...current, model, backend: 'wasm' as const };
  })();
  loaded = next;
  next.catch(() => { if (loaded === next) loaded = undefined; });
  return next;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

let queue: Promise<void> = Promise.resolve();

addEventListener('message', ({ data }: MessageEvent<EmbeddingRequest>) => {
  queue = queue.then(async () => {
    if (data.type === 'load') {
      try { await load(); } catch (e) { send({ type: 'error', message: errMsg(e) }); }
      return;
    }
    if (data.type === 'embed') {
      try {
        const l = await load();
        let out: { full: Float32Array; art: Float32Array };
        try {
          out = await embedPair(l, data);
        } catch (e) {
          if (l.backend !== 'webgpu') throw e;
          console.warn('[card-embedding] webgpu inference failed, switching to wasm q8', e);
          out = await embedPair(await switchToWasm(l), data);
        }
        send({ type: 'embedded', id: data.id, full: out.full, art: out.art }, [out.full.buffer, out.art.buffer]);
      } catch (e) {
        send({ type: 'error', id: data.id, message: errMsg(e) });
      }
    }
  });
});
