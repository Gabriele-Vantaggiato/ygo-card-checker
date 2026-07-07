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
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { Decklist, DecklistCard } from '../../models/decklist.model';
import { LegalityResult, YgoCard } from '../../models/ygo-card.model';
import { CardLegalityFacade } from '../../services/card-legality.facade';
import { I18nService } from '../../services/i18n.service';
import { YgoApiService } from '../../services/ygo-api.service';
import { splitDeckIntoYdkeSections, parseYdkeUrl } from '../../services/ydke.service';
import { countTextDeckLines, parseDeckText } from '../../services/deck-text.service';
import { DecklistStore } from '../../features/decklist/stores/decklist.store';
import { FormatStore } from '../../core/stores/format.store';
import {
  computeTypeStats,
  deckSections,
  expandCardsForGrid,
  sectionCardCount,
  sortDeckCards,
  splitDeckSections,
} from '../../utils/deck-card.utils';
import { DECK_SECTION_I18N_KEYS } from '../../utils/deck-section.utils';
import { verdictShortKey } from '../../utils/legality-display.utils';
import { FormatSelectorComponent } from '../format-selector/format-selector.component';
import { DeckSuggestionsPanelComponent } from '../deck-suggestions-panel/deck-suggestions-panel.component';
import { DeckStatsStripComponent } from '../deck-stats-strip/deck-stats-strip.component';
import { CardKnowledgeService } from '../../services/card-knowledge.service';
import { DeckCompletionService } from '../../services/deck-completion.service';
import { DeckStrategyPanelComponent } from '../deck-strategy-panel/deck-strategy-panel.component';
import { DecklistSearchSidebarComponent } from '../decklist-search-sidebar/decklist-search-sidebar.component';
import { DeckStrategyStore } from '../../features/decklist/stores/deck-strategy.store';
import { CardRelatedSuggestion, DeckRelatedResult } from '../../models/card-knowledge.model';
import { DeckCompletionPlan } from '../../models/deck-completion.model';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DecklistEditorHeaderComponent } from './decklist-editor-header.component';
import { DeckSectionGridComponent } from './deck-section-grid.component';
import {
  DeckCardInspectMobileComponent,
  DeckCardInspectPanelComponent,
} from './deck-card-inspect-panel.component';
import { CompleteDeckDialogComponent } from './complete-deck-dialog.component';
import { YdkeExportDialogComponent, YdkeImportDialogComponent } from './ydke-dialogs.component';
import { TextDeckExportDialogComponent, TextDeckImportDialogComponent } from './text-deck-dialogs.component';
import {
  DeckCardInspectViewModel,
  DeckSectionViewModel,
  InspectTarget,
} from './decklist-editor.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-decklist-editor',
  standalone: true,
  imports: [
    TranslatePipe,
    FormatSelectorComponent,
    DeckSuggestionsPanelComponent,
    DeckStatsStripComponent,
    DeckStrategyPanelComponent,
    DecklistSearchSidebarComponent,
    DecklistEditorHeaderComponent,
    DeckSectionGridComponent,
    DeckCardInspectPanelComponent,
    DeckCardInspectMobileComponent,
    CompleteDeckDialogComponent,
    YdkeExportDialogComponent,
    YdkeImportDialogComponent,
    TextDeckExportDialogComponent,
    TextDeckImportDialogComponent,
  ],
  template: `
    @if (deck(); as activeDeck) {
      <section class="flex flex-col min-h-0 gap-3">
        <app-decklist-editor-header
          [deck]="activeDeck"
          [renaming]="renaming()"
          [renameDraft]="renameDraft()"
          (back)="back.emit()"
          (renameStart)="startRename($event)"
          (renameDraftChange)="renameDraft.set($event)"
          (renameCommit)="commitRename()"
          (renameCancel)="cancelRename()"
          (completeDeck)="openCompleteDeckDialog()"
          (importText)="openImportTextDialog()"
          (exportText)="openTextExportDialog(activeDeck)"
          (importYdke)="openImportYdkeDialog()"
          (exportYdke)="openYdkeDialog(activeDeck)"
          (sortDeck)="decklistStore.sortActiveDeck()"
          (deleteDeck)="decklistStore.deleteActiveDecklist(); back.emit()"
        />

        <div class="deck-context-bar">
          <app-deck-stats-strip
            [embedded]="true"
            [cards]="liveDeck().cards"
            [mainTarget]="completeDeckTarget()"
          />
          <div class="deck-context-divider hidden sm:block" aria-hidden="true"></div>
          <div class="deck-context-format-inline min-w-0 flex-1 sm:flex-none">
            <app-format-selector
              [compact]="true"
              [formats]="formatStore.formats()"
              [selectedId]="formatStore.formatId()"
              (selectedChange)="formatStore.setFormatId($event)"
            />
          </div>
        </div>

        @defer (on viewport) {
          <app-deck-strategy-panel class="min-w-0" />
        } @placeholder {
          <div class="duel-panel min-h-10"></div>
        }

        <div role="tablist" class="workspace-tabs lg:hidden" [attr.aria-label]="'decklist.editor.workspace' | translate">
          <button
            type="button"
            role="tab"
            class="workspace-tab"
            [class.tab-active]="mobileWorkspaceTab() === 'deck'"
            [attr.aria-selected]="mobileWorkspaceTab() === 'deck'"
            (click)="mobileWorkspaceTab.set('deck')"
          >
            {{ 'decklist.editor.tab.deck' | translate }}
          </button>
          <button
            type="button"
            role="tab"
            class="workspace-tab"
            [class.tab-active]="mobileWorkspaceTab() === 'search'"
            [attr.aria-selected]="mobileWorkspaceTab() === 'search'"
            (click)="mobileWorkspaceTab.set('search')"
          >
            {{ 'decklist.editor.tab.search' | translate }}
          </button>
          @if (activeDeck.cards.length > 0) {
            <button
              type="button"
              role="tab"
              class="workspace-tab"
              [class.tab-active]="mobileWorkspaceTab() === 'assist'"
              [attr.aria-selected]="mobileWorkspaceTab() === 'assist'"
              (click)="mobileWorkspaceTab.set('assist')"
            >
              {{ 'decklist.editor.tab.assist' | translate }}
            </button>
          }
        </div>

        <div class="deck-workspace">
          <app-deck-card-inspect-panel
            [view]="inspectViewModel()"
            (increment)="incrementInspect()"
            (decrement)="decrementInspect()"
            (removeCopy)="removeInspectedCopy()"
            (openInSearch)="openInspectedInSearch()"
          />

          <div [class.max-lg:hidden]="mobileWorkspaceTab() !== 'deck'">
            <app-deck-section-grid
              [sections]="sectionViewModels()"
              [inspectedCardId]="deckInspectedCardId()"
              (cardInspect)="inspectDeckCard($event)"
              (cardRemove)="removeOneCopy($event.cardId, $event.event)"
            />
          </div>

          <div class="deck-rail" [class.max-lg:hidden]="mobileWorkspaceTab() !== 'search'">
            <app-decklist-search-sidebar
              class="shrink-0 min-w-0"
              [deckCards]="liveDeck().cards"
              [inspectedCardId]="inspectedSearchCardId()"
              (cardInspect)="inspectSearchCard($event)"
              (quickAdd)="addSearchCard($event)"
            />

            @if (activeDeck.cards.length > 0) {
              <div class="hidden lg:block min-h-0 flex-1">
                @defer (on viewport) {
                  <app-deck-suggestions-panel
                    [compact]="true"
                    [loading]="deckSuggestionsLoading()"
                    [available]="deckSuggestions().available"
                    [sourceCount]="deckSuggestions().sourceCount"
                    [groups]="deckSuggestions().groups"
                    [formatLabel]="deckSuggestionFormatLabel()"
                    (cardSelected)="addSuggestion($event)"
                  />
                } @placeholder {
                  <div class="duel-panel min-h-24"></div>
                }
              </div>
            }
          </div>
        </div>

        <app-deck-card-inspect-mobile
          [view]="inspectViewModel()"
          (increment)="incrementInspect()"
          (decrement)="decrementInspect()"
          (removeCopy)="removeInspectedCopy()"
        />
      </section>

      @if (activeDeck.cards.length > 0) {
        <div class="lg:hidden" [class.hidden]="mobileWorkspaceTab() !== 'assist'">
          @defer (when mobileWorkspaceTab() === 'assist') {
            <app-deck-suggestions-panel
              [loading]="deckSuggestionsLoading()"
              [available]="deckSuggestions().available"
              [sourceCount]="deckSuggestions().sourceCount"
              [groups]="deckSuggestions().groups"
              [formatLabel]="deckSuggestionFormatLabel()"
              (cardSelected)="addSuggestion($event)"
            />
          }
        </div>
      }
    }

    <app-complete-deck-dialog
      [open]="completeDeckDialogOpen()"
      [targetMain]="completeDeckTarget()"
      [includeSide]="completeDeckIncludeSide()"
      [mainCount]="mainDeckCount()"
      [extraCount]="extraDeckCount()"
      [sideCount]="sideDeckCount()"
      [planning]="completeDeckPlanning()"
      [plan]="completeDeckPlan()"
      (targetMainChange)="onCompleteDeckTargetChange($event)"
      (includeSideChange)="onCompleteDeckIncludeSideChange($event)"
      (closed)="closeCompleteDeckDialog()"
      (refresh)="refreshCompleteDeckPlan()"
      (apply)="confirmCompleteDeck()"
    />

    <app-text-deck-import-dialog
      [open]="importTextDialogOpen()"
      [draft]="importTextDraft()"
      [replace]="importTextReplace()"
      [importing]="importTextImporting()"
      [preview]="importTextPreview()"
      [unresolved]="importTextUnresolved()"
      (draftChange)="onImportTextDraftChange($event)"
      (replaceChange)="importTextReplace.set($event)"
      (closed)="closeImportTextDialog()"
      (confirm)="confirmImportText()"
    />

    <app-text-deck-export-dialog
      [open]="textExportDialogOpen()"
      [text]="textExportContent()"
      [hint]="textExportHint()"
      (closed)="closeTextExportDialog()"
      (copy)="copyTextExport()"
      (selectText)="selectTextExport($event)"
    />

    <app-ydke-import-dialog
      [open]="importYdkeDialogOpen()"
      [draft]="importYdkeDraft()"
      [replace]="importYdkeReplace()"
      [importing]="importYdkeImporting()"
      [preview]="importYdkePreview()"
      (draftChange)="onImportYdkeDraftChange($event)"
      (replaceChange)="importYdkeReplace.set($event)"
      (closed)="closeImportYdkeDialog()"
      (confirm)="confirmImportYdke()"
    />

    <app-ydke-export-dialog
      [open]="ydkeDialogOpen()"
      [url]="ydkeUrl()"
      [hint]="ydkeHint()"
      (closed)="closeYdkeDialog()"
      (copy)="copyYdke()"
      (selectText)="selectYdkeText($event)"
    />
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
  private readonly completion = inject(DeckCompletionService);
  private readonly strategy = inject(DeckStrategyStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly searchSidebar = viewChild(DecklistSearchSidebarComponent);

  readonly renaming = signal(false);
  readonly renameDraft = signal('');
  readonly mobileWorkspaceTab = signal<'deck' | 'search' | 'assist'>('deck');
  readonly inspectCard = signal<InspectTarget | null>(null);
  readonly inspectDesc = signal<string | null>(null);
  readonly inspectDescLoading = signal(false);
  readonly ydkeDialogOpen = signal(false);
  readonly ydkeUrl = signal('');
  readonly ydkeHint = signal('');
  readonly importYdkeDialogOpen = signal(false);
  readonly importYdkeDraft = signal('');
  readonly importYdkeReplace = signal(true);
  readonly importYdkeImporting = signal(false);
  readonly importYdkePreview = signal<{ main: string; extra: string; side: string } | null>(null);
  readonly importTextDialogOpen = signal(false);
  readonly importTextDraft = signal('');
  readonly importTextReplace = signal(true);
  readonly importTextImporting = signal(false);
  readonly importTextPreview = signal<{ main: string; extra: string; side: string } | null>(null);
  readonly importTextUnresolved = signal<string[]>([]);
  readonly textExportDialogOpen = signal(false);
  readonly textExportContent = signal('');
  readonly textExportHint = signal('');
  readonly deckSuggestionsLoading = signal(false);
  readonly deckSuggestions = signal<DeckRelatedResult>({
    suggestions: [],
    groups: [],
    sourceCount: 0,
    available: false,
    formatId: null,
  });
  readonly completeDeckDialogOpen = signal(false);
  readonly completeDeckTarget = signal(40);
  readonly completeDeckIncludeSide = signal(true);
  readonly completeDeckPlanning = signal(false);
  readonly completeDeckPlan = signal<DeckCompletionPlan | null>(null);

  readonly deckRevision = computed(() => {
    const deck = this.liveDeck();
    const total = deck.cards.reduce((sum, card) => sum + card.quantity, 0);
    return `${deck.id}:${deck.updatedAt}:${total}:${deck.cards.length}`;
  });

  protected readonly liveDeck = computed(() => {
    const deckId = this.deck().id;
    return this.decklistStore.decklists().find((item) => item.id === deckId) ?? this.deck();
  });

  readonly deckSuggestionFormatLabel = computed(() => {
    const format = this.formatStore.selectedFormat();
    if (!format) {
      return null;
    }
    const lang = this.i18n.lang();
    return format.name[lang] ?? format.name.en;
  });

  readonly mainDeckCount = computed(() =>
    sectionCardCount(splitDeckSections(this.liveDeck().cards).main),
  );
  readonly extraDeckCount = computed(() =>
    sectionCardCount(splitDeckSections(this.liveDeck().cards).extra),
  );
  readonly sideDeckCount = computed(() =>
    sectionCardCount(splitDeckSections(this.liveDeck().cards).side),
  );

  readonly inspectedSearchCardId = computed(() => {
    const inspect = this.inspectCard();
    return inspect?.kind === 'search' ? inspect.card.id : null;
  });

  readonly deckInspectedCardId = computed(() => {
    const inspect = this.inspectCard();
    return inspect?.kind === 'deck' ? inspect.card.id : null;
  });

  readonly sectionViewModels = computed((): DeckSectionViewModel[] => {
    const sections = deckSections(sortDeckCards(this.liveDeck().cards));
    return sections.map((section) => {
      const stats = computeTypeStats(section.cards);
      return {
        key: section.key,
        titleKey: DECK_SECTION_I18N_KEYS[section.key].title,
        emptyKey: DECK_SECTION_I18N_KEYS[section.key].empty,
        count: sectionCardCount(section.cards),
        monsters: stats.monsters,
        spells: stats.spells,
        traps: stats.traps,
        cards: section.cards,
        expandedCards: expandCardsForGrid(section.cards).map((card) => ({
          card,
          verdictShortKey: card.legalityVerdict ? verdictShortKey(card.legalityVerdict) : null,
        })),
      };
    });
  });

  readonly inspectViewModel = computed((): DeckCardInspectViewModel | null => {
    const inspect = this.inspectCard();
    if (!inspect) {
      return null;
    }
    const cardId = inspect.card.id;
    const legality = this.resolveInspectLegality(inspect);
    const qty = this.decklistStore.quantityInActive(cardId);
    return {
      cardId,
      name: inspect.card.name,
      type: inspect.card.type,
      imageUrl:
        inspect.kind === 'deck'
          ? inspect.card.imageUrlSmall
          : (inspect.card.card_images[0]?.image_url_small ?? null),
      desc: this.inspectDesc(),
      descLoading: this.inspectDescLoading(),
      legality,
      qty,
      inDeckLabelKey: 'decklist.editor.inDeck',
      inDeckLabelParams: { qty: String(qty) },
      canAdd: this.canAddInspectTarget(inspect, legality),
    };
  });

  private readonly descCache = new Map<number, string>();
  private completeDeckPlanSub: Subscription | null = null;

  constructor() {
    this.formatStore.formatId$
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const format = this.formatStore.selectedFormat();
        if (format) {
          this.decklistStore.refreshActiveDeckLegality(format);
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
      void this.strategy.direction();
      void this.strategy.prompt();
      void this.strategy.useOllama();
      void revision;

      if (!format || deck.cards.length === 0) {
        this.deckSuggestions.set({
          suggestions: [],
          groups: [],
          sourceCount: 0,
          available: !!format,
          formatId: format?.id ?? null,
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

    effect((onCleanup) => {
      if (!this.completeDeckDialogOpen()) {
        return;
      }
      const sub = this.strategy.ragResult$.pipe(debounceTime(600)).subscribe(() => {
        this.refreshCompleteDeckPlan();
      });
      onCleanup(() => sub.unsubscribe());
    });
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

  incrementInspect(): void {
    const inspect = this.inspectCard();
    if (!inspect || !this.inspectViewModel()?.canAdd) {
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
    const id = inspect?.card.id;
    if (!id || this.decklistStore.quantityInActive(id) === 0) {
      return;
    }
    const banlistStatus =
      inspect?.kind === 'deck'
        ? inspect.card.banlistStatus ?? null
        : (this.searchLegalityMap().get(id)?.banlistStatus ?? null);
    this.decklistStore.decrementCard(id, banlistStatus);
  }

  removeInspectedCopy(): void {
    const id = this.inspectViewModel()?.cardId;
    if (id) {
      this.removeOneCopy(id);
    }
  }

  removeOneCopy(cardId: number, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.decklistStore.removeOneCopy(cardId);
    const inspect = this.inspectCard();
    if (inspect?.card.id === cardId && inspect.kind === 'deck') {
      const fresh = this.deck().cards.find((c) => c.id === cardId);
      if (fresh) {
        this.inspectCard.set({ kind: 'deck', card: fresh });
      }
    }
  }

  addSearchCard(card: YgoCard): void {
    const legality = this.searchLegalityMap().get(card.id);
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

  openInspectedInSearch(): void {
    const id = this.inspectViewModel()?.cardId;
    if (!id) {
      return;
    }
    void this.router.navigate(['/'], {
      queryParams: { cardId: id, from: 'decklist', deckId: this.deck().id },
    });
  }

  openYdkeDialog(deck: Decklist): void {
    const sections = splitDeckIntoYdkeSections(deck.cards);
    const url = this.decklistStore.encodeYdke(deck.id);
    if (!url) {
      return;
    }
    this.ydkeUrl.set(url);
    this.ydkeHint.set(
      this.i18n.translate('decklist.ydke.hint', {
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
    this.decklistStore
      .importFromYdke$(draft, deck.id, this.importYdkeReplace(), format)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.importYdkeImporting.set(false);
          if (result.ok) {
            this.closeImportYdkeDialog();
          }
        },
        error: () => this.importYdkeImporting.set(false),
      });
  }

  openImportTextDialog(): void {
    this.importTextDraft.set('');
    this.importTextReplace.set(true);
    this.importTextPreview.set(null);
    this.importTextUnresolved.set([]);
    this.importTextDialogOpen.set(true);
  }

  closeImportTextDialog(): void {
    this.importTextDialogOpen.set(false);
    this.importTextDraft.set('');
    this.importTextPreview.set(null);
    this.importTextUnresolved.set([]);
  }

  onImportTextDraftChange(value: string): void {
    this.importTextDraft.set(value);
    try {
      const sections = parseDeckText(value);
      const counts = countTextDeckLines(sections);
      this.importTextPreview.set({
        main: `${counts.main}`,
        extra: `${counts.extra}`,
        side: `${counts.side}`,
      });
    } catch {
      this.importTextPreview.set(null);
    }
  }

  confirmImportText(): void {
    const deck = this.deck();
    const format = this.formatStore.selectedFormat();
    const draft = this.importTextDraft().trim();
    if (!draft || !format || this.importTextImporting()) {
      return;
    }
    this.importTextImporting.set(true);
    this.importTextUnresolved.set([]);
    this.decklistStore
      .importFromText$(draft, deck.id, this.importTextReplace(), format)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.importTextImporting.set(false);
          if (result.unresolved.length > 0) {
            this.importTextUnresolved.set(result.unresolved);
          }
          if (result.ok) {
            this.closeImportTextDialog();
          }
        },
        error: () => this.importTextImporting.set(false),
      });
  }

  openTextExportDialog(deck: Decklist): void {
    if (deck.cards.length === 0) {
      return;
    }
    this.textExportContent.set('');
    this.textExportHint.set('');
    this.textExportDialogOpen.set(true);
    this.decklistStore
      .exportDeckText$(deck.id, this.i18n.lang())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((text) => {
        if (!text) {
          this.closeTextExportDialog();
          return;
        }
        const sections = parseDeckText(text);
        const counts = countTextDeckLines(sections);
        this.textExportContent.set(text);
        this.textExportHint.set(
          this.i18n.translate('decklist.text.hint', {
            main: `${counts.main}`,
            extra: `${counts.extra}`,
            side: `${counts.side}`,
          }),
        );
      });
  }

  closeTextExportDialog(): void {
    this.textExportDialogOpen.set(false);
    this.textExportContent.set('');
    this.textExportHint.set('');
  }

  selectTextExport(event: FocusEvent): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) {
      target.select();
    }
  }

  async copyTextExport(): Promise<void> {
    const text = this.textExportContent();
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.closeTextExportDialog();
    } catch {
      // Clipboard blocked: textarea remains selectable for manual copy.
    }
  }

  addSuggestion(suggestion: CardRelatedSuggestion): void {
    const format = this.formatStore.selectedFormat();
    const qty = suggestion.suggestedQty ?? 1;
    if (!format || qty <= 0) {
      return;
    }
    this.ygoApi
      .getCardById$(suggestion.cardId, this.i18n.lang())
      .pipe(
        switchMap((card) => {
          if (!card) {
            return of(null);
          }
          return this.cardLegality.evaluate$(card, format).pipe(map((result) => ({ card, result })));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((payload) => {
        if (!payload) {
          return;
        }
        const { card, result } = payload;
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
  }

  openCompleteDeckDialog(): void {
    this.completeDeckTarget.set(this.completion.defaultTargetMain());
    this.completeDeckIncludeSide.set(true);
    this.completeDeckPlan.set(null);
    this.completeDeckDialogOpen.set(true);
    this.strategy.refreshOllamaStatus();
    this.refreshCompleteDeckPlan();
  }

  closeCompleteDeckDialog(): void {
    this.completeDeckPlanSub?.unsubscribe();
    this.completeDeckPlanSub = null;
    this.completeDeckDialogOpen.set(false);
    this.completeDeckPlan.set(null);
    this.completeDeckPlanning.set(false);
  }

  onCompleteDeckTargetChange(value: number | string): void {
    const parsed = typeof value === 'number' ? value : Number(value);
    this.completeDeckTarget.set(
      this.completion.normalizeTargetMain(Number.isFinite(parsed) ? parsed : 40),
    );
    this.refreshCompleteDeckPlan();
  }

  onCompleteDeckIncludeSideChange(value: boolean): void {
    this.completeDeckIncludeSide.set(value);
    this.refreshCompleteDeckPlan();
  }

  refreshCompleteDeckPlan(): void {
    const format = this.formatStore.selectedFormat();
    if (!format || this.completeDeckPlanning()) {
      return;
    }
    this.completeDeckPlanSub?.unsubscribe();
    this.completeDeckPlanning.set(true);
    this.completeDeckPlanSub = this.completion
      .plan$(this.liveDeck(), format, {
        targetMain: this.completeDeckTarget(),
        includeSide: this.completeDeckIncludeSide(),
        targetSide: 15,
      })
      .subscribe({
        next: (plan) => {
          this.completeDeckPlan.set(plan);
          this.completeDeckPlanning.set(false);
          this.completeDeckPlanSub = null;
        },
        error: () => {
          this.completeDeckPlanning.set(false);
          this.completeDeckPlanSub = null;
        },
      });
  }

  confirmCompleteDeck(): void {
    const plan = this.completeDeckPlan();
    const deck = this.deck();
    if (!plan || plan.status !== 'ready') {
      return;
    }
    if (this.decklistStore.applyCompletionPlan(deck.id, plan)) {
      this.closeCompleteDeckDialog();
    }
  }

  private searchLegalityMap(): Map<number, LegalityResult> {
    return this.searchSidebar()?.searchLegality() ?? new Map();
  }

  private resolveInspectLegality(inspect: InspectTarget): LegalityResult | null {
    if (inspect.kind === 'search') {
      return this.searchLegalityMap().get(inspect.card.id) ?? null;
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

  private canAddInspectTarget(
    inspect: InspectTarget,
    legality: LegalityResult | null,
  ): boolean {
    const cardId = inspect.card.id;
    if (inspect.kind === 'deck' && inspect.card.banlistStatus === 'Forbidden') {
      return false;
    }
    if (inspect.kind === 'search' && legality?.banlistStatus === 'Forbidden') {
      return false;
    }
    const banlistStatus =
      inspect.kind === 'deck'
        ? inspect.card.banlistStatus ?? null
        : (legality?.banlistStatus ?? null);
    return this.decklistStore.canAddToDeck(this.deck().id, cardId, banlistStatus);
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
    this.ygoApi
      .getCardById$(cardId, this.i18n.lang())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((card) => {
        const desc = card?.desc ?? null;
        if (desc) {
          this.descCache.set(cardId, desc);
        }
        this.inspectDesc.set(desc);
        this.inspectDescLoading.set(false);
      });
  }
}
