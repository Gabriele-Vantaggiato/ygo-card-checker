# Replay, Flow and coach integration

Implemented on `engine-assist-boost`.

## Shared evidence

`DuelLineAction` is a language-independent `(kind, cardId)` observation used by both replay normalization and `WizardLineStep.action`. Ordered arrays retain repeated actions. Normal Summon, Special Summon, activation and Set are currently comparable. Explanatory script text and alternative targets are deliberately not converted into fictional executable steps.

The parser retains visible draw passcodes. The extractor handles the first own turn only, requires a visible 5–6 card opening, rejects hidden actions and cards outside the main/extra snapshot, and never uses later draws to guess earlier availability. Exact deck keys retain quantities and extra-deck identity.

## Learning and recommendations

A root service connects the page-scoped stores. Up to 200 deduplicated opening records persist in `ygo-replay-lines-v1` in this browser. No raw replay files, player names or API keys are persisted in this memory. The replay page can erase it. Storage failures fall back to session memory.

The wizard adds a bounded observational score to existing domain scores. Unknown outcomes do not count as losses. Repeated lines can become candidates after at least three distinct games, at least two wins, a smoothed outcome rate above 50%, the exact same opening hand and deck, and no observed opponent intervention. Those thresholds are conservative heuristics, not evidence of optimality. The wizard also identifies sampled starters with no wins, or curated starters not observed in a sample of at least five openings.

Replay comparisons exclude their own hash and additionally match Master Rule and first-own-turn number. A curated fallback compares only explicit observable actions, currently mostly the opening action. The complete explanatory wizard script is not a certified combo. Flow presents historical suggestions with an explicit format/legality caveat because Flow does not provide replay Master Rule/banlist identity.

## Comparison and coach

The deterministic comparison checks whether candidate actions appear in order in the observed sequence. A difference produces informational `suboptimal_line`, explicitly not a proven missplay. Restrictions or opponent actions yield an inconclusive comparison. Missing visible hands or unsupported actions yield no comparison.

The coach receives the primary comparison and up to ten recent analyses from the same focus name in the current session. Game counts are deduplicated and trends count games, not repeated findings. Gemini instructions require explaining supplied evidence, preserving uncertainty and avoiding invented errors, optimal lines and opponent archetypes. No Gemini call is required for learning or comparisons.

Pending analysis/coach results are invalidated when inputs reset or evidence is cleared, preventing old requests from repopulating erased results.

## Windows startup

`tools/start-dev.mjs` starts both the Gemini proxy and Angular CLI with `process.execPath`, argument arrays and `shell: false`. Paths containing spaces no longer pass through command-shell quoting. Child startup failures are handled and sibling processes are stopped on failure/shutdown.

## Verification

- TypeScript check passed.
- Angular suite: 138 tests passed, including parser, ordered comparisons, hidden hands, deduplication, learning thresholds, persistent memory, wizard promotion, multi-game briefs and reset during parsing.
- Production build passed; initial bundle 744.48 kB produces the existing 500 kB budget warning.
- Startup script syntax check passed. Full dual-service startup was not exercised against the user's existing development processes.
- `harness validate` could not run because the harness executable is unavailable in this shell.

## Explicit limits

This is an evidence bridge, not a duel simulator or an optimal-play solver. The current replay model lacks complete zone changes, resolutions, paid costs, chain outcomes and later hand reconstruction. Summoning/chaining messages describe observed attempts and do not certify successful resolution. Comparison is consequently limited to observable opening actions; richer curated action sequences can use the same schema as they become available. No causal winrate claim or automatic deck mutation is made.


## Replay Flow creation and catalog filters (2026-09-16)

The replay page accepts a saved deck selection. Embedded Main/Extra snapshots must match exactly, including copies; otherwise analysis reports a mismatch. If no embedded deck exists, the selection supplies the focus deck after checking visible opening cards. Opponent deck information is not invented.

A turn can be converted into a new editable Flow. Observable focus-player actions retain their order and repeated cards. Each creation has a distinct ID to protect prior edits; the document includes YDKE, card snapshots and selected deck identity, then opens via `/flow?flowId=...`. Replay format is recorded as unknown instead of inferred from the shell's current format. This is an observed sequence, not a legal/optimal combo or proof of direct relations between adjacent cards.

GY relationship retrieval now checks recognized target-race restrictions in effect scripts in both directions before ranking and limiting results, including precomputed relations. Popular monster names no longer bypass the deck race gate. Generic spell/trap enablers are retained. Example: [Mezuki's official effect](https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=7359&ope=2&request_locale=en) requires a Zombie target; generic GY tags do not justify a direct relation to a non-Zombie Mermail. Unknown filters and type-changing board effects still require additional contextual analysis.

Flow Builder catalog search supports card type, race/subtype, attribute, exact level/rank, exact ATK/DEF and archetype. Filters are applied in the API request before pagination, form part of cache identity and survive Italian-to-English fallback. A name is optional when filters are active. More results and filter reset are available. API parameter reference: [YGOPRODeck guide](https://ygoprodeck.com/api-guide/).

Verification after these changes: 147 Angular tests passed; production build passed (744.72 kB initial bundle, existing 500 kB budget warning). Local browser UI checked for deck selection and Flow Builder filters. No real replay file was supplied for an end-to-end import; conversion, deck mismatch, non-overwrite and snapshot validation were exercised with fixtures.

## Model check and UI alignment (2026-09-16)

Gemini model catalog re-verified live: fetched the official model list
(https://ai.google.dev/gemini-api/docs/models) and probed the local proxy
against Google with a deliberately invalid key for `gemini-3.6-flash`,
`gemini-3.7-flash`, `gemini-3.8-flash`, `gemini-2.5-flash`. All returned
`API key not valid` (400, before any model routing), confirming the proxy
path and model IDs reach Google correctly; none 404'd as unknown models.
`gemini-2.0-flash`/`gemini-2.0-flash-lite` are confirmed shut down.
`GEMINI_MODEL_OPTIONS` reordered newest-stable-first:
`gemini-3.8-flash, gemini-3.7-flash, gemini-3.6-flash, gemini-2.5-flash-lite,
gemini-2.5-flash, gemini-3-flash-preview` (preview kept last — tighter rate
limits). Default model is now `gemini-3.8-flash`. i18n error copy for
`replay.gemini.error.model` updated to match (en/it). No live authenticated
call was made — no API key is available in this environment; correctness
rests on the official docs fetch plus the unauthenticated-error probe above.

Replay page "Lines" panel (turn selector, create-Flow button, learned-line
comparisons, observed-line memory counter) was restyled to match the rest
of the replay page: wrapped in `app-duel-panel` instead of a bare
`.card`/`.card-body`, comparison entries use the same
`rounded-lg border border-base-300/60 bg-base-200/40` treatment as the
findings list, status uses `badge-success/warning/ghost` instead of plain
text, buttons follow the page's `btn-primary btn-sm` / `btn-ghost btn-xs`
convention. No behavior changed, no new i18n keys needed (all existing).
`tsc --noEmit`, `ng test` (147/147) and `ng build` re-run clean after both
changes. Dual-service `npm start` (gemini-proxy :8787 + ng serve :4200)
verified running together for the first time this session (previously only
syntax-checked) — two orphaned processes from earlier failed attempts had
to be killed first, unrelated to the code itself.

Still open: no real `.yrp3d` file has been run through the UI end-to-end
in a live browser (no browser automation available in this environment).
This remains the one unverified path — needs either a real replay file or
a manual click-through before calling the feature fully done.

## BabelCDB reading and effect-script dataset curation (2026-09-16)

Root cause of a real precision gap (Mezuki correlated with wrong-archetype
monsters like Mermail): the local MDPro3/EDOPro Lua parser
(`tools/card-knowledge-db/src/mdpro-lua-parser.ts`) reads the real vendored
`.lua` source for 13k+ cards, but had no pattern for `CATEGORY_TOGRAVE` +
`Duel.SendtoGrave(...)` from `LOCATION_DECK` — the shape of the single most
common generic GY-enabler effect (Foolish Burial, Armageddon Knight, Dark
Grepher's ignition, Mathematician). Those cards' scripts had empty `steps`,
so the GY-target-race gate in `effect-partner-compatibility.ts` had no
signal to tell "generic enabler" apart from "wrong-archetype revival
target" and conservatively blocked both.

Added a new `mill` op (`EffectOp`, kept in sync between
`tools/card-knowledge-db/src/effect-script-types.ts` and
`src/app/models/effect-script.model.ts`) and a parser branch detecting the
deck-to-grave mill shape independently of the existing hand-cost and
GY-range branches. Re-ran `npm run db:effect-scripts` against the already-synced
local DB and lua cache (fully offline, no network needed) —
**473 cards catalog-wide** gained a real `mill` action they previously had
none for. `effectPartnersCompatible` now exempts any candidate whose own
script contains a deck-mill action from the source's race-target gate,
regardless of the candidate's race — a structural signal, not a guess.

Verified end-to-end against the regenerated dataset (not synthetic
fixtures): Armageddon Knight/Dark Grepher/Mathematician → now correctly
allowed as Mezuki partners; Mermail Abyssmegalo → still correctly rejected;
Gozuki (real Zombie revival target) → still correctly allowed.

BabelCDB cache refreshed (`npm run db:babel -- --force`): 14755 official
cards read (up from a 6-day-old cache), 14201 matched our catalog, 7922
got a setcode. Propagated end to end: `npm run db:relations` (1m31s,
1,766,691 relations stored, 106,539 reinforced by the fresher BabelCDB
setcode groups) → `npm run db:export` (14422 entries, `related.json`
34.17 MB, same order of magnitude as before — no collapse) →
`npm run db:combos` (2098 combos, `combos.json` 12.46 MB). Spot-checked
Mezuki's relations post-regeneration: still 0 Mermail matches, still
correctly includes Gozuki/Uni-Zombie/Zombie Master/Goblin Zombie as real
Zombie targets and Armageddon Knight/Dark Grepher/Mathematician as
generic enablers (now allowed by the `mill`-action exemption). Re-ran
`tsc --noEmit`, 152/152 Angular tests, `ng build` — all clean — after the
regeneration to make sure nothing downstream broke.

## Full local pipeline refresh (2026-09-16, same day)

Ran the remaining chain too: `db:sync` (14565 EN cards from YGOPRODeck,
143 new since the last sync) → `db:babel` (14243 matched, up from 14201)
→ `db:parse-effects` (2888 structured, 10265 mentions) → `db:tag`
(13338 tagged) → `db:format-legality` (14641 cards × 5 formats) →
`db:relations` (1,863,118 relations, 106,850 BabelCDB-reinforced) →
`db:export` (related.json, 14641 entries, 35.20 MB) → `db:export:formats`
→ `db:combos` (2174 combos, 12.94 MB) → `db:effect-scripts` (14641
scripts, 13505 MDPro lua hits, 481 cards now carry a real `mill` action —
up from 473 before the fresh sync added more cards) →
`db:export:passcodes` → `prepare-study-data.mjs`.
`db:tag-llm` is an unimplemented stub (prints a message, exits) — not
part of the pipeline, nothing to run there. `db:mdpro-scripts` was
skipped: its source `C:\Games\MDPro3\Data\script.zip` predates the
existing lua cache, so re-extracting would have produced no new files.

Re-checked Mezuki after this full refresh: still 0 Mermail matches, same
8 real relations (Zombie targets + generic mill enablers). `tsc`, 152/152
tests and `ng build` all clean afterward. Dev server picked up the
refreshed assets via hot reload, no restart needed.

New tests: `tools/card-knowledge-db/src/mdpro-lua-parser.test.ts` (run via
`npm run db:test:mdpro`) covers the deck-mill pattern and confirms a
hand-cost self-summon (Mermail's shape) does NOT trigger it.
`effect-partner-compatibility.spec.ts` covers the exemption both ways.
Verification: `tsc --noEmit` clean, 152/152 Angular tests, `ng build`
clean, `db:test:effects` and `db:test:mdpro` both pass.
