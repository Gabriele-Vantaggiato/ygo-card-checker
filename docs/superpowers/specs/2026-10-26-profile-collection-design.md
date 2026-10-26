# Profile Collection — Design

Branch: `feature/profile-collection`. Date: 2026-10-26.

## Goal

Add a **Collezione** section to the profile page where a player tracks the physical Yu-Gi-Oh! cards they own, with bulk entry through a live camera scan (Kira TCG style) and a monetary value shown per card and in total.

Out of scope for this spec (later): public sharing of the collection, CSV import/export, condition price multipliers, and the **cart toward sellers (e.g. Cardmarket)** built from decklists + collection. The data model and service API below are designed so the cart can be added without rework (see "Cart readiness").

## Decisions

| Topic | Decision |
|---|---|
| Recognition | Combination: set-code OCR (primary) → card-name OCR (fallback) → artwork hash matching (third level) |
| Price | YGOPRODeck `card_prices` / `set_price`; Cardmarket EUR primary; no external source |
| Per-card data | Full: printing (set code, rarity), quantity, condition, language, 1st Edition, notes |
| Storage | Supabase table + local IndexedDB cache |
| Scan UX | Continuous live session with a review queue, confirm all at the end |

## 1. Data and backend

Supabase table `collection_items`:

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | references auth user |
| passcode | bigint | YGOPRODeck card id |
| set_code | text | e.g. `LOB-EN001` |
| rarity | text | e.g. `Ultra Rare` |
| language | text | derived from set code region, editable |
| condition | text | `NM` \| `LP` \| `MP` \| `HP` \| `DMG`, default `NM` |
| first_edition | boolean | default false |
| quantity | int | >= 1 |
| notes | text | nullable |
| updated_at | timestamptz | |

Unique key: `(user_id, set_code, rarity, language, condition, first_edition)`. A repeated scan of the same printing adds to `quantity`. RLS: a user reads and writes only their own rows. The migration is shown to the user before it is applied.

Services (modelled on `DeckSyncService` / `ProfileService`):
- `CollectionService` — CRUD against Supabase, IndexedDB cache for instant render and offline use, pending offline changes synced on reconnect. Exposes signals for items and totals, plus `ownedQuantity(passcode)` (sum across printings).
- `CollectionPriceService` — resolves a price per printing from YGOPRODeck (`set_price`, fallback to the card's average `cardmarket_price`), cached 24 h. Total value = sum(price x quantity), no condition multiplier in v1.

## 2. Live scan

`CollectionScannerService` opens `getUserMedia` (rear camera) and samples a frame about every 300 ms. Recognition pipeline, per accepted candidate:

1. OCR of the set code (tesseract.js, crop of the region under the artwork) → lookup in `cardsets` → exact printing.
2. On failure: OCR of the card name → card; the printing is chosen during review.
3. On failure: perceptual-hash matching of the artwork against candidates (existing pixelmatch / @huggingface deps).

Acceptance needs 2–3 agreeing frames. A cooldown of about 1.5 s after acceptance prevents counting the same card twice. Feedback on accept: beep, flash, vibration.

Each recognised card enters the **review queue** (thumbnail, name, set, rarity, price, quantity). Condition, language and 1st Edition use defaults (NM / language from set code / no) and are editable in one tap. Matching scans increment quantity. Low-confidence results are queued marked "da verificare" and never silently dropped. "Conferma tutto" saves the queue in one batch.

## 3. UI

- New section in `profile.page.ts`, with logic in separate components to keep that file from growing: `collection-section`, `collection-scanner`, `collection-review-list`.
- Header: total cards, unique cards, estimated value in EUR. Grid/list with filters (set, rarity, condition), search, edit and remove per row, manual add through the existing card search.
- "Scansiona" opens a full-screen panel: camera preview, live queue, confirm.
- Style: DaisyUI as in the rest of the app, `DESIGN.md` as the reference, Italian copy. Particular care on interface cleanliness and UX: generous spacing, one primary action per view, clear empty/loading/error states (per `ui-ux-saas` conventions), mobile-first because scanning is a phone flow.

## 4. Errors and testing

- Camera denied or missing: clear message, fall back to manual add. Logged-out user: section asks to sign in, as the profile already does.
- Network/API failure: queue stays local and can be retried.
- Jasmine unit tests for pure logic: set-code parsing and normalisation (OCR confusions such as `0`/`O`, `1`/`I`), matching against `cardsets`, quantity merge, value computation. The camera pipeline is verified manually in the browser.

## Cart readiness (not built now)

- `ownedQuantity(passcode)` lets a future cart compute `needed = deck copies - owned` for any decklist.
- Printings are stored with `set_code` and `rarity`, which is what seller listings need.
- A future `CartService` can consume decklist + collection and emit per-seller line items; nothing in this feature blocks that.
