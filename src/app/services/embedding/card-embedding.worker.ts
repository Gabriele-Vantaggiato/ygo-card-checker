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
}
let loaded: Promise<Loaded> | undefined;

async function webgpuAvailable(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try { return !!(await gpu.requestAdapter()); } catch { return false; }
}

function load(): Promise<Loaded> {
  return (loaded ??= (async () => {
    // Aggregate per-file byte progress into one 0..1 value.
    const files = new Map<string, { loaded: number; total: number }>();
    const progress_callback = (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.file && p.total) {
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
        let l = 0;
        let t = 0;
        for (const f of files.values()) { l += f.loaded; t += f.total; }
        if (t) send({ type: 'progress', progress: Math.min(1, l / t) });
      }
    };
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
    if (!model) model = await AutoModel.from_pretrained(MODEL_ID, { device: 'wasm', dtype: 'q8', progress_callback });
    send({ type: 'ready', backend });
    return { model, mean: ip.image_mean, std: ip.image_std };
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
        // Batch 1 on purpose: two sequential calls (q8 dynamic quantization spans the whole batch).
        const full = await embedOne(l, data.full);
        const art = await embedOne(l, data.art);
        send({ type: 'embedded', id: data.id, full, art }, [full.buffer, art.buffer]);
      } catch (e) {
        send({ type: 'error', id: data.id, message: errMsg(e) });
      }
    }
  });
});
