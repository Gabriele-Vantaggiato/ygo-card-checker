import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { combineLatest, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { DeckStrategyPanelComponent } from '../../components/deck-strategy-panel/deck-strategy-panel.component';
import { FormatSelectorComponent } from '../../components/format-selector/format-selector.component';
import { ComboPayoff, ComboRequirement, ComboResult } from '../../models/card-combo.model';
import { CardKnowledgeEffect } from '../../models/card-knowledge.model';
import { YgoCard } from '../../models/ygo-card.model';
import { CardComboService } from '../../services/card-combo.service';
import { CardKnowledgeService } from '../../services/card-knowledge.service';
import { I18nService } from '../../services/i18n.service';
import { YgoApiService } from '../../services/ygo-api.service';
import { FormatStore } from '../../stores/format.store';

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

@Component({
  selector: 'app-combo-page',
  standalone: true,
  imports: [RouterLink, FormatSelectorComponent, DeckStrategyPanelComponent],
  template: `
    <main class="page-main page-stack max-w-3xl lg:max-w-4xl">
      <div class="flex flex-wrap items-center gap-2">
        <a
          routerLink="/"
          [queryParams]="card() ? { cardId: card()!.id } : null"
          class="btn btn-ghost btn-sm gap-1.5"
        >
          <span aria-hidden="true">←</span>
          {{ i18n.t('combo.backToSearch') }}
        </a>
      </div>

      <header class="space-y-1">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">{{ i18n.t('combo.title') }}</h1>
        <p class="text-sm text-base-content/60">{{ i18n.t('combo.subtitle') }}</p>
      </header>

      <div class="deck-context-strip">
        <div class="deck-context-format">
          <app-format-selector
            [compact]="true"
            [formats]="formatStore.formats()"
            [selectedId]="formatStore.formatId()"
            (selectedChange)="formatStore.setFormatId($event)"
          />
        </div>
        <app-deck-strategy-panel class="min-w-0" />
      </div>

      @if (loading()) {
        <p class="text-sm text-base-content/60">{{ i18n.t('combo.loading') }}</p>
      } @else if (!card()) {
        <div class="alert alert-warning">
          <span>{{ i18n.t('combo.noCard') }}</span>
        </div>
      } @else {
        <section class="duel-panel">
          <div class="p-4 sm:p-6">
            <div class="flex gap-4 items-start">
              @if (card()!.card_images[0].image_url_small; as img) {
                <img [src]="img" [alt]="" class="w-16 sm:w-20 rounded shrink-0" />
              }
              <div class="min-w-0 space-y-2">
                <h2 class="text-lg font-bold">{{ card()!.name }}</h2>
                <p class="text-xs sm:text-sm text-base-content/70 line-clamp-4">{{ card()!.desc }}</p>
              </div>
            </div>
          </div>
        </section>

        @if (!combo().available) {
          <p class="text-sm text-base-content/60">{{ i18n.t('combo.unavailable') }}</p>
        } @else if (
          combo().enablers.length === 0 &&
          combo().targets.length === 0 &&
          combo().lines.length === 0
        ) {
          <p class="text-sm text-base-content/60">{{ i18n.t('combo.unparsed') }}</p>
        } @else {
          @if (combo().displayTags.length > 0) {
            <section class="card bg-base-100 shadow-xl border border-base-300">
              <div class="card-body p-4 sm:p-6 space-y-2">
                <h3 class="font-semibold text-sm">{{ i18n.t('knowledge.mechanics') }}</h3>
                <div class="flex flex-wrap gap-1">
                  @for (tag of combo().displayTags; track tag.id) {
                    <span class="badge badge-secondary badge-sm badge-outline">{{ i18n.t(tag.labelKey) }}</span>
                  }
                </div>
              </div>
            </section>
          }

          @if (combo().requirements.length > 0 || combo().payoffs.length > 0 || combo().effects.length > 0) {
            <section class="card bg-base-100 shadow-xl border border-base-300">
              <div class="card-body p-4 sm:p-6 space-y-3">
                <h3 class="font-semibold">{{ i18n.t('combo.parsedEffects') }}</h3>
                <div class="flex flex-wrap gap-2">
                  @for (req of combo().requirements; track $index) {
                    <span class="badge badge-outline badge-primary">
                      {{ requirementLabel(req) }}
                    </span>
                  }
                  @for (pay of combo().payoffs; track $index) {
                    <span class="badge badge-outline badge-secondary">
                      {{ payoffLabel(pay) }}
                    </span>
                  }
                  @for (effect of combo().effects; track effect.kind) {
                    <span class="badge badge-outline badge-info">
                      {{ effectLabel(effect) }}
                    </span>
                  }
                </div>
              </div>
            </section>
          }

          @if (combo().lines.length > 0) {
            <section class="space-y-3">
              <h3 class="font-semibold text-lg">{{ i18n.t('combo.linesTitle') }}</h3>
              @for (line of combo().lines; track line.id) {
                <article class="duel-panel">
                  <div class="p-4 space-y-3">
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
                              {{ i18n.t(step.reasonKey, step.reasonParams) }}
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

          @if (combo().enablers.length > 0) {
            <section class="card bg-base-100 shadow-xl border border-base-300">
              <div class="card-body p-4 sm:p-6 space-y-3">
                <h3 class="font-semibold">{{ i18n.t('combo.enablersTitle') }}</h3>
                <ul class="space-y-2">
                  @for (item of combo().enablers; track item.id) {
                    <li>
                      <button
                        type="button"
                        class="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-base-200/80 text-left"
                        (click)="openCard(item.id)"
                      >
                        <img [src]="item.imageSmall" [alt]="" class="w-9 h-12 object-cover rounded shrink-0" loading="lazy" />
                        <div class="min-w-0">
                          <p class="text-sm font-medium truncate">{{ item.name }}</p>
                          <p class="text-[11px] text-base-content/60 truncate">
                            {{ i18n.t(item.reasonKey, item.reasonParams) }}
                          </p>
                        </div>
                      </button>
                    </li>
                  }
                </ul>
              </div>
            </section>
          }

          @if (combo().targets.length > 0) {
            <section class="card bg-base-100 shadow-xl border border-base-300">
              <div class="card-body p-4 sm:p-6 space-y-3">
                <h3 class="font-semibold">{{ i18n.t('combo.targetsTitle') }}</h3>
                <ul class="space-y-2">
                  @for (item of combo().targets; track item.id) {
                    <li>
                      <button
                        type="button"
                        class="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-base-200/80 text-left"
                        (click)="openCard(item.id)"
                      >
                        <img [src]="item.imageSmall" [alt]="" class="w-9 h-12 object-cover rounded shrink-0" loading="lazy" />
                        <div class="min-w-0">
                          <p class="text-sm font-medium truncate">{{ item.name }}</p>
                          <p class="text-[11px] text-base-content/60 truncate">
                            {{ i18n.t(item.reasonKey, item.reasonParams) }}
                          </p>
                        </div>
                      </button>
                    </li>
                  }
                </ul>
              </div>
            </section>
          }

          @if (combo().synergies.length > 0) {
            <section class="card bg-base-100 shadow-xl border border-primary/30">
              <div class="card-body p-4 sm:p-6 space-y-3">
                <h3 class="font-semibold">{{ i18n.t('combo.synergiesTitle') }}</h3>
                <p class="text-xs text-base-content/60">{{ i18n.t('combo.synergiesHint') }}</p>
                <ul class="space-y-2">
                  @for (item of combo().synergies; track item.id) {
                    <li>
                      <button
                        type="button"
                        class="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-base-200/80 text-left"
                        (click)="openCard(item.id)"
                      >
                        <img [src]="item.imageSmall" [alt]="" class="w-9 h-12 object-cover rounded shrink-0" loading="lazy" />
                        <div class="min-w-0">
                          <p class="text-sm font-medium truncate">{{ item.name }}</p>
                          <p class="text-[11px] text-base-content/60 truncate">
                            {{ i18n.t(item.reasonKey, item.reasonParams) }}
                          </p>
                        </div>
                      </button>
                    </li>
                  }
                </ul>
              </div>
            </section>
          }

          @if (combo().enablers.length === 0 && combo().targets.length === 0 && combo().lines.length === 0 && combo().synergies.length === 0) {
            <p class="text-sm text-base-content/60">{{ i18n.t('combo.emptyFormat') }}</p>
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
