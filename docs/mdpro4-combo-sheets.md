# Combo sheets (MDPro4 1.0.6)

Inspected locally on 2026-11-02: `C:/Games/MDPro4/Data/Combos/README.md`,
`Examples/chimera.json` and `Examples/chaos-ritual.json`. The updater initially
held these files in the 1.0.6 update ZIP; it completed during inspection.
The installed `Data/client-version.txt` reads `1.0.6`.

The teaching-sheet schema uses `schemaVersion: 1`, a sheet identity and metadata,
tabs containing combo variants, starting/end/required/interruption card lists,
card notes, ordered steps, and optional start/end/step diagrams. A diagram retains
each card occurrence, connector (`none`, `arrow`, `plus`, `or`), action, zone and caption.
Passcode zero means generic material. These are teaching procedures, not replays.

Both complete shipped examples pass the website validator: Chimera has 3 tabs
and 15 variants; Chaos Ritual has 4 tabs and 9 guides. The reduced Chimera fixture
retains the first complete guide for round-trip regression coverage, including
the original author credit (MDPro4 examples / Drident). Its provenance is the local
installation; no website artwork is copied. Original source credit in MDPro4:
https://www.masterduelmeta.com/spreadsheet/6a269450d654689b59c9d8ac.

Website entry: `/combo`, replacing the former card-centered standalone Combo
page and retaining the original single navigation item. `/combo-sheets` redirects
to `/combo`. Existing card detail links select sheets containing that card;
creating a sheet from that context seeds the opening card. Deck editor links
carry the selected `deckId` into the sheet generator.
The website's own Dino Rabbit example is independent teaching content. Imported
files receive fresh local IDs. Exports retain the native schema and annotations;
unknown JSON properties are preserved through cloning and export. This confirms
JSON compatibility with shipped examples. Native local-draft loading has also
been verified in the installed MDPro4 1.0.6 UI. Storage is browser-local under `ygo-combo-sheets-v1`.
The library preserves unreadable storage and keeps failed writes exportable.
Imports are limited to 2 MB, with bounded structures validated before saving.

The website editor covers sections, variants, metadata, requirements, step order
and step diagram occurrences. Imported start/end diagrams and card notes remain
visible and are retained; changing the corresponding start/end card list replaces
its diagram with the new simple card list. Card names have an offline English
catalog fallback, with localized online resolution. The editor also searches the
local English catalog by card name or passcode. Images require network access.

## Verification

- Production Angular build passes (existing global initial-bundle warning at
  approximately 1.02 MB against the 500 kB warning threshold).
- Archive, generation, source import and interchange regression tests pass.
- `harness validate` passes from the parent repository root.
- Browser check at `http://127.0.0.1:4201/combo-sheets`: opened the website example,
  duplicated it, edited a diagram caption, saved, reloaded, reopened and verified
  the changed caption. Downloaded JSON validates and retains the change.
- Imported the complete installed MDPro4 Chimera sheet through the file picker:
  all three tabs / fifteen variants are available, with diagrams and annotations.
- Local name search returns Rescue Rabbit. The demo remains open in the browser.
- Website export successfully loaded in MDPro4's My combo sheets, including card diagrams.

## Generation from a deck

`combo-sheet-generation.ts` assembles bounded sheets from three distinct sources:

1. The supported Rabbit recipe checks Rabbit in Main, at least two Sabersaurus
   in Main, and Laggia/Dolkka in Extra independently. Side cards never satisfy
   those requirements. The data-driven recipe matcher also covers ten Zombie
   procedures, checking Main/Extra copy counts, named opening cards, cards that
   must remain in the Deck, and generic hand-cost availability. This is procedure
   selection, not general combo discovery.
2. Local replay observations must match the exact Main/Extra fingerprint. Different
   opening hands, master rules and turns stay separate, repeated actions remain,
   duplicate replay IDs do not inflate evidence, and impossible opening-hand
   quantities or unavailable action cards exclude a line. These are recorded
   actions, not proof of resolution, format compatibility, or an endboard.
3. `EffectScriptService.ensureStudyLoaded$()` supplies conditional effect worksheets
   for up to twenty distinct Main Deck starters. Costs and conditions remain in
   text; these are explicitly drafts, never asserted as a connected sequence.
   No target or final board is invented. The unused legacy textual flows catalog
   is deliberately not used as a generator: it includes unreliable sequences.

Decks imported through APIs or text use the same `DecklistStore`, so their origin
does not change generation. The generator captures the deck version and selected
format context, reports effect coverage and abstains if no source is available.
It does not certify format legality. Generation from a saved deck opens a reviewable
draft; the single-step YDKE import/generate action also saves the generated result.
Results arriving after another sheet is opened or
after navigation are discarded.

The local study metadata currently covers 14,641 card records, 5,965 with steps
and 284 tagged starters. This measures data availability, not rules completeness.
General logical combo discovery still needs a state-transition search: exact
zones/copies, paid costs, Normal Summon usage, once-per-turn flags, target
predicates, materials, restrictions and chain/trigger timing. The existing
assistance and replay-restriction engines are useful inputs but do not collectively
implement that simulator. A language model can propose candidate routes; a rules
executor would still have to verify them before they are labeled validated.

Follow-up verification: twelve archive/generation tests pass and production build
passes (same global initial-bundle warning). In the browser, created a separate
minimal test deck via the normal text importer, followed its Combo link, generated
both Rabbit variants, and saved the result. The importer applied the selected
format's Rabbit copy cap. The deck is a deliberately incomplete test fixture,
not a competitive deck recommendation. Harness validation passes at repo root.

## Real Zombie deck and native MDPro4 verification

The user's exact YDKE is retained in `src/test-fixtures/combo-sheets/user-deck.ydke`.
It contains 42 Main, 15 Extra and 15 Side cards. Browser import created
`Zombie Synchro · mazzo reale`; its actual deck editor shows 72 cards with all
three original section counts. Snapshot import uses the opt-in `preserveSource`
mode: no banlist-based dropping/capping, no partial resolution, and Main/Side
occurrences remain separate. Legality annotations remain attached. Existing
normal-import behavior is unchanged.

The real deck generated ten authored procedures and one separate effect worksheet,
39 total instructional entries. Procedures were checked against the installed
English MDPro4 card database. Important constraints are explicit: Goblin Zombie
does not search when detached as Xyz Material; Mezuki searched by Goblin is in
hand, not on the field; Plaguespreader banishes itself only after its own revival;
Pain Painter/Archfiend Zombie-Skull needs two non-Tuners; Super Polymerization is
conditional on two actual usable monsters already on the field. No native duel
execution or blanket interruption validation is claimed.

Created a native local draft through the MDPro4 UI to observe the real envelope:
`id`, `remoteId`, `remoteOwnerId`, `remoteRevision`, `updated` (Unix seconds),
`sheet` and `pending`. Export now writes this envelope with matching UUIDs,
empty `sourceUrl`, and null publication state, using `<id>.json`. Raw sheet JSON
remains a separate export. Both shapes can be imported by the website.

Native destination: `%USERPROFILE%/AppData/LocalLow/YGO/MDPro4/ComboSheets/drafts`.
The full exported draft `667da786-6155-42b1-adf2-29ae981015c1.json` was copied there
without replacing an existing file. Verified in MDPro4 UI via Deck → submenu →
Combo Sheets → My combo sheets → Combo · Zombie Synchro · mazzo reale. Both tabs
and the first procedure's starting-card diagram render. A copy is retained in
`output/combo-sheets/`. The empty native draft created solely to observe the
envelope was archived with an `.empty-test-backup` extension.

The reusable authored recipe source is `tools/build/author-zombie-combo-recipes.mjs`;
the runtime catalog is `src/assets/data/combo-sheets/deck-recipes.json`. Matching
depends on the actual card sections/copies, not deck title or an exact sample
fingerprint. Removing Beelze or moving Pain Painter to Side removes the dependent
routes. Native local loading proves format compatibility; online publication was
not performed.

Final checks: 36 ChromeHeadless tests pass across archive, recipe matching,
generation, MDPro4 envelopes, exact YDKE snapshot import and YDKE encoding.
Production build passes with the existing initial-bundle size warning; Harness
validation and diff whitespace checks pass. Browser remains on the real deck's
Combo page (`deckId=0b069119-47a0-4dbb-831b-6843c4f71d0f`). The exact YDK is also
available in MDPro4's Deck directory under the new, non-overwriting name
`Zombie Synchro - YGOCardChecker.ydk`.
