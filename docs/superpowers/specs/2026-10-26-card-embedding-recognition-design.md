# Card recognition by image embedding — Design

Branch: `feature/card-embedding-recognition`. Date: 2026-10-26.
Builds on: `2026-10-26-profile-collection-design.md` (the Collezione scan flow).

## Problem

The live scan in the Collezione panel reads the printed set code (and, as a fallback, the card name) with Tesseract OCR. On a PC webcam the set code is ~9 px tall and unreadable; the name fallback is fragile. Real tests showed the scan "sits there" and finds nothing.

## Decision

Recognise the card from its **image** (as TCG scanner apps do), not from text. A spike (offline, simulated webcam frames, 2,500-card index, 300 queries) measured:

| Setup | Mild | Medium | Harsh (blur + low-res + noise + JPEG) |
|---|---|---|---|
| DINOv2-small q8, CLS+mean, full card + art box fused, augmented index (top-1) | 100% | 97.7% | 60.7% |
| Extrapolated to ~13k cards | ~99% | ~96–97% | ~50% |

Findings that shape the design: glare alone is harmless; **blur + low resolution + noise together** are what break recognition. So the runtime must reject blurry frames, vote over several frames, ask for a closer card, and let the user pick among the top candidates. Same-art twins did not cause failures.

Chosen: `onnx-community/dinov2-small` (24 MB q8) in the browser through `@huggingface/transformers` (already a dependency), a precomputed int8 index shipped as a static asset (~20 MB for ~13k cards x full+art), and an optional "Leggi con AI" button (Gemini, user's own key) as a fallback.

Out of scope: card detection/perspective warp (the user aligns the card in the guide frame, as today), foil/sleeve modelling, public sharing, the Cardmarket cart.

## 1. Index (offline, built by `tools/card-index`)

- One file `public/assets/card-index/card-index.bin` + `card-index.meta.json`, format owned by `src/app/utils/card-index.format.ts` (`encodeIndex` / `decodeIndex` / `searchIndex`), shared by the Node builder and the browser.
- Per card row: `full` and `art` 768-d int8 vectors (CLS + mean-patch, each half L2-normalised, mean of clean + 3 augmented embeddings) with per-vector scales; `ids` are card passcodes (alternate artworks are extra rows with the same id).
- Rebuilt with `npm run index:build` when new cards are released; `meta.version` identifies the build. Verified with `tools/card-index/verify-index.mjs`.

## 2. Runtime (browser)

New units, each with one purpose:

- `CardIndexService` — lazily fetches and decodes the index (HTTP cache; exposes a loading-progress signal and a `ready` signal); also exposes `indexVersion`.
- `card-embedding.worker.ts` + `CardEmbeddingService` — loads the DINOv2 q8 ONNX model through transformers.js in a **Web Worker** (dynamic import, so it does not enter the main bundle; WebGPU fp16 when available, WASM q8 otherwise), preprocesses a frame (squash to 224x224, same normalisation as the Node recipe) and returns `{ full: Float32Array; art: Float32Array }`. Exposes model-loading progress (the model is cached by the browser after the first load).
- `sharpness.utils.ts` (pure) — variance of the Laplacian on a downscaled greyscale copy of the guide frame; `isSharp(frame)` with a tuned threshold. Blurry frames are skipped and the UI says so.
- `frame-vote.utils.ts` (pure) — aggregates the top-K lists of the last N sharp frames: sums scores per card id, returns ranked candidates with a confidence derived from the margin between #1 and #2 and the number of agreeing frames.
- `CardRecognizerService` — replaces the OCR-first tick of `CollectionScannerService`: grab guide frame → sharpness gate → embed (`full` from the whole guide frame, `art` from the art box x 11–89 %, y 18–72 %) → `searchIndex` top-5 → vote. It auto-accepts when confidence is high (≥3 agreeing sharp frames and a clear margin) and otherwise emits the ranked top-5 for the user to choose. Camera lifecycle, run-token race protection and the `detections$` contract of `CollectionScannerService` are kept; the set-code OCR pass is retained **only to propose the printing** of the recognised card (it is optional and never blocks recognition). Tesseract name OCR stays as a fallback while the model/index are still loading.
- `ScanDetection` gains `alternatives: { card: YgoCard; score: number }[]`.

## 3. UI (scan panel)

- Status line (aria-live): "Scarico il modello… 24 MB" / "Carico l'indice…" / "Troppo sfocata: avvicina la carta e tienila ferma" / "Riconosco…" / the recognised name.
- **Candidate strip**: when not auto-accepted, show up to 5 thumbnails (`cards_small`) with names; one tap adds the card to the queue as `needsReview`; auto-accepted cards go straight into the queue as today.
- Existing queue, review list, manual add and diagnostics are kept; the Diagnostica box additionally shows the top-5 ids/scores and the sharpness value.
- Copy stays Italian, calm, one primary action per view.

## 4. "Leggi con AI" (optional)

A button in the scan panel that captures the current frame (max 1024 px, JPEG), sends it to Gemini with the user's own key (`AiProviderPreferencesService`; shown only when a Gemini key is configured), asks for `{ name, setCode, language }` as JSON, then resolves the answer through the existing `CardsetLookupService`. First use asks for confirmation that the image is sent to Google. Errors and timeouts surface as a calm inline message; nothing is sent automatically.

## 5. Errors, performance, testing

- Model/index download failure: message with "Riprova", OCR fallback keeps working.
- Per-frame budget: embed at most one frame at a time (skip frames while busy); two DINOv2 passes per sharp frame (measured ~120 ms in Node; expect 0.2–0.5 s in the browser).
- Unit tests (Karma) for pure units: index format and search, sharpness, frame voting, art-box cropping geometry. The offline `verify-index` script reproduces the spike numbers on the built index. Camera, worker and WebGPU/WASM paths are verified manually (phone over HTTPS, PC webcam).
- Honest limits: the spike is synthetic; foil, sleeves and wear are not modelled; expected top-1 on a sharp frame ~96–99 %, on a blurry small card ~50 % (hence the sharpness gate, voting and the candidate strip).
