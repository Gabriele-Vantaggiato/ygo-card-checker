# Local card decisions (experimental)

Target: the Angular site deployed to Vercel. Branch: `refactor/decision-model`, based on web `main` at `a971715`.

## Decision

Use the open **multilingual E5 small** embedding model as a conservative additional ranking signal. It runs in a lazy Web Worker using Transformers.js 3.8.1 and ONNX/WASM, with no server process, API key or GPU requirement. This is semantic retrieval, **not a strategic reasoning model or duel simulator**. It cannot establish that a combo actually works. Keep the experiment opt-in until a representative deck benchmark demonstrates improvement.

The shared “Experimental local ranking” control appears in AutoComplete Deck and Related Cards. Its goal is session-only and shared between them. Without a goal, the existing deck summary or selected card provides the query. No model downloads happen while the option is disabled. Local mode never silently falls back to Gemini; the existing Gemini path remains available when local mode is off.

The model reorders up to 24 already admissible candidates. AutoComplete supplies hydrated card descriptions; Related Cards uses the knowledge index's names, archetypes and mechanic tags. Existing format, section, copy-count and admissibility checks stay authoritative. This does not add cards to the candidate pool or change their quantities.

Inputs use E5's required `query:`/`passage:` prefixes. Mean-pooled normalized embeddings produce cosine similarities. Malformed, incomplete, duplicate-ID, unknown-ID and non-finite outputs are rejected. A top-two margin below 0.01 or total spread below 0.02 preserves the baseline. Otherwise, the final score combines 65% existing candidate order and 35% normalized semantic similarity. These weights and abstention thresholds are product heuristics, **not calibrated probabilities**.

## Alternatives examined on 2026-09-21

| Candidate | Evidence | Decision |
| --- | --- | --- |
| TypeSafe Jev | [Official SDK](https://github.com/typesafe-ai/typesafe-sdk-js) uses an authenticated hosted API. The SDK being MIT does not establish that model weights are open. | Possible future Vercel server adapter; not used in this branch. |
| Needle 3 | [Model card](https://huggingface.co/Cactus-Compute/needle3) labels weights Apache-2.0 and provides a WASM runtime. | Evaluated locally; insufficient evidence for card ranking. |
| Multilingual E5 small | [Original model](https://huggingface.co/intfloat/multilingual-e5-small) has MIT metadata and multilingual retrieval training; [ONNX conversion](https://huggingface.co/Xenova/multilingual-e5-small) supports Transformers.js. | Selected as an experimental semantic signal, with deterministic fallback. |

Needle revision `b274efcb211a9eef48c9a88da4b43bd569696a39`: a three-card ranking probe echoed all candidates in input order, including the off-archetype candidate. A separate six-query intent probe produced one truncated result, four suppressed results (several semantically wrong despite high reported confidence), and one appropriate refusal of a weather request. This small probe does not benchmark the model generally; it is enough not to ship it as a trusted Yu-Gi-Oh ranker.

E5 revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`: four synthetic mechanic queries (Italian/English) correctly selected three top effects. The fourth confused removal and disruption with a 0.0032 margin; our abstention policy preserves the original ranking. These fixtures verify execution/basic cross-language relevance, **not deck-building quality**. Real archetype, historical-format, negation, summon-condition and adversarial examples still need expert-labelled evaluation.

## Vercel and browser operation

- Standard `npm ci && npm run build`; existing Vercel build/output configuration works unchanged.
- ONNX runtime assets are copied to `/assets/onnx/`. The model and tokenizer download directly from Hugging Face at the pinned revision and use browser caching where available. The first use transfers approximately 150 MB in total (118 MB quantized weights, 17 MB tokenizer, runtime assets). No card text, deck or goal is uploaded for inference.
- Model inference uses one WASM thread, so it requires neither WebGPU nor cross-origin isolation headers. Unsupported browsers, blocked downloads, insufficient memory, errors or a 90-second timeout preserve the existing ranking.
- At most two requests can be pending. They are correlated by ID and executed serially; unsubscribed results are ignored. Cancelling the last request terminates the worker. After completion, 60 seconds of inactivity releases its memory. An in-worker embedding cache is bounded to 128 entries.
- Related Cards shows its original suggestions immediately while enrichment runs. AutoComplete cancels an obsolete plan when options change; no old plan stays applicable during recomputation.
- Nothing is deployed by creating this branch. Normal Vercel branch preview deployment can exercise it before a production merge.

## Verification

```sh
npm test -- --watch=false --browsers=ChromeHeadless
npm run build
node --import tsx tools/semantic-probe.mjs
node tools/verify-card-decision-browser.mjs
```

The browser smoke test requires Playwright and a Chrome installation (`PLAYWRIGHT_MODULE` may point to an existing Playwright `index.mjs`). It serves the production build locally, starts the **actual built worker**, downloads the pinned model, and verifies an Italian query against English effect descriptions. No inference mocks are used. Initial observed run: about 7.1 seconds including download, with no failed requests.

The unit tests exercise model boundaries, ambiguity, opt-in, errors, timeout, concurrent request correlation, cancellation, and local-mode cloud isolation. They do not claim to prove recommendation quality. Production compilation emits an initial-bundle warning but stays below its 1 MB error ceiling; model code is a separate lazy worker. Harness validation reports missing `Project Overview`, `Repository Structure`, and `Development Workflow` sections in the parent repository's pre-existing AGENTS.md.

For the research-only Needle probe, download `wasm/needle.js`, `wasm/needle.wasm`, `needle3.cact`, and `LICENSE` from the pinned Needle revision into `tmp/needle3`, then run `node tools/needle-probe.cjs`. These assets are not shipped with the application.

## Next evidence needed

Before enabling by default, compare baseline vs hybrid top-5/top-10 relevance on expert-labelled decks across TCG and historical formats. Measure cold/warm latency and peak memory on low-end mobile browsers. Evaluate mechanic tags vs full card text for Related Cards. If a small trained decision model replaces E5, keep the same candidate boundary, cancellation, abstention and legality contracts.
