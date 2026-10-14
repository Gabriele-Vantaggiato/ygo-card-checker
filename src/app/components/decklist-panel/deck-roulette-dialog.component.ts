import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecklistStore } from '../../features/decklist/stores/decklist.store';
import { FormatStore } from '../../core/stores/format.store';
import {
  DeckRouletteService,
  EMPTY_ROULETTE_FILTERS,
  RouletteDeck,
  RouletteDeckSource,
  filterRouletteDecks,
  listRouletteArchetypes,
} from '../../services/deck-roulette.service';
import { I18nService } from '../../services/i18n.service';
import { CompetitiveContext, CompetitiveScore } from '../../utils/competitive-score.utils';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

const LIST_LIMIT = 30;

/**
 * "Estrai deck": picks a coherent deck for the selected format from the curated pool (see
 * DeckRouletteService), either at random or by searching/filtering by archetype, key card and source.
 * The chosen deck is imported through the exact YDKE pipeline used by manual import.
 */
@Component({
  selector: 'app-deck-roulette-dialog',
  standalone: true,
  imports: [A11yModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <dialog class="modal modal-open" open aria-modal="true" aria-labelledby="roulette-title" (keydown.escape)="close()">
        <div class="modal-box duel-modal w-full max-w-2xl overflow-x-hidden" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
          <h3 id="roulette-title" class="font-display font-semibold text-2xl">{{ 'decklist.roulette.title' | translate }}</h3>
          <p class="text-sm text-base-content/60 mt-1.5 leading-relaxed">
            {{ 'decklist.roulette.hint' | translate: { format: formatName() } }}
          </p>

          <div class="mt-5 space-y-4 min-w-0">
            @if (loading()) {
              <div class="flex justify-center py-8"><span class="loading loading-spinner"></span></div>
            } @else if (pool().length === 0) {
              <p class="text-sm text-warning">{{ 'decklist.roulette.empty' | translate }}</p>
            } @else {
              <div class="space-y-2">
                <input
                  cdkFocusInitial
                  type="search"
                  role="combobox"
                  autocomplete="off"
                  class="input input-bordered input-sm w-full"
                  aria-autocomplete="list"
                  aria-controls="roulette-suggestions"
                  [attr.aria-expanded]="showSuggestions()"
                  [attr.aria-activedescendant]="showSuggestions() && visible().length ? 'roulette-opt-' + activeIndex() : null"
                  [attr.aria-label]="'decklist.roulette.searchLabel' | translate"
                  [placeholder]="'decklist.roulette.searchPlaceholder' | translate"
                  [value]="query()"
                  (input)="onQuery($any($event.target).value)"
                  (keydown.arrowdown)="moveActive(1); $event.preventDefault()"
                  (keydown.arrowup)="moveActive(-1); $event.preventDefault()"
                  (keydown.enter)="pickActive(); $event.preventDefault()"
                />
                <div class="flex flex-wrap gap-2 items-center min-w-0">
                  <select
                    class="select select-bordered select-sm w-full sm:w-auto sm:flex-1 min-w-0 max-w-full"
                    [attr.aria-label]="'decklist.roulette.archetypeLabel' | translate"
                    [value]="archetype() ?? ''"
                    (change)="setArchetype($any($event.target).value || null)"
                  >
                    <option value="">{{ 'decklist.roulette.allArchetypes' | translate }}</option>
                    @for (a of archetypes(); track a.name) {
                      <option [value]="a.name" [selected]="a.name === archetype()">{{ a.name }} ({{ a.count }})</option>
                    }
                  </select>
                  <div class="flex flex-wrap gap-1" role="group" [attr.aria-label]="'decklist.roulette.sourceLabel' | translate">
                    <button type="button" class="btn btn-sm" [class.btn-primary]="source() === null" (click)="setSource(null)">
                      {{ 'decklist.roulette.sourceAll' | translate }}
                    </button>
                    @for (s of sources(); track s) {
                      <button type="button" class="btn btn-sm" [class.btn-primary]="source() === s" (click)="setSource(s)">
                        {{ ('decklist.roulette.source.' + s) | translate }}
                      </button>
                    }
                  </div>
                  @if (hasScores()) {
                    <select
                      class="select select-bordered select-sm w-full sm:w-auto"
                      [attr.aria-label]="'decklist.roulette.sortLabel' | translate"
                      [value]="sortMode()"
                      (change)="setSort($any($event.target).value)"
                    >
                      <option value="relevance">{{ 'decklist.roulette.sort.relevance' | translate }}</option>
                      <option value="competitive">{{ 'decklist.roulette.sort.competitive' | translate }}</option>
                    </select>
                  }
                  @if (hasFilters()) {
                    <button type="button" class="btn btn-ghost btn-sm" (click)="clearFilters()">{{ 'decklist.roulette.clear' | translate }}</button>
                  }
                </div>
                <p class="text-xs text-base-content/50" aria-live="polite">
                  {{ 'decklist.roulette.matches' | translate: { count: '' + filtered().length, total: '' + pool().length } }}
                </p>
              </div>

              @if (!showSuggestions()) {
                <p class="text-xs text-base-content/50">{{ 'decklist.roulette.typeHint' | translate }}</p>
              } @else if (filtered().length === 0) {
                <p class="text-sm text-warning">{{ 'decklist.roulette.noMatch' | translate }}</p>
              } @else {
                <ul
                  id="roulette-suggestions"
                  role="listbox"
                  class="rounded-lg border border-base-300/60 max-h-44 sm:max-h-56 overflow-y-auto overflow-x-hidden p-1"
                  [attr.aria-label]="'decklist.roulette.listLabel' | translate"
                >
                  @for (item of visible(); track item.id; let i = $index) {
                    <li role="option" [id]="'roulette-opt-' + i" [attr.aria-selected]="item.id === deck()?.id">
                      <button
                        type="button"
                        class="flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-base-200"
                        [class.bg-base-200]="i === activeIndex()"
                        [class.font-semibold]="item.id === deck()?.id"
                        (click)="select(item)"
                        (mouseenter)="activeIndex.set(i)"
                      >
                        <span class="min-w-0 flex-1">
                          <span class="block truncate">{{ item.archetype || item.name }}</span>
                          <span class="block truncate text-xs text-base-content/50">{{ eventOf(item) }}</span>
                        </span>
                        <span class="badge badge-ghost badge-xs shrink-0">{{ ('decklist.roulette.source.' + item.source) | translate }}</span>
                      </button>
                    </li>
                  }
                  @if (filtered().length > visible().length) {
                    <li class="px-2.5 py-1 text-xs text-base-content/50">
                      {{ 'decklist.roulette.more' | translate: { count: '' + (filtered().length - visible().length) } }}
                    </li>
                  }
                </ul>
              }
              @if (deck(); as d) {
                <div class="flex gap-3 items-start rounded-lg border border-primary/40 bg-base-200/40 p-3 min-w-0">
                  @if (d.coverCardId) {
                    <img
                      class="w-12 sm:w-16 rounded shadow shrink-0"
                      [src]="'https://images.ygoprodeck.com/images/cards_small/' + d.coverCardId + '.jpg'"
                      alt=""
                      loading="lazy"
                    />
                  }
                  <div class="min-w-0 space-y-1.5">
                    <p class="font-display text-lg font-semibold leading-tight break-words">{{ d.archetype || d.name }}</p>
                    <p class="text-xs text-base-content/50 break-words">{{ eventOf(d) }}</p>
                    <div class="flex flex-wrap gap-1.5">
                                            <span class="badge badge-sm badge-outline">{{ ('decklist.roulette.source.' + d.source) | translate }}</span>
                      <span class="badge badge-ghost badge-sm tabular-nums">
                        {{ 'decklist.aiGen.previewCount' | translate: { main: '' + d.main.length, extra: '' + d.extra.length, side: '' + d.side.length } }}
                      </span>
                    </div>
                    @if (scoreOf(d); as sc) {
                      <p class="text-xs text-base-content/70 tabular-nums">
                        {{ 'decklist.roulette.score' | translate: { overall: '' + pct(sc.overall), brick: '' + pct(sc.brickRate), usage: '' + pct(sc.usage) } }}
                      </p>
                    }
                    @if (d.placement && d.eventDate) {
                      <p class="text-xs text-base-content/50">
                        {{ 'decklist.roulette.placement' | translate: { place: '' + d.placement, date: d.eventDate } }}
                      </p>
                    }
                    @if (d.keyCards?.length) {
                      <p class="text-xs text-base-content/60 leading-relaxed line-clamp-2">{{ d.keyCards!.slice(0, 5).join(' · ') }}</p>
                    }
                    @if (d.url) {
                      <a class="link link-hover text-xs" [href]="d.url" target="_blank" rel="noopener noreferrer">
                        {{ 'decklist.roulette.original' | translate }} ↗
                      </a>
                    }
                  </div>
                </div>
              }

            }
            @if (errorKey(); as err) {
              <p class="text-xs text-error">{{ err | translate }}</p>
            }
          </div>

          <div class="modal-action mt-4 flex-wrap gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
            <button type="button" class="btn btn-ghost" (click)="close()">{{ 'decklist.dialog.cancel' | translate }}</button>
            <button type="button" class="btn btn-outline gap-2" [disabled]="loading() || importing() || filtered().length === 0" (click)="drawNext()">
              <span aria-hidden="true">↻</span>{{ 'decklist.roulette.again' | translate }}
            </button>
            <button type="button" class="btn btn-primary gap-2" [disabled]="!deck() || importing()" (click)="confirmCreate()">
              @if (importing()) { <span class="loading loading-spinner loading-xs"></span> }
              {{ 'decklist.roulette.create' | translate }}
            </button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" (click)="close()">close</button>
        </form>
      </dialog>
    }
  `,
})
export class DeckRouletteDialogComponent {
  private readonly roulette = inject(DeckRouletteService);
  private readonly decklistStore = inject(DecklistStore);
  private readonly formatStore = inject(FormatStore);
  private readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = signal(false);
  readonly closed = output<void>();
  readonly deckReady = output<string>();

  readonly loading = signal(false);
  readonly importing = signal(false);
  readonly pool = signal<RouletteDeck[]>([]);
  readonly deck = signal<RouletteDeck | null>(null);
  readonly errorKey = signal<string | null>(null);

  readonly query = signal('');
  readonly archetype = signal<string | null>(null);
  readonly source = signal<RouletteDeckSource | null>(null);
  readonly activeIndex = signal(0);
  readonly sortMode = signal<'relevance' | 'competitive'>('relevance');
  private readonly scores = signal<Map<string, CompetitiveScore>>(new Map());
  readonly hasScores = computed(() => this.scores().size > 0);

  readonly formatName = computed(() => {
    const format = this.formatStore.selectedFormat();
    return format ? format.name[this.i18n.lang()] : '';
  });

  readonly archetypes = computed(() => listRouletteArchetypes(this.pool()));
  readonly sources = computed(() => [...new Set(this.pool().map((d) => d.source))]);
  readonly filtered = computed(() => {
    const matches = filterRouletteDecks(this.pool(), {
      ...EMPTY_ROULETTE_FILTERS,
      query: this.query(),
      archetype: this.archetype(),
      source: this.source(),
    });
    const scores = this.scores();
    if (this.sortMode() !== 'competitive' || scores.size === 0) return matches;
    return [...matches].sort((a, b) => (scores.get(b.id)?.overall ?? 0) - (scores.get(a.id)?.overall ?? 0));
  });
  readonly visible = computed(() => this.filtered().slice(0, LIST_LIMIT));
  readonly hasFilters = computed(() => !!this.query().trim() || !!this.archetype() || !!this.source());
  /** Suggestions appear as soon as the user types or narrows by archetype/source. */
  readonly showSuggestions = computed(() => this.hasFilters() || this.sortMode() === 'competitive');

  show(): void {
    const format = this.formatStore.selectedFormat();
    this.deck.set(null);
    this.errorKey.set(null);
    this.clearFilters();
    this.open.set(true);
    if (!format) return;
    this.loading.set(true);
    this.roulette
      .loadPool$(format.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((pool) => {
        this.pool.set(pool);
        this.loading.set(false);
        this.drawNext();
        this.loadScores(format.id, pool);
      });
  }

  /** Competitive scores for the formats the model covers; the list simply has no score sorting elsewhere. */
  private loadScores(formatId: string, pool: readonly RouletteDeck[]): void {
    this.scores.set(new Map());
    this.sortMode.set('relevance');
    this.roulette
      .loadCompetitiveContext$(formatId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ctx: CompetitiveContext | null) => {
        if (ctx) this.scores.set(this.roulette.scoreDecks(pool, ctx));
      });
  }

  setSort(mode: 'relevance' | 'competitive'): void {
    this.sortMode.set(mode);
    this.activeIndex.set(0);
    // ranking by competitiveness starts from the best deck of the current matches
    if (mode === 'competitive') this.deck.set(this.filtered()[0] ?? null);
    else this.onFiltersChanged();
  }

  scoreOf(deck: RouletteDeck): CompetitiveScore | undefined {
    return this.scores().get(deck.id);
  }

  pct(value: number): number {
    return Math.round(value * 100);
  }

  close(): void {
    this.open.set(false);
    this.closed.emit();
  }

  clearFilters(): void {
    this.query.set('');
    this.archetype.set(null);
    this.source.set(null);
    this.onFiltersChanged();
  }

  onQuery(value: string): void {
    this.query.set(value);
    this.onFiltersChanged();
  }

  /** Keeps the previewed deck consistent with the current matches (first match when it no longer fits). */
  onFiltersChanged(): void {
    this.activeIndex.set(0);
    const matches = this.filtered();
    const current = this.deck();
    if (!current || !matches.some((d) => d.id === current.id)) this.deck.set(matches[0] ?? null);
  }

  setArchetype(value: string | null): void {
    this.archetype.set(value);
    this.onFiltersChanged();
  }

  setSource(value: RouletteDeckSource | null): void {
    this.source.set(value);
    this.onFiltersChanged();
  }

  /** "Warrior — Event name" → "Event name"; names without an event are shown as is. */
  eventOf(deck: RouletteDeck): string {
    const parts = deck.name.split(' — ');
    return parts.length > 1 ? parts.slice(1).join(' — ') : deck.name;
  }

  moveActive(step: number): void {
    const count = this.visible().length;
    if (count === 0) return;
    this.activeIndex.update((i) => (i + step + count) % count);
    this.pickActive();
  }

  pickActive(): void {
    const item = this.visible()[this.activeIndex()];
    if (item) this.select(item);
  }

  select(deck: RouletteDeck): void {
    this.deck.set(deck);
  }

  /** Random pick among the decks matching the current filters. */
  drawNext(): void {
    const format = this.formatStore.selectedFormat();
    if (!format) return;
    this.deck.set(this.roulette.draw(format.id, this.filtered()));
  }

  confirmCreate(): void {
    const format = this.formatStore.selectedFormat();
    const deck = this.deck();
    if (!format || !deck || this.importing()) return;
    this.importing.set(true);
    this.errorKey.set(null);
    const id = this.decklistStore.createDecklist(deck.name);
    this.decklistStore
      .importFromYdke$(this.roulette.toYdkeUrl(deck), id, true, format)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.importing.set(false);
          if (!result.ok && result.errorKey) {
            this.errorKey.set(result.errorKey);
            return;
          }
          this.deckReady.emit(id);
          this.close();
        },
        error: () => {
          this.importing.set(false);
          this.errorKey.set('decklist.feedback.ydkeInvalid');
        },
      });
  }
}
