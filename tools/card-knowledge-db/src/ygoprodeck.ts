import type { YgoProDeckCard } from './types';

const API_BASE = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const PAGE_SIZE = 100;
const REQUEST_DELAY_MS = 60;

export interface FetchPageResult {
  cards: YgoProDeckCard[];
  totalRows: number;
  hasMore: boolean;
}

export async function fetchCardPage(
  offset: number,
  language: 'en' | 'it' = 'en',
): Promise<FetchPageResult> {
  const params = new URLSearchParams({
    misc: 'yes',
    num: String(PAGE_SIZE),
    offset: String(offset),
  });
  if (language === 'it') {
    params.set('language', 'it');
  }

  const response = await fetch(`${API_BASE}?${params}`);
  if (!response.ok) {
    throw new Error(`YGOPRODeck API error ${response.status} at offset ${offset}`);
  }

  const body = (await response.json()) as {
    data?: YgoProDeckCard[];
    meta?: { total_rows?: number };
  };
  const cards = body.data ?? [];
  const totalRows = body.meta?.total_rows ?? cards.length;
  return {
    cards,
    totalRows,
    hasMore: offset + cards.length < totalRows,
  };
}

export async function fetchAllCards(
  language: 'en' | 'it' = 'en',
  onProgress?: (loaded: number, total: number) => void,
  maxRows?: number,
): Promise<YgoProDeckCard[]> {
  const all: YgoProDeckCard[] = [];
  let offset = 0;
  let totalRows = 0;

  do {
    const page = await fetchCardPage(offset, language);
    totalRows = page.totalRows;
    all.push(...page.cards);
    offset += page.cards.length;
    onProgress?.(all.length, totalRows);
    if (maxRows && all.length >= maxRows) {
      return all.slice(0, maxRows);
    }
    if (page.hasMore) {
      await sleep(REQUEST_DELAY_MS);
    }
  } while (offset < totalRows);

  return all;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
