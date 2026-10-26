// Node implementation of the card-embedding recipe (must match the browser runtime).
//
//   image -> (optional art crop x 11..89%, y 18..72%) -> squash to 224x224 (no centre crop)
//   -> ImageNet mean/std (from the model's processor config) -> dinov2-small q8
//   -> [L2(CLS), L2(mean of patch tokens)] -> L2 of the 768-d concatenation
//
// Exports: initEmbedder(opts), embedFull(buf), embedArt(buf), degrade(buf, level, seed), LEVELS, DIM.
// Inference runs one image per call (batch=1) on purpose: the q8 model uses dynamic activation
// quantization whose scale spans the whole batch, and the runtime always embeds a single frame.
import sharp from 'sharp';
import { env, AutoProcessor, AutoModel, Tensor } from '@huggingface/transformers';

export const MODEL_ID = 'onnx-community/dinov2-small';
export const DTYPE = 'q8';
export const SIZE = 224;
export const DIM = 768;
export const ART_BOX = { x0: 0.11, x1: 0.89, y0: 0.18, y1: 0.72 };

let state = null;

/**
 * Loads processor + model once. `cacheDir` = where HF model files are cached; `dtype` defaults to
 * the index recipe (q8) and should only be overridden to measure runtime variants (verify-index).
 */
export async function initEmbedder({ cacheDir, threads, dtype = DTYPE } = {}) {
  if (state) return state;
  if (cacheDir) env.cacheDir = cacheDir;
  env.allowLocalModels = false;
  const proc = await AutoProcessor.from_pretrained(MODEL_ID);
  const ip = proc.image_processor ?? proc;
  const session_options = threads ? { intraOpNumThreads: threads } : undefined;
  const model = await AutoModel.from_pretrained(MODEL_ID, { dtype, device: 'cpu', session_options });
  state = { model, mean: ip.image_mean, std: ip.image_std };
  return state;
}

async function pixels(buf, art) {
  let img = sharp(buf).removeAlpha();
  if (art) {
    const md = await sharp(buf).metadata();
    img = img.extract({
      left: Math.round(md.width * ART_BOX.x0),
      top: Math.round(md.height * ART_BOX.y0),
      width: Math.round(md.width * (ART_BOX.x1 - ART_BOX.x0)),
      height: Math.round(md.height * (ART_BOX.y1 - ART_BOX.y0)),
    });
  }
  return img.resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer();
}

function l2(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}

async function embed(buf, art) {
  const { model, mean, std } = state ?? (await initEmbedder());
  const raw = await pixels(buf, art);
  const plane = SIZE * SIZE;
  const a = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) a[c * plane + i] = (raw[i * 3 + c] / 255 - mean[c]) / std[c];
  }
  const out = await model({ pixel_values: new Tensor('float32', a, [1, 3, SIZE, SIZE]) });
  const h = out.last_hidden_state;
  const [, t, d] = h.dims;
  const data = h.data;
  const cls = Float32Array.from(data.subarray(0, d));
  const m = new Float32Array(d);
  for (let j = 1; j < t; j++) for (let q = 0; q < d; q++) m[q] += data[j * d + q];
  const v = new Float32Array(2 * d);
  v.set(l2(cls));
  v.set(l2(m), d);
  return l2(v);
}

/** Whole-card embedding (768-d, unit length). */
export const embedFull = (buf) => embed(buf, false);
/** Art-box embedding (768-d, unit length). */
export const embedArt = (buf) => embed(buf, true);

// ---------------------------------------------------------------------------------------------
// Synthetic webcam-frame degradation (port of the spike's sim.mjs, with a per-call seed).
export const LEVELS = {
  mild:   { margin: [-0.03, 0.03], rot: 2,   persp: 0.010, downH: [240, 260], blur: [0.5, 0.8], bright: 0.10, contrast: [0.9, 1.1],  gamma: [0.9, 1.1],  cast: 8,  glareP: 0.3, glareArea: [0.05, 0.10], glareOp: [0.4, 0.6],  noise: [1, 3],  jpeg: [65, 75] },
  medium: { margin: [-0.06, 0.06], rot: 3.5, persp: 0.020, downH: [210, 240], blur: [0.8, 1.4], bright: 0.22, contrast: [0.75, 1.2], gamma: [0.75, 1.35], cast: 16, glareP: 0.6, glareArea: [0.08, 0.18], glareOp: [0.5, 0.75], noise: [3, 6],  jpeg: [50, 70] },
  harsh:  { margin: [-0.08, 0.08], rot: 5,   persp: 0.030, downH: [180, 210], blur: [1.2, 2.0], bright: 0.35, contrast: [0.6, 1.3],  gamma: [0.6, 1.6],  cast: 25, glareP: 1.0, glareArea: [0.15, 0.25], glareOp: [0.6, 0.9],  noise: [6, 10], jpeg: [40, 55] },
};

// Integer hash so that nearby seeds (id*4+k) give uncorrelated LCG streams.
export function mix32(x) {
  x = (x >>> 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Seed for the k-th augmentation of an image (shared by build and verify; verify uses other salts). */
export const augSeed = (imageId, k, salt = 0) => mix32(mix32(imageId + salt * 0x1000193) + k);

function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = b.map((v, i) => v / A[i][i]); h.push(1); return h;
}

/**
 * Simulates a webcam frame of the card in `buf` (any sharp-readable image) at `level`
 * ('mild' | 'medium' | 'harsh' or a LEVELS-shaped object). Deterministic for a given seed.
 * Returns a JPEG buffer, 400px wide, same aspect as the source.
 */
export async function degrade(buf, level, seed) {
  const L = typeof level === 'string' ? LEVELS[level] : level;
  if (!L) throw new Error(`degrade: unknown level ${level}`);
  let s = mix32(seed);
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const U = (a, b) => a + (b - a) * rnd();
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  const { data: src, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sw = info.width, sh = info.height;
  const W = 400, H = Math.round(400 * sh / sw);
  const m = U(...L.margin), th = U(-L.rot, L.rot) * Math.PI / 180, cx = W / 2, cy = H / 2;
  const hw = W * (0.5 - m), hh = H * (0.5 - m);
  const dst = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => {
    const jx = U(-L.persp, L.persp) * W, jy = U(-L.persp, L.persp) * H;
    return [cx + x * Math.cos(th) - y * Math.sin(th) + jx, cy + x * Math.sin(th) + y * Math.cos(th) + jy];
  });
  const Hm = homography(dst, [[0, 0], [sw, 0], [sw, sh], [0, sh]]);
  const bg = [U(20, 120), U(20, 110), U(15, 100)];
  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Hm[6] * x + Hm[7] * y + 1, sx = (Hm[0] * x + Hm[1] * y + Hm[2]) / d - 0.5, sy = (Hm[3] * x + Hm[4] * y + Hm[5]) / d - 0.5;
    const o = (y * W + x) * 3;
    if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) { for (let c = 0; c < 3; c++) out[o + c] = bg[c] + 8 * gauss(); continue; }
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
    for (let c = 0; c < 3; c++) {
      const a = src[(y0 * sw + x0) * 3 + c], b = src[(y0 * sw + x1) * 3 + c], cc = src[(y1 * sw + x0) * 3 + c], dd = src[(y1 * sw + x1) * 3 + c];
      out[o + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + dd * fx) * fy;
    }
  }
  const glare = rnd() < L.glareP;
  const gArea = U(...L.glareArea) * (2 * hw) * (2 * hh), gR = Math.sqrt(gArea / Math.PI) * 1.3;
  const gx = cx + U(-0.6, 0.6) * hw, gy = cy + U(-0.6, 0.6) * hh, gOp = U(...L.glareOp);
  const br = 1 + U(-L.bright, L.bright) * (rnd() < 0.5 ? 1 : 1), ct = U(...L.contrast), gm = U(...L.gamma);
  const cast = [U(-L.cast, L.cast), U(-L.cast, L.cast), U(-L.cast, L.cast)], ns = U(...L.noise);
  const f = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let ga = 0;
    if (glare) { const r = Math.hypot(x - gx, (y - gy) * 1.2) / gR; if (r < 1) ga = gOp * Math.pow(1 - r * r, 1.5); }
    for (let c = 0; c < 3; c++) {
      const i = (y * W + x) * 3 + c;
      let v = out[i] / 255;
      v = Math.pow(Math.max(0, (v - 0.5) * ct + 0.5) * br, gm) * 255 + cast[c];
      v = v * (1 - ga) + 255 * ga;
      f[i] = v;
    }
  }
  const px = Buffer.alloc(W * H * 3);
  for (let i = 0; i < f.length; i++) px[i] = Math.max(0, Math.min(255, f[i] + ns * gauss()));
  const dh = Math.round(U(...L.downH)), dw = Math.round(dh * W / H);
  const small = await sharp(px, { raw: { width: W, height: H, channels: 3 } }).resize(dw, dh).blur(U(...L.blur)).png().toBuffer();
  return sharp(small).resize(W, H).jpeg({ quality: Math.round(U(...L.jpeg)) }).toBuffer();
}
