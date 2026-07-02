import { Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { Decklist, DecklistCard } from '../../models/decklist.model';
import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { BanlistStatus } from '../../models/ygo-format.model';
import { CardLegalityFacade } from '../../services/card-legality.facade';
import { I18nService } from '../../services/i18n.service';
import { YgoApiService } from '../../services/ygo-api.service';
import { splitDeckIntoYdkeSections, parseYdkeUrl } from '../../services/ydke.service';
import { DecklistStore } from '../../stores/decklist.store';
import { FormatStore } from '../../stores/format.store';
import {
  computeTypeStats,
  deckSections,
  expandCardsForGrid,
  sectionCardCount,
  sortDeckCards,
} from '../../utils/deck-card.utils';
import { sortYgoCardsByPlayability } from '../../utils/card-sort.utils';
import {
  quantityBadgeClass,
  quantityLabelKey,
  verdictBadgeClass,
  verdictBannerClass,
  verdictLabelKey,
  verdictShortKey,
} from '../../utils/legality-display.utils';
import { FormatSelectorComponent } from '../format-selector/format-selector.component';
import { DeckSuggestionsPanelComponent } from '../deck-suggestions-panel/deck-suggestions-panel.component';
import { CardKnowledgeService } from '../../services/card-knowledge.service';
import { CardRelatedSuggestion, DeckRelatedResult } from '../../models/card-knowledge.model';

type InspectTarget =
  | { kind: 'deck'; card: DecklistCard }
  | { kind: 'search'; card: YgoCard };

@Component({
  selector: 'app-decklist-editor',
  standalone: true,
  imports: [FormsModule, FormatSelectorComponent, DeckSuggestionsPanelComponent],
  template: `
    @if (deck(); as activeDeck) {
      <section class="flex flex-col min-h-0 gap-4">
        <header
          class="flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl border border-base-300 bg-base-100 px-3 py-2 sm:px-4 sm:py-3"
        >
          <button type="button" class="btn btn-ghost btn-sm btn-square shrink-0" (click)="back.emit()">
            ←
          </button>

          <div class="flex-1 min-w-0 flex items-center gap-2">
            @if (renaming()) {
              <input
                type="text"
                class="input input-bordered input-sm flex-1 min-w-0"
                [ngModel]="renameDraft()"
                (ngModelChange)="renameDraft.set($event)"
                (keydown.enter)="commitRename()"
                (keydown.escape)="cancelRename()"
              />
              <button type="button" class="btn btn-primary btn-sm" (click)="commitRename()">
                {{ i18n.t('decklist.renameSave') }}
              </button>
            } @else {
              <h2 class="font-bold text-lg truncate">{{ activeDeck.name }}</h2>
              <button
                type="button"
                class="btn btn-ghost btn-xs btn-square shrink-0"
                [attr.aria-label]="i18n.t('decklist.rename')"
                (click)="startRename(activeDeck.name)"
              >
                ✎
              </button>
            }
          </div>

          <span class="badge badge-lg badge-primary font-mono tabular-nums">
            {{ decklistStore.totalCardsForDeck(activeDeck.id) }}
          </span>

          <div class="flex flex-wrap gap-1 w-full sm:w-auto sm:ml-auto">
            <button type="button" class="btn btn-ghost btn-sm" (click)="decklistStore.sortActiveDeck()">
              {{ i18n.t('decklist.editor.sort') }}
            </button>
            <button type="button" class="btn btn-outline btn-sm" (click)="openImportYdkeDialog()">
              {{ i18n.t('decklist.importYdke') }}
            </button>
            <button type="button" class="btn btn-outline btn-sm" (click)="openYdkeDialog(activeDeck)">
              {{ i18n.t('decklist.exportYdke') }}
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm text-error"
              (click)="decklistStore.deleteActiveDecklist(); back.emit()"
            >
              {{ i18n.t('decklist.delete') }}
            </button>
          </div>
        </header>

        <div class="rounded-xl border border-base-300 bg-base-100 px-3 py-2 sm:px-4 sm:py-3">
          <app-format-selector
            [compact]="true"
            [formats]="formatStore.formats()"
            [selectedId]="formatStore.formatId()"
            (selectedChange)="formatStore.setFormatId($event)"
          />
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_minmax(0,18rem)] gap-4 min-h-0">
          <aside class="hidden xl:flex flex-col rounded-xl border border-base-300 bg-base-100 overflow-hidden min-h-[28rem] max-h-[calc(100vh-12rem)]">
            <div class="px-3 py-2 border-b border-base-300 text-xs font-semibold uppercase tracking-wide text-base-content/60 shrink-0">
              {{ i18n.t('decklist.editor.preview') }}
            </div>
            <div class="flex-1 min-h-0 flex flex-col p-3">
              @if (inspectCard(); as target) {
                <div class="flex flex-col gap-3 min-h-0 flex-1">
                  <div class="flex gap-3 shrink-0">
                    @if (inspectImage(); as src) {
                      <img [src]="src" [alt]="inspectName()" class="w-20 rounded-lg shadow-md shrink-0" />
                    }
                    <div class="min-w-0 flex-1">
                      <p class="font-semibold text-sm leading-tight line-clamp-2">{{ inspectName() }}</p>
                      <p class="text-[11px] text-base-content/60 mt-1">{{ inspectType() }}</p>
                      @if (inspectLegality(); as legality) {
                        <div class="flex flex-wrap gap-1 mt-2">
                          <span class="badge badge-xs" [class]="verdictBadgeClass(legality.verdict)">
                            {{ verdictLabel(legality.verdict) }}
                          </span>
                          <span class="badge badge-xs badge-outline" [class]="quantityBadgeClass(legality.banlistStatus)">
                            {{ quantityLabel(legality.banlistStatus) }}
                          </span>
                        </div>
                      }
                    </div>
                  </div>

                  @if (inspectDescLoading()) {
                    <p class="text-xs text-base-content/50">{{ i18n.t('search.loading') }}</p>
                  } @else if (inspectDesc(); as desc) {
                    <section class="rounded-lg bg-base-200/50 p-2.5 flex-1 min-h-0 flex flex-col">
                      <h3 class="text-[10px] font-semibold uppercase tracking-wide text-base-content/60 mb-1.5 shrink-0">
                        {{ i18n.t('result.effect') }}
                      </h3>
                      <p class="text-xs leading-relaxed whitespace-pre-line text-base-content/90 overflow-y-auto min-h-0 flex-1">
                        {{ desc }}
                      </p>
                    </section>
                  }

                  <div class="shrink-0 space-y-2 pt-1 border-t border-base-300">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs text-base-content/60">
                        {{ inspectInDeckLabel() }}
                      </span>
                      <div class="join">
                        <button
                          type="button"
                          class="btn btn-sm join-item"
                          [disabled]="inspectQty() === 0"
                          (click)="decrementInspect()"
                        >
                          −
                        </button>
                        <span class="btn btn-sm join-item btn-disabled tabular-nums no-animation">×{{ inspectQty() }}</span>
                        <button
                          type="button"
                          class="btn btn-sm join-item"
                          [disabled]="!canAddInspect()"
                          (click)="incrementInspect()"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    @if (inspectQty() > 0) {
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs text-error w-full"
                        (click)="removeOneCopy(inspectedCardId()!, $event)"
                      >
                        {{ i18n.t('decklist.editor.removeCopy') }}
                      </button>
                    }
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs w-full text-primary/80"
                      (click)="openInspectedInSearch()"
                    >
                      {{ i18n.t('decklist.editor.openInSearch') }}
                    </button>
                  </div>
                </div>
              } @else {
                <p class="text-sm text-base-content/50 text-center px-2 py-8">{{ i18n.t('decklist.editor.inspectHint') }}</p>
              }
            </div>
          </aside>

          <div class="rounded-xl border border-base-300 bg-base-100 overflow-hidden flex flex-col min-h-[24rem]">
            <div class="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-4 max-h-[min(70vh,48rem)]">
              @for (section of sections(activeDeck); track section.key) {
                <div>
                  <div
                    class="flex flex-wrap items-center gap-2 sm:gap-3 mb-2 px-2 py-1.5 rounded-lg bg-base-200/80 border border-base-300"
                  >
                    <span class="font-semibold text-sm">{{ sectionTitle(section.key) }}</span>
                    <span class="text-xs text-base-content/60 tabular-nums">
                      {{ sectionCardCount(section.cards) }}
                    </span>
                    <div class="flex gap-2 ml-auto text-[11px] font-medium">
                      <span class="text-warning">{{ typeStats(section.cards).monsters }} M</span>
                      <span class="text-success">{{ typeStats(section.cards).spells }} S</span>
                      <span class="text-secondary">{{ typeStats(section.cards).traps }} T</span>
                    </div>
                  </div>

                  @if (section.cards.length === 0) {
                    <p class="text-xs text-base-content/50 px-2 py-6 text-center border border-dashed border-base-300 rounded-lg">
                      {{ sectionEmpty(section.key) }}
                    </p>
                  } @else {
                    <div class="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 p-1">
                      @for (card of expandSection(section.cards); track card.id + '-' + $index) {
                        <div
                          class="group relative aspect-[59/86] rounded transition-transform duration-200 ease-out hover:scale-[1.35] hover:z-30"
                        >
                          <button
                            type="button"
                            class="relative w-full h-full rounded overflow-hidden border-2 transition-colors"
                            [class.border-primary]="isDeckInspected(card.id)"
                            [class.border-transparent]="!isDeckInspected(card.id)"
                            [class.ring-2]="isDeckInspected(card.id)"
                            [class.ring-primary/40]="isDeckInspected(card.id)"
                            (click)="inspectDeckCard(card)"
                          >
                            @if (card.imageUrlSmall; as src) {
                              <img [src]="src" [alt]="" class="w-full h-full object-cover" loading="lazy" />
                            } @else {
                              <span class="block w-full h-full bg-base-300"></span>
                            }
                            @if (card.legalityVerdict; as verdict) {
                              <span
                                class="absolute bottom-0 inset-x-0 z-10 text-[8px] sm:text-[9px] font-bold text-center py-0.5 leading-tight truncate px-0.5"
                                [class]="verdictBannerClass(verdict)"
                              >
                                {{ verdictShort(verdict) }}
                              </span>
                            }
                          </button>
                          <button
                            type="button"
                            class="absolute -top-1 -right-1 z-20 btn btn-error btn-xs btn-circle opacity-0 group-hover:opacity-100 shadow-md transition-opacity"
                            [attr.aria-label]="i18n.t('decklist.editor.removeCopy')"
                            (click)="removeOneCopy(card.id, $event)"
                          >
                            ✕
                          </button>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          </div>

          <aside class="rounded-xl border border-base-300 bg-base-100 flex flex-col xl:self-start overflow-hidden">
            <div class="px-3 py-2 border-b border-base-300 shrink-0">
              <p class="text-xs font-semibold uppercase tracking-wide text-base-content/60 mb-2">
                {{ i18n.t('decklist.editor.search') }}
              </p>
              <div class="flex gap-2">
                <input
                  type="text"
                  class="input input-bordered input-sm flex-1 min-w-0"
                  [placeholder]="i18n.t('search.placeholder')"
                  [ngModel]="searchQuery()"
                  (ngModelChange)="onSearchInput($event)"
                />
                <button type="button" class="btn btn-primary btn-sm" (click)="triggerSearch()">
                  {{ i18n.t('decklist.editor.searchBtn') }}
                </button>
              </div>
              @if (searchTotalRows() > 0) {
                <p class="text-[11px] text-base-content/50 mt-2 px-0.5">
                  {{ searchResultsLabel() }}
                </p>
              }
              <p class="text-[10px] text-base-content/45 mt-1 px-0.5">{{ i18n.t('decklist.editor.searchRowHint') }}</p>
            </div>

            <div class="overflow-y-auto overscroll-y-contain p-2 max-h-[min(45vh,20rem)] sm:max-h-[min(50vh,22rem)] xl:max-h-[min(60vh,28rem)]">
              @if (searchLoading() || legalityLoading()) {
                <p class="text-xs text-base-content/60 px-2 py-4">{{ i18n.t('search.loading') }}</p>
              } @else {
                @for (card of sortedSearchResults(); track card.id) {
                  <div
                    class="flex items-center gap-1 rounded-lg transition-colors"
                    [class.bg-primary/10]="isSearchInspected(card.id)"
                    [class.ring-1]="isSearchInspected(card.id)"
                    [class.ring-primary/30]="isSearchInspected(card.id)"
                  >
                    <button
                      type="button"
                      class="flex-1 min-w-0 flex items-center gap-2 p-2 rounded-lg hover:bg-base-200/80 text-left transition-colors"
                      [class.opacity-50]="isSearchForbidden(card.id)"
                      (click)="inspectSearchCard(card)"
                    >
                      @if (card.card_images[0]?.image_url_small; as src) {
                        <img [src]="src" [alt]="" class="w-8 h-11 object-cover rounded shrink-0" loading="lazy" />
                      } @else {
                        <span class="w-8 h-11 rounded bg-base-300 shrink-0"></span>
                      }
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium truncate">{{ card.name }}</p>
                        <p class="text-[11px] text-base-content/60 truncate">{{ card.type }}</p>
                        @if (legalityFor(card.id); as legality) {
                          <span class="flex flex-wrap gap-1 mt-1">
                            <span
                              class="badge badge-xs"
                              [class]="verdictBadgeClass(legality.verdict)"
                              [title]="i18n.t('history.playability')"
                            >
                              {{ verdictLabel(legality.verdict) }}
                            </span>
                            <span
                              class="badge badge-xs badge-outline"
                              [class]="quantityBadgeClass(legality.banlistStatus)"
                              [title]="i18n.t('history.quantity')"
                            >
                              {{ quantityLabel(legality.banlistStatus) }}
                            </span>
                          </span>
                        }
                      </div>
                      @if (qtyInDeck(card.id) > 0) {
                        <span class="badge badge-xs badge-primary shrink-0">×{{ qtyInDeck(card.id) }}</span>
                      }
                    </button>
                    <button
                      type="button"
                      class="btn btn-primary btn-xs btn-square shrink-0 mr-1"
                      [class.btn-disabled]="isSearchForbidden(card.id) || !canAddSearchCard(card.id)"
                      [attr.aria-label]="i18n.t('decklist.editor.quickAdd')"
                      (click)="quickAddSearchCard(card, $event)"
                    >
                      +
                    </button>
                  </div>
                } @empty {
                  @if (searchQuery().trim().length >= 2) {
                    <p class="text-xs text-base-content/60 px-2 py-4">{{ i18n.t('search.noResults') }}</p>
                  } @else {
                    <p class="text-xs text-base-content/50 px-2 py-4">{{ i18n.t('decklist.editor.searchHint') }}</p>
                  }
                }
              }
              @if (searchHasMore() && !searchLoading() && !legalityLoading()) {
                <button
                  type="button"
                  class="btn btn-ghost btn-sm w-full mt-2"
                  (click)="loadMoreSearch()"
                >
                  {{ i18n.t('decklist.editor.loadMore') }}
                </button>
              }
            </div>
          </aside>
        </div>

        @if (inspectCard(); as target) {
          <div class="xl:hidden rounded-xl border border-base-300 bg-base-100 p-3 flex flex-col gap-3">
            <div class="flex gap-3 items-start">
              @if (inspectImage(); as src) {
                <img [src]="src" [alt]="" class="w-14 h-20 object-cover rounded-lg shrink-0" />
              }
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm leading-tight">{{ inspectName() }}</p>
                @if (inspectLegality(); as legality) {
                  <span class="badge badge-xs mt-1" [class]="verdictBadgeClass(legality.verdict)">
                    {{ verdictLabel(legality.verdict) }}
                  </span>
                }
                <div class="join mt-2">
                  <button
                    type="button"
                    class="btn btn-xs join-item"
                    [disabled]="inspectQty() === 0"
                    (click)="decrementInspect()"
                  >
                    −
                  </button>
                  <span class="btn btn-xs join-item btn-disabled tabular-nums no-animation">×{{ inspectQty() }}</span>
                  <button
                    type="button"
                    class="btn btn-xs join-item"
                    [disabled]="!canAddInspect()"
                    (click)="incrementInspect()"
                  >
                    +
                  </button>
                </div>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-xs btn-circle text-error shrink-0"
                [disabled]="inspectQty() === 0"
                [attr.aria-label]="i18n.t('decklist.editor.removeCopy')"
                (click)="removeOneCopy(inspectedCardId()!, $event)"
              >
                ✕
              </button>
            </div>
            @if (inspectDesc(); as desc) {
              <section class="rounded-lg bg-base-200/50 p-2.5 max-h-32 overflow-y-auto">
                <h3 class="text-[10px] font-semibold uppercase tracking-wide text-base-content/60 mb-1">
                  {{ i18n.t('result.effect') }}
                </h3>
                <p class="text-xs leading-relaxed whitespace-pre-line text-base-content/90">{{ desc }}</p>
              </section>
            }
          </div>
        }
      </section>

      @if (activeDeck.cards.length > 0) {
        <app-deck-suggestions-panel
          [loading]="deckSuggestionsLoading()"
          [available]="deckSuggestions().available"
          [sourceCount]="deckSuggestions().sourceCount"
          [groups]="deckSuggestions().groups"
          (cardSelected)="addSuggestion($event)"
        />
      }
    }

    @if (importYdkeDialogOpen()) {
      <dialog class="modal modal-open" open>
        <div class="modal-box max-w-2xl">
          <h3 class="font-bold text-lg">{{ i18n.t('decklist.ydke.importTitle') }}</h3>
          <p class="text-sm text-base-content/60 mt-1">{{ i18n.t('decklist.ydke.importHint') }}</p>
          <textarea
            class="textarea textarea-bordered w-full mt-4 font-mono text-xs leading-relaxed min-h-28"
            [ngModel]="importYdkeDraft()"
            (ngModelChange)="onImportYdkeDraftChange($event)"
            [placeholder]="i18n.t('decklist.ydke.importPlaceholder')"
          ></textarea>
          @if (importYdkePreview(); as preview) {
            <p class="text-xs text-base-content/60 mt-2">
              {{ i18n.t('decklist.ydke.hint', preview) }}
            </p>
          }
          <label class="label cursor-pointer justify-start gap-3 mt-3">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              [ngModel]="importYdkeReplace()"
              (ngModelChange)="importYdkeReplace.set($event)"
            />
            <span class="label-text">{{ i18n.t('decklist.ydke.importReplace') }}</span>
          </label>
          <div class="modal-action">
            <button type="button" class="btn btn-ghost" (click)="closeImportYdkeDialog()">
              {{ i18n.t('decklist.dialog.cancel') }}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="!importYdkeDraft().trim() || importYdkeImporting()"
              (click)="confirmImportYdke()"
            >
              @if (importYdkeImporting()) {
                <span class="loading loading-spinner loading-xs"></span>
              }
              {{ i18n.t('decklist.ydke.importConfirm') }}
            </button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" (click)="closeImportYdkeDialog()">close</button>
        </form>
      </dialog>
    }

    @if (ydkeDialogOpen()) {
      <dialog class="modal modal-open" open>
        <div class="modal-box max-w-2xl">
          <h3 class="font-bold text-lg">{{ i18n.t('decklist.ydke.title') }}</h3>
          <p class="text-sm text-base-content/60 mt-1">{{ ydkeHint() }}</p>
          <textarea
            class="textarea textarea-bordered w-full mt-4 font-mono text-xs leading-relaxed min-h-28"
            readonly
            [value]="ydkeUrl()"
            (focus)="selectYdkeText($event)"
          ></textarea>
          <div class="modal-action">
            <button type="button" class="btn btn-ghost" (click)="closeYdkeDialog()">
              {{ i18n.t('decklist.ydke.close') }}
            </button>
            <button type="button" class="btn btn-primary" (click)="copyYdke()">
              {{ i18n.t('decklist.ydke.copy') }}
            </button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" (click)="closeYdkeDialog()">close</button>
        </form>
      </dialog>
    }
  `,
})
export class DecklistEditorComponent {
  readonly deck = input.required<Decklist>();
  readonly focusCardId = input<number | null>(null);
  readonly back = output<void>();

  protected readonly decklistStore = inject(DecklistStore);
  protected readonly formatStore = inject(FormatStore);
  protected readonly i18n = inject(I18nService);
  private readonly ygoApi = inject(YgoApiService);
  private readonly cardLegality = inject(CardLegalityFacade);
  private readonly knowledge = inject(CardKnowledgeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly search$ = new Subject<string>();

  readonly renaming = signal(false);
  readonly renameDraft = signal('');
  readonly inspectCard = signal<InspectTarget | null>(null);
  readonly inspectDesc = signal<string | null>(null);
  readonly inspectDescLoading = signal(false);
  readonly searchQuery = signal('');
  readonly searchResults = signal<YgoCard[]>([]);
  readonly searchTotalRows = signal(0);
  readonly searchHasMore = signal(false);
  readonly searchLoading = signal(false);
  readonly legalityLoading = signal(false);
  readonly searchLegality = signal<Map<number, LegalityResult>>(new Map());
  readonly sortedSearchResults = computed(() =>
    sortYgoCardsByPlayability(this.searchResults(), this.searchLegality()),
  );
  readonly ydkeDialogOpen = signal(false);
  readonly ydkeUrl = signal('');
  readonly ydkeHint = signal('');
  readonly importYdkeDialogOpen = signal(false);
  readonly importYdkeDraft = signal('');
  readonly importYdkeReplace = signal(true);
  readonly importYdkeImporting = signal(false);
  readonly deckRevision = computed(() => {
    const deck = this.liveDeck();
    const total = deck.cards.reduce((sum, card) => sum + card.quantity, 0);
    return `${deck.id}:${deck.updatedAt}:${total}:${deck.cards.length}`;
  });

  private readonly liveDeck = computed(() => {
    const deckId = this.deck().id;
    return this.decklistStore.decklists().find((item) => item.id === deckId) ?? this.deck();
  });
  readonly importYdkePreview = signal<{ main: string; extra: string; side: string } | null>(null);
  readonly deckSuggestionsLoading = signal(false);
  readonly deckSuggestions = signal<DeckRelatedResult>({
    suggestions: [],
    groups: [],
    sourceCount: 0,
    available: false,
  });

  protected readonly sectionCardCount = sectionCardCount;
  protected readonly quantityBadgeClass = quantityBadgeClass;
  protected readonly verdictBadgeClass = verdictBadgeClass;
  protected readonly verdictBannerClass = verdictBannerClass;

  private readonly searchLimit = 50;
  private readonly descCache = new Map<number, string>();

  constructor() {
    this.search$
      .pipe(
        debounceTime(280),
        distinctUntilChanged(),
        switchMap((query) => {
          const trimmed = query.trim();
          if (trimmed.length < 2) {
            this.searchLoading.set(false);
            this.searchLegality.set(new Map());
            this.searchTotalRows.set(0);
            this.searchHasMore.set(false);
            return of({ cards: [] as YgoCard[], totalRows: 0, hasMore: false });
          }
          this.searchLoading.set(true);
          return this.ygoApi.searchCardsPage$(trimmed, this.i18n.lang(), this.searchLimit, 0);
        }),
        tap(() => this.searchLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => {
        this.searchResults.set(page.cards);
        this.searchTotalRows.set(page.totalRows);
        this.searchHasMore.set(page.hasMore);
        const format = this.formatStore.selectedFormat();
        if (format && page.cards.length > 0) {
          this.evaluateSearchLegality(page.cards, format);
        } else {
          this.searchLegality.set(new Map());
        }
      });

    this.formatStore.formatId$
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const format = this.formatStore.selectedFormat();
        if (!format) {
          return;
        }
        this.decklistStore.refreshActiveDeckLegality(format);
        const cards = this.searchResults();
        if (cards.length > 0) {
          this.evaluateSearchLegality(cards, format);
        }
      });

    effect(() => {
      const id = this.focusCardId();
      if (id == null) {
        return;
      }
      const card = this.deck().cards.find((c) => c.id === id);
      if (card) {
        this.inspectDeckCard(card);
      }
    });

    effect(() => {
      const inspect = this.inspectCard();
      if (inspect?.kind !== 'deck') {
        return;
      }
      const deck = this.deck();
      const fresh = deck.cards.find((c) => c.id === inspect.card.id);
      if (!fresh) {
        this.inspectCard.set(null);
        this.inspectDesc.set(null);
        return;
      }
      if (
        fresh.quantity !== inspect.card.quantity ||
        fresh.banlistStatus !== inspect.card.banlistStatus ||
        fresh.legalityVerdict !== inspect.card.legalityVerdict
      ) {
        this.inspectCard.set({ kind: 'deck', card: fresh });
      }
    });

    effect((onCleanup) => {
      const revision = this.deckRevision();
      const deck = this.liveDeck();
      const format = this.formatStore.selectedFormat();
      void revision;

      if (!format || deck.cards.length === 0) {
        this.deckSuggestions.set({
          suggestions: [],
          groups: [],
          sourceCount: 0,
          available: !!format,
        });
        this.deckSuggestionsLoading.set(false);
        return;
      }

      this.deckSuggestionsLoading.set(true);
      const sub = this.knowledge.findRelatedForDeck$(deck, format).subscribe((result) => {
        this.deckSuggestions.set(result);
        this.deckSuggestionsLoading.set(false);
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  private evaluateSearchLegality(
    cards: YgoCard[],
    format: NonNullable<ReturnType<FormatStore['selectedFormat']>>,
    append = false,
  ): void {
    this.legalityLoading.set(true);
    this.cardLegality.evaluateMany$(cards, format).subscribe({
      next: (map) => {
        if (append) {
          this.searchLegality.update((prev) => new Map([...prev, ...map]));
        } else {
          this.searchLegality.set(map);
        }
        this.legalityLoading.set(false);
      },
      error: () => {
        if (!append) {
          this.searchLegality.set(new Map());
        }
        this.legalityLoading.set(false);
      },
    });
  }

  sections(deck: Decklist) {
    return deckSections(sortDeckCards(deck.cards));
  }

  sectionTitle(key: 'main' | 'extra' | 'side'): string {
    switch (key) {
      case 'main':
        return this.i18n.t('decklist.editor.main');
      case 'extra':
        return this.i18n.t('decklist.editor.extra');
      default:
        return this.i18n.t('decklist.editor.side');
    }
  }

  sectionEmpty(key: 'main' | 'extra' | 'side'): string {
    switch (key) {
      case 'main':
        return this.i18n.t('decklist.editor.emptyMain');
      case 'extra':
        return this.i18n.t('decklist.editor.emptyExtra');
      default:
        return this.i18n.t('decklist.editor.emptySide');
    }
  }

  typeStats(cards: DecklistCard[]) {
    return computeTypeStats(cards);
  }

  expandSection(cards: DecklistCard[]): DecklistCard[] {
    return expandCardsForGrid(cards);
  }

  startRename(name: string): void {
    this.renameDraft.set(name);
    this.renaming.set(true);
  }

  cancelRename(): void {
    this.renaming.set(false);
    this.renameDraft.set('');
  }

  commitRename(): void {
    const name = this.renameDraft().trim();
    if (!name) {
      return;
    }
    this.decklistStore.renameActiveDecklist(name);
    this.renaming.set(false);
  }

  inspectDeckCard(card: DecklistCard): void {
    const fresh = this.deck().cards.find((c) => c.id === card.id) ?? card;
    this.inspectCard.set({ kind: 'deck', card: fresh });
    this.loadInspectDesc(fresh.id);
  }

  inspectSearchCard(card: YgoCard): void {
    this.inspectCard.set({ kind: 'search', card });
    this.inspectDesc.set(card.desc || null);
    this.inspectDescLoading.set(false);
  }

  inspectedCardId(): number | null {
    const inspect = this.inspectCard();
    return inspect?.card.id ?? null;
  }

  isDeckInspected(cardId: number): boolean {
    const inspect = this.inspectCard();
    return inspect?.kind === 'deck' && inspect.card.id === cardId;
  }

  isSearchInspected(cardId: number): boolean {
    const inspect = this.inspectCard();
    return inspect?.kind === 'search' && inspect.card.id === cardId;
  }

  inspectName(): string {
    return this.inspectCard()?.card.name ?? '';
  }

  inspectType(): string {
    const inspect = this.inspectCard();
    if (!inspect) {
      return '';
    }
    return inspect.kind === 'deck' ? inspect.card.type : inspect.card.type;
  }

  inspectImage(): string | null {
    const inspect = this.inspectCard();
    if (!inspect) {
      return null;
    }
    if (inspect.kind === 'deck') {
      return inspect.card.imageUrlSmall;
    }
    return inspect.card.card_images[0]?.image_url_small ?? null;
  }

  inspectLegality(): LegalityResult | null {
    const inspect = this.inspectCard();
    if (!inspect) {
      return null;
    }
    if (inspect.kind === 'search') {
      return this.searchLegality().get(inspect.card.id) ?? null;
    }
    const card = inspect.card;
    if (card.legalityVerdict && card.banlistStatus) {
      return {
        verdict: card.legalityVerdict,
        banlistStatus: card.banlistStatus,
        tcgDate: null,
        reasons: [],
      };
    }
    return null;
  }

  inspectQty(): number {
    const id = this.inspectedCardId();
    return id ? this.qtyInDeck(id) : 0;
  }

  inspectInDeckLabel(): string {
    return this.i18n.t('decklist.editor.inDeck', { qty: String(this.inspectQty()) });
  }

  canAddInspect(): boolean {
    const inspect = this.inspectCard();
    if (!inspect) {
      return false;
    }
    const cardId = inspect.card.id;
    if (inspect.kind === 'deck' && inspect.card.banlistStatus === 'Forbidden') {
      return false;
    }
    if (inspect.kind === 'search' && this.isSearchForbidden(cardId)) {
      return false;
    }
    const banlistStatus =
      inspect.kind === 'deck'
        ? inspect.card.banlistStatus ?? null
        : this.searchLegality().get(cardId)?.banlistStatus ?? null;
    return this.decklistStore.canAddToDeck(this.deck().id, cardId, banlistStatus);
  }

  canAddSearchCard(cardId: number): boolean {
    if (this.isSearchForbidden(cardId)) {
      return false;
    }
    const legality = this.searchLegality().get(cardId);
    return this.decklistStore.canAddToDeck(this.deck().id, cardId, legality?.banlistStatus ?? null);
  }

  incrementInspect(): void {
    const inspect = this.inspectCard();
    if (!inspect || !this.canAddInspect()) {
      return;
    }
    if (inspect.kind === 'deck') {
      this.decklistStore.incrementCard(inspect.card.id, inspect.card.banlistStatus ?? null);
      return;
    }
    this.addSearchCard(inspect.card);
  }

  decrementInspect(): void {
    const inspect = this.inspectCard();
    const id = this.inspectedCardId();
    if (!id || this.inspectQty() === 0) {
      return;
    }
    const banlistStatus =
      inspect?.kind === 'deck'
        ? inspect.card.banlistStatus ?? null
        : this.searchLegality().get(id)?.banlistStatus ?? null;
    this.decklistStore.decrementCard(id, banlistStatus);
  }

  private loadInspectDesc(cardId: number): void {
    const cached = this.descCache.get(cardId);
    if (cached) {
      this.inspectDesc.set(cached);
      this.inspectDescLoading.set(false);
      return;
    }
    this.inspectDescLoading.set(true);
    this.inspectDesc.set(null);
    this.ygoApi.getCardById$(cardId, this.i18n.lang()).subscribe((card) => {
      const desc = card?.desc ?? null;
      if (desc) {
        this.descCache.set(cardId, desc);
      }
      this.inspectDesc.set(desc);
      this.inspectDescLoading.set(false);
    });
  }

  openInspectedInSearch(): void {
    const id = this.inspectedCardId();
    if (!id) {
      return;
    }
    void this.router.navigate(['/'], {
      queryParams: {
        cardId: id,
        from: 'decklist',
        deckId: this.deck().id,
      },
    });
  }

  quickAddSearchCard(card: YgoCard, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.inspectSearchCard(card);
    if (this.canAddSearchCard(card.id)) {
      this.addSearchCard(card);
    }
  }

  removeOneCopy(cardId: number, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.decklistStore.removeOneCopy(cardId);
    const inspect = this.inspectCard();
    if (inspect?.card.id === cardId) {
      if (inspect.kind === 'deck') {
        const deck = this.deck();
        const fresh = deck.cards.find((c) => c.id === cardId);
        if (fresh) {
          this.inspectCard.set({ kind: 'deck', card: fresh });
        }
      }
    }
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.search$.next(value);
  }

  triggerSearch(): void {
    this.search$.next(this.searchQuery());
  }

  loadMoreSearch(): void {
    const query = this.searchQuery().trim();
    if (query.length < 2 || !this.searchHasMore()) {
      return;
    }
    const offset = this.searchResults().length;
    const format = this.formatStore.selectedFormat();
    this.searchLoading.set(true);
    this.ygoApi.searchCardsPage$(query, this.i18n.lang(), this.searchLimit, offset).subscribe({
      next: (page) => {
        this.searchResults.update((prev) => [...prev, ...page.cards]);
        this.searchTotalRows.set(page.totalRows);
        this.searchHasMore.set(page.hasMore);
        this.searchLoading.set(false);
        if (format && page.cards.length > 0) {
          this.evaluateSearchLegality(page.cards, format, true);
        }
      },
      error: () => this.searchLoading.set(false),
    });
  }

  searchResultsLabel(): string {
    return this.i18n.t('decklist.editor.resultsCount', {
      shown: `${this.searchResults().length}`,
      total: `${this.searchTotalRows()}`,
    });
  }

  qtyInDeck(cardId: number): number {
    return this.decklistStore.quantityInActive(cardId);
  }

  addSearchCard(card: YgoCard): void {
    const legality = this.searchLegality().get(card.id);
    if (legality?.banlistStatus === 'Forbidden') {
      return;
    }

    this.decklistStore.addCard({
      id: card.id,
      name: card.name,
      type: card.type,
      imageUrlSmall: card.card_images[0]?.image_url_small ?? null,
      banlistStatus: legality?.banlistStatus ?? null,
      legalityVerdict: legality?.verdict ?? null,
    });
  }

  legalityFor(cardId: number): LegalityResult | null {
    return this.searchLegality().get(cardId) ?? null;
  }

  isSearchForbidden(cardId: number): boolean {
    return this.searchLegality().get(cardId)?.banlistStatus === 'Forbidden';
  }

  verdictLabel(verdict: LegalityResult['verdict']): string {
    return this.i18n.t(verdictLabelKey(verdict));
  }

  quantityLabel(status: BanlistStatus): string {
    return this.i18n.t(quantityLabelKey(status));
  }

  verdictShort(verdict: LegalityResult['verdict']): string {
    return this.i18n.t(verdictShortKey(verdict));
  }

  openYdkeDialog(deck: Decklist): void {
    const sections = splitDeckIntoYdkeSections(deck.cards);
    const url = this.decklistStore.encodeYdke(deck.id);
    if (!url) {
      return;
    }
    this.ydkeUrl.set(url);
    this.ydkeHint.set(
      this.i18n.t('decklist.ydke.hint', {
        main: `${sections.main.length}`,
        extra: `${sections.extra.length}`,
        side: `${sections.side.length}`,
      }),
    );
    this.ydkeDialogOpen.set(true);
  }

  closeYdkeDialog(): void {
    this.ydkeDialogOpen.set(false);
    this.ydkeUrl.set('');
    this.ydkeHint.set('');
  }

  selectYdkeText(event: FocusEvent): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) {
      target.select();
    }
  }

  async copyYdke(): Promise<void> {
    const url = this.ydkeUrl();
    if (!url) {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.decklistStore.notify({ key: 'decklist.feedback.ydkeCopied', tone: 'success' });
      this.closeYdkeDialog();
    } catch {
      // Clipboard blocked: textarea remains selectable for manual copy.
    }
  }

  openImportYdkeDialog(): void {
    this.importYdkeDraft.set('');
    this.importYdkeReplace.set(true);
    this.importYdkePreview.set(null);
    this.importYdkeDialogOpen.set(true);
  }

  closeImportYdkeDialog(): void {
    this.importYdkeDialogOpen.set(false);
    this.importYdkeDraft.set('');
    this.importYdkePreview.set(null);
  }

  onImportYdkeDraftChange(value: string): void {
    this.importYdkeDraft.set(value);
    try {
      const sections = parseYdkeUrl(value);
      this.importYdkePreview.set({
        main: `${sections.main.length}`,
        extra: `${sections.extra.length}`,
        side: `${sections.side.length}`,
      });
    } catch {
      this.importYdkePreview.set(null);
    }
  }

  confirmImportYdke(): void {
    const deck = this.deck();
    const format = this.formatStore.selectedFormat();
    const draft = this.importYdkeDraft().trim();
    if (!draft || !format || this.importYdkeImporting()) {
      return;
    }

    this.importYdkeImporting.set(true);
    this.decklistStore.importFromYdke$(draft, deck.id, this.importYdkeReplace(), format).subscribe({
      next: (result) => {
        this.importYdkeImporting.set(false);
        if (result.ok) {
          this.decklistStore.notify({
            key: 'decklist.feedback.ydkeImported',
            params: { total: `${result.total}`, unique: `${result.unique}` },
            tone: 'success',
          });
          this.closeImportYdkeDialog();
          return;
        }
        this.decklistStore.notify({
          key: result.errorKey ?? 'decklist.feedback.ydkeResolveFailed',
          tone: 'warning',
        });
      },
      error: () => {
        this.importYdkeImporting.set(false);
        this.decklistStore.notify({ key: 'decklist.feedback.ydkeResolveFailed', tone: 'warning' });
      },
    });
  }

  addSuggestion(suggestion: CardRelatedSuggestion): void {
    const format = this.formatStore.selectedFormat();
    const qty = suggestion.suggestedQty ?? 1;
    if (!format || qty <= 0) {
      return;
    }
    this.ygoApi.getCardById$(suggestion.cardId, this.i18n.lang()).subscribe((card) => {
      if (!card) {
        return;
      }
      this.cardLegality.evaluate$(card, format).subscribe((result) => {
        this.decklistStore.addCard(
          {
            id: card.id,
            name: card.name,
            type: card.type,
            imageUrlSmall: card.card_images[0]?.image_url_small ?? null,
            banlistStatus: result.banlistStatus,
            legalityVerdict: result.verdict,
          },
          qty,
        );
      });
    });
  }
}
