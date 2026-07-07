import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { combineLatest, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { ComboPayoff, ComboRequirement, ComboResult } from '../../../models/card-combo.model';
import { CardKnowledgeEffect } from '../../../models/card-knowledge.model';
import { YgoCard } from '../../../models/ygo-card.model';
import { CardComboService } from '../../../services/card-combo.service';
import { CardKnowledgeService } from '../../../services/card-knowledge.service';
import { I18nService } from '../../../services/i18n.service';
import { YgoApiService } from '../../../services/ygo-api.service';
import { FormatStore } from '../../../core/stores/format.store';

const EMPTY_COMBO: ComboResult = {
  tags: [],
  displayTags: [],
  effects: [],
  requirements: [],
  payoffs: [],
  enablers: [],
  targets: [],
  synergies: [],
  lines: [],
  available: false,
};

import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-combo-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <main class="page-main page-stack max-w-3xl lg:max-w-4xl">
      <header class="page-header flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1 min-w-0">
          <h1 class="page-title">{{ 'combo.title' | translate }}</h1>
          <p class="page-subtitle">{{ 'combo.subtitle' | translate }}</p>
        </div>
        <a
          routerLink="/"
          [queryParams]="card() ? { cardId: card()!.id } : null"
          class="btn btn-ghost btn-sm gap-1.5 shrink-0"
        >
          <span aria-hidden="true">←</span>
          {{ 'combo.backToSearch' | translate }}
        </a>
      </header>

      @if (loading()) {
        <p class="text-sm text-base-content/60">{{ 'combo.loading' | translate }}</p>
      } @else if (!card()) {
        <div class="empty-state py-10">
          <p class="empty-state-title">{{ 'combo.noCard' | translate }}</p>
        </div>
      } @else {
        <section class="duel-panel">
          <div class="p-4 sm:p-5">
            <div class="flex gap-4 items-start">
              @if (card()!.card_images[0].image_url_small; as img) {
                <img [src]="img" [alt]="" class="w-14 sm:w-16 rounded shrink-0" />
              }
              <div class="min-w-0 space-y-1">
                <h2 class="text-lg font-bold leading-tight">{{ card()!.name }}</h2>
                <p class="text-xs sm:text-sm text-base-content/60 line-clamp-3">{{ card()!.desc }}</p>
              </div>
            </div>
          </div>
        </section>

        @if (!combo().available) {
          <p class="text-sm text-base-content/60">{{ 'combo.unavailable' | translate }}</p>
        } @else if (
          combo().enablers.length === 0 &&
          combo().targets.length === 0 &&
          combo().lines.length === 0
        ) {
          <p class="text-sm text-base-content/60">{{ 'combo.unparsed' | translate }}</p>
        } @else {
          @if (combo().lines.length > 0) {
            <section class="space-y-2">
              <h3 class="section-title">{{ 'combo.linesTitle' | translate }}</h3>
              @for (line of combo().lines; track line.id) {
                <article class="duel-panel">
                  <div class="p-4 space-y-2">
                    <ol class="space-y-2">
                      @for (step of line.steps; track step.cardId + step.role; let idx = $index) {
                        <li class="flex items-center gap-3">
                          <span class="badge badge-neutral badge-sm shrink-0">{{ idx + 1 }}</span>
                          <img [src]="step.imageSmall" [alt]="" class="w-8 h-11 object-cover rounded shrink-0" loading="lazy" />
                          <div class="min-w-0 flex-1">
                            <button
                              type="button"
                              class="text-sm font-medium truncate text-left hover:text-primary"
                              (click)="openCard(step.cardId)"
                            >
                              {{ step.name }}
                            </button>
                            <p class="text-[11px] text-base-content/60 truncate">
                              {{ (step.reasonKey) | translate: step.reasonParams }}
                            </p>
                          </div>
                        </li>
                      }
                    </ol>
                  </div>
                </article>
              }
            </section>
          }

          @if (relatedCards().length > 0) {
            <section class="duel-panel">
              <div class="duel-panel-header">{{ 'combo.relatedTitle' | translate }}</div>
              <ul class="divide-y divide-base-300/60">
                @for (item of relatedCards(); track item.id + item.group) {
                  <li>
                    <button
                      type="button"
                      class="w-full flex items-center gap-3 p-3 hover:bg-base-200/50 text-left transition-colors"
                      (click)="openCard(item.id)"
                    >
                      <img [src]="item.imageSmall" [alt]="" class="w-9 h-12 object-cover rounded shrink-0" loading="lazy" />
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium truncate">{{ item.name }}</p>
                        <p class="text-[11px] text-base-content/55 truncate">
                          {{ (item.groupKey) | translate }} · {{ (item.reasonKey) | translate: item.reasonParams }}
                        </p>
                      </div>
                    </button>
                  </li>
                }
              </ul>
            </section>
          }

          @if (combo().displayTags.length > 0 || combo().requirements.length > 0 || combo().payoffs.length > 0 || combo().effects.length > 0) {
            <details class="duel-panel group">
              <summary class="duel-panel-header cursor-pointer list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                <span class="text-primary/80 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
                {{ 'combo.technicalDetails' | translate }}
              </summary>
              <div class="p-4 space-y-3">
                @if (combo().displayTags.length > 0) {
                  <div class="flex flex-wrap gap-1">
                    @for (tag of combo().displayTags; track tag.id) {
                      <span class="badge badge-secondary badge-sm badge-outline">{{ (tag.labelKey) | translate }}</span>
                    }
                  </div>
                }
                <div class="flex flex-wrap gap-2">
                  @for (req of combo().requirements; track $index) {
                    <span class="badge badge-outline badge-primary badge-sm">{{ requirementLabel(req) }}</span>
                  }
                  @for (pay of combo().payoffs; track $index) {
                    <span class="badge badge-outline badge-secondary badge-sm">{{ payoffLabel(pay) }}</span>
                  }
                  @for (effect of combo().effects; track effect.kind) {
                    <span class="badge badge-outline badge-info badge-sm">{{ effectLabel(effect) }}</span>
                  }
                </div>
              </div>
            </details>
          }

          @if (combo().enablers.length === 0 && combo().targets.length === 0 && combo().lines.length === 0 && combo().synergies.length === 0) {
            <p class="text-sm text-base-content/60">{{ 'combo.emptyFormat' | translate }}</p>
          }
        }
      }
    </main>
  `,
})
export class ComboPage {
  protected readonly i18n = inject(I18nService);
  protected readonly formatStore = inject(FormatStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ygoApi = inject(YgoApiService);
  private readonly comboService = inject(CardComboService);
  private readonly knowledge = inject(CardKnowledgeService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly card = signal<YgoCard | null>(null);
  readonly combo = signal<ComboResult>(EMPTY_COMBO);

  readonly relatedCards = computed(() => {
    const combo = this.combo();
    const enablers = combo.enablers.map((item) => ({
      ...item,
      group: 'enabler' as const,
      groupKey: 'combo.enablersTitle',
    }));
    const targets = combo.targets.map((item) => ({
      ...item,
      group: 'target' as const,
      groupKey: 'combo.targetsTitle',
    }));
    const synergies = combo.synergies.map((item) => ({
      ...item,
      group: 'synergy' as const,
      groupKey: 'combo.synergiesTitle',
    }));
    return [...enablers, ...targets, ...synergies];
  });

  constructor() {
    combineLatest([this.route.queryParamMap, this.formatStore.selectedFormat$, this.i18n.lang$])
      .pipe(
        map(([params, format, lang]) => ({
          cardId: (() => {
            const raw = params.get('cardId');
            return raw && /^\d+$/.test(raw) ? Number(raw) : null;
          })(),
          format,
          lang,
        })),
        tap(() => this.loading.set(true)),
        switchMap(({ cardId, format, lang }) => {
          if (!cardId || !format) {
            return of({ card: null as YgoCard | null, combo: EMPTY_COMBO });
          }
          return this.ygoApi.getCardById$(cardId, lang).pipe(
            switchMap((card) => {
              if (!card) {
                return of({ card: null as YgoCard | null, combo: EMPTY_COMBO });
              }
              return this.comboService.findCombos$(card, format).pipe(
                map((combo) => ({ card, combo })),
              );
            }),
            catchError(() => of({ card: null as YgoCard | null, combo: EMPTY_COMBO })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ card, combo }) => {
        this.card.set(card);
        this.combo.set(combo);
        this.loading.set(false);
      });
  }

  requirementLabel(req: ComboRequirement): string {
    return this.i18n.t('combo.requirement.control', {
      level: String(req.minLevel),
      names: req.names.join(' / '),
    });
  }

  payoffLabel(pay: ComboPayoff): string {
    if (pay.kind === 'self_summon_hand_tribute_atk') {
      return this.i18n.t('combo.payoff.selfSummonTribute', {
        count: String(pay.tributeCount),
        atk: String(pay.minAtk),
      });
    }
    return this.i18n.t('combo.payoff.specialSummonDeck', {
      level: String(pay.minLevel),
      names: pay.names.join(' / '),
    });
  }

  effectLabel(effect: CardKnowledgeEffect): string {
    const key = this.knowledge.effectLabelKey(effect);
    const translated = this.i18n.t(key, this.knowledge.effectLabelParams(effect));
    return translated === key ? effect.kind : translated;
  }

  openCard(cardId: number): void {
    void this.router.navigate(['/combo'], { queryParams: { cardId } });
  }
}
