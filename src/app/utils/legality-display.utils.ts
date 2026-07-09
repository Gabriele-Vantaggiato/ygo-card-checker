import { LegalityVerdict } from '../models/ygo-card.model';
import { BanlistStatus } from '../models/ygo-format.model';

export function verdictBadgeClass(verdict: LegalityVerdict): string {
  switch (verdict) {
    case 'legal':
      return 'badge-success duel-verdict-badge';
    case 'restricted':
      return 'badge-warning duel-verdict-badge';
    default:
      return 'badge-error duel-verdict-badge';
  }
}

export function quantityBadgeClass(status: BanlistStatus): string {
  switch (status) {
    case 'Forbidden':
      return 'badge-error duel-verdict-badge';
    case 'Limited':
    case 'Semi-Limited':
      return 'badge-warning duel-verdict-badge';
    default:
      return 'badge-success duel-verdict-badge';
  }
}

export function banlistStatusLabelKey(status: BanlistStatus): string {
  switch (status) {
    case 'Forbidden':
      return 'banlist.forbidden';
    case 'Limited':
      return 'banlist.limited';
    case 'Semi-Limited':
      return 'banlist.semiLimited';
    default:
      return 'banlist.unlimited';
  }
}

export function quantityLabelKey(status: BanlistStatus): string {
  switch (status) {
    case 'Forbidden':
      return 'history.quantity.forbidden';
    case 'Limited':
      return 'history.quantity.limited';
    case 'Semi-Limited':
      return 'history.quantity.semiLimited';
    default:
      return 'history.quantity.unlimited';
  }
}

export function verdictLabelKey(verdict: LegalityVerdict): string {
  switch (verdict) {
    case 'legal':
      return 'result.legal';
    case 'restricted':
      return 'result.restricted';
    default:
      return 'result.notLegal';
  }
}

/** Compact playability label for search result chips (banlist-aware). */
export function playabilityChipLabelKey(
  banlistStatus: BanlistStatus | null | undefined,
  verdict: LegalityVerdict | null | undefined,
): string {
  if (!verdict || verdict === 'not-legal' || banlistStatus === 'Forbidden') {
    return 'playability.notPlayable';
  }
  switch (banlistStatus) {
    case 'Limited':
      return 'playability.limited';
    case 'Semi-Limited':
      return 'playability.semiLimited';
    default:
      return 'playability.playable';
  }
}

export function verdictPlayabilityRank(verdict: LegalityVerdict | null | undefined): number {
  switch (verdict) {
    case 'legal':
      return 0;
    case 'restricted':
      return 1;
    case 'not-legal':
      return 2;
    default:
      return 3;
  }
}

export function comparePlayability(
  verdictA: LegalityVerdict | null | undefined,
  verdictB: LegalityVerdict | null | undefined,
): number {
  return verdictPlayabilityRank(verdictA) - verdictPlayabilityRank(verdictB);
}

export function verdictBannerClass(verdict: LegalityVerdict): string {
  switch (verdict) {
    case 'legal':
      return 'bg-success text-success-content';
    case 'restricted':
      return 'bg-warning text-warning-content';
    default:
      return 'bg-error text-error-content';
  }
}

export function verdictShortKey(verdict: LegalityVerdict): string {
  switch (verdict) {
    case 'legal':
      return 'decklist.editor.verdictShort.legal';
    case 'restricted':
      return 'decklist.editor.verdictShort.restricted';
    default:
      return 'decklist.editor.verdictShort.notLegal';
  }
}
