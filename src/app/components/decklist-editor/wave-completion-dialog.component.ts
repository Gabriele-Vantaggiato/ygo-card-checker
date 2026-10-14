import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Decklist } from '../../models/decklist.model';
import { YgoFormat } from '../../models/ygo-format.model';
import { DeckBuilderAdd } from '../../features/deck-builder/deck-builder.model';
import { WaveAdvice, WaveCardInfo, WaveCompletionService } from '../../features/deck-builder/wave-completion.service';
import { CompletionMemoryService } from '../../services/completion-memory.service';
import { I18nService } from '../../services/i18n.service';
import { resolveDeckSection } from '../../services/ydke.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CompetitiveScore, scoreDeck } from '../../utils/competitive-score.utils';
import { rankPoolDecks } from '../../utils/pool-completion.utils';
import {
  Wave,
  WaveCard,
  WaveContext,
  WaveKind,
  WaveResult,
  WaveSection,
  WhyTag,
  applyWave,
  nextWave,
} from '../../utils/wave-planner.utils';

interface AppliedWave {
  wave: Wave;
  /** Cards the user took (the wave's cards plus the chosen option). Empty when skipped. */
  taken: WaveCard[];
  /** Index of the chosen option and the options passed over, for waves with a choice. */
  picked: { index: number; options: WaveCard[]; aiTop?: number } | null;
  skipped: boolean;
  auto: boolean;
  before: { draft: Map<string, number>; rejected: Set<number> };
}

const KIND_GLYPH: Record<WaveKind, string> = {
  core: '◆',
  need: '❖',
  partners: '⛓',
  engine: '⚙',
  support: '✦',
  extra: '✶',
  side: '▣',
};
const MAX_AUTO_WAVES = 30;

/**
 * Guided completion in waves. Each wave is a small group of cards with the reason for each one; once taken,
 * the deck changes and the next wave is decided on the updated deck. When the data does not settle a slot,
 * the user picks one of a few alternatives. Every decision is remembered locally and shown back as an analysis.
 */
@Component({
  selector: 'app-wave-completion-dialog',
  standalone: true,
  imports: [A11yModule, NgTemplateOutlet, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .wave-meter { height: 0.5rem; border-radius: 999px; background: color-mix(in oklab, var(--color-base-content, #fff) 10%, transparent); overflow: hidden; display: flex; }
      .wave-meter > span { height: 100%; transition: width 0.45s ease; }
      .wave-meter .base { background: var(--color-primary, #c9a227); }
      .wave-meter .gain { background: color-mix(in oklab, var(--color-primary, #c9a227) 45%, transparent); }
      .wave-tile { transition: transform 0.15s ease, box-shadow 0.15s ease; }
      .wave-tile:hover { transform: translateY(-2px); }
      .wave-enter { animation: wave-in 0.28s ease both; }
      @keyframes wave-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) { .wave-enter, .wave-meter > span, .wave-tile { animation: none; transition: none; } }
    `,
  ],
  template: `
    @if (open()) {
      <dialog class="modal modal-open" open aria-modal="true" aria-labelledby="wave-title" (keydown.escape)="close()">
        <div class="modal-box duel-modal w-[calc(100%-1.5rem)] max-w-5xl max-h-[calc(100dvh-1.5rem)] p-0 flex flex-col overflow-hidden" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
          <!-- header -->
          <header class="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-base-300/50 shrink-0">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <h3 id="wave-title" class="font-display font-semibold text-xl sm:text-2xl">{{ 'wave.title' | translate }}</h3>
                @if (basisLine(); as line) {
                  <p class="text-xs sm:text-sm text-base-content/60 mt-0.5 break-words line-clamp-2 sm:line-clamp-none">{{ line }}</p>
                }
              </div>
              <button type="button" class="btn btn-ghost btn-xs sm:btn-sm shrink-0" (click)="classicRequested.emit()">{{ 'wave.classic' | translate }}</button>
            </div>

            <!-- progress -->
            <div class="mt-3 grid grid-cols-3 gap-x-2 sm:gap-x-4" aria-live="polite">
              @for (m of meters(); track m.key) {
                <div class="min-w-0">
                  <div class="flex items-baseline justify-between gap-1 text-[11px] sm:text-xs">
                    <span class="text-base-content/60">{{ ('wave.meter.' + m.key) | translate }}</span>
                    <span class="tabular-nums font-medium">
                      {{ m.have }}<span class="text-base-content/50">/{{ m.target }}</span>
                      @if (m.gain > 0) { <span class="text-primary"> +{{ m.gain }}</span> }
                    </span>
                  </div>
                  <div class="wave-meter" role="progressbar" [attr.aria-valuenow]="m.have" [attr.aria-valuemax]="m.target" [attr.aria-label]="('wave.meter.' + m.key) | translate">
                    <span class="base" [style.width.%]="m.basePct"></span>
                    <span class="gain" [style.width.%]="m.gainPct"></span>
                  </div>
                </div>
              }
            </div>

            <!-- timeline -->
            @if (history().length > 0) {
              <ol class="mt-3 flex flex-wrap gap-1.5 text-xs" [attr.aria-label]="'wave.timeline' | translate">
                @for (h of history(); track $index) {
                  @if (history().length > 6) {
                    <li class="grid place-items-center w-6 h-6 rounded-full text-[11px] font-medium tabular-nums"
                        [class.bg-primary]="!h.skipped" [class.text-primary-content]="!h.skipped" [class.bg-base-300]="h.skipped"
                        [title]="($index + 1) + ' · ' + (('wave.kind.' + h.wave.kind) | translate)">{{ $index + 1 }}</li>
                  } @else {
                    <li class="badge badge-sm gap-1" [class.badge-ghost]="h.skipped" [class.badge-primary]="!h.skipped" [class.badge-outline]="h.auto">
                      <span aria-hidden="true">{{ h.skipped ? '–' : '✓' }}</span>{{ $index + 1 }} · {{ ('wave.kind.' + h.wave.kind) | translate }}
                    </li>
                  }
                }
              </ol>
            }
          </header>

          <!-- body -->
          <div class="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4">
            @switch (phase()) {
              @case ('loading') {
                <div class="flex flex-col items-center gap-3 py-16 text-base-content/60">
                  <span class="loading loading-spinner loading-lg"></span>
                  <p class="text-sm">{{ 'wave.loading' | translate }}</p>
                </div>
              }
              @case ('unsupported') {
                <div class="py-10 text-center space-y-3">
                  <p class="text-base">{{ 'wave.unsupported' | translate: { format: formatName() } }}</p>
                  <button type="button" class="btn btn-primary" (click)="classicRequested.emit()">{{ 'wave.useClassic' | translate }}</button>
                </div>
              }
              @case ('summary') {
                <section class="wave-enter space-y-4" aria-labelledby="wave-summary-title">
                  <div class="flex items-center gap-3">
                    <span class="text-3xl text-primary" aria-hidden="true">✓</span>
                    <div class="min-w-0">
                      <h4 id="wave-summary-title" class="font-display text-xl font-semibold">{{ summaryTitle() | translate }}</h4>
                      <p class="text-sm text-base-content/60">{{ 'wave.summary.counts' | translate: { main: '' + counts().main, extra: '' + counts().extra, side: '' + counts().side } }}</p>
                    </div>
                  </div>
                  @if (comparison(); as cmp) {
                    <div class="rounded-lg border border-base-300/60 bg-base-200/40 p-3 text-sm space-y-2">
                      <div>
                        <p class="font-medium">{{ 'wave.summary.vsBest' | translate: { name: cmp.name } }}</p>
                        <p class="text-base-content/70 mt-0.5">{{ 'wave.summary.same' | translate: { same: '' + cmp.same, diff: '' + cmp.different } }}</p>
                      </div>
                      @if (cmp.yours.length > 0) {
                        <p class="text-xs"><span class="font-medium text-primary">{{ 'wave.summary.yours' | translate }}</span> {{ namesWithQty(cmp.yours) }}</p>
                      }
                      @if (cmp.theirs.length > 0) {
                        <p class="text-xs"><span class="font-medium text-warning">{{ 'wave.summary.theirs' | translate }}</span> {{ namesWithQty(cmp.theirs) }}</p>
                      }
                    </div>
                  }
                  <ng-container [ngTemplateOutlet]="analysis" />
                </section>
              }
              @default {
                @if (waveOf(); as wave) {
                  <section class="wave-enter space-y-4" [attr.aria-labelledby]="'wave-head'" aria-live="polite">
                    <div class="flex items-start gap-3">
                      <span class="grid place-items-center w-11 h-11 rounded-full bg-primary/15 text-primary text-xl shrink-0" aria-hidden="true">{{ glyph(wave.kind) }}</span>
                      <div class="min-w-0">
                        <p class="duel-eyebrow">{{ 'wave.number' | translate: { n: '' + (history().length + 1) } }}</p>
                        <h4 id="wave-head" class="font-display text-xl font-semibold leading-tight">{{ ('wave.kind.' + wave.kind) | translate }}</h4>
                        <p class="text-sm text-base-content/65 mt-0.5">{{ ('wave.kindHint.' + wave.kind) | translate }}</p>
                      </div>
                    </div>

                    @if (wave.cards.length > 0) {
                      <ul class="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
                        @for (card of wave.cards; track card.section + card.cardId) {
                          <li>
                            <ng-container [ngTemplateOutlet]="tile" [ngTemplateOutletContext]="{ card: card }" />
                          </li>
                        }
                      </ul>
                    }

                    @if (wave.choice; as choice) {
                      <fieldset class="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-3">
                        <legend class="px-2 text-sm font-semibold text-primary">{{ ('wave.choice.' + choice.prompt) | translate }}</legend>
                        <p class="text-xs text-base-content/60">{{ 'wave.choice.hint' | translate: { n: '' + choice.options.length } }}</p>
                        <div class="flex flex-wrap items-center gap-2">
                          <button type="button" class="btn btn-outline btn-xs gap-1" [disabled]="aiState() === 'loading'" (click)="askAi()">
                            @if (aiState() === 'loading') { <span class="loading loading-spinner loading-xs"></span> } @else { <span aria-hidden="true">✦</span> }
                            {{ 'wave.ai.ask' | translate }}
                          </button>
                          <span class="text-[11px] text-base-content/50">{{ 'wave.ai.privacy' | translate }}</span>
                        </div>
                        @if (aiState() === 'unavailable') {
                          <p class="text-xs text-warning" role="status">{{ 'wave.ai.unavailable' | translate }}</p>
                        }
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3" role="radiogroup" [attr.aria-label]="('wave.choice.' + choice.prompt) | translate">
                          @for (option of choice.options; track option.cardId; let i = $index) {
                            <label class="cursor-pointer rounded-lg border bg-base-100/40 p-2 block wave-tile focus-within:ring-2 focus-within:ring-primary"
                                   [class.border-primary]="pickedIndex() === i" [class.ring-2]="pickedIndex() === i" [class.ring-primary]="pickedIndex() === i" [class.border-base-300]="pickedIndex() !== i">
                              <input type="radio" class="sr-only" name="wave-choice" [checked]="pickedIndex() === i" (change)="pick(i)" [attr.aria-label]="nameOf(option.cardId)" />
                              <ng-container [ngTemplateOutlet]="tile" [ngTemplateOutletContext]="{ card: option, recommended: i === choice.recommended, selectable: true }" />
                            </label>
                          }
                        </div>
                      </fieldset>
                    }

                    @if (waveOf()?.cards?.length === 0 && !wave.choice) {
                      <p class="text-sm text-warning">{{ 'wave.empty' | translate }}</p>
                    }
                  </section>
                }
                <div class="mt-5">
                  <ng-container [ngTemplateOutlet]="analysis" />
                </div>
              }
            }
          </div>

          <!-- footer -->
          <footer class="px-4 sm:px-5 py-3 border-t border-base-300/50 shrink-0 flex flex-wrap items-center gap-2 bg-base-100/60">
            @if (phase() === 'wave') {
              <button type="button" class="btn btn-primary btn-sm order-first w-full sm:order-last sm:w-auto" [disabled]="!canApplyWave()" (click)="applyCurrent()">
                {{ 'wave.apply' | translate }}
              </button>
            }
            @if (phase() === 'summary') {
              <button type="button" class="btn btn-primary btn-sm order-first w-full sm:order-last sm:w-auto" [disabled]="finishing() || takenCount() === 0" (click)="finish()">
                @if (finishing()) { <span class="loading loading-spinner loading-xs"></span> }
                {{ 'wave.finish' | translate: { count: '' + takenCount() } }}
              </button>
            }
            @if (history().length > 0 && phase() !== 'loading') {
              <button type="button" class="btn btn-ghost btn-xs sm:btn-sm" (click)="undo()">↶ {{ 'wave.undo' | translate }}</button>
            }
            <span class="flex-1 hidden sm:block"></span>
            @if (phase() === 'wave') {
              <button type="button" class="btn btn-outline btn-xs sm:btn-sm" (click)="skip()">{{ 'wave.skip' | translate }}</button>
              <button type="button" class="btn btn-outline btn-xs sm:btn-sm" (click)="autoComplete()">{{ 'wave.auto' | translate }}</button>
            }
            <button type="button" class="btn btn-ghost btn-xs sm:btn-sm" (click)="close()">{{ 'decklist.dialog.cancel' | translate }}</button>
          </footer>
        </div>
        <form method="dialog" class="modal-backdrop"><button type="button" (click)="close()">close</button></form>
      </dialog>
    }

    <!-- a card tile: image, name, quantity, reasons and how it compares with the closest decks -->
    <ng-template #tile let-card="card" let-recommended="recommended" let-selectable="selectable">
      <div class="wave-tile rounded-lg bg-base-200/50 p-2 h-full flex flex-col gap-1.5 min-w-0" [class.border]="!selectable" [class.border-base-300]="!selectable">
        <div class="relative mx-auto w-20">
          @if (infoOf(card.cardId)?.imageUrlSmall; as src) {
            <img [src]="src" alt="" class="w-20 aspect-[59/86] object-cover rounded shadow" loading="lazy" />
          } @else {
            <div class="w-20 aspect-[59/86] rounded bg-base-300/60 animate-pulse"></div>
          }
          <span class="absolute -top-1.5 -right-1.5 badge badge-primary badge-sm font-semibold tabular-nums">×{{ card.quantity }}</span>
        </div>
        <p class="text-sm font-medium leading-tight text-center line-clamp-2 break-words" [title]="nameOf(card.cardId)">{{ nameOf(card.cardId) }}</p>
        @if (recommended) { <span class="badge badge-success badge-xs mx-auto">{{ 'wave.recommended' | translate }}</span> }
        @if (aiTopId() === card.cardId) { <span class="badge badge-info badge-xs mx-auto">✦ {{ 'wave.ai.top' | translate }}</span> }
        <ul class="mt-auto space-y-1 text-[11px] leading-snug">
          <li [class]="compareClass(card)">{{ compareText(card) }}</li>
          @for (tag of card.why; track $index) {
            <li class="text-base-content/65 break-words">· {{ whyText(tag) }}</li>
          }
          @if (aiReasonOf(card.cardId); as reason) {
            <li class="text-info break-words">✦ {{ reason }}</li>
          }
        </ul>
      </div>
    </ng-template>

    <!-- analysis: quality of the deck so far + the decisions taken -->
    <ng-template #analysis>
      <div class="grid gap-4 md:grid-cols-2">
        <section class="rounded-lg border border-base-300/60 bg-base-200/40 p-3 min-w-0" [attr.aria-label]="'wave.analysis.title' | translate">
          <p class="text-xs uppercase tracking-wide text-base-content/50">{{ 'wave.analysis.title' | translate }}</p>
          @if (score(); as sc) {
            <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt class="text-[11px] text-base-content/50">{{ 'decklist.completion.comp.brick' | translate }}</dt>
                <dd class="font-medium tabular-nums">{{ pct(sc.brickRate) }}%@if (reference(); as ref) {<span class="text-[11px] font-normal text-base-content/50"> ({{ pct(ref.brickRate) }}%)</span>}</dd>
              </div>
              <div>
                <dt class="text-[11px] text-base-content/50">{{ 'decklist.completion.comp.synergy' | translate }}</dt>
                <dd class="font-medium tabular-nums">{{ pct(sc.synergy.inTurn) }}@if (reference(); as ref) {<span class="text-[11px] font-normal text-base-content/50"> ({{ pct(ref.synergy.inTurn) }})</span>}</dd>
              </div>
              <div>
                <dt class="text-[11px] text-base-content/50">{{ 'decklist.completion.comp.consistency' | translate }}</dt>
                <dd class="font-medium tabular-nums">{{ pct(sc.consistency) }}@if (reference(); as ref) {<span class="text-[11px] font-normal text-base-content/50"> ({{ pct(ref.consistency) }})</span>}</dd>
              </div>
              <div>
                <dt class="text-[11px] text-base-content/50">{{ 'decklist.completion.comp.usage' | translate }}</dt>
                <dd class="font-medium tabular-nums">{{ pct(sc.usage) }}%@if (reference(); as ref) {<span class="text-[11px] font-normal text-base-content/50"> ({{ pct(ref.usage) }}%)</span>}</dd>
              </div>
            </dl>
            <p class="text-[11px] text-base-content/50 mt-2">{{ 'wave.analysis.note' | translate }}</p>
          } @else {
            <p class="text-sm text-base-content/50 mt-2">{{ 'wave.analysis.needMore' | translate }}</p>
          }
        </section>

        <section class="rounded-lg border border-base-300/60 bg-base-200/40 p-3 min-w-0" [attr.aria-label]="'wave.log.title' | translate">
          <p class="text-xs uppercase tracking-wide text-base-content/50">{{ 'wave.log.title' | translate }}</p>
          @if (history().length === 0) {
            <p class="text-sm text-base-content/50 mt-2">{{ 'wave.log.empty' | translate }}</p>
          } @else {
            <ol class="mt-2 space-y-2 max-h-56 overflow-y-auto pr-1">
              @for (h of history(); track $index) {
                <li class="text-sm">
                  <p class="font-medium">{{ $index + 1 }}. {{ ('wave.kind.' + h.wave.kind) | translate }}@if (h.skipped) { <span class="badge badge-ghost badge-xs ml-1">{{ 'wave.log.skipped' | translate }}</span> }@if (h.auto) { <span class="badge badge-outline badge-xs ml-1">{{ 'wave.log.auto' | translate }}</span> }</p>
                  @if (!h.skipped) {
                    <p class="text-xs text-base-content/65 break-words">{{ takenSummary(h) }}</p>
                    @if (h.picked; as p) {
                      <p class="text-xs text-primary break-words">{{ 'wave.log.picked' | translate: { chosen: nameOf(p.options[p.index].cardId), others: otherNames(p) } }}</p>
                      @if (p.aiTop && p.aiTop !== p.options[p.index].cardId) {
                        <p class="text-xs text-info break-words">{{ 'wave.log.aiDiffers' | translate: { ai: nameOf(p.aiTop) } }}</p>
                      }
                    }
                  }
                </li>
              }
            </ol>
            @if (memoryCount() > 0) {
              <p class="text-[11px] text-base-content/50 mt-2">{{ 'wave.log.memory' | translate: { n: '' + memoryCount() } }}</p>
            }
          }
        </section>
      </div>
    </ng-template>
  `,
})
export class WaveCompletionDialogComponent {
  private readonly service = inject(WaveCompletionService);
  private readonly memory = inject(CompletionMemoryService);
  private readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = input(false);
  readonly deck = input.required<Decklist>();
  readonly format = input<YgoFormat | null>(null);
  readonly targetMain = input(40);
  readonly includeSide = input(true);

  readonly closed = output<void>();
  /** Everything the user took, ready to be added to the deck in one go. */
  readonly applied = output<DeckBuilderAdd[]>();
  readonly classicRequested = output<void>();

  private readonly loadState = signal<'idle' | 'loading' | 'ready' | 'unsupported'>('idle');
  private readonly ctx = signal<WaveContext | null>(null);
  readonly draft = signal<Map<string, number>>(new Map());
  readonly rejected = signal<Set<number>>(new Set());
  readonly history = signal<AppliedWave[]>([]);
  private readonly info = signal<Map<number, WaveCardInfo>>(new Map());
  private readonly picked = signal<number | null>(null);
  /** AI opinion per choice (keyed by wave id), asked only when the user clicks the button. */
  private readonly advice = signal<Map<string, { state: 'loading' | 'unavailable' | 'ready'; advice?: WaveAdvice }>>(new Map());
  readonly finishing = signal(false);
  readonly reference = signal<CompetitiveScore | null>(null);
  readonly memoryCount = this.memory.count;

  /** Archetype of the closest deck, to scope the learned preferences. Plain field: read inside the planner. */
  private archetype: string | null = null;

  readonly formatName = computed(() => {
    const f = this.format();
    return f ? f.name[this.i18n.lang()] : '';
  });

  readonly result = computed<WaveResult | null>(() => {
    const ctx = this.ctx();
    const format = this.format();
    if (!ctx || !format) return null;
    return nextWave(
      {
        userBySection: this.draft(),
        rejected: this.rejected(),
        preference: (cardId) => this.memory.preference(cardId, format.id, this.archetype),
      },
      ctx,
    );
  });

  readonly waveOf = computed(() => {
    const r = this.result();
    return r && !r.done ? r.wave : null;
  });

  readonly phase = computed<'loading' | 'unsupported' | 'wave' | 'summary'>(() => {
    const state = this.loadState();
    if (state === 'loading' || state === 'idle') return 'loading';
    if (state === 'unsupported') return 'unsupported';
    const r = this.result();
    if (!r) return 'loading';
    return r.done ? 'summary' : 'wave';
  });

  readonly summaryTitle = computed(() => {
    const r = this.result();
    return r && r.done && r.reason === 'no-candidates' ? 'wave.summary.titleNoMore' : 'wave.summary.title';
  });

  readonly aiState = computed(() => {
    const wave = this.waveOf();
    return wave ? (this.advice().get(wave.id)?.state ?? 'idle') : 'idle';
  });

  /** The option the AI ranked first for the current choice. */
  readonly aiTopId = computed(() => {
    const wave = this.waveOf();
    const entry = wave ? this.advice().get(wave.id) : undefined;
    return entry?.state === 'ready' ? (entry.advice?.order[0] ?? null) : null;
  });

  readonly pickedIndex = computed(() => {
    const wave = this.waveOf();
    if (!wave?.choice) return null;
    const manual = this.picked();
    if (manual !== null) return manual;
    const top = this.aiTopId();
    const byAi = top === null ? -1 : wave.choice.options.findIndex((o) => o.cardId === top);
    return byAi >= 0 ? byAi : wave.choice.recommended;
  });

  readonly counts = computed(() => ({
    main: this.countSection('main'),
    extra: this.countSection('extra'),
    side: this.countSection('side'),
  }));

  readonly meters = computed(() => {
    const ctx = this.ctx();
    const counts = this.counts();
    const wave = this.waveOf();
    const gain = { main: 0, extra: 0, side: 0 };
    if (wave) {
      const cards = [...wave.cards];
      const choice = wave.choice?.options[this.pickedIndex() ?? 0];
      if (choice) cards.push(choice);
      for (const c of cards) gain[c.section] += c.quantity;
    }
    const targets = ctx?.targets ?? { main: this.targetMain(), extra: 15, side: this.includeSide() ? 15 : 0 };
    return (['main', 'extra', 'side'] as const)
      .filter((key) => targets[key] > 0)
      .map((key) => ({
        key,
        have: counts[key],
        target: targets[key],
        gain: Math.min(gain[key], Math.max(targets[key] - counts[key], 0)),
        basePct: Math.min(100, (counts[key] / targets[key]) * 100),
        gainPct: Math.min(100 - Math.min(100, (counts[key] / targets[key]) * 100), (gain[key] / targets[key]) * 100),
      }));
  });

  readonly score = computed<CompetitiveScore | null>(() => {
    const ctx = this.ctx();
    if (!ctx?.competitive) return null;
    const main: number[] = [];
    for (const [key, qty] of this.draft()) {
      const [section, id] = key.split(':');
      if (section === 'main') for (let i = 0; i < qty; i++) main.push(Number(id));
    }
    return main.length >= 20 ? scoreDeck(main, ctx.competitive, { samples: 400 }) : null;
  });

  readonly basisLine = computed(() => {
    const wave = this.waveOf();
    const best = wave?.basis.best;
    if (!wave || !best) return '';
    return this.i18n.t('wave.basis', { decks: '' + wave.basis.decks, name: best.name, pct: '' + Math.round(best.coverage * 100) });
  });

  readonly comparison = computed(() => {
    const ctx = this.ctx();
    if (!ctx) return null;
    const userMainExtra = new Map<number, number>();
    for (const [key, qty] of this.draft()) {
      const [section, id] = key.split(':');
      if (section !== 'side') userMainExtra.set(Number(id), (userMainExtra.get(Number(id)) ?? 0) + qty);
    }
    const best = rankPoolDecks(userMainExtra, ctx.pool, { limit: 1, minCoverage: 0.3, minOverlap: 3 })[0];
    if (!best) return null;
    const bestCopies = new Map<number, number>();
    for (const id of best.deck.main) bestCopies.set(id, (bestCopies.get(id) ?? 0) + 1);
    let same = 0;
    let total = 0;
    for (const [key, qty] of this.draft()) {
      const [section, id] = key.split(':');
      if (section !== 'main') continue;
      total += qty;
      same += Math.min(qty, bestCopies.get(Number(id)) ?? 0);
    }
    const yours: Array<{ cardId: number; qty: number }> = [];
    for (const [key, qty] of this.draft()) {
      const [section, id] = key.split(':');
      if (section !== 'main') continue;
      const extra = qty - (bestCopies.get(Number(id)) ?? 0);
      if (extra > 0) yours.push({ cardId: Number(id), qty: extra });
    }
    const mine = new Map<number, number>();
    for (const [key, qty] of this.draft()) {
      const [section, id] = key.split(':');
      if (section === 'main') mine.set(Number(id), qty);
    }
    const theirs: Array<{ cardId: number; qty: number }> = [];
    for (const [id, qty] of bestCopies) {
      const missing = qty - (mine.get(id) ?? 0);
      if (missing > 0) theirs.push({ cardId: id, qty: missing });
    }
    const byQty = (a: { qty: number }, b: { qty: number }) => b.qty - a.qty;
    return {
      name: best.deck.name,
      same,
      different: total - same,
      yours: yours.sort(byQty).slice(0, 8),
      theirs: theirs.sort(byQty).slice(0, 8),
    };
  });

  readonly takenCount = computed(() =>
    this.history().reduce((sum, h) => sum + h.taken.reduce((s, c) => s + c.quantity, 0), 0),
  );

  readonly canApplyWave = computed(() => {
    const wave = this.waveOf();
    if (!wave) return false;
    return wave.cards.length > 0 || (!!wave.choice && this.pickedIndex() !== null);
  });

  constructor() {
    // load the planner context every time the dialog opens
    effect(() => {
      if (!this.open()) return;
      const format = this.format();
      const deck = this.deck();
      untracked(() => this.start(deck, format));
    });
    // fetch names and images for whatever the current wave and the log mention
    effect(() => {
      const wave = this.waveOf();
      const history = this.history();
      const ids = new Set<number>();
      for (const c of wave?.cards ?? []) this.collectIds(c, ids);
      for (const c of wave?.choice?.options ?? []) this.collectIds(c, ids);
      for (const h of history) {
        for (const c of h.taken) this.collectIds(c, ids);
        for (const c of h.picked?.options ?? []) this.collectIds(c, ids);
      }
      const cmp = this.comparison();
      for (const row of [...(cmp?.yours ?? []), ...(cmp?.theirs ?? [])]) ids.add(row.cardId);
      untracked(() => this.ensureInfo([...ids]));
    });
    // remember the archetype of the closest deck for the learned preferences
    effect(() => {
      const wave = this.waveOf();
      if (wave?.basis.best?.archetype !== undefined) this.archetype = wave.basis.best.archetype;
    });
  }

  // ------------------------------------------------------------------ actions

  close(): void {
    this.closed.emit();
  }

  pick(index: number): void {
    this.picked.set(index);
  }

  applyCurrent(): void {
    const wave = this.waveOf();
    const format = this.format();
    if (!wave || !format) return;
    const index = wave.choice ? (this.pickedIndex() ?? wave.choice.recommended) : null;
    const taken = [...wave.cards];
    let pickedInfo: AppliedWave['picked'] = null;
    if (wave.choice && index !== null) {
      taken.push(wave.choice.options[index]);
      const aiTop = this.aiTopId() ?? undefined;
      pickedInfo = { index, options: wave.choice.options, ...(aiTop !== undefined ? { aiTop } : {}) };
    }
    this.pushHistory({ wave, taken, picked: pickedInfo, skipped: false, auto: false });
    this.memory.record({
      formatId: format.id,
      archetype: this.archetype,
      waveKind: wave.kind,
      accepted: wave.cards.map((c) => c.cardId),
      rejected: [],
      chosen: pickedInfo ? pickedInfo.options[pickedInfo.index].cardId : null,
      passedOver: pickedInfo ? pickedInfo.options.filter((_, i) => i !== pickedInfo!.index).map((o) => o.cardId) : [],
    });
    this.draft.set(applyWave({ userBySection: this.draft(), rejected: this.rejected() }, wave, index));
    this.picked.set(null);
  }

  skip(): void {
    const wave = this.waveOf();
    const format = this.format();
    if (!wave || !format) return;
    const ids = [...wave.cards.map((c) => c.cardId), ...(wave.choice?.options.map((o) => o.cardId) ?? [])];
    this.pushHistory({ wave, taken: [], picked: null, skipped: true, auto: false });
    this.memory.record({
      formatId: format.id,
      archetype: this.archetype,
      waveKind: wave.kind,
      accepted: [],
      rejected: ids,
      chosen: null,
      passedOver: [],
    });
    this.rejected.set(new Set([...this.rejected(), ...ids]));
    this.picked.set(null);
  }

  /** Asks the configured AI to read the effects of the current choice's options. Sends data only on click. */
  askAi(): void {
    const wave = this.waveOf();
    const choice = wave?.choice;
    const format = this.format();
    if (!wave || !choice || !format || this.aiState() === 'loading') return;
    const setState = (value: { state: 'loading' | 'unavailable' | 'ready'; advice?: WaveAdvice }) =>
      this.advice.update((m) => new Map(m).set(wave.id, value));
    setState({ state: 'loading' });

    // names and effects of the options, plus the deck's names, so the model reasons about this exact deck
    const mainIds = [...this.draft().keys()].filter((k) => k.startsWith('main:')).map((k) => Number(k.split(':')[1]));
    const needed = [...new Set([...choice.options.map((o) => o.cardId), ...wave.cards.map((c) => c.cardId), ...mainIds])];
    this.service
      .cards$(needed)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cards) => {
        const merged = new Map(this.info());
        for (const [id, c] of cards) merged.set(id, c);
        this.info.set(merged);
        const deckLines = [...this.draft().entries()]
          .filter(([k]) => k.startsWith('main:'))
          .map(([k, qty]) => `${qty}x ${merged.get(Number(k.split(':')[1]))?.name ?? '#' + k.split(':')[1]}`)
          .join(', ');
        const archetype = this.archetype ? `${this.i18n.t('wave.ai.archetype')}: ${this.archetype}. ` : '';
        const deckSummary = `${this.formatName()}. ${archetype}Main: ${deckLines}`;
        const fixed = wave.cards.map((c) => `${c.quantity}x ${merged.get(c.cardId)?.name ?? c.cardId}`).join(', ');
        const context = this.i18n.t(`wave.ai.context.${choice.prompt}`) + (fixed ? ` ${this.i18n.t('wave.ai.alsoAdding', { cards: fixed })}` : '');
        this.service
          .advise$(choice.options.map((o) => o.cardId), merged, deckSummary, context)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (result) => setState(result ? { state: 'ready', advice: result } : { state: 'unavailable' }),
            error: () => setState({ state: 'unavailable' }),
          });
      });
  }

  undo(): void {
    const all = this.history();
    const last = all[all.length - 1];
    if (!last) return;
    this.draft.set(new Map(last.before.draft));
    this.rejected.set(new Set(last.before.rejected));
    this.history.set(all.slice(0, -1));
    if (!last.auto) this.memory.removeLast();
    this.picked.set(null);
  }

  /** Takes the recommended option of every remaining wave. Not remembered as the user's own choices. */
  autoComplete(): void {
    const ctx = this.ctx();
    const format = this.format();
    if (!ctx || !format) return;
    let draft = this.draft();
    const rejected = this.rejected();
    const added: AppliedWave[] = [];
    for (let i = 0; i < MAX_AUTO_WAVES; i++) {
      const r = nextWave({ userBySection: draft, rejected, preference: (id) => this.memory.preference(id, format.id, this.archetype) }, ctx);
      if (r.done) break;
      const index = r.wave.choice ? r.wave.choice.recommended : null;
      const taken = [...r.wave.cards];
      let picked: AppliedWave['picked'] = null;
      if (r.wave.choice && index !== null) {
        taken.push(r.wave.choice.options[index]);
        picked = { index, options: r.wave.choice.options };
      }
      added.push({ wave: r.wave, taken, picked, skipped: false, auto: true, before: { draft: new Map(draft), rejected: new Set(rejected) } });
      draft = applyWave({ userBySection: draft, rejected }, r.wave, index);
    }
    this.history.set([...this.history(), ...added]);
    this.draft.set(draft);
    this.picked.set(null);
  }

  finish(): void {
    if (this.finishing()) return;
    const taken = this.history().flatMap((h) => h.taken);
    this.finishing.set(true);
    this.service
      .cards$(taken.map((c) => c.cardId))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cards) => {
        const merged = new Map(this.info());
        for (const [id, c] of cards) merged.set(id, c);
        this.info.set(merged);
        const adds: DeckBuilderAdd[] = [];
        for (const card of taken) {
          const c = merged.get(card.cardId);
          if (!c) continue;
          adds.push({
            cardId: card.cardId,
            name: c.name,
            quantity: card.quantity,
            type: c.type,
            imageUrlSmall: c.imageUrlSmall,
            section: card.section,
            reason: card.why.length > 0 ? this.whyText(card.why[0]) : this.compareText(card),
          });
        }
        this.finishing.set(false);
        this.applied.emit(adds);
      });
  }

  // ------------------------------------------------------------------ view helpers

  glyph(kind: WaveKind): string {
    return KIND_GLYPH[kind];
  }

  pct(value: number): number {
    return Math.round(value * 100);
  }

  infoOf(cardId: number): WaveCardInfo | undefined {
    return this.info().get(cardId);
  }

  nameOf(cardId: number): string {
    return this.info().get(cardId)?.name ?? `#${cardId}`;
  }

  /** How a card compares with the decks the suggestion is based on. */
  compareClass(card: WaveCard): string {
    if (card.of === 0) return 'text-base-content/60';
    const ratio = card.playedBy / card.of;
    return ratio >= 0.5 ? 'text-success' : ratio > 0 ? 'text-warning' : 'text-info';
  }

  compareText(card: WaveCard): string {
    if (card.of === 0 || card.playedBy === 0) {
      return card.why.some((w) => w.kind === 'staple') ? this.i18n.t('wave.cmp.staple') : this.i18n.t('wave.cmp.none');
    }
    const key = card.playedBy / card.of >= 0.5 ? 'wave.cmp.same' : card.playedBy === 1 ? 'wave.cmp.rareOne' : 'wave.cmp.rare';
    return this.i18n.t(key, { n: '' + card.playedBy, of: '' + card.of });
  }

  whyText(tag: WhyTag): string {
    const names = (ids: number[]) => ids.map((id) => this.nameOf(id)).join(', ');
    switch (tag.kind) {
      case 'playset':
        return this.i18n.t('wave.why.playset', { have: '' + tag.have, typical: '' + tag.typical });
      case 'linked':
        return this.i18n.t(`wave.why.linked.${tag.relation}`, { name: names(tag.to) });
      case 'ritual-need':
        return this.i18n.t('wave.why.ritual');
      case 'staple':
        return this.i18n.t('wave.why.staple', { pct: '' + Math.round(tag.share * 100) });
      case 'usage':
        return this.i18n.t('wave.why.usage', { pct: '' + Math.round(tag.share * 100) });
      case 'reachable':
        return this.i18n.t('wave.why.reachable');
      case 'preference':
        return this.i18n.t(tag.net > 0 ? 'wave.why.prefer' : 'wave.why.avoid');
      case 'better-score':
        return this.i18n.t('wave.why.betterScore');
    }
  }

  namesWithQty(rows: ReadonlyArray<{ cardId: number; qty: number }>): string {
    return rows.map((r) => `${r.qty}× ${this.nameOf(r.cardId)}`).join(' · ');
  }

  aiReasonOf(cardId: number): string | undefined {
    const wave = this.waveOf();
    const entry = wave ? this.advice().get(wave.id) : undefined;
    return entry?.state === 'ready' ? entry.advice?.reasons.get(cardId) : undefined;
  }

  takenSummary(h: AppliedWave): string {
    return h.taken.map((c) => `${c.quantity}× ${this.nameOf(c.cardId)}`).join(' · ');
  }

  otherNames(p: NonNullable<AppliedWave['picked']>): string {
    return p.options.filter((_, i) => i !== p.index).map((o) => this.nameOf(o.cardId)).join(', ');
  }

  // ------------------------------------------------------------------ internals

  private start(deck: Decklist, format: YgoFormat | null): void {
    this.history.set([]);
    this.rejected.set(new Set());
    this.picked.set(null);
    this.advice.set(new Map());
    this.ctx.set(null);
    this.reference.set(null);
    this.archetype = null;
    const draft = new Map<string, number>();
    for (const card of deck.cards) {
      const key = `${resolveDeckSection(card)}:${card.id}`;
      draft.set(key, (draft.get(key) ?? 0) + card.quantity);
    }
    this.draft.set(draft);
    if (!format) {
      this.loadState.set('unsupported');
      return;
    }
    this.loadState.set('loading');
    this.service
      .context$(format, { main: this.targetMain(), extra: 15, side: this.includeSide() ? 15 : 0 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ctx) => {
        if (!ctx) {
          this.loadState.set('unsupported');
          this.classicRequested.emit();
          return;
        }
        this.ctx.set(ctx);
        this.reference.set(this.tournamentReference(ctx));
        this.loadState.set('ready');
      });
  }

  /** Average competitive measures of the format's tournament decks, to compare the draft against. */
  private tournamentReference(ctx: WaveContext): CompetitiveScore | null {
    if (!ctx.competitive) return null;
    const decks = ctx.pool.filter((d) => d.source === 'tournament' && d.main.length >= 40).slice(0, 80);
    if (decks.length < 10) return null;
    const total = { brickRate: 0, inTurn: 0, crossTurn: 0, consistency: 0, usage: 0, overall: 0 };
    for (const d of decks) {
      const s = scoreDeck(d.main, ctx.competitive, { samples: 150 });
      total.brickRate += s.brickRate;
      total.inTurn += s.synergy.inTurn;
      total.crossTurn += s.synergy.crossTurn;
      total.consistency += s.consistency;
      total.usage += s.usage;
      total.overall += s.overall;
    }
    const n = decks.length;
    return {
      brickRate: total.brickRate / n,
      synergy: { inTurn: total.inTurn / n, crossTurn: total.crossTurn / n },
      consistency: total.consistency / n,
      usage: total.usage / n,
      overall: total.overall / n,
    };
  }

  private countSection(section: WaveSection): number {
    let total = 0;
    for (const [key, qty] of this.draft()) if (key.startsWith(`${section}:`)) total += qty;
    return total;
  }

  private pushHistory(entry: Omit<AppliedWave, 'before'>): void {
    this.history.set([
      ...this.history(),
      { ...entry, before: { draft: new Map(this.draft()), rejected: new Set(this.rejected()) } },
    ]);
  }

  private collectIds(card: WaveCard, into: Set<number>): void {
    into.add(card.cardId);
    for (const tag of card.why) if (tag.kind === 'linked') for (const id of tag.to) into.add(id);
  }

  private ensureInfo(ids: number[]): void {
    const known = this.info();
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length === 0) return;
    this.service
      .cards$(missing)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cards) => {
        const merged = new Map(this.info());
        for (const [id, c] of cards) merged.set(id, c);
        this.info.set(merged);
      });
  }
}
