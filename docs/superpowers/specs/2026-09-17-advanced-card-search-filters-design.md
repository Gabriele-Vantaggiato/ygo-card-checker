# Advanced card search filters — design

Date: 2026-09-17

## Problem

Card search (decklist editor sidebar, Checker page) only matches by name via
the live YGOPRODeck API. There is no way to narrow results by type, level,
attribute, ATK/DEF range, archetype, or a portion of effect text. Users
building a deck or looking up a card by partial memory of its effect have no
tool for that.

## Scope

- Decklist editor "add cards" sidebar (`decklist-search-sidebar.component.ts`)
- Checker page card search (`checker.store.ts` + `card-search.component.ts`)
- Flow Builder's existing basic filters (`flow-builder.component.ts`) are
  out of scope — untouched, except its type/race/attribute option lists move
  to a shared constant file that Flow Builder keeps consuming.

Plain name-only search (no filters active) is **unchanged**: it keeps hitting
the live YGOPRODeck API exactly as today, IT/EN name resolution included.

## Why not the live API for filters

YGOPRODeck's `cardinfo.php` supports single-value exact filters (`type`,
`race`, `attribute`, `level`, `atk`, `def`, `archetype`) and one-sided numeric
prefixes (`gte`/`lte`), but not a two-sided range in one call, and no
substring search over card text (`desc`). Building this server-side isn't an
option (static Angular app, no backend). A local, pre-built search index
solves both: real min/max ranges and effect-text substring, evaluated
entirely client-side.

## Data pipeline

New export script: `tools/card-knowledge-db/src/export-search-index.ts`
Reads `data/card-knowledge/cards.db` (already synced by `db:sync`/`db:babel`)
and writes a flat array to
`src/assets/data/card-knowledge/search-index.json`:

```ts
interface SearchIndexEntry {
  id: number;
  name: string;      // EN
  type: string;
  race: string | null;
  attribute: string | null;
  level: number | null;
  atk: number | null;
  def: number | null;
  archetype: string | null;
  desc: string;       // EN effect text
}
```

~14,565 entries, estimated ~2 MB gzipped. Kept separate from the existing
`related.json` export (`export.ts`), which serves the synergy/knowledge-graph
features and has a different shape/purpose.

New npm script `db:export:search-index`, added to the `db:build` chain
(after `db:export`, same as the other `db:export:*` steps).

## Frontend

### `CardSearchIndexService` (`src/app/services/card-search-index.service.ts`)

- `loadIndex$(): Observable<SearchIndexEntry[]>` — `HttpClient.get` on the
  asset, `shareReplay({bufferSize:1, refCount:false})`. Called lazily, only
  the first time a consumer activates advanced filters (not at app
  bootstrap).
- `filterIndex(entries, query, filters): number[]` — pure, synchronous.
  - `query` (if present): case-insensitive substring on `name`.
  - `filters.effectText` (if present): case-insensitive substring on `desc`.
  - `type`/`race`/`attribute`/`archetype`: exact match (case-sensitive,
    values come from the same enums the API uses).
  - `levelMin`/`levelMax`, `atkMin`/`atkMax`, `defMin`/`defMax`: inclusive
    range; a card missing the stat (e.g. Spell/Trap has no level) is excluded
    once any bound for that stat is set.
  - Returns matching ids sorted by `name` (locale compare).

### `AdvancedCardSearchFilters` (`src/app/models/card-search-filters.model.ts`)

New interface, additive to the file — does not replace the existing
`CardSearchFilters` (still used by Flow Builder and the direct-API path in
`YgoApiService`):

```ts
interface AdvancedCardSearchFilters {
  type?: string;
  race?: string;
  attribute?: string;
  archetype?: string;
  levelMin?: number;
  levelMax?: number;
  atkMin?: number;
  atkMax?: number;
  defMin?: number;
  defMax?: number;
  effectText?: string;
}

function hasActiveAdvancedFilters(f: AdvancedCardSearchFilters): boolean;
```

### `CardSearchFacade.searchAdvanced$`

```ts
searchAdvanced$(
  query: string,
  filters: AdvancedCardSearchFilters,
  lang: Lang,
  limit: number,
  offset: number,
): Observable<CardSearchPage>
```

1. `indexService.loadIndex$()` (cached after first load).
2. `indexService.filterIndex(entries, query, filters)` → sorted id list.
3. Slice `[offset, offset + limit)` from that id list.
4. `ygoApi.getCardsByIds$(pageIds, lang)` to hydrate real `YgoCard` objects
   (localized name, images, full description) for display — reuses the
   existing batched/cached fetch-by-id path, chunked at 25 ids.
5. `totalRows` = full filtered id list length; `hasMore` = `offset + limit <
   totalRows`. Both computed client-side, no extra network round-trip.

Result shape matches the existing `CardSearchPage`, so both integration
points reuse their current rendering/pagination code paths unchanged.

### Shared filter options

`src/app/models/card-search-options.ts` (new): `SEARCH_TYPES`,
`SEARCH_RACES`, `SEARCH_ATTRIBUTES` constants, extracted from
`flow-builder.component.ts`'s inline arrays. Flow Builder switches to
importing these instead of its local copies; no behavior change there.

### `CardSearchFiltersPanelComponent`

New shared component: `src/app/shared/ui/card-search-filters-panel/`.

- Inputs: current `AdvancedCardSearchFilters` value.
- Outputs: filter changes (per-field, debounced upstream by the parent like
  existing search debouncing), reset.
- Fields: type/race/attribute selects, archetype text input, level/atk/def
  min-max number input pairs, effect-text input.
- Presentational only — no API/index access itself.

### Toggle + badge

Both integration points get a "Filtri" button next to the search input that
opens/closes the panel and shows a badge with the count of active filters
(`Object.keys` over the non-empty fields). Panel collapses by default.

### Integration: `decklist-search-sidebar.component.ts`

- New signal `advancedFilters = signal<AdvancedCardSearchFilters>({})`.
- `hasAdvancedFilters = computed(...)`.
- Search pipeline branches: when `hasAdvancedFilters()` is true, call
  `cardSearch.searchAdvanced$(query, filters, lang, limit, offset)` instead
  of `cardSearch.searchPage$(query, lang, limit, offset)`. `loadMore()`
  branches the same way. Everything downstream (legality evaluation, sorting,
  quick-add, empty states) is unchanged since the page shape is identical.

### Integration: Checker page

- `checker.store.ts` gains the same `advancedFilters` signal/state next to
  the existing `query`/`searchIntent$`.
- The search intent pipeline (around the existing `ygoApi.searchCards$` call,
  `checker.store.ts:201`) branches to `cardSearch.searchAdvanced$` the same
  way.
- `card-search.component.ts` (presentational) gets the filters panel added
  next to its input; no changes to its existing dropdown/list rendering
  logic since it just receives `suggestions`/`loading` as before.

## Error handling / edge cases

- Index fetch failure: `catchError(() => of([]))` — advanced search yields
  zero results rather than breaking the page; existing empty-state UI
  (`search.noResults`) covers it.
- A range with only `min` or only `max` set is a one-sided bound (as today's
  behavior on the live API's `gte`/`lte`).
- Switching off the last active filter (back to plain query, or empty
  everything) reverts to the live-API path on the next keystroke/reload —
  no stale local-index results shown.
- Cards missing a stat used in a range filter (e.g. Spell/Trap and
  level/atk/def) are excluded once that filter is active, not treated as 0.
- Index is loaded once per app session (`shareReplay`) and reused across both
  integration points if both are visited.

## Testing

- `card-search-index.service.spec.ts`: unit tests for `filterIndex` — each
  filter kind, combinations, range edge cases (only-min, only-max, missing
  stat), case-insensitivity on name/desc substring.
- `card-search.facade.spec.ts` (extend): `searchAdvanced$` pagination
  (`offset`/`limit` slicing, `hasMore`), hydration via a mocked
  `getCardsByIds$`.
- `export-search-index.ts`: no automated test (matches the existing
  `export.ts`/`export-format-legality.ts` scripts, which are unowned by the
  Angular test suite) — verified manually by running it and checking
  `search-index.json` row count against `meta.json.totalCards`.
- Manual verification: `npx ng test`, `npx ng build`, then exercise both
  integration points in a running `ng serve` — combination of level range +
  attribute + effect-text substring in the decklist sidebar and in Checker.
