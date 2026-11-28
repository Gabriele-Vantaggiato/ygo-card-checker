import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DecklistStore } from '../decklist/stores/decklist.store';
import { IntentWorkspaceService } from './intent-workspace.service';
import { PANEL_CATALOG, type PanelKind, type WorkspaceDefinition, type WorkspaceTheme } from './intent-contract';
import type { Decklist } from '../../models/decklist.model';
import type { SimulationCard } from './intent-simulator';
import { hypergeometricPmf } from '../../utils/hypergeo.utils';
import { computeTypeStats, deckSections, sectionCardCount, splitDeckSections } from '../../utils/deck-card.utils';
import { INTENT_EXAMPLES, interpretIntentAction } from './intent-actions';
import { mainDeckSnapshot } from './intent-simulator';

@Component({
  selector: 'app-intent-workspace-page', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './intent-workspace.page.html',
  styleUrls: ['./intent-workspace.page.surface.css', './intent-workspace.page.panels.css', './intent-workspace.page.css'],
})
export class IntentWorkspacePage {
  private readonly router = inject(Router);
  protected readonly examples = INTENT_EXAMPLES;
  protected readonly store = inject(DecklistStore);
  protected readonly runtime = inject(IntentWorkspaceService);
  protected readonly panelCatalog = PANEL_CATALOG;
  protected readonly request = signal('Prendi il mio mazzo e simula 10.000 mani iniziali. Mostrami le probabilità di pescata, le mani più frequenti e un grafico con tema scuro su due colonne.');
  protected readonly modification = signal('');
  protected readonly deckSelection = signal(this.store.activeDecklistId() ?? '');
  protected readonly selectedStarters = signal<number[]>([]);
  protected readonly sampleIndex = signal(0);
  protected readonly errorMessage = signal('');
  protected readonly platformSession = toSignal(inject(AuthService).session$, { initialValue: null });
  protected readonly planning = signal(false);
  protected readonly notice = signal('');
  protected readonly selectedDeck = computed<Decklist | null>(() =>
    this.store.decklists().find((d) => d.id === this.deckSelection()) ?? this.store.activeDecklist());
  protected readonly deckCounts = computed(() => {
    const decks = splitDeckSections(this.selectedDeck()?.cards ?? []);
    return { main: sectionCardCount(decks.main), extra: sectionCardCount(decks.extra), side: sectionCardCount(decks.side) };
  });
  protected readonly showDeckAnalysis = signal(false);
  protected readonly deckAnalysis = computed(() => deckSections(this.selectedDeck()?.cards ?? []).map(({ key, cards }) => ({
    name: key === 'main' ? 'Main Deck' : key === 'extra' ? 'Extra Deck' : 'Side Deck',
    copies: sectionCardCount(cards), distinct: new Set(cards.map((card) => card.id)).size, ...computeTypeStats(cards),
  })));
  protected readonly candidateStarters = computed(() => mainDeckSnapshot(this.selectedDeck()?.cards ?? []));
  protected readonly visiblePanels = computed(() => this.runtime.active()?.panels.filter((p) => p.visible) ?? []);

  protected async create(): Promise<void> {
    if (this.planning()) return;
    this.errorMessage.set(''); this.notice.set('');
    const deck = this.selectedDeck();
    this.planning.set(true);
    try {
      const action = interpretIntentAction(this.request());
      switch (action.kind) {
        case 'search':
          await this.router.navigate(['/search'], { queryParams: { q: action.query, ...action.filters } });
          return;
        case 'decks':
          await this.router.navigate(['/decklist'], { queryParams: action.action === 'list' ? {} : { tool: action.action, deckId: action.action === 'check' ? deck?.id : undefined } });
          return;
        case 'combo':
          await this.router.navigate([action.view === 'sheets' ? '/combo' : '/flow'], {
            queryParams: action.view === 'sheets' && deck ? { deckId: deck.id } : {},
          });
          return;
        case 'deck':
          if (!deck) throw new Error('Scegli o crea prima una decklist.');
          await this.router.navigate(['/decklist'], {
            queryParams: { deckId: deck.id, editor: '1', tool: action.action === 'edit' ? null : action.action },
          });
          return;
        case 'deck-analysis':
          if (!deck) throw new Error('Scegli o crea prima una decklist.');
          this.showDeckAnalysis.set(true);
          this.notice.set('Composizione del mazzo calcolata dalle carte selezionate.');
          return;
        case 'workspace':
          if (!deck) throw new Error('Scegli o crea prima una decklist.');
          await this.runtime.create(this.request(), deck, this.selectedStarters());
      }
      this.sampleIndex.set(0);
      this.notice.set('Ambiente creato e salvato nel browser. Puoi modificarlo, sospenderlo e riaprirlo.');
    } catch (error) { this.errorMessage.set(error instanceof Error ? error.message : 'Simulazione non disponibile.'); }
    finally { this.planning.set(false); }
  }

  protected async modify(): Promise<void> {
    if (this.planning()) return;
    this.errorMessage.set(''); this.notice.set('');
    if (!this.modification().trim()) return;
    this.planning.set(true);
    try {
      await this.runtime.modify(this.modification());
      this.notice.set('Composizione aggiornata e salvata.');
      this.modification.set('');
    } catch (error) { this.errorMessage.set(error instanceof Error ? error.message : 'Modifica non disponibile.'); }
    finally { this.planning.set(false); }
  }

  protected chooseWorkspace(id: string): void {
    this.runtime.setActive(id);
    this.sampleIndex.set(0);
    this.errorMessage.set(''); this.notice.set('Ambiente ripristinato dalla memoria locale.');
  }

  protected toggleCriterion(id: number, value: boolean, workspace: WorkspaceDefinition): void {
    const current = workspace.simulation.starterIds;
    this.runtime.updateCriterion(value ? [...current, id] : current.filter((candidate) => candidate !== id));
    this.notice.set('Criterio aggiornato: le statistiche sono state ricalcolate sullo stesso campione.');
  }

  protected toggleBeforeCreate(id: number, value: boolean): void {
    this.selectedStarters.update((ids) => value ? [...ids, id] : ids.filter((candidate) => candidate !== id));
  }

  protected setTheme(value: WorkspaceTheme): void { this.runtime.updatePresentation({ theme: value }); }
  protected setScale(value: WorkspaceDefinition['scale']): void { this.runtime.updatePresentation({ scale: value }); }
  protected setColumns(value: number | string): void {
    const count = Number(value);
    if (count === 1 || count === 2 || count === 3) this.runtime.updatePresentation({ columns: count });
  }

  protected drawAgain(): void {
    this.runtime.rerun(); this.sampleIndex.set(0);
    this.notice.set('Nuova simulazione eseguita e salvata.');
  }

  protected deleteCurrent(): void {
    const active = this.runtime.active();
    if (active && confirm(`Eliminare l'ambiente «${active.name}»? La decklist rimarrà invariata.`)) {
      this.runtime.deleteWorkspace(active.id);
    }
  }

  protected exampleHand(workspace: WorkspaceDefinition): readonly number[] {
    return workspace.simulation.exampleHands.at(this.sampleIndex()) ?? [];
  }

  protected cardById(workspace: WorkspaceDefinition, id: number): SimulationCard | undefined {
    return workspace.cards.find((card) => card.id === id);
  }
  protected percent(value: number): string { return (value * 100).toLocaleString('it-IT', { maximumFractionDigits: 2 }) + '%'; }
  protected percentage(value: number): number { return Math.min(100, Math.max(0, value * 100)); }
  protected drawPercent(value: number, samples: number): string { return this.percent(value / samples); }
  protected hasStarter(workspace: WorkspaceDefinition, id: number): boolean { return workspace.simulation.starterIds.includes(id); }
  protected panelLabel(kind: PanelKind): string { return PANEL_CATALOG.find((p) => p.kind === kind)?.title ?? kind; }
  protected appearanceCount(workspace: WorkspaceDefinition): number { return workspace.simulation.appearances.length; }
  protected humanDate(value: string): string { return new Date(value).toLocaleString('it-IT'); }
  protected exactBrickRate(workspace: WorkspaceDefinition): number | null {
    const { starterIds, deckSize, handSize } = workspace.simulation;
    if (!starterIds.length) return null;
    const copies = workspace.cards.reduce((total, card) => total + (starterIds.includes(card.id) ? card.quantity : 0), 0);
    return hypergeometricPmf(deckSize, copies, handSize, 0);
  }
}
