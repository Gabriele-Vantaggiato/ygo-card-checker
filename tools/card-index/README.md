# Card image-embedding index

Offline builder for the index used to recognise physical cards from camera frames.
The binary format and the search live in `src/app/utils/card-index.format.ts`, shared by
these Node tools and the browser runtime.

## Recipe

- Model: `onnx-community/dinov2-small`, `q8` ONNX, via `@huggingface/transformers` (onnxruntime-node).
- Preprocessing: decode, drop alpha, resize to 224x224 with `fit: 'fill'` (squash, no centre crop),
  `(x/255 - mean) / std` with the model's processor mean/std (ImageNet).
- Embedding (768-d): `L2([L2(CLS token), L2(mean of the 256 patch tokens)])`.
- Two vectors per reference image: `full` (whole card face) and `art` (crop x 11..89%, y 18..72%).
- Index vector = `L2(clean + 3 degraded copies)` per kind; copies alternate mild/medium/mild
  synthetic webcam degradation (`degrade()` in `embedder.mjs`, port of the spike's `sim.mjs`),
  seeded per image id so builds are reproducible.
- Inference is always batch 1, here and at runtime (the q8 model quantizes activations per batch,
  so batching changes the vectors slightly).
- Stored as int8 with a per-vector scale `maxabs/127`.
- Query score = `cos(full) + cos(art)`, brute force, rows of the same card deduplicated.

Reference images: `https://images.ygoprodeck.com/images/cards_small/<imageId>.jpg` (268x391).
Card list: `https://db.ygoprodeck.com/api/v7/cardinfo.php` (one request, cached).
Each card contributes one row per `card_images[]` entry; alternate artworks are extra rows with
the same card id. Images that 404 are skipped and listed in the meta file.

## Build

```bash
npm run index:build -- --out public/assets/card-index/card-index.bin
# options: --cache <dir> (default tools/card-index/.cache)  --limit N (seeded random subset)
#          --aug 3  --concurrency 1  --threads T  --refresh-cards (re-fetch the card list)
```

Writes `card-index.bin` and `card-index.meta.json` (row/card counts, skipped images, sha256).
Expect roughly 90-100 rows/min on a desktop CPU (downloads overlap with embedding), i.e. about
2.5-3 hours for the full catalogue (~14.8k rows, ~23 MB). `--concurrency 2` gains under 10%.

### Resume

Everything is cached under `--cache`: `cardinfo.json`, `img/<imageId>.jpg`,
`emb-<recipeHash>/<imageId>.f32` (the averaged float vectors, written atomically per image) and
`missing-images.json`. After a crash or Ctrl+C just run the same command again: cached rows are
skipped and the index is assembled from the cache. Changing the recipe (e.g. `--aug`) uses a new
`emb-*` folder; images are reused.

## Verify

```bash
npm run index:verify -- --index public/assets/card-index/card-index.bin [--n 200] [--src full|small] [--query-dtype fp16]
```

Simulates mild/medium/harsh frames of N indexed cards (from the full-size 421x614 image by default,
a different resampling than the reference), embeds them like the runtime and prints top-1/top-5.
Reference (400-card subset, N=400): mild 100/100, medium 99/99.8, harsh 63/82.5. The spike measured
on 2500 cards: mild 100, medium 97.7, harsh 60.7 top-1; smaller indexes score higher.

## File format (`card-index.bin`, little-endian)

| bytes | content |
| --- | --- |
| 4 | magic `YGCI` |
| 4 | u32 header JSON length H (multiple of 4) |
| H | header JSON (`CardIndexMeta`: version, model, dtype, dim, count, recipe), space padded |
| 4*count | `ids` u32 (card passcode per row) |
| 4*count | `fullScale` f32 |
| 4*count | `artScale` f32 |
| dim*count | `full` i8, row-major |
| dim*count | `art` i8, row-major |

## When to rebuild

- New cards / new artworks released: run with `--refresh-cards`; only the new images are
  downloaded and embedded, the rest comes from the cache.
- Recipe change (model, preprocessing, crop box, augmentation): bump the recipe in `embedder.mjs`
  / `build-index.mjs` together with the runtime and rebuild everything.
- Do not commit the cache. The generated `.bin` is published as a static asset.
