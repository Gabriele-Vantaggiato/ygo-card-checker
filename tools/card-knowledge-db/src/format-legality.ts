export type BanlistStatus = 'Forbidden' | 'Limited' | 'Semi-Limited' | 'Unlimited';
export type LegalityVerdict = 'legal' | 'restricted' | 'not-legal';
export type BanlistSource = 'ban_goat' | 'ban_tcg' | 'local';

export interface FormatDefinition {
  id: string;
  banlistId: string | null;
  cardPoolStartDate: string;
  cardPoolEndDate: string | null;
  banlistSource: BanlistSource;
}

export interface BanlistSnapshot {
  id: string;
  effectiveDate: string;
  cards: Record<string, BanlistStatus>;
  nameIndex: Record<string, BanlistStatus>;
}

export interface CardLegalityInput {
  id: number;
  name: string;
  tcgDate: string | null;
  banTcg: string | null;
  banGoat: string | null;
  formats: string[];
}

export interface FormatLegalityResult {
  formatId: string;
  inPool: boolean;
  banStatus: BanlistStatus;
  verdict: LegalityVerdict;
  maxCopies: number;
}

export function maxCopiesForStatus(status: BanlistStatus): number {
  switch (status) {
    case 'Forbidden':
      return 0;
    case 'Limited':
      return 1;
    case 'Semi-Limited':
      return 2;
    default:
      return 3;
  }
}

export function formatPlayableTag(formatId: string): string {
  return `format:${formatId}`;
}

export function formatCopiesTag(formatId: string, maxCopies: number): string {
  return `copies:${formatId}:${maxCopies}`;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readBanlistStatus(
  card: CardLegalityInput,
  format: FormatDefinition,
  localBanlist: BanlistSnapshot | null,
): BanlistStatus {
  if (format.banlistSource === 'ban_goat') {
    return card.banGoat ?? 'Unlimited';
  }
  if (format.banlistSource === 'ban_tcg') {
    return card.banTcg ?? 'Unlimited';
  }
  if (localBanlist) {
    const byId = localBanlist.cards[String(card.id)];
    if (byId) {
      return byId;
    }
    return localBanlist.nameIndex[normalizeName(card.name)] ?? 'Unlimited';
  }
  return 'Unlimited';
}

function computeVerdict(inPool: boolean, banlistStatus: BanlistStatus): LegalityVerdict {
  if (!inPool || banlistStatus === 'Forbidden') {
    return 'not-legal';
  }
  if (banlistStatus === 'Limited' || banlistStatus === 'Semi-Limited') {
    return 'restricted';
  }
  return 'legal';
}

function isSpeedDuelExclusive(formats: string[]): boolean {
  const normalized = formats.map((value) => value.toLowerCase());
  return normalized.includes('speed duel') && !normalized.includes('tcg');
}

function isRushDuelExclusive(formats: string[]): boolean {
  const normalized = formats.map((value) => value.toLowerCase());
  return normalized.includes('rush duel') && !normalized.includes('tcg');
}

export function evaluateCardForFormat(
  card: CardLegalityInput,
  format: FormatDefinition,
  localBanlist: BanlistSnapshot | null,
): FormatLegalityResult {
  const tcgDate = card.tcgDate;
  let inPool = true;

  if (!tcgDate) {
    inPool = false;
  } else {
    if (format.cardPoolStartDate && tcgDate < format.cardPoolStartDate) {
      inPool = false;
    }
    if (format.cardPoolEndDate && tcgDate > format.cardPoolEndDate) {
      inPool = false;
    }
  }

  if (format.id !== 'tcg') {
    if (isSpeedDuelExclusive(card.formats)) {
      inPool = false;
    }
    if (isRushDuelExclusive(card.formats)) {
      inPool = false;
    }
  }

  const banStatus = readBanlistStatus(card, format, localBanlist);
  const verdict = computeVerdict(inPool, banStatus);
  const maxCopies = inPool ? maxCopiesForStatus(banStatus) : 0;

  return {
    formatId: format.id,
    inPool,
    banStatus,
    verdict,
    maxCopies,
  };
}

export function formatTagsFromResult(result: FormatLegalityResult): string[] {
  if (result.verdict === 'not-legal' || result.maxCopies === 0) {
    return [formatCopiesTag(result.formatId, 0)];
  }
  return [formatPlayableTag(result.formatId), formatCopiesTag(result.formatId, result.maxCopies)];
}
