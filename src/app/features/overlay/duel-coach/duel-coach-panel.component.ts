import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { DuelCoachStore } from './duel-coach.store';
import { MdproDirectoryService } from './mdpro-directory.service';
import { ACTION_LABELS, COACH_ACTIONS, CoachAction, CoachRun } from './duel-coach.model';

@Component({
  selector: 'app-duel-coach-panel', standalone: true,
  imports: [FormsModule,DatePipe], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './duel-coach-panel.component.html',
})
export class DuelCoachPanelComponent {
  readonly coach = inject(DuelCoachStore);
  readonly mdpro = inject(MdproDirectoryService);
  readonly bridge = this.coach.bridge;
  readonly decks = inject(DecklistStore);
  readonly input = signal('');
  readonly action = signal<CoachAction>('normal-summon');
  readonly cardId = signal(0);
  readonly prerequisites = signal(false);
  readonly actions = COACH_ACTIONS.filter(action => action !== 'instruction');
  readonly labels = ACTION_LABELS;
  constructor() { void this.coach.loadCatalog(); }
  loadSaved(id: string): void {
    const deck = this.decks.decklists().find(d => d.id === id);
    if (deck) { this.coach.useSavedDeck(deck); this.prerequisites.set(false); }
  }
  loadDetected(): void {
    const active = this.mdpro.active();
    if (active) { this.coach.useDeck(active.ydke,active.name); this.prerequisites.set(false); }
  }
  loadBridgeDeck(): void {
    const active = this.bridge.snapshot()?.activeDeck;
    if (active) { this.coach.useDeck(active.ydke,active.name); this.prerequisites.set(false); }
  }
  loadInput(): void { this.coach.useDeck(this.input().trim()); this.prerequisites.set(false); }
  record(): void { this.coach.record(Number(this.cardId()),this.action()); }
  replay(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) void this.coach.importReplay(input.files[0]);
    input.value = '';
  }
  nativeCapture(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) void this.coach.importNativeCapture(input.files[0]);
    input.value = '';
  }
  comparison(run: CoachRun): string {
    if (!run.route) return 'Senza linea di riferimento';
    const comparison = this.coach.comparisonFor(run);
    if (!comparison) return 'Confronto inconcludente: interferenze o azioni non osservabili';
    return comparison.status === 'complete' ? 'Sequenza esplicita completata' : comparison.status === 'deviation' ? 'Sequenza diversa dalla guida' : `Sequenza parziale: ${comparison.matched} passi`;
  }
  sameHandRuns(run: CoachRun): number {
    const opening = [...run.opening].sort((a,b) => a-b).join(',');
    const key = JSON.stringify(run.moves.map(m => [m.action,m.cardId]));
    return this.coach.deckHistory().filter(r => r.source === run.source && r.masterRule === run.masterRule && r.turn === run.turn &&
      [...r.opening].sort((a,b) => a-b).join(',') === opening && JSON.stringify(r.moves.map(m => [m.action,m.cardId])) === key).length;
  }
  exportRuns(): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 1,runs: this.coach.history() },null,2)],{ type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'ygo-duel-coach-sessioni.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
}
