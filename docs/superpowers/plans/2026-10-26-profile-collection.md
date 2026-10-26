# Profile Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Collezione" section to the profile page: physical cards the player owns (printing, quantity, condition, language, 1st Edition, notes), bulk entry through a live camera scan, and a Cardmarket EUR value per card and in total.

**Architecture:** Pure utils (set-code parsing, name matching, scan consensus, collection merge/totals) are test-first. `CollectionService` stores items in Supabase (`collection_items`, RLS) with an IndexedDB cache and an offline pending queue. A `CollectionScannerService` runs a camera loop (guide-frame crop → tesseract OCR → set-code lookup, name fallback) and emits detections into a review queue UI. UI is three standalone components mounted from `profile.page.ts`.

**Tech Stack:** Angular 20 (standalone, signals, OnPush, inline templates), DaisyUI 5 / Tailwind 4, Supabase JS, tesseract.js (existing `CardScreenOcrService`), YGOPRODeck API v7, Karma + Jasmine.

## Global Constraints

- Repo/branch: `C:\Users\adani\Desktop\YGOChecker\ygo-card-checker`, branch `feature/profile-collection`.
- UI copy in **Italian**; code identifiers/comments in English. Follow existing style: 2-space indent, single quotes, `inject()`, `ChangeDetectionStrategy.OnPush`, signals.
- Reuse existing CSS utility classes from `src/styles.css`: `page-stack`, `section-title`, `empty-state`, `empty-state-title`, `empty-state-hint`, plus DaisyUI `btn`, `input`, `select`, `badge`, `loading`.
- Condition values: `NM` | `LP` | `MP` | `HP` | `DMG` (default `NM`). Languages: `EN IT FR DE ES PT JP KR AE`.
- Unique key of an item: `(user_id, set_code, rarity, language, condition, first_edition)`; same key = add to quantity.
- Price source: YGOPRODeck `card_prices[0].cardmarket_price` (EUR, **per card, not per printing**); missing/`0.00` ⇒ `null` shown as "n/d". No condition multiplier. Total = sum(price × quantity) over priced items.
- Set-code lookup: `GET https://db.ygoprodeck.com/api/v7/cardsetsinfo.php?setcode=<CODE>` returns `{id,name,set_name,set_code,set_rarity,set_price}` or `{"error":...}` (HTTP 400). Full printings come from `cardinfo.php?id=<id>` → `card_sets[]` (`set_name,set_code,set_rarity,set_rarity_code,set_price`).
- `images.ygoprodeck.com` sends **no CORS headers**: canvas pixel reads of those images are tainted. Level 3 (artwork-hash matching) is therefore **out of this plan** and needs an image proxy (follow-up decision).
- Out of scope: public sharing, CSV import/export, price multipliers, the cart toward sellers.
- Unit-test command (single file): `npx ng test --watch=false --browsers=ChromeHeadless --include='<spec path>'`. Type-check: `npx ng build --configuration development`.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|---|---|
| `src/app/models/ygo-card.model.ts` (modify) | add `CardSet`, `CardPrice`, optional `card_sets`/`card_prices` on `YgoCard` |
| `src/app/models/collection.model.ts` (create) | `CollectionItem`, `CollectionDraft`, `ScanQueueEntry`, `ScanDetection`, condition/language constants |
| `src/app/utils/set-code.utils.ts` (+spec) | parse OCR text into set-code candidates + language |
| `src/app/utils/name-match.utils.ts` (+spec) | clean OCR name, similarity, best match |
| `src/app/utils/scan-consensus.utils.ts` (+spec) | N-of-M frame agreement + per-key cooldown |
| `src/app/utils/scan-geometry.utils.ts` (+spec) | guide-frame rectangle (fractions of the video) |
| `src/app/utils/collection.utils.ts` (+spec) | key, merge, patch, price extraction, totals |
| `supabase/migrations/20261026120000_collection_items.sql` (create) | table + RLS |
| `src/app/services/collection-cache.service.ts` | IndexedDB key/value cache |
| `src/app/services/collection.service.ts` | CRUD, offline queue, signals |
| `src/app/services/cardset-lookup.service.ts` | set code / name → card + printings |
| `src/app/services/collection-price.service.ts` | Cardmarket EUR per passcode, 24 h cache |
| `src/app/services/card-screen-ocr.service.ts` (modify) | add `recognizeText(canvas)` |
| `src/app/services/collection-scanner.service.ts` | camera loop + recognition pipeline → `detections$` |
| `src/app/features/profile/components/collection-review-list.component.ts` | editable queue rows (dumb) |
| `src/app/features/profile/components/collection-scanner.component.ts` | full-screen scan panel + manual add |
| `src/app/features/profile/components/collection-section.component.ts` | profile section: stats, filters, list, edit |
| `src/app/features/profile/pages/profile.page.ts` (modify) | mount `<app-collection-section />` |

---

### Task 1: Models and set-code parsing

**Files:**
- Modify: `src/app/models/ygo-card.model.ts`
- Create: `src/app/models/collection.model.ts`, `src/app/utils/set-code.utils.ts`
- Test: `src/app/utils/set-code.utils.spec.ts`

**Interfaces:**
- Produces: `CardSet`, `CardPrice`, `CollectionItem`, `CollectionDraft`, `ScanQueueEntry`, `ScanDetection`, `CARD_CONDITIONS`, `CARD_LANGUAGES`, `CardCondition`, `CardLanguage`; `parseSetCode(text: string): ParsedSetCode | null` where `ParsedSetCode = { candidates: string[]; language: CardLanguage }`.

- [ ] **Step 1: Extend the card model**

In `src/app/models/ygo-card.model.ts`, add after `MiscInfo`:

```ts
export interface CardSet {
  set_name: string;
  set_code: string;
  set_rarity: string;
  set_rarity_code?: string;
  set_price?: string;
}

export interface CardPrice {
  cardmarket_price?: string;
  tcgplayer_price?: string;
  ebay_price?: string;
  amazon_price?: string;
  coolstuffinc_price?: string;
}
```

and inside `YgoCard`, after `misc_info?: MiscInfo[];`:

```ts
  card_sets?: CardSet[];
  card_prices?: CardPrice[];
```

- [ ] **Step 2: Create the collection model**

`src/app/models/collection.model.ts`:

```ts
import { CardSet, YgoCard } from './ygo-card.model';

export const CARD_CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;
export type CardCondition = (typeof CARD_CONDITIONS)[number];

export const CARD_LANGUAGES = ['EN', 'IT', 'FR', 'DE', 'ES', 'PT', 'JP', 'KR', 'AE'] as const;
export type CardLanguage = (typeof CARD_LANGUAGES)[number];

export interface CollectionItem {
  id: string;
  passcode: number;
  cardName: string;
  setCode: string;
  rarity: string;
  language: CardLanguage;
  condition: CardCondition;
  firstEdition: boolean;
  quantity: number;
  notes: string | null;
  updatedAt: string;
}

export type CollectionDraft = Omit<CollectionItem, 'id' | 'updatedAt'>;

/** A scanned/manual card waiting in the review queue before being saved. */
export interface ScanQueueEntry extends CollectionDraft {
  tempId: string;
  printings: CardSet[];
  needsReview: boolean;
}

export interface ScanDetection {
  card: YgoCard;
  printings: CardSet[];
  setCode: string;
  language: CardLanguage;
  source: 'code' | 'name';
  needsReview: boolean;
}
```

- [ ] **Step 3: Write the failing test**

`src/app/utils/set-code.utils.spec.ts`:

```ts
import { parseSetCode } from './set-code.utils';

describe('parseSetCode', () => {
  it('parses a modern English code', () => {
    expect(parseSetCode('LOB-EN005')).toEqual({ candidates: ['LOB-EN005'], language: 'EN' });
  });

  it('adds the English equivalent for other languages', () => {
    expect(parseSetCode('SDY-IT006')).toEqual({ candidates: ['SDY-IT006', 'SDY-EN006'], language: 'IT' });
  });

  it('parses legacy single-letter regions', () => {
    expect(parseSetCode('LOB-I005')).toEqual({ candidates: ['LOB-I005', 'LOB-EN005'], language: 'IT' });
  });

  it('tolerates case and spaces around separators', () => {
    expect(parseSetCode('lob - en 005')?.candidates[0]).toBe('LOB-EN005');
  });

  it('fixes O/I/L confusions inside the number', () => {
    expect(parseSetCode('LOB-ENOO5')?.candidates[0]).toBe('LOB-EN005');
    expect(parseSetCode('LOB-ENO1L')?.candidates[0]).toBe('LOB-EN011');
  });

  it('ignores surrounding words', () => {
    expect(parseSetCode('1ST EDITION LOB-EN005\nfoo')?.candidates[0]).toBe('LOB-EN005');
  });

  it('accepts four-character prefixes', () => {
    expect(parseSetCode('RA01-EN001')?.candidates[0]).toBe('RA01-EN001');
  });

  it('returns null for unknown regions, short numbers and noise', () => {
    expect(parseSetCode('LOB-XX005')).toBeNull();
    expect(parseSetCode('LOB-EN05')).toBeNull();
    expect(parseSetCode('hello world')).toBeNull();
    expect(parseSetCode('')).toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/utils/set-code.utils.spec.ts'`
Expected: FAIL (cannot find module `./set-code.utils`). If `ChromeHeadless` is not found, stop and report the Karma launcher problem to the user.

- [ ] **Step 5: Implement**

`src/app/utils/set-code.utils.ts`:

```ts
import { CardLanguage } from '../models/collection.model';

export interface ParsedSetCode {
  /** Lookup order: the code as printed first, then its English equivalent. */
  candidates: string[];
  language: CardLanguage;
}

const REGION_LANGUAGE: Readonly<Record<string, CardLanguage>> = {
  EN: 'EN', E: 'EN',
  IT: 'IT', I: 'IT',
  FR: 'FR', F: 'FR',
  DE: 'DE', G: 'DE',
  SP: 'ES', S: 'ES',
  PT: 'PT', P: 'PT',
  JP: 'JP', J: 'JP',
  KR: 'KR', K: 'KR',
  AE: 'AE',
};

const SET_CODE_RE = /(?<![A-Z0-9])([A-Z0-9]{2,5})-([A-Z]{1,2})([0-9OIL]{3})(?![0-9A-Z])/;

/** Reads a printed set code (e.g. `LOB-EN005`) out of noisy OCR text. */
export function parseSetCode(text: string): ParsedSetCode | null {
  const normalized = text
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\b([A-Z]{1,2})\s+([0-9OIL]{3})\b/g, '$1$2');

  const match = SET_CODE_RE.exec(normalized);
  if (!match) {
    return null;
  }

  const [, prefix, region, rawNumber] = match;
  const language = REGION_LANGUAGE[region];
  if (!language) {
    return null;
  }

  const number = rawNumber.replace(/O/g, '0').replace(/[IL]/g, '1');
  const printed = `${prefix}-${region}${number}`;
  const english = `${prefix}-EN${number}`;
  return { candidates: printed === english ? [printed] : [printed, english], language };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run the Step 4 command. Expected: 8 specs, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add src/app/models src/app/utils/set-code.utils.ts src/app/utils/set-code.utils.spec.ts
git commit -m "feat(collection): models and set-code parser"
```

---

### Task 2: Name matching, scan consensus, scan geometry

**Files:**
- Create: `src/app/utils/name-match.utils.ts`, `src/app/utils/scan-consensus.utils.ts`, `src/app/utils/scan-geometry.utils.ts`
- Test: `src/app/utils/name-match.utils.spec.ts`, `src/app/utils/scan-consensus.utils.spec.ts`, `src/app/utils/scan-geometry.utils.spec.ts`

**Interfaces:**
- Produces: `cleanOcrName(text): string | null`, `normalizeName(s): string`, `similarity(a,b): number`, `bestNameMatch<T extends {name:string}>(ocr: string, cards: readonly T[], minScore = 0.6): T | null`; `class ScanConsensus { constructor(options: ConsensusOptions); push(key: string | null, now: number): string | null }`; `guideRect(vw, vh): {x,y,w,h}` (fractions), `CARD_ASPECT`.

- [ ] **Step 1: Write the failing tests**

`src/app/utils/name-match.utils.spec.ts`:

```ts
import { bestNameMatch, cleanOcrName, normalizeName, similarity } from './name-match.utils';

describe('name-match utils', () => {
  it('cleanOcrName picks the line with the most letters', () => {
    expect(cleanOcrName('  \n Dark Magician \n 2500')).toBe('Dark Magician');
  });

  it('cleanOcrName returns null when nothing readable', () => {
    expect(cleanOcrName(' \n 12 \n')).toBeNull();
  });

  it('normalizeName strips accents, case and punctuation', () => {
    expect(normalizeName('Éclair-Dragon!')).toBe('eclair dragon');
  });

  it('similarity is 1 for equal names and drops with edits', () => {
    expect(similarity('Dark Magician', 'dark magician')).toBe(1);
    expect(similarity('Dark Magicjan', 'Dark Magician')).toBeGreaterThan(0.85);
    expect(similarity('abc', 'xyz')).toBe(0);
  });

  it('bestNameMatch returns the closest card above the threshold', () => {
    const cards = [{ name: 'Dark Magician' }, { name: 'Dark Magician Girl' }];
    expect(bestNameMatch('Dark Magicjan', cards)).toEqual({ name: 'Dark Magician' });
  });

  it('bestNameMatch returns null below the threshold', () => {
    expect(bestNameMatch('Blue-Eyes', [{ name: 'Dark Magician' }])).toBeNull();
  });
});
```

`src/app/utils/scan-consensus.utils.spec.ts`:

```ts
import { ScanConsensus } from './scan-consensus.utils';

describe('ScanConsensus', () => {
  const make = () => new ScanConsensus({ required: 2, windowSize: 4, cooldownMs: 1500 });

  it('does not accept a single read', () => {
    expect(make().push('A', 0)).toBeNull();
  });

  it('accepts after two agreeing reads', () => {
    const c = make();
    c.push('A', 0);
    expect(c.push('A', 300)).toBe('A');
  });

  it('tolerates noise between agreeing reads', () => {
    const c = make();
    c.push('A', 0);
    c.push('B', 300);
    expect(c.push('A', 600)).toBe('A');
  });

  it('does not count a card that stays in front of the camera twice', () => {
    const c = make();
    c.push('A', 0);
    expect(c.push('A', 300)).toBe('A');
    for (let t = 600; t <= 6000; t += 300) {
      expect(c.push('A', t)).toBeNull();
    }
  });

  it('accepts the same card again after it left for longer than the cooldown', () => {
    const c = make();
    c.push('A', 0);
    c.push('A', 300);
    c.push(null, 600);
    expect(c.push('A', 3000)).toBeNull();
    expect(c.push('A', 3300)).toBe('A');
  });

  it('accepts a different card right after the previous one', () => {
    const c = make();
    c.push('A', 0);
    c.push('A', 300);
    c.push('B', 600);
    expect(c.push('B', 900)).toBe('B');
  });
});
```

`src/app/utils/scan-geometry.utils.spec.ts`:

```ts
import { guideRect } from './scan-geometry.utils';

describe('guideRect', () => {
  it('fits a portrait stream by width', () => {
    const r = guideRect(720, 1280);
    expect(r.w).toBeCloseTo(0.94, 2);
    expect(r.x).toBeCloseTo(0.03, 2);
    expect(r.h).toBeCloseTo(0.771, 2);
    expect(r.y).toBeCloseTo((1 - r.h) / 2, 3);
  });

  it('fits a landscape stream by height', () => {
    const r = guideRect(1280, 720);
    expect(r.h).toBeCloseTo(0.88, 2);
    expect(r.w).toBeCloseTo(0.34, 2);
    expect(r.x).toBeCloseTo((1 - r.w) / 2, 3);
  });

  it('keeps the card aspect ratio in pixels', () => {
    const r = guideRect(1000, 1000);
    expect((r.w * 1000) / (r.h * 1000)).toBeCloseTo(59 / 86, 3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/utils/{name-match,scan-consensus,scan-geometry}.utils.spec.ts'`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the three utils**

`src/app/utils/name-match.utils.ts`:

```ts
/** Picks the most name-like line of an OCR blob (most letters, at least 3). */
export function cleanOcrName(text: string): string | null {
  let best: string | null = null;
  let bestLetters = 2;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const letters = (trimmed.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
    if (letters > bestLetters) {
      best = trimmed;
      bestLetters = letters;
    }
  }
  return best;
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length];
}

/** 1 = identical after normalisation, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  const longest = Math.max(x.length, y.length);
  if (longest === 0) {
    return 0;
  }
  return 1 - levenshtein(x, y) / longest;
}

export function bestNameMatch<T extends { name: string }>(
  ocrName: string,
  cards: readonly T[],
  minScore = 0.6,
): T | null {
  let best: T | null = null;
  let bestScore = minScore;
  for (const card of cards) {
    const score = similarity(ocrName, card.name);
    if (score >= bestScore) {
      best = card;
      bestScore = score;
    }
  }
  return best;
}
```

`src/app/utils/scan-consensus.utils.ts`:

```ts
export interface ConsensusOptions {
  /** Agreeing reads needed inside the window. */
  required: number;
  windowSize: number;
  /** A just-accepted key stays blocked until it has been unseen for this long. */
  cooldownMs: number;
}

/**
 * Debounces noisy per-frame OCR reads: a key is accepted once it appears
 * `required` times in the last `windowSize` frames, and is not accepted again
 * while the same card is still in front of the camera.
 */
export class ScanConsensus {
  private readonly window: string[] = [];
  private readonly lastSeen = new Map<string, number>();
  private readonly blocked = new Set<string>();

  constructor(private readonly options: ConsensusOptions) {}

  push(key: string | null, now: number): string | null {
    this.window.push(key ?? '');
    if (this.window.length > this.options.windowSize) {
      this.window.shift();
    }
    if (!key) {
      return null;
    }

    const previouslySeen = this.lastSeen.get(key);
    this.lastSeen.set(key, now);
    if (this.blocked.has(key)) {
      if (previouslySeen !== undefined && now - previouslySeen < this.options.cooldownMs) {
        return null;
      }
      this.blocked.delete(key);
    }

    if (this.window.filter((k) => k === key).length < this.options.required) {
      return null;
    }
    this.blocked.add(key);
    this.window.length = 0;
    return key;
  }
}
```

`src/app/utils/scan-geometry.utils.ts`:

```ts
export const CARD_ASPECT = 59 / 86;

export interface GuideRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Centered card-shaped rectangle inside a video frame, as fractions (0..1) of
 * the frame. The overlay and the OCR crop both use it so they stay aligned.
 */
export function guideRect(videoWidth: number, videoHeight: number): GuideRect {
  let h = videoHeight * 0.88;
  let w = h * CARD_ASPECT;
  if (w > videoWidth * 0.94) {
    w = videoWidth * 0.94;
    h = w / CARD_ASPECT;
  }
  return {
    x: (videoWidth - w) / 2 / videoWidth,
    y: (videoHeight - h) / 2 / videoHeight,
    w: w / videoWidth,
    h: h / videoHeight,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run the Step 2 command. Expected: all specs pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/utils/name-match.utils* src/app/utils/scan-consensus.utils* src/app/utils/scan-geometry.utils*
git commit -m "feat(collection): name matching, scan consensus and guide geometry utils"
```

---

### Task 3: Collection utils (key, merge, patch, price, totals)

**Files:**
- Create: `src/app/utils/collection.utils.ts`
- Test: `src/app/utils/collection.utils.spec.ts`

**Interfaces:**
- Consumes: Task 1 models.
- Produces: `collectionKey(i)`, `mergeDraft<T extends CollectionDraft>(list, incoming): T[]`, `applyItemPatch(items, id, patch, now)`, `extractCardmarketEur(card): number | null`, `collectionTotals(items, prices)`, `type CollectionItemPatch`.

- [ ] **Step 1: Write the failing test**

`src/app/utils/collection.utils.spec.ts`:

```ts
import { CollectionDraft, CollectionItem } from '../models/collection.model';
import { YgoCard } from '../models/ygo-card.model';
import { applyItemPatch, collectionKey, collectionTotals, extractCardmarketEur, mergeDraft } from './collection.utils';

const draft = (over: Partial<CollectionDraft> = {}): CollectionDraft => ({
  passcode: 1,
  cardName: 'Card',
  setCode: 'LOB-EN001',
  rarity: 'Ultra Rare',
  language: 'EN',
  condition: 'NM',
  firstEdition: false,
  quantity: 1,
  notes: null,
  ...over,
});

const item = (id: string, over: Partial<CollectionDraft> = {}): CollectionItem => ({
  ...draft(over),
  id,
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('collection utils', () => {
  it('collectionKey differs by condition, language, rarity and first edition', () => {
    const base = collectionKey(draft());
    expect(collectionKey(draft({ condition: 'LP' }))).not.toBe(base);
    expect(collectionKey(draft({ language: 'IT' }))).not.toBe(base);
    expect(collectionKey(draft({ rarity: 'Rare' }))).not.toBe(base);
    expect(collectionKey(draft({ firstEdition: true }))).not.toBe(base);
    expect(collectionKey(draft({ quantity: 9, notes: 'x' }))).toBe(base);
  });

  it('mergeDraft adds quantity to a matching entry', () => {
    const merged = mergeDraft([draft({ quantity: 2 })], draft({ quantity: 3 }));
    expect(merged.length).toBe(1);
    expect(merged[0].quantity).toBe(5);
  });

  it('mergeDraft appends a different printing', () => {
    expect(mergeDraft([draft()], draft({ setCode: 'LOB-EN002' })).length).toBe(2);
  });

  it('applyItemPatch updates in place when no twin exists', () => {
    const result = applyItemPatch([item('a')], 'a', { condition: 'LP' }, 'now');
    expect(result?.removedId).toBeNull();
    expect(result?.items[0].condition).toBe('LP');
    expect(result?.items[0].updatedAt).toBe('now');
  });

  it('applyItemPatch merges into a twin and reports the removed id', () => {
    const items = [item('a', { quantity: 1 }), item('b', { condition: 'LP', quantity: 2 })];
    const result = applyItemPatch(items, 'a', { condition: 'LP' }, 'now');
    expect(result?.removedId).toBe('a');
    expect(result?.touchedId).toBe('b');
    expect(result?.items.length).toBe(1);
    expect(result?.items[0].quantity).toBe(3);
  });

  it('applyItemPatch returns null for an unknown id', () => {
    expect(applyItemPatch([item('a')], 'zzz', {}, 'now')).toBeNull();
  });

  it('extractCardmarketEur parses the price and treats 0 / missing as null', () => {
    const card = (price?: string) => ({ card_prices: price === undefined ? [] : [{ cardmarket_price: price }] }) as unknown as YgoCard;
    expect(extractCardmarketEur(card('1.25'))).toBe(1.25);
    expect(extractCardmarketEur(card('0.00'))).toBeNull();
    expect(extractCardmarketEur(card())).toBeNull();
  });

  it('collectionTotals sums quantity, unique cards and priced value', () => {
    const items = [item('a', { passcode: 1, quantity: 2 }), item('b', { passcode: 1, setCode: 'X-EN001', quantity: 1 }), item('c', { passcode: 2, quantity: 4 })];
    const prices = new Map<number, number | null>([[1, 2.5], [2, null]]);
    expect(collectionTotals(items, prices)).toEqual({ totalCards: 7, uniqueCards: 2, valueEur: 7.5, unpricedCards: 4 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/utils/collection.utils.spec.ts'`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/app/utils/collection.utils.ts`:

```ts
import { CollectionDraft, CollectionItem } from '../models/collection.model';
import { YgoCard } from '../models/ygo-card.model';

export type CollectionItemPatch = Partial<Omit<CollectionItem, 'id' | 'updatedAt'>>;

export function collectionKey(
  i: Pick<CollectionDraft, 'setCode' | 'rarity' | 'language' | 'condition' | 'firstEdition'>,
): string {
  return [i.setCode, i.rarity, i.language, i.condition, i.firstEdition ? '1' : '0'].join('|');
}

/** Adds `incoming` to the list, summing quantity when the printing already exists. */
export function mergeDraft<T extends CollectionDraft>(list: readonly T[], incoming: T): T[] {
  const key = collectionKey(incoming);
  const index = list.findIndex((entry) => collectionKey(entry) === key);
  if (index === -1) {
    return [...list, incoming];
  }
  return list.map((entry, i) => (i === index ? { ...entry, quantity: entry.quantity + incoming.quantity } : entry));
}

export function applyItemPatch(
  items: readonly CollectionItem[],
  id: string,
  patch: CollectionItemPatch,
  now: string,
): { items: CollectionItem[]; touchedId: string; removedId: string | null } | null {
  const current = items.find((i) => i.id === id);
  if (!current) {
    return null;
  }
  const updated: CollectionItem = { ...current, ...patch, updatedAt: now };
  const twin = items.find((i) => i.id !== id && collectionKey(i) === collectionKey(updated));
  if (!twin) {
    return { items: items.map((i) => (i.id === id ? updated : i)), touchedId: id, removedId: null };
  }
  const merged: CollectionItem = { ...twin, quantity: twin.quantity + updated.quantity, updatedAt: now };
  return {
    items: items.filter((i) => i.id !== id).map((i) => (i.id === twin.id ? merged : i)),
    touchedId: twin.id,
    removedId: id,
  };
}

/** Cardmarket price in EUR (per card, not per printing); `0.00`/missing ⇒ null. */
export function extractCardmarketEur(card: YgoCard): number | null {
  const raw = card.card_prices?.[0]?.cardmarket_price;
  const value = raw === undefined ? NaN : Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export interface CollectionTotals {
  totalCards: number;
  uniqueCards: number;
  valueEur: number;
  /** Copies owned whose price is unknown (not counted in `valueEur`). */
  unpricedCards: number;
}

export function collectionTotals(
  items: readonly CollectionItem[],
  prices: ReadonlyMap<number, number | null>,
): CollectionTotals {
  let totalCards = 0;
  let valueEur = 0;
  let unpricedCards = 0;
  const unique = new Set<number>();
  for (const item of items) {
    totalCards += item.quantity;
    unique.add(item.passcode);
    const price = prices.get(item.passcode) ?? null;
    if (price === null) {
      unpricedCards += item.quantity;
    } else {
      valueEur += price * item.quantity;
    }
  }
  return { totalCards, uniqueCards: unique.size, valueEur, unpricedCards };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the Step 2 command. Expected: 8 specs, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/app/utils/collection.utils.ts src/app/utils/collection.utils.spec.ts
git commit -m "feat(collection): key, merge, patch, price and totals utils"
```

---

### Task 4: Supabase migration

**Files:**
- Create: `supabase/migrations/20261026120000_collection_items.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Physical card collection per user. Row Level Security: owner only.
create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  passcode bigint not null,
  card_name text not null,
  set_code text not null,
  rarity text not null,
  language text not null default 'EN',
  condition text not null default 'NM' check (condition in ('NM', 'LP', 'MP', 'HP', 'DMG')),
  first_edition boolean not null default false,
  quantity integer not null check (quantity >= 1),
  notes text,
  updated_at timestamptz not null default now(),
  unique (user_id, set_code, rarity, language, condition, first_edition)
);

create index collection_items_user_passcode_idx on public.collection_items (user_id, passcode);

alter table public.collection_items enable row level security;

create policy "collection_items_select_own" on public.collection_items
  for select using (auth.uid() = user_id);
create policy "collection_items_insert_own" on public.collection_items
  for insert with check (auth.uid() = user_id);
create policy "collection_items_update_own" on public.collection_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "collection_items_delete_own" on public.collection_items
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: Show the SQL to the user and ask for approval**

This changes the live Supabase project (`ubflewrwtpbrbkjdohfx`). Do NOT apply before the user explicitly confirms.

- [ ] **Step 3: After approval, apply it**

Use the Supabase MCP `apply_migration` (name `collection_items`, the SQL above) on project `ubflewrwtpbrbkjdohfx`. Then `list_tables` to confirm `collection_items` exists with RLS enabled, and `get_advisors` (security) to confirm no new warning for it.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261026120000_collection_items.sql
git commit -m "feat(collection): collection_items table with RLS"
```

---

### Task 5: Cache and CollectionService

**Files:**
- Create: `src/app/services/collection-cache.service.ts`, `src/app/services/collection.service.ts`

**Interfaces:**
- Consumes: Task 1 models, Task 3 utils, `AuthService.currentUser`, `supabase`.
- Produces: `CollectionService` with `items: Signal<CollectionItem[]>`, `status: Signal<'idle'|'loading'|'ready'|'offline'|'error'>`, `load(): Promise<void>`, `addMany(drafts: CollectionDraft[]): Promise<void>`, `update(id: string, patch: CollectionItemPatch): Promise<void>`, `remove(id: string): Promise<void>`, `ownedQuantity(passcode: number): number`.

- [ ] **Step 1: Create the IndexedDB cache**

`src/app/services/collection-cache.service.ts`:

```ts
import { Injectable } from '@angular/core';

const DB_NAME = 'ygo-checker-collection';
const DB_VERSION = 1;
const STORE = 'kv';

/** Tiny key/value store for the collection snapshot and the offline queue. Never throws. */
@Injectable({ providedIn: 'root' })
export class CollectionCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  async get<T>(key: string): Promise<T | null> {
    try {
      const db = await this.openDb();
      return await new Promise<T | null>((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        req.onerror = () => reject(req.error ?? new Error('idb get failed'));
        req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      });
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('idb put failed'));
      });
    } catch {
      // cache is best-effort
    }
  }

  private openDb(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('indexedDB unavailable'));
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error ?? new Error('idb open failed'));
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) {
            req.result.createObjectStore(STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
      });
    }
    return this.dbPromise;
  }
}
```

- [ ] **Step 2: Create CollectionService**

`src/app/services/collection.service.ts`:

```ts
import { Injectable, inject, signal } from '@angular/core';
import { supabase } from '../core/supabase-client';
import { CardCondition, CardLanguage, CollectionDraft, CollectionItem } from '../models/collection.model';
import { applyItemPatch, collectionKey, CollectionItemPatch } from '../utils/collection.utils';
import { AuthService } from './auth.service';
import { CollectionCacheService } from './collection-cache.service';

const TABLE = 'collection_items';
const CONFLICT_COLUMNS = 'user_id,set_code,rarity,language,condition,first_edition';

export type CollectionStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'error';

interface CollectionRow {
  id: string;
  user_id: string;
  passcode: number;
  card_name: string;
  set_code: string;
  rarity: string;
  language: string;
  condition: string;
  first_edition: boolean;
  quantity: number;
  notes: string | null;
  updated_at: string;
}

function rowToItem(row: CollectionRow): CollectionItem {
  return {
    id: row.id,
    passcode: row.passcode,
    cardName: row.card_name,
    setCode: row.set_code,
    rarity: row.rarity,
    language: row.language as CardLanguage,
    condition: row.condition as CardCondition,
    firstEdition: row.first_edition,
    quantity: row.quantity,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

function itemToRow(item: CollectionItem, userId: string): CollectionRow {
  return {
    id: item.id,
    user_id: userId,
    passcode: item.passcode,
    card_name: item.cardName,
    set_code: item.setCode,
    rarity: item.rarity,
    language: item.language,
    condition: item.condition,
    first_edition: item.firstEdition,
    quantity: item.quantity,
    notes: item.notes,
    updated_at: item.updatedAt,
  };
}

/**
 * The player's physical cards. Reads come from the IndexedDB snapshot first, then
 * Supabase; writes are applied locally at once and flushed to Supabase, with ids
 * of unsynced upserts/deletes kept in `pending`/`deleted` so offline edits survive.
 */
@Injectable({ providedIn: 'root' })
export class CollectionService {
  private readonly auth = inject(AuthService);
  private readonly cache = inject(CollectionCacheService);

  readonly items = signal<CollectionItem[]>([]);
  readonly status = signal<CollectionStatus>('idle');

  private pending = new Set<string>();
  private deleted = new Set<string>();

  ownedQuantity(passcode: number): number {
    return this.items().reduce((sum, item) => (item.passcode === passcode ? sum + item.quantity : sum), 0);
  }

  async load(): Promise<void> {
    const userId = this.userId();
    if (!userId) {
      this.items.set([]);
      this.status.set('idle');
      return;
    }
    this.status.set('loading');
    const [cached, pending, deleted] = await Promise.all([
      this.cache.get<CollectionItem[]>(this.key(userId, 'items')),
      this.cache.get<string[]>(this.key(userId, 'pending')),
      this.cache.get<string[]>(this.key(userId, 'deleted')),
    ]);
    this.items.set(cached ?? []);
    this.pending = new Set(pending ?? []);
    this.deleted = new Set(deleted ?? []);

    try {
      await this.flush(userId);
      const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).order('updated_at', { ascending: false });
      if (error || !data) {
        throw new Error(error?.message ?? 'Failed to load collection');
      }
      this.items.set((data as CollectionRow[]).map(rowToItem));
      await this.cache.set(this.key(userId, 'items'), this.items());
      this.status.set('ready');
    } catch {
      this.status.set(cached ? 'offline' : 'error');
    }
  }

  async addMany(drafts: readonly CollectionDraft[]): Promise<void> {
    const now = new Date().toISOString();
    let next = [...this.items()];
    for (const draft of drafts) {
      const index = next.findIndex((item) => collectionKey(item) === collectionKey(draft));
      if (index >= 0) {
        next[index] = { ...next[index], quantity: next[index].quantity + draft.quantity, updatedAt: now };
        this.pending.add(next[index].id);
      } else {
        const created: CollectionItem = { ...draft, id: crypto.randomUUID(), updatedAt: now };
        next = [created, ...next];
        this.pending.add(created.id);
      }
    }
    await this.commit(next);
  }

  async update(id: string, patch: CollectionItemPatch): Promise<void> {
    const result = applyItemPatch(this.items(), id, patch, new Date().toISOString());
    if (!result) {
      return;
    }
    this.pending.add(result.touchedId);
    if (result.removedId) {
      this.pending.delete(result.removedId);
      this.deleted.add(result.removedId);
    }
    await this.commit(result.items);
  }

  async remove(id: string): Promise<void> {
    this.pending.delete(id);
    this.deleted.add(id);
    await this.commit(this.items().filter((item) => item.id !== id));
  }

  private async commit(next: CollectionItem[]): Promise<void> {
    this.items.set(next);
    const userId = this.userId();
    if (!userId) {
      return;
    }
    await this.persistLocal(userId);
    try {
      await this.flush(userId);
      this.status.set('ready');
    } catch {
      this.status.set('offline');
    }
  }

  private async persistLocal(userId: string): Promise<void> {
    await Promise.all([
      this.cache.set(this.key(userId, 'items'), this.items()),
      this.cache.set(this.key(userId, 'pending'), [...this.pending]),
      this.cache.set(this.key(userId, 'deleted'), [...this.deleted]),
    ]);
  }

  /** Pushes unsynced deletes and upserts; throws if Supabase is unreachable. */
  private async flush(userId: string): Promise<void> {
    if (this.deleted.size > 0) {
      const { error } = await supabase.from(TABLE).delete().eq('user_id', userId).in('id', [...this.deleted]);
      if (error) {
        throw new Error(error.message);
      }
      this.deleted.clear();
    }
    if (this.pending.size > 0) {
      const rows = this.items().filter((item) => this.pending.has(item.id)).map((item) => itemToRow(item, userId));
      if (rows.length > 0) {
        const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: CONFLICT_COLUMNS });
        if (error) {
          throw new Error(error.message);
        }
      }
      this.pending.clear();
    }
    await this.persistLocal(userId);
  }

  private userId(): string | null {
    return this.auth.currentUser?.id ?? null;
  }

  private key(userId: string, name: 'items' | 'pending' | 'deleted'): string {
    return `${userId}:${name}`;
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx ng build --configuration development`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/services/collection-cache.service.ts src/app/services/collection.service.ts
git commit -m "feat(collection): CollectionService with IndexedDB cache and offline queue"
```

---

### Task 6: Lookup and price services

**Files:**
- Create: `src/app/services/cardset-lookup.service.ts`, `src/app/services/collection-price.service.ts`

**Interfaces:**
- Consumes: `YgoApiService.getCardById$(id, 'en')`, `searchCards$(q, lang, limit)`, `getCardsByIds$(ids, 'en')`; Task 2 `bestNameMatch`; Task 3 `extractCardmarketEur`.
- Produces: `CardsetLookupService.bySetCodes$(codes: readonly string[]): Observable<ScanMatch | null>`, `.byName$(ocrName: string): Observable<ScanMatch | null>` where `ScanMatch = { card: YgoCard; printings: CardSet[]; setCode: string }`; `CollectionPriceService.prices: Signal<ReadonlyMap<number, number | null>>`, `ensure(passcodes: readonly number[]): Promise<void>`.

- [ ] **Step 1: Create CardsetLookupService**

`src/app/services/cardset-lookup.service.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, concatMap, first, map, switchMap } from 'rxjs/operators';
import { CardSet, YgoCard } from '../models/ygo-card.model';
import { bestNameMatch } from '../utils/name-match.utils';
import { YgoApiService } from './ygo-api.service';

const SET_INFO_URL = 'https://db.ygoprodeck.com/api/v7/cardsetsinfo.php';
const NO_SET_CODE = 'N/D';

export interface ScanMatch {
  card: YgoCard;
  printings: CardSet[];
  setCode: string;
}

@Injectable({ providedIn: 'root' })
export class CardsetLookupService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(YgoApiService);

  /** Tries each candidate code in order and returns the first card found. */
  bySetCodes$(codes: readonly string[]): Observable<ScanMatch | null> {
    return from(codes).pipe(
      concatMap((code) => this.bySetCode$(code)),
      first((match) => match !== null, null),
    );
  }

  /** Fuzzy name path: the printing is unknown, so the first printing is a default to review. */
  byName$(ocrName: string): Observable<ScanMatch | null> {
    return this.api.searchCards$(ocrName, 'it', 20).pipe(
      map((cards) => bestNameMatch(ocrName, cards)),
      switchMap((hit) => (hit ? this.api.getCardById$(hit.id, 'en') : of(null))),
      map((card) => {
        if (!card) {
          return null;
        }
        const printings = card.card_sets ?? [];
        return { card, printings, setCode: printings[0]?.set_code ?? NO_SET_CODE };
      }),
      catchError(() => of(null)),
    );
  }

  private bySetCode$(code: string): Observable<ScanMatch | null> {
    const url = `${SET_INFO_URL}?setcode=${encodeURIComponent(code)}`;
    return this.http.get<{ id?: number }>(url).pipe(
      switchMap((res) => (res?.id ? this.api.getCardById$(res.id, 'en') : of(null))),
      map((card) => {
        if (!card) {
          return null;
        }
        const printings = (card.card_sets ?? []).filter((set) => set.set_code.toUpperCase() === code);
        return { card, printings, setCode: code };
      }),
      catchError(() => of(null)),
    );
  }
}
```

- [ ] **Step 2: Create CollectionPriceService**

`src/app/services/collection-price.service.ts`:

```ts
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { extractCardmarketEur } from '../utils/collection.utils';
import { YgoApiService } from './ygo-api.service';

const STORAGE_KEY = 'ygo-collection-prices-v1';
const TTL_MS = 24 * 60 * 60 * 1000;

interface StoredPrices {
  savedAt: number;
  entries: [number, number | null][];
}

/** Cardmarket EUR price per passcode, cached in localStorage for 24 hours. */
@Injectable({ providedIn: 'root' })
export class CollectionPriceService {
  private readonly api = inject(YgoApiService);

  readonly prices = signal<ReadonlyMap<number, number | null>>(this.hydrate());

  async ensure(passcodes: readonly number[]): Promise<void> {
    const known = this.prices();
    const missing = [...new Set(passcodes)].filter((id) => id > 0 && !known.has(id));
    if (missing.length === 0) {
      return;
    }
    try {
      const cards = await firstValueFrom(this.api.getCardsByIds$(missing, 'en'));
      const next = new Map(known);
      for (const id of missing) {
        next.set(id, null);
      }
      for (const card of cards) {
        next.set(card.id, extractCardmarketEur(card));
      }
      this.prices.set(next);
      this.persist(next);
    } catch {
      // prices are optional: leave them unknown and retry on the next ensure()
    }
  }

  private hydrate(): ReadonlyMap<number, number | null> {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as StoredPrices | null;
      if (stored && Date.now() - stored.savedAt < TTL_MS) {
        return new Map(stored.entries);
      }
    } catch {
      // corrupt or unavailable storage
    }
    return new Map();
  }

  private persist(prices: ReadonlyMap<number, number | null>): void {
    try {
      const stored: StoredPrices = { savedAt: Date.now(), entries: [...prices] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // storage full or unavailable
    }
  }
}
```

Note: `savedAt` is refreshed on every persist, so the 24 h window slides while the user keeps adding cards; acceptable for v1.

- [ ] **Step 3: Type-check**

Run: `npx ng build --configuration development`
Expected: build succeeds.

- [ ] **Step 4: Smoke-check the lookup against the live API**

Run: `curl -s "https://db.ygoprodeck.com/api/v7/cardsetsinfo.php?setcode=LOB-EN005"`
Expected: JSON with `"set_code":"LOB-EN005"` and a numeric `id` (the lookup relies on this shape).

- [ ] **Step 5: Commit**

```bash
git add src/app/services/cardset-lookup.service.ts src/app/services/collection-price.service.ts
git commit -m "feat(collection): set-code/name lookup and Cardmarket price services"
```

---

### Task 7: Scanner service

**Files:**
- Modify: `src/app/services/card-screen-ocr.service.ts` (add method inside `CardScreenOcrService`, after `recognize$`)
- Create: `src/app/services/collection-scanner.service.ts`

**Interfaces:**
- Consumes: `CardScreenOcrService.recognizeText`, `CardsetLookupService`, `parseSetCode`, `cleanOcrName`/`normalizeName`, `ScanConsensus`, `guideRect`.
- Produces: `CollectionScannerService` with `state: Signal<'idle'|'starting'|'scanning'|'error'>`, `error: Signal<'denied'|'unavailable'|null>`, `busy: Signal<boolean>`, `lastMiss: Signal<number>` (epoch ms of the last unresolved read), `detections$: Observable<ScanDetection>`, `start(video: HTMLVideoElement): Promise<void>`, `stop(): void`.

- [ ] **Step 1: Add `recognizeText` to the OCR service**

In `src/app/services/card-screen-ocr.service.ts`, insert after the `recognize$` method:

```ts
  /** Raw OCR text of a canvas (used by the collection scanner); '' on any failure. */
  async recognizeText(source: HTMLCanvasElement): Promise<string> {
    this.bumpWorkerTtl();
    try {
      return (await this.runOcr(source)).text;
    } catch (err) {
      console.error('[collection-ocr]', err);
      return '';
    }
  }
```

- [ ] **Step 2: Create the scanner service**

`src/app/services/collection-scanner.service.ts`:

```ts
import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { CardLanguage, ScanDetection } from '../models/collection.model';
import { cleanOcrName, normalizeName } from '../utils/name-match.utils';
import { ScanConsensus } from '../utils/scan-consensus.utils';
import { guideRect } from '../utils/scan-geometry.utils';
import { parseSetCode } from '../utils/set-code.utils';
import { CardScreenOcrService } from './card-screen-ocr.service';
import { CardsetLookupService, ScanMatch } from './cardset-lookup.service';

const FRAME_WIDTH = 640;
const FRAME_HEIGHT = Math.round((FRAME_WIDTH * 86) / 59);
const TICK_MS = 300;
const OCR_UPSCALE = 2;
const NAME_KEY_LENGTH = 10;

/** Regions of the guide frame, as fractions of the card. */
const SET_CODE_BAND = { x: 0.4, y: 0.6, w: 0.6, h: 0.14 };
const NAME_BAND = { x: 0.03, y: 0.02, w: 0.94, h: 0.1 };

type Seed = { kind: 'code'; candidates: string[]; language: CardLanguage } | { kind: 'name'; text: string };

export type ScannerState = 'idle' | 'starting' | 'scanning' | 'error';

/**
 * Camera loop for the collection scan: crops the on-screen guide frame, OCRs the
 * set code (fallback: the card name), debounces reads with ScanConsensus and
 * resolves accepted reads into cards. Emits one detection per accepted card.
 */
@Injectable({ providedIn: 'root' })
export class CollectionScannerService {
  private readonly ocr = inject(CardScreenOcrService);
  private readonly lookup = inject(CardsetLookupService);

  readonly state = signal<ScannerState>('idle');
  readonly error = signal<'denied' | 'unavailable' | null>(null);
  readonly busy = signal(false);
  readonly lastMiss = signal(0);

  private readonly detectionSubject = new Subject<ScanDetection>();
  readonly detections$: Observable<ScanDetection> = this.detectionSubject.asObservable();

  private stream: MediaStream | null = null;
  private running = false;
  private consensus = this.newConsensus();
  private readonly seeds = new Map<string, Seed>();
  private readonly frame = document.createElement('canvas');
  private readonly band = document.createElement('canvas');

  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    this.state.set('starting');
    this.error.set(null);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (err) {
      this.error.set(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'unavailable');
      this.state.set('error');
      return;
    }
    video.srcObject = this.stream;
    await video.play().catch(() => undefined);
    this.consensus = this.newConsensus();
    this.seeds.clear();
    this.running = true;
    this.state.set('scanning');
    void this.loop(video);
  }

  stop(): void {
    this.running = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.state.set('idle');
  }

  private newConsensus(): ScanConsensus {
    return new ScanConsensus({ required: 2, windowSize: 4, cooldownMs: 1500 });
  }

  private async loop(video: HTMLVideoElement): Promise<void> {
    while (this.running) {
      const startedAt = performance.now();
      try {
        await this.tick(video);
      } catch (err) {
        console.error('[collection-scanner]', err);
      }
      const wait = Math.max(0, TICK_MS - (performance.now() - startedAt));
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  private async tick(video: HTMLVideoElement): Promise<void> {
    const frame = this.grabFrame(video);
    if (!frame) {
      return;
    }

    let key: string | null = null;
    const parsed = parseSetCode(await this.ocr.recognizeText(this.crop(frame, SET_CODE_BAND)));
    if (parsed) {
      key = `code:${parsed.candidates[0]}|${parsed.language}`;
      this.seeds.set(key, { kind: 'code', candidates: parsed.candidates, language: parsed.language });
    } else {
      const name = cleanOcrName(await this.ocr.recognizeText(this.crop(frame, NAME_BAND)));
      if (name) {
        key = `name:${normalizeName(name).slice(0, NAME_KEY_LENGTH)}`;
        this.seeds.set(key, { kind: 'name', text: name });
      }
    }

    const accepted = this.consensus.push(key, performance.now());
    if (accepted) {
      await this.resolve(accepted);
    }
  }

  private async resolve(key: string): Promise<void> {
    const seed = this.seeds.get(key);
    if (!seed) {
      return;
    }
    this.busy.set(true);
    try {
      const match: ScanMatch | null =
        seed.kind === 'code'
          ? await firstValueFrom(this.lookup.bySetCodes$(seed.candidates))
          : await firstValueFrom(this.lookup.byName$(seed.text));
      if (!match) {
        this.lastMiss.set(Date.now());
        return;
      }
      this.detectionSubject.next({
        card: match.card,
        printings: match.printings,
        setCode: match.setCode,
        language: seed.kind === 'code' ? seed.language : 'EN',
        source: seed.kind,
        needsReview: seed.kind === 'name' || match.printings.length !== 1,
      });
    } finally {
      this.busy.set(false);
    }
  }

  private grabFrame(video: HTMLVideoElement): HTMLCanvasElement | null {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      return null;
    }
    const guide = guideRect(vw, vh);
    this.frame.width = FRAME_WIDTH;
    this.frame.height = FRAME_HEIGHT;
    const ctx = this.frame.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return null;
    }
    ctx.drawImage(video, guide.x * vw, guide.y * vh, guide.w * vw, guide.h * vh, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    return this.frame;
  }

  private crop(frame: HTMLCanvasElement, band: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
    const sx = band.x * frame.width;
    const sy = band.y * frame.height;
    const sw = band.w * frame.width;
    const sh = band.h * frame.height;
    this.band.width = Math.round(sw * OCR_UPSCALE);
    this.band.height = Math.round(sh * OCR_UPSCALE);
    const ctx = this.band.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.imageSmoothingQuality = 'high';
      ctx.filter = 'grayscale(1) contrast(1.6)';
      ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, this.band.width, this.band.height);
    }
    return this.band;
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx ng build --configuration development`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/services/card-screen-ocr.service.ts src/app/services/collection-scanner.service.ts
git commit -m "feat(collection): camera scanner service (set-code OCR with name fallback)"
```

---

### Task 8: Review list and scanner panel components

**Files:**
- Create: `src/app/features/profile/components/collection-review-list.component.ts`, `src/app/features/profile/components/collection-scanner.component.ts`

**Interfaces:**
- Consumes: `CollectionScannerService`, `CollectionPriceService`, `CollectionService.addMany`, `YgoApiService.searchCards$`, `mergeDraft`, `ToastService`, models.
- Produces: `<app-collection-review-list [entries] [prices] (patch) (remove)>` and `<app-collection-scanner (closed)>`.

UI rules for both components (user asked for particular care on cleanliness): one primary action per view, quiet neutral surfaces (`border-base-300/60`, `text-base-content/60` for secondary text), no emoji icons, ≥44 px touch targets (`btn` default height + `min-h-11` on row actions), details hidden behind a "Dettagli" disclosure, clear empty/loading/error copy.

- [ ] **Step 1: Create the review list (dumb component)**

`src/app/features/profile/components/collection-review-list.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CARD_CONDITIONS, CARD_LANGUAGES, CardCondition, CardLanguage, ScanQueueEntry } from '../../../models/collection.model';

export interface EntryPatch {
  tempId: string;
  patch: Partial<Pick<ScanQueueEntry, 'setCode' | 'rarity' | 'language' | 'condition' | 'firstEdition' | 'quantity' | 'notes'>>;
}

/** Editable rows of the scan queue. Pure presentation: all changes are emitted. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-collection-review-list',
  standalone: true,
  template: `
    <ul class="divide-y divide-base-300/60">
      @for (entry of entries(); track entry.tempId) {
        <li class="py-3 space-y-2">
          <div class="flex items-center gap-3">
            <img
              [src]="'https://images.ygoprodeck.com/images/cards_small/' + entry.passcode + '.jpg'"
              alt=""
              class="w-11 rounded shrink-0"
              loading="lazy"
            />
            <div class="min-w-0 flex-1">
              <p class="font-medium truncate">{{ entry.cardName }}</p>
              <p class="text-xs text-base-content/60 truncate">{{ entry.setCode }} · {{ entry.rarity }}</p>
              @if (entry.needsReview) {
                <span class="badge badge-warning badge-sm mt-1">Da verificare</span>
              }
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button class="btn btn-sm btn-ghost btn-square" aria-label="Meno" (click)="changeQuantity(entry, -1)">−</button>
              <span class="w-6 text-center tabular-nums">{{ entry.quantity }}</span>
              <button class="btn btn-sm btn-ghost btn-square" aria-label="Più" (click)="changeQuantity(entry, 1)">+</button>
            </div>
          </div>

          <div class="flex items-center justify-between gap-2 pl-14">
            <span class="text-sm text-base-content/70">{{ priceLabel(entry) }}</span>
            <div class="flex items-center gap-1">
              <button class="btn btn-xs btn-ghost" (click)="toggle(entry.tempId)">
                {{ openId === entry.tempId ? 'Chiudi' : 'Dettagli' }}
              </button>
              <button class="btn btn-xs btn-ghost text-error" (click)="remove.emit(entry.tempId)">Rimuovi</button>
            </div>
          </div>

          @if (openId === entry.tempId) {
            <div class="pl-14 grid grid-cols-2 gap-2">
              @if (entry.printings.length > 1) {
                <select
                  class="select select-bordered select-sm col-span-2"
                  [value]="entry.setCode + '|' + entry.rarity"
                  (change)="pickPrinting(entry, $any($event.target).value)"
                  aria-label="Stampa"
                >
                  @for (p of entry.printings; track p.set_code + p.set_rarity) {
                    <option [value]="p.set_code + '|' + p.set_rarity">{{ p.set_code }} · {{ p.set_rarity }}</option>
                  }
                </select>
              }
              <select class="select select-bordered select-sm" [value]="entry.condition" (change)="pickCondition(entry, $any($event.target).value)" aria-label="Condizione">
                @for (c of conditions; track c) {
                  <option [value]="c">{{ c }}</option>
                }
              </select>
              <select class="select select-bordered select-sm" [value]="entry.language" (change)="pickLanguage(entry, $any($event.target).value)" aria-label="Lingua">
                @for (l of languages; track l) {
                  <option [value]="l">{{ l }}</option>
                }
              </select>
              <label class="label cursor-pointer justify-start gap-2 col-span-2 py-0">
                <input type="checkbox" class="checkbox checkbox-sm" [checked]="entry.firstEdition" (change)="patch.emit({ tempId: entry.tempId, patch: { firstEdition: $any($event.target).checked } })" />
                <span class="text-sm">1st Edition</span>
              </label>
            </div>
          }
        </li>
      }
    </ul>
  `,
})
export class CollectionReviewListComponent {
  readonly entries = input.required<readonly ScanQueueEntry[]>();
  readonly prices = input.required<ReadonlyMap<number, number | null>>();
  readonly patch = output<EntryPatch>();
  readonly remove = output<string>();

  protected readonly conditions = CARD_CONDITIONS;
  protected readonly languages = CARD_LANGUAGES;
  protected openId: string | null = null;

  private readonly eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

  protected toggle(tempId: string): void {
    this.openId = this.openId === tempId ? null : tempId;
  }

  protected priceLabel(entry: ScanQueueEntry): string {
    const price = this.prices().get(entry.passcode);
    return price == null ? 'Prezzo n/d' : this.eur.format(price);
  }

  protected changeQuantity(entry: ScanQueueEntry, delta: number): void {
    const quantity = Math.max(1, entry.quantity + delta);
    this.patch.emit({ tempId: entry.tempId, patch: { quantity } });
  }

  protected pickPrinting(entry: ScanQueueEntry, value: string): void {
    const [setCode, rarity] = value.split('|');
    this.patch.emit({ tempId: entry.tempId, patch: { setCode, rarity } });
  }

  protected pickCondition(entry: ScanQueueEntry, value: string): void {
    this.patch.emit({ tempId: entry.tempId, patch: { condition: value as CardCondition } });
  }

  protected pickLanguage(entry: ScanQueueEntry, value: string): void {
    this.patch.emit({ tempId: entry.tempId, patch: { language: value as CardLanguage } });
  }
}
```

- [ ] **Step 2: Create the scanner panel**

`src/app/features/profile/components/collection-scanner.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnDestroy, OnInit, computed, inject, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CardCondition, CollectionDraft, ScanDetection, ScanQueueEntry } from '../../../models/collection.model';
import { YgoCard } from '../../../models/ygo-card.model';
import { CollectionPriceService } from '../../../services/collection-price.service';
import { CollectionScannerService } from '../../../services/collection-scanner.service';
import { CollectionService } from '../../../services/collection.service';
import { ToastService } from '../../../services/toast.service';
import { YgoApiService } from '../../../services/ygo-api.service';
import { mergeDraft } from '../../../utils/collection.utils';
import { guideRect } from '../../../utils/scan-geometry.utils';
import { CollectionReviewListComponent, EntryPatch } from './collection-review-list.component';

const DEFAULT_CONDITION: CardCondition = 'NM';

/** Full-screen live scan: camera + guide frame on top, review queue underneath. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-collection-scanner',
  standalone: true,
  imports: [FormsModule, CollectionReviewListComponent],
  template: `
    <div class="fixed inset-0 z-50 flex flex-col bg-base-100">
      <header class="flex items-center justify-between gap-3 px-4 py-3 border-b border-base-300/60">
        <h2 class="font-display text-lg font-semibold">Scansiona carte</h2>
        <button class="btn btn-sm btn-ghost" (click)="close()">Chiudi</button>
      </header>

      @if (!reviewOpen()) {
        <section class="flex-1 min-h-0 flex flex-col items-center justify-center bg-neutral p-3">
          @if (scanner.state() === 'error') {
            <div class="text-center text-neutral-content max-w-xs space-y-2">
              <p class="font-medium">
                {{ scanner.error() === 'denied' ? 'Accesso alla fotocamera negato' : 'Fotocamera non disponibile' }}
              </p>
              <p class="text-sm opacity-70">Puoi comunque aggiungere le carte a mano qui sotto.</p>
            </div>
          } @else {
            <div class="relative max-h-full max-w-full" [style.aspect-ratio]="aspect()">
              <video #video class="h-full max-h-[62vh] w-auto rounded-lg" playsinline muted (loadedmetadata)="onMetadata()"></video>
              <div
                class="absolute rounded-lg border-2 border-dashed pointer-events-none transition-colors duration-150"
                [class.border-white/70]="!flash()"
                [class.border-success]="flash()"
                [style.left.%]="guide().x * 100"
                [style.top.%]="guide().y * 100"
                [style.width.%]="guide().w * 100"
                [style.height.%]="guide().h * 100"
              ></div>
            </div>
            <p class="mt-3 text-sm text-neutral-content/80 text-center min-h-5" aria-live="polite">{{ hint() }}</p>
          }
        </section>
      } @else {
        <section class="flex-1 min-h-0 overflow-y-auto px-4">
          @if (queue().length === 0) {
            <div class="empty-state my-6">
              <p class="empty-state-title">Nessuna carta in coda</p>
              <p class="empty-state-hint">Inquadra una carta oppure cercala a mano.</p>
            </div>
          } @else {
            <app-collection-review-list [entries]="queue()" [prices]="prices.prices()" (patch)="patchEntry($event)" (remove)="removeEntry($event)" />
          }

          <details class="my-4 rounded-lg border border-base-300/60 p-3">
            <summary class="cursor-pointer text-sm font-medium">Aggiungi a mano</summary>
            <form class="mt-3 flex gap-2" (submit)="$event.preventDefault(); search()">
              <input class="input input-bordered input-sm flex-1" type="search" [(ngModel)]="searchTerm" name="searchTerm" placeholder="Nome della carta" />
              <button class="btn btn-sm btn-outline" type="submit" [disabled]="searching()">Cerca</button>
            </form>
            @if (searching()) {
              <span class="loading loading-spinner loading-sm mt-3"></span>
            }
            <ul class="mt-2 divide-y divide-base-300/60">
              @for (card of results(); track card.id) {
                <li>
                  <button class="w-full text-left py-2 text-sm hover:text-primary min-h-11" (click)="addManual(card)">{{ card.name }}</button>
                </li>
              }
            </ul>
          </details>
        </section>
      }

      <footer class="border-t border-base-300/60 px-4 py-3 flex items-center justify-between gap-3">
        <button class="btn btn-ghost btn-sm" (click)="reviewOpen.set(!reviewOpen())">
          {{ reviewOpen() ? 'Torna alla fotocamera' : 'Rivedi (' + queueCount() + ')' }}
        </button>
        <button class="btn btn-primary" [disabled]="queue().length === 0 || saving()" (click)="confirm()">
          @if (saving()) {
            <span class="loading loading-spinner loading-xs"></span>
          }
          Conferma {{ queueCount() }} {{ queueCount() === 1 ? 'carta' : 'carte' }}
        </button>
      </footer>
    </div>
  `,
})
export class CollectionScannerComponent implements OnInit, OnDestroy {
  protected readonly scanner = inject(CollectionScannerService);
  protected readonly prices = inject(CollectionPriceService);
  private readonly collection = inject(CollectionService);
  private readonly api = inject(YgoApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly closed = output<void>();
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  protected readonly queue = signal<ScanQueueEntry[]>([]);
  protected readonly queueCount = computed(() => this.queue().reduce((sum, entry) => sum + entry.quantity, 0));
  protected readonly reviewOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly flash = signal(false);
  protected readonly aspect = signal('3 / 4');
  protected readonly guide = signal(guideRect(720, 1280));
  protected readonly hint = signal('Inquadra una carta dentro il riquadro');

  protected searchTerm = '';
  protected readonly searching = signal(false);
  protected readonly results = signal<YgoCard[]>([]);

  constructor() {
    this.scanner.detections$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((detection) => this.onDetection(detection));
  }

  ngOnInit(): void {
    queueMicrotask(() => {
      const element = this.video()?.nativeElement;
      if (element) {
        void this.scanner.start(element);
      } else {
        this.reviewOpen.set(true);
      }
    });
    this.updateHintOnMiss();
  }

  ngOnDestroy(): void {
    this.scanner.stop();
  }

  protected onMetadata(): void {
    const element = this.video()?.nativeElement;
    if (element?.videoWidth && element.videoHeight) {
      this.aspect.set(`${element.videoWidth} / ${element.videoHeight}`);
      this.guide.set(guideRect(element.videoWidth, element.videoHeight));
    }
  }

  protected close(): void {
    this.closed.emit();
  }

  private onDetection(detection: ScanDetection): void {
    this.queue.update((queue) => mergeDraft(queue, this.toEntry(detection.card, detection)));
    void this.prices.ensure([detection.card.id]);
    this.hint.set(`Riconosciuta: ${detection.card.name}`);
    this.feedback();
  }

  private toEntry(card: YgoCard, detection: ScanDetection): ScanQueueEntry {
    const printing = detection.printings.find((p) => p.set_code === detection.setCode) ?? detection.printings[0];
    return {
      tempId: crypto.randomUUID(),
      passcode: card.id,
      cardName: card.name,
      setCode: printing?.set_code ?? detection.setCode,
      rarity: printing?.set_rarity ?? 'N/D',
      language: detection.language,
      condition: DEFAULT_CONDITION,
      firstEdition: false,
      quantity: 1,
      notes: null,
      printings: detection.printings,
      needsReview: detection.needsReview,
    };
  }

  protected patchEntry({ tempId, patch }: EntryPatch): void {
    this.queue.update((queue) => queue.map((entry) => (entry.tempId === tempId ? { ...entry, ...patch, needsReview: false } : entry)));
  }

  protected removeEntry(tempId: string): void {
    this.queue.update((queue) => queue.filter((entry) => entry.tempId !== tempId));
  }

  protected async search(): Promise<void> {
    const term = this.searchTerm.trim();
    if (!term) {
      return;
    }
    this.searching.set(true);
    try {
      this.results.set(await firstValueFrom(this.api.searchCards$(term, 'it', 12)));
    } finally {
      this.searching.set(false);
    }
  }

  protected async addManual(summary: YgoCard): Promise<void> {
    const card = (await firstValueFrom(this.api.getCardById$(summary.id, 'en'))) ?? summary;
    const printings = card.card_sets ?? [];
    this.queue.update((queue) =>
      mergeDraft(queue, this.toEntry(card, { card, printings, setCode: printings[0]?.set_code ?? 'N/D', language: 'EN', source: 'name', needsReview: true })),
    );
    void this.prices.ensure([card.id]);
    this.results.set([]);
    this.searchTerm = '';
    this.reviewOpen.set(true);
  }

  protected async confirm(): Promise<void> {
    this.saving.set(true);
    try {
      const drafts: CollectionDraft[] = this.queue().map(({ tempId, printings, needsReview, ...draft }) => draft);
      await this.collection.addMany(drafts);
      this.toast.success(`${this.queueCount()} carte aggiunte alla collezione`);
      this.queue.set([]);
      this.close();
    } catch {
      this.toast.error('Salvataggio non riuscito. Riprova.');
    } finally {
      this.saving.set(false);
    }
  }

  private feedback(): void {
    this.flash.set(true);
    setTimeout(() => this.flash.set(false), 250);
    navigator.vibrate?.(40);
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.frequency.value = 880;
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
      osc.onended = () => void ctx.close();
    } catch {
      // audio is optional
    }
  }

  private updateHintOnMiss(): void {
    let last = 0;
    const check = setInterval(() => {
      const miss = this.scanner.lastMiss();
      if (miss !== last) {
        last = miss;
        this.hint.set('Carta non riconosciuta: avvicinati o aggiungila a mano');
      }
    }, 400);
    this.destroyRef.onDestroy(() => clearInterval(check));
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx ng build --configuration development`
Expected: build succeeds. Fix any strict-template errors (e.g. `$any(...)` usages) before moving on.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/profile/components
git commit -m "feat(collection): scan panel and review list components"
```

---

### Task 9: Collection section and profile wiring

**Files:**
- Create: `src/app/features/profile/components/collection-section.component.ts`
- Modify: `src/app/features/profile/pages/profile.page.ts` (imports array, template, import statement)

**Interfaces:**
- Consumes: `CollectionService`, `CollectionPriceService`, `collectionTotals`, `CollectionScannerComponent`, `CARD_CONDITIONS`, `CARD_LANGUAGES`.
- Produces: `<app-collection-section />`.

- [ ] **Step 1: Create the section component**

`src/app/features/profile/components/collection-section.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CARD_CONDITIONS, CARD_LANGUAGES, CardCondition, CardLanguage, CollectionItem } from '../../../models/collection.model';
import { CollectionPriceService } from '../../../services/collection-price.service';
import { CollectionService } from '../../../services/collection.service';
import { collectionTotals } from '../../../utils/collection.utils';
import { CollectionScannerComponent } from './collection-scanner.component';

const PAGE_SIZE = 60;

/** "Collezione" block of the profile: totals, filters, list with inline edit, scan entry point. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-collection-section',
  standalone: true,
  imports: [FormsModule, CollectionScannerComponent],
  template: `
    <section class="space-y-4 rounded-lg border border-base-300/60 p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-1 min-w-0">
          <h2 class="section-title">Collezione</h2>
          @if (collection.items().length > 0) {
            <p class="text-sm text-base-content/70">
              {{ totals().totalCards }} carte · {{ totals().uniqueCards }} uniche
              <span class="mx-1 text-base-content/30">|</span>
              <span class="font-medium text-base-content" [title]="valueHint()">≈ {{ eur.format(totals().valueEur) }}</span>
            </p>
          }
        </div>
        <button class="btn btn-primary btn-sm shrink-0" (click)="scanning.set(true)">Scansiona</button>
      </div>

      @switch (collection.status()) {
        @case ('loading') {
          <div class="flex justify-center py-8"><span class="loading loading-spinner"></span></div>
        }
        @case ('error') {
          <div class="text-sm text-error flex items-center gap-2">
            Impossibile caricare la collezione.
            <button class="btn btn-xs btn-outline" (click)="reload()">Riprova</button>
          </div>
        }
        @default {
          @if (collection.status() === 'offline') {
            <p class="text-xs text-base-content/60">Offline: le modifiche si sincronizzano appena torni online.</p>
          }

          @if (collection.items().length === 0) {
            <div class="empty-state py-10">
              <p class="empty-state-title">La tua collezione è vuota</p>
              <p class="empty-state-hint">Scansiona le tue carte con la fotocamera: riconosco set, rarità e valore.</p>
              <button class="btn btn-primary btn-sm mt-4" (click)="scanning.set(true)">Scansiona la prima carta</button>
            </div>
          } @else {
            <div class="flex flex-wrap gap-2">
              <input class="input input-bordered input-sm flex-1 min-w-40" type="search" placeholder="Cerca per nome" [ngModel]="query()" (ngModelChange)="query.set($event); visible.set(PAGE_SIZE)" name="collectionQuery" />
              <select class="select select-bordered select-sm" [ngModel]="setFilter()" (ngModelChange)="setFilter.set($event); visible.set(PAGE_SIZE)" name="setFilter" aria-label="Set">
                <option value="">Tutti i set</option>
                @for (s of setOptions(); track s) {
                  <option [value]="s">{{ s }}</option>
                }
              </select>
              <select class="select select-bordered select-sm" [ngModel]="rarityFilter()" (ngModelChange)="rarityFilter.set($event); visible.set(PAGE_SIZE)" name="rarityFilter" aria-label="Rarità">
                <option value="">Tutte le rarità</option>
                @for (r of rarityOptions(); track r) {
                  <option [value]="r">{{ r }}</option>
                }
              </select>
              <select class="select select-bordered select-sm" [ngModel]="conditionFilter()" (ngModelChange)="conditionFilter.set($event); visible.set(PAGE_SIZE)" name="conditionFilter" aria-label="Condizione">
                <option value="">Ogni condizione</option>
                @for (c of conditions; track c) {
                  <option [value]="c">{{ c }}</option>
                }
              </select>
            </div>

            @if (filtered().length === 0) {
              <p class="text-sm text-base-content/60 py-4 text-center">Nessuna carta corrisponde ai filtri.</p>
            }

            <ul class="divide-y divide-base-300/60">
              @for (item of shown(); track item.id) {
                <li class="py-3 space-y-2">
                  <div class="flex items-center gap-3">
                    <img [src]="'https://images.ygoprodeck.com/images/cards_small/' + item.passcode + '.jpg'" alt="" class="w-10 rounded shrink-0" loading="lazy" />
                    <div class="min-w-0 flex-1">
                      <p class="font-medium truncate">{{ item.cardName }}</p>
                      <p class="text-xs text-base-content/60 truncate">
                        {{ item.setCode }} · {{ item.rarity }} · {{ item.language }} · {{ item.condition }}{{ item.firstEdition ? ' · 1st' : '' }}
                      </p>
                    </div>
                    <div class="text-right shrink-0">
                      <p class="text-sm tabular-nums">×{{ item.quantity }}</p>
                      <p class="text-xs text-base-content/60">{{ priceLabel(item) }}</p>
                    </div>
                    <button class="btn btn-xs btn-ghost shrink-0" (click)="toggleEdit(item.id)">{{ editingId() === item.id ? 'Chiudi' : 'Modifica' }}</button>
                  </div>

                  @if (editingId() === item.id) {
                    <div class="pl-[3.25rem] grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                      <div class="flex items-center gap-1">
                        <button class="btn btn-sm btn-ghost btn-square" aria-label="Meno" (click)="collection.update(item.id, { quantity: max1(item.quantity - 1) })">−</button>
                        <span class="w-6 text-center tabular-nums">{{ item.quantity }}</span>
                        <button class="btn btn-sm btn-ghost btn-square" aria-label="Più" (click)="collection.update(item.id, { quantity: item.quantity + 1 })">+</button>
                      </div>
                      <select class="select select-bordered select-sm" [ngModel]="item.condition" (ngModelChange)="setCondition(item, $event)" [name]="'cond-' + item.id" aria-label="Condizione">
                        @for (c of conditions; track c) {
                          <option [value]="c">{{ c }}</option>
                        }
                      </select>
                      <select class="select select-bordered select-sm" [ngModel]="item.language" (ngModelChange)="setLanguage(item, $event)" [name]="'lang-' + item.id" aria-label="Lingua">
                        @for (l of languages; track l) {
                          <option [value]="l">{{ l }}</option>
                        }
                      </select>
                      <label class="label cursor-pointer justify-start gap-2 py-0">
                        <input type="checkbox" class="checkbox checkbox-sm" [checked]="item.firstEdition" (change)="collection.update(item.id, { firstEdition: $any($event.target).checked })" />
                        <span class="text-sm">1st Edition</span>
                      </label>
                      <input class="input input-bordered input-sm col-span-2 sm:col-span-3" type="text" placeholder="Note" [ngModel]="item.notes ?? ''" (change)="collection.update(item.id, { notes: $any($event.target).value.trim() || null })" [name]="'notes-' + item.id" />
                      <button class="btn btn-sm btn-ghost text-error justify-self-end" (click)="remove(item)">Rimuovi</button>
                    </div>
                  }
                </li>
              }
            </ul>

            @if (filtered().length > shown().length) {
              <button class="btn btn-sm btn-ghost w-full" (click)="visible.set(visible() + PAGE_SIZE)">Mostra altre ({{ filtered().length - shown().length }})</button>
            }
          }
        }
      }
    </section>

    @if (scanning()) {
      <app-collection-scanner (closed)="scanning.set(false)" />
    }
  `,
})
export class CollectionSectionComponent {
  protected readonly collection = inject(CollectionService);
  private readonly priceService = inject(CollectionPriceService);

  protected readonly PAGE_SIZE = PAGE_SIZE;
  protected readonly conditions = CARD_CONDITIONS;
  protected readonly languages = CARD_LANGUAGES;
  protected readonly eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

  protected readonly scanning = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly visible = signal(PAGE_SIZE);
  protected readonly query = signal('');
  protected readonly setFilter = signal('');
  protected readonly rarityFilter = signal('');
  protected readonly conditionFilter = signal('');

  protected readonly totals = computed(() => collectionTotals(this.collection.items(), this.priceService.prices()));
  protected readonly valueHint = computed(() => {
    const unpriced = this.totals().unpricedCards;
    return `Stima Cardmarket (prezzo medio per carta)${unpriced ? `; ${unpriced} copie senza prezzo non incluse` : ''}`;
  });

  protected readonly setOptions = computed(() => [...new Set(this.collection.items().map((i) => i.setCode.split('-')[0]))].sort());
  protected readonly rarityOptions = computed(() => [...new Set(this.collection.items().map((i) => i.rarity))].sort());

  protected readonly filtered = computed(() => {
    const query = this.query().trim().toLowerCase();
    const set = this.setFilter();
    const rarity = this.rarityFilter();
    const condition = this.conditionFilter();
    return this.collection.items().filter(
      (i) =>
        (!query || i.cardName.toLowerCase().includes(query)) &&
        (!set || i.setCode.startsWith(`${set}-`)) &&
        (!rarity || i.rarity === rarity) &&
        (!condition || i.condition === condition),
    );
  });
  protected readonly shown = computed(() => this.filtered().slice(0, this.visible()));

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    await this.collection.load();
    await this.priceService.ensure(this.collection.items().map((i) => i.passcode));
  }

  protected toggleEdit(id: string): void {
    this.editingId.set(this.editingId() === id ? null : id);
  }

  protected max1(value: number): number {
    return Math.max(1, value);
  }

  protected priceLabel(item: CollectionItem): string {
    const price = this.priceService.prices().get(item.passcode);
    return price == null ? 'n/d' : this.eur.format(price * item.quantity);
  }

  protected setCondition(item: CollectionItem, value: string): void {
    void this.collection.update(item.id, { condition: value as CardCondition });
  }

  protected setLanguage(item: CollectionItem, value: string): void {
    void this.collection.update(item.id, { language: value as CardLanguage });
  }

  protected remove(item: CollectionItem): void {
    this.editingId.set(null);
    void this.collection.remove(item.id);
  }
}
```


- [ ] **Step 2: Mount it in the profile page**

In `src/app/features/profile/pages/profile.page.ts`:

1. Add the import next to the other imports:

```ts
import { CollectionSectionComponent } from '../components/collection-section.component';
```

2. Change `imports: [FormsModule, RouterLink],` to:

```ts
  imports: [FormsModule, RouterLink, CollectionSectionComponent],
```

3. In the template, insert directly after the closing `</section>` of the "Profile header" block and before the `<section class="space-y-3 rounded-lg border border-base-300/60 p-4">` that contains "Modello decisionale":

```html
        <app-collection-section />
```

- [ ] **Step 3: Type-check and run the whole unit suite**

Run: `npx ng build --configuration development`
Expected: build succeeds.

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: all specs pass (new ones: set-code, name-match, scan-consensus, scan-geometry, collection utils; nothing previously green may regress).

- [ ] **Step 4: Manual verification in the browser**

Run `npm run start:app`, open `http://localhost:4200/profile`, log in, and check:
- Empty state shows with a single "Scansiona la prima carta" CTA.
- "Scansiona" opens the full-screen panel; camera permission prompt appears; denying it shows the message and "Aggiungi a mano" still works (open "Rivedi", expand "Aggiungi a mano", search "Dark Magician", pick it).
- A manual card appears in the review list with a "Da verificare" badge; Dettagli opens printing/condition/language/1st; "Conferma 1 carta" saves, toast appears, panel closes, the card is in the list with price and the header total updates.
- Reload the page: the collection is still there (Supabase), and with devtools Network set to Offline an edit shows the offline note and syncs after going online.
- With a real card and good light, hold it inside the dashed frame: a read should be accepted within about 1–2 seconds, flash/beep, and the same card must not be counted again while it stays in frame. Report honestly how reliable the OCR was on real cards; do not claim it works if not tested with a camera.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/profile
git commit -m "feat(collection): Collezione section in the profile page"
```

---

### Task 10: Sync the spec with what was built

**Files:**
- Modify: `docs/superpowers/specs/2026-10-26-profile-collection-design.md`

- [ ] **Step 1: Record the deviations**

Edit the spec so it matches reality:
- Data table: add column `card_name text` (display without a card fetch).
- Price: Cardmarket EUR is **per card** (`card_prices[0].cardmarket_price`), not per printing; `set_price` is a TCGplayer USD value and is not used.
- Recognition: level 3 (artwork hash) is **not implemented** because `images.ygoprodeck.com` has no CORS headers (canvas is tainted); it needs an image proxy endpoint and is a follow-up decision.
- Set-code lookup uses `cardsetsinfo.php` then `cardinfo.php?id=`; candidates are tried as printed, then the English equivalent.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-10-26-profile-collection-design.md
git commit -m "docs: align collection spec with implementation findings"
```
