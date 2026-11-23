# Intent Runtime MVP architecture

Request → planner (demo rules or gateway model) → validated plan → capability registry → deterministic results → generic renderer.

`kernel.mjs` resolves cards against the real repository snapshot and implements `combo` and `optimize`. Plans contain only tool names and view names. Unknown tools, missing result views, incompatible views and oversized requests are rejected. No model-generated JavaScript, HTML, URLs, commands, metrics or effects are executed. Tool results are rendered using textContent, not HTML injection.

`server.mjs` owns provider credentials, timeout, origin/host checks and the two API endpoints. Static serving uses an exact allowlist. The renderer has timeline, metrics, changes and audit components, composed by the returned plan. UI inputs remain in the page across runs; each request recomputes results. There is no persistent conversational memory or arbitrary tool graph yet.

The real codebase is Angular 20 + RxJS + Tailwind 4/daisyUI 5, with Karma/Jasmine tests and local Gemini proxy. This lab deliberately adds no Angular dependencies and runs as a separate Node companion. Its input/output deck format matches the existing text importer. It neither loads account credentials nor mutates saved decklists. A future Angular adapter can connect DecklistStore and FormatStore after an explicit product decision; the present lab fixes format to HAT and visibly exposes its assumptions.

Safety/correctness boundaries: only the three-card Scrap scenario is simulated; no general engine legality claim. HAT data is a dated repository snapshot. Probability means drawing at least one of two named starter types, not a measured performance improvement. AI planning remains unvalidated live until a key/model is supplied. Unknown intents fail instead of hallucinating capabilities. No production deployment, autonomous installs, generated code execution or automatic deck edits.
