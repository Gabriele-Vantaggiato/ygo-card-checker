import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  LegalityReason,
  LegalityResult,
  LegalityVerdict,
  YgoCard,
} from '../models/ygo-card.model';
import { BanlistStatus, YgoFormat } from '../models/ygo-format.model';
import { BanlistService } from './banlist.service';

@Injectable({ providedIn: 'root' })
export class LegalityService {
  constructor(private readonly banlistService: BanlistService) {}

  evaluate(card: YgoCard, format: YgoFormat, banlistStatus: BanlistStatus): LegalityResult {
    return this.buildResult(card, format, banlistStatus);
  }

  evaluateWithLocalBanlist$(card: YgoCard, format: YgoFormat): Observable<LegalityResult> {
    return this.banlistService.loadBanlist$(format.banlistId!).pipe(
      map((snapshot) =>
        this.buildResult(
          card,
          format,
          this.banlistService.getStatus(snapshot, card.id, card.name),
        ),
      ),
    );
  }

  readBanlistFromCard(card: YgoCard, format: YgoFormat): BanlistStatus {
    if (format.banlistSource === 'ban_goat') {
      return card.banlist_info?.ban_goat ?? 'Unlimited';
    }

    if (format.banlistSource === 'ban_tcg') {
      return card.banlist_info?.ban_tcg ?? 'Unlimited';
    }

    return 'Unlimited';
  }

  needsLocalBanlist(format: YgoFormat): boolean {
    return format.banlistSource === 'local' && !!format.banlistId;
  }

  private buildResult(
    card: YgoCard,
    format: YgoFormat,
    banlistStatus: BanlistStatus,
  ): LegalityResult {
    const reasons: LegalityReason[] = [];
    const tcgDate = card.misc_info?.[0]?.tcg_date ?? null;
    const formats = this.normalizeFormats(card.misc_info?.[0]?.formats);

    let inPool = true;

    if (!tcgDate) {
      inPool = false;
      reasons.push({ key: 'reason.noTcgDate' });
    } else {
      if (format.cardPoolStartDate && tcgDate < format.cardPoolStartDate) {
        inPool = false;
        reasons.push({
          key: 'reason.notInPoolBefore',
          params: { date: tcgDate, start: format.cardPoolStartDate },
        });
      }

      if (format.cardPoolEndDate && tcgDate > format.cardPoolEndDate) {
        inPool = false;
        reasons.push({
          key: 'reason.notInPool',
          params: { date: tcgDate, cutoff: format.cardPoolEndDate },
        });
      }

      if (inPool) {
        reasons.push({ key: 'reason.inPool' });
      }
    }

    if (this.isRetroFormat(format)) {
      if (this.isSpeedDuelExclusive(formats)) {
        inPool = false;
        reasons.push({ key: 'reason.speedDuel' });
      }
      if (this.isRushDuelExclusive(formats)) {
        inPool = false;
        reasons.push({ key: 'reason.rushDuel' });
      }
    }

    reasons.push(this.banlistReason(banlistStatus));

    return {
      verdict: this.computeVerdict(inPool, banlistStatus),
      banlistStatus,
      tcgDate,
      reasons,
    };
  }

  private banlistReason(status: BanlistStatus): LegalityReason {
    switch (status) {
      case 'Forbidden':
        return { key: 'reason.forbidden' };
      case 'Limited':
        return { key: 'reason.limited' };
      case 'Semi-Limited':
        return { key: 'reason.semiLimited' };
      default:
        return { key: 'reason.unlimited' };
    }
  }

  private computeVerdict(inPool: boolean, banlistStatus: BanlistStatus): LegalityVerdict {
    if (!inPool || banlistStatus === 'Forbidden') {
      return 'not-legal';
    }

    if (banlistStatus === 'Limited' || banlistStatus === 'Semi-Limited') {
      return 'restricted';
    }

    return 'legal';
  }

  private normalizeFormats(formats: unknown): string[] {
    return Array.isArray(formats) ? formats : [];
  }

  private isRetroFormat(format: YgoFormat): boolean {
    return format.id !== 'tcg';
  }

  private isSpeedDuelExclusive(formats: string[]): boolean {
    const normalized = formats.map((f) => f.toLowerCase());
    return normalized.includes('speed duel') && !normalized.includes('tcg');
  }

  private isRushDuelExclusive(formats: string[]): boolean {
    const normalized = formats.map((f) => f.toLowerCase());
    return normalized.includes('rush duel') && !normalized.includes('tcg');
  }
}
