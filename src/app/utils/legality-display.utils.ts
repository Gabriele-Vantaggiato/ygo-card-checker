import { BanlistStatus } from '../models/ygo-format.model';
import { LegalityVerdict } from '../models/ygo-card.model';

export function verdictBadgeClass(verdict: LegalityVerdict): string {
  switch (verdict) {
    case 'legal':
      return 'badge-success';
    case 'restricted':
      return 'badge-warning';
    default:
      return 'badge-error';
  }
}

export function quantityBadgeClass(status: BanlistStatus): string {
  switch (status) {
    case 'Forbidden':
      return 'badge-error';
    case 'Limited':
    case 'Semi-Limited':
      return 'badge-warning';
    default:
      return 'badge-success';
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
