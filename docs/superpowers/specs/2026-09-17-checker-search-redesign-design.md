# Checker/Decklist search redesign — design

Date: 2026-09-17

## Problem

The advanced-filters feature shipped earlier today (see
`2026-09-17-advanced-card-search-filters-design.md`) works but the UX is
confusing: an inline filter block that pushes the layout down, a separate
"effect text" field duplicating the name box, and an empty results area with
static "starter" chips until the user types something. User feedback:
mixed-up layout, not user-friendly.

This spec supersedes that design's UI/interaction pieces (data-layer pieces —
`search-index.json`, `CardSearchIndexService`, `searchAdvanced$` — are kept
and extended, not replaced).

## Scope

- Checker page (`checker.store.ts`, `card-search.component.ts`,
  `checker.page.ts`)
- Decklist editor "add cards" sidebar (`decklist-search-sidebar.component.ts`)
- Shared: `CardSearchFiltersPanelComponent`, `CardSearchFacade`,
  `CardSearchIndexService`, `AdvancedCardSearchFilters`

Both pages get the same interaction pattern and share the same filter drawer
component.

## Behavior changes

1. **Default browse list.** With no query and no filters, both pages show
   cards legal in the currently selected format (paginated), instead of an
   empty state. Switching format recomputes this list when no query/filters
   are active.
2. **Combined name+effect search, on submit.** The single text box now
   matches card name OR effect text (substring, case-insensitive). It no
   longer searches on every keystroke — only on Enter or a search-button
   click. This replaces the dedicated "effect text" filter field, which is
   removed.
3. **Filters update immediately.** Selecting a filter (type/race/attribute)
   or editing a numeric range still triggers a search right away (small
   debounce on numeric typing), same as today.
4. **Scope of query/filter search: the full catalog, not just the selected
   format's legal pool.** The format-legal restriction applies only to the
   empty default list — the Checker's job is to look up *any* card's
   legality, including ones not legal in the current format. Legality badges
   on result rows already communicate ban/format status.
5. **Filters panel becomes a drawer**, opened by a "Filtri" button, instead
   of an inline block that pushes the page layout down.

## Data layer

### `CardSearchIndexService.filterIndex` — OR semantics for the query

Currently `query` matches only `name`; `filters.effectText` separately
matches `desc`. Both collapse into one check: a non-empty `query` matches if
it's a substring of `name` **or** `desc` (case-insensitive). The
`effectText` field is removed from `AdvancedCardSearchFilters` entirely (and
from `normalizeAdvancedSearchFilters`/`hasActiveAdvancedFilters`).

### `CardSearchFacade.browseFormat$`

```ts
browseFormat$(
  formatId: string,
  lang: Lang,
  limit: number,
  offset: number,
): Observable<CardSearchPage>
```

1. Combines `CardSearchIndexService.loadIndex$()` (already used for
   `searchAdvanced$`) with `CardKnowledgeIndexService.formatLegality$`
   (already loaded/cached elsewhere in the app for legality checks — no new
   HTTP fetch).
2. Builds the set of card ids whose `playable` entry includes `formatId`.
3. Filters the search index to that id set, sorted by name — a new
   `CardSearchIndexService.sortIdsWithin(entries, idSet)` helper (pure,
   parallel to `filterIndex`).
4. Paginates and hydrates via the same private helper `searchAdvanced$`
   already uses (`ygoApi.getCardsByIds$`, reordered to match the page's id
   order). That helper is extracted so both methods share it.

If `formatLegality$` resolves `null` (fetch failure), `browseFormat$` yields
an empty page rather than throwing — consistent with how the rest of the
knowledge-index consumers already treat a failed load.

## Frontend interaction

### Search trigger model (both pages)

- A local `pendingQuery` signal holds the input's live text (for display —
  `[value]` binding), decoupled from what actually triggers a search.
- Enter keydown or a search-button click calls `runSearch(pendingQuery())`.
- Filter changes call `runSearch(pendingQuery())` immediately (through the
  existing debounce-per-emission mechanism already in place).
- `runSearch(query)` decides the source exactly as `searchAdvanced$`/
  `searchPage$` did before, plus the new default case:
  - no query and no active filters → `browseFormat$(currentFormatId, ...)`
  - query and/or active filters → `searchAdvanced$(query, filters, ...)`
- Component init (and format change while idle) calls `runSearch('')` to
  populate the default list.

This removes the old live-as-you-type `search$`/`searchIntent$` debounce
tied to every keystroke in the name box; the debounce now guards only
rapid filter-field edits.

### `CardSearchComponent` (Checker)

- Adds a search button (magnifying glass) next to the input.
- Enter now calls `runSearch()` instead of selecting the first listed card
  (that shortcut is dropped — it stops making sense once Enter always means
  "search").
- `hasResults()`/list rendering simplifies: the page always has a
  `suggestions` array to show (default list, or search/filter results), so
  the component no longer special-cases "query too short" — it just renders
  `suggestions()`, with a loading skeleton while a fetch is in flight and a
  "no results" state when a real search/filter genuinely returns nothing.
- The static "starter chip" quick-search suggestions are removed — the
  default legal-card list replaces them as the landing content.

### `DecklistSearchSidebarComponent`

Same trigger model. Quick-add (`+` button per row) and existing legality
evaluation, sorting, and pagination (`loadMore`) are unchanged — they operate
on whatever `searchResults()` currently holds, regardless of source
(default list, filtered, or searched).

### `CardSearchFiltersPanelComponent` → drawer

- Renders as a fixed-position overlay with a backdrop (click-to-close),
  closes on Escape and on an explicit "Chiudi" button.
- Same fields as before minus `effectText`: type, race, attribute,
  archetype, level/ATK/DEF min-max pairs — grouped under short section
  labels for scannability.
- Opened via a "Filtri" toggle button (unchanged trigger, changed
  presentation) showing the active-filter count badge.

## Error handling / edge cases

- `browseFormat$` with an unset/unknown `formatId` (format list not loaded
  yet) yields an empty page; the list populates once `FormatStore` resolves
  a real format and the component re-runs the default query.
- Clearing the query back to empty (with no filters) re-triggers the default
  browse list on next submit, not an empty state.
- A search or filter combination that legitimately matches nothing shows the
  existing "no results" message, distinct from the loading state.

## Testing

- `card-search-index.service.spec.ts`: update `filterIndex` tests for OR
  name/desc matching; remove `effectText`-specific case; add
  `sortIdsWithin` tests (subset + sort order).
- `card-search-filters.model.spec.ts`: remove `effectText` assertions.
- `card-search.facade.spec.ts`: add `browseFormat$` tests (id-set built from
  a mocked `formatLegality$`, pagination/hydration reusing the shared
  helper — mirrors the existing `searchAdvanced$` tests).
- `card-search.component.spec.ts`: update for the new render-suggestions-
  always model; add a test for the search button/Enter triggering
  `queryChange`/a submit output rather than auto-searching on input.
- `decklist-search-sidebar.component.spec.ts`, `checker.store.spec.ts`:
  update existing filter-branch tests for the submit-triggered model; add a
  default-list-on-init test.
- Manual: `npx ng build`, then exercise both pages in `ng serve` — default
  list on load, format switch while idle, filters drawer open/close, Enter
  search matching an effect-text fragment, quick-add still works.
