import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import {
  ComboEntry,
  ComboIndex,
  ComboPartner,
  ComboPartnerRecord,
  ComboResult,
} from '../models/card-combo.model';
import { YgoCard } from '../models/ygo-card.model';
import { BanlistStatus, YgoFormat } from '../models/ygo-format.model';
import { CardLegalityFacade } from './card-legality.facade';
import { toDisplayTags } from '../utils/knowledge-display.utils';

const INDEX_URL = 'assets/data/card-knowledge/combos.json';

const PARTNER_REASON_KEYS: Record<ComboPartnerRecord['role'], string> = {
  satisfies_requirement: 'combo.reason.satisfiesRequirement',
  puts_on_field: 'combo.reason.putsOnField',
  summon_target: 'combo.reason.summonTarget',
  tribute_fodder: 'combo.reason.tributeFodder',
  summon_support: 'combo.reason.summonSupport',
  enabled_card: 'combo.reason.enabledCard',
};

@Injectable({ providedIn: 'root' })
export class CardComboService {
  private readonly http = inject(HttpClient);
  private readonly cardLegality = inject(CardLegalityFacade);

  private readonly index$ = this.http.get<ComboIndex>(INDEX_URL).pipe(
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  findCombos$(card: YgoCard, format: YgoFormat): Observable<ComboResult> {
    return this.index$.pipe(
      switchMap((index) => {
        if (!index) {
          return of(this.emptyResult());
        }
        const entry = index.entries[String(card.id)];
        if (!entry) {
          return of({ ...this.emptyResult(), available: true });
        }
        return this.filterEntry$(entry, format);
      }),
    );
  }

  private filterEntry$(entry: ComboEntry, format: YgoFormat): Observable<ComboResult> {
    const partners = [...entry.enablers, ...entry.targets];
    const stubs = partners.map((partner) => this.toYgoCard(partner));
    if (stubs.length === 0) {
      return of(this.toResult(entry, [], [], []));
    }

    return this.cardLegality.evaluateMany$(stubs, format).pipe(
      map((legality) => {
        const playable = new Set(
          [...legality.entries()]
            .filter(([, verdict]) => verdict.verdict === 'legal' || verdict.verdict === 'restricted')
            .map(([id]) => id),
        );

        const enablers = entry.enablers
          .filter((item) => playable.has(item.id))
          .map((item) => this.toPartner(item));
        const targets = entry.targets
          .filter((item) => playable.has(item.id))
          .map((item) => this.toPartner(item));
        const playableIds = new Set([...enablers, ...targets].map((item) => item.id));

        const lines = entry.lines
          .map((line) => ({
            ...line,
            steps: line.steps.filter(
              (step) => step.role === 'source' || playableIds.has(step.cardId),
            ),
          }))
          .filter((line) => line.steps.some((step) => step.role === 'target'));

        return this.toResult(entry, enablers, targets, lines.slice(0, 8));
      }),
    );
  }

  private toResult(
    entry: ComboEntry,
    enablers: ComboPartner[],
    targets: ComboPartner[],
    lines: ComboResult['lines'],
  ): ComboResult {
    const tags = entry.tags ?? [];
    const effects = (entry.effects ?? []) as ComboResult['effects'];
    return {
      tags,
      displayTags: toDisplayTags(tags),
      effects,
      requirements: entry.requirements,
      payoffs: entry.payoffs,
      enablers,
      targets,
      lines,
      available: true,
    };
  }

  private toPartner(partner: ComboPartnerRecord): ComboPartner {
    return {
      id: partner.id,
      name: partner.name,
      role: partner.role,
      score: partner.score,
      tcgDate: partner.tcgDate,
      banTcg: partner.banTcg,
      imageSmall: partner.imageSmall,
      reasonKey: PARTNER_REASON_KEYS[partner.role],
      reasonParams: { name: partner.name },
    };
  }

  private toYgoCard(partner: ComboPartnerRecord): YgoCard {
    const banTcg = partner.banTcg as BanlistStatus | null | undefined;
    return {
      id: partner.id,
      name: partner.name,
      type: 'Monster',
      desc: '',
      card_images: [
        {
          id: partner.id,
          image_url: partner.imageSmall.replace('cards_small', 'cards'),
          image_url_small: partner.imageSmall,
        },
      ],
      banlist_info: banTcg ? { ban_tcg: banTcg } : undefined,
      misc_info: partner.tcgDate ? [{ tcg_date: partner.tcgDate }] : undefined,
    };
  }

  private emptyResult(): ComboResult {
    return {
      tags: [],
      displayTags: [],
      effects: [],
      requirements: [],
      payoffs: [],
      enablers: [],
      targets: [],
      lines: [],
      available: false,
    };
  }
}
