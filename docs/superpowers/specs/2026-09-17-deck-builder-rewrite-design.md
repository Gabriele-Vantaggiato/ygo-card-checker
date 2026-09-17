# Deck Builder rewrite (synergy/completion engine from scratch)

## Why

The existing deck-completion/synergy engine (`DeckCompletionService`, `DeckSuggestionService`,
`synergy-retrieval.utils.ts`, `script-deck-synergy.utils.ts`, `mechanic-synergy.utils.ts`,
`deck-fingerprint.utils.ts`, `babel-category.ts`, and `tools/card-knowledge-db`'s
`mechanic-tags.ts`/`build-relations.ts` SYNERGY_PAIRS) grew through many rounds of patching
regex-derived "tags" and text-substring heuristics. Each fix (Armed Dragon in a Photon/Galaxy
deck, Cyber Laser Dragon via a shared word, Cyber Laser Dragon again via a race/name-substring
gate loophole) uncovered another false positive from the same root cause: correctness depended
on ~6 different scattered heuristics, each independently checking text/name similarity instead
of structured card identity. User decision: remove it entirely and rebuild.

## Architecture

1. **Admissibility gate — deterministic, no text/NLP.** Single pure function decides whether a
   candidate card can ever be suggested for a deck: same official `archetype` string, same
   `setcode` family, or membership in a small curated generic-staple allowlist (hand traps,
   generic removal — maintained by hand, not derived from effect-text regex). This is the only
   place correctness is decided; every suggestion source must go through it.
2. **Ranking — real co-occurrence + LLM.** Within the gated (already-correct) candidate pool,
   rank by:
   - Real tournament decklist co-occurrence (scraped from YGOPRODeck's public tournament pages —
     no bulk API exists; robots.txt has no disallow rules and the API guide states no scraping
     prohibition, only API rate limits/caching requirements, which the scraper respects).
   - Gemini (reusing the existing BYOK `gemini-coach.service.ts` infra) for final ranking and
     natural-language reasoning, grounded ONLY in the gated pool — every returned card id is
     validated against the admissible set before display; quantities are computed in code, never
     dictated by the model.
   - Structured deterministic fallback (gate + co-occurrence only) when Gemini is unavailable —
     never a hard failure.
3. **Deck identity** stays structurally computed (dominant archetype/series from deck cards,
   exact string data) with an optional LLM-authored description on top.
4. **UI**: the "Completa mazzo" dialog and the card-detail "Assist" panel merge into one
   `DeckBuilder` feature. The freeform "Deck Strategy" prompt/direction panel is removed — the
   LLM ranking step already explains its reasoning per suggestion.

## Removed

- `src/app/services/deck-completion.service.ts`, `deck-suggestion.service.ts`
- `src/app/utils/synergy-retrieval.utils.ts`, `script-deck-synergy.utils.ts`,
  `mechanic-synergy.utils.ts`, `deck-fingerprint.utils.ts`, `completion-prompt.utils.ts`
- `tools/card-knowledge-db/src/mechanic-tags.ts` (SYNERGY_PAIRS/tag detection),
  `build-relations.ts`, `babel-category.ts`
- `effect-parser.ts`'s `seriesNamesForCard` archetype-word-matching logic
- The `DeckStrategyStore`/"Deck Strategy" panel and its prompt/direction UI

## Kept

- Raw sync: `sync.ts` (YGOPRODeck catalog), `sync-babelcdb.ts` (setcode/text only, no category
  bitmask decoding)
- `gemini-coach.service.ts` BYOK infra (reused, not rebuilt)

## New

- `tools/card-knowledge-db/src/sync-tournament-decks.ts` — rate-limited scraper building
  `deck_cooccurrence(card_a, card_b, weight)`
- `tools/card-knowledge-db/src/export-gate.ts` — exports structured facts only (archetype,
  setcode, staple allowlist, co-occurrence)
- `src/app/features/deck-builder/` — `deck-builder-gate.util.ts` (pure, exhaustively tested),
  `deck-cooccurrence.service.ts`, `deck-builder-ai.service.ts`, `deck-builder.service.ts`
  (orchestrator), UI components

## Testing

- Gate: exhaustive unit tests, TDD, safety-critical (this replaces 6 scattered checks with one).
- Co-occurrence scoring: unit tests with fixture data.
- AI service: tests cover response validation/fallback only, never the model's actual choices.

## Known risk

Scraping YGOPRODeck's tournament pages has no explicit permission (nor explicit prohibition) —
fragile to markup changes, needs periodic re-verification. Coverage will be partial at first
(only decks/cards YGOPRODeck has indexed tournament results for).
