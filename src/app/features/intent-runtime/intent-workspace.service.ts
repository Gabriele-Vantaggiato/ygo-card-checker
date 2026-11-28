import { Injectable, computed, signal } from '@angular/core';
import type { Decklist } from '../../models/decklist.model';
import { CAPABILITIES, interpretWorkspaceRequest, validWorkspace, type PanelKind, type WorkspaceDefinition, type WorkspaceTheme } from './intent-contract';
import { deckFingerprint, mainDeckSnapshot, simulateOpeningHands } from './intent-simulator';

const STORAGE_KEY = 'ygo-intent-runtime-workspaces-v1';
const MAX_WORKSPACES = 20;

function loadWorkspaces(): WorkspaceDefinition[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(data) ? data.filter(validWorkspace).slice(0, MAX_WORKSPACES) : [];
  } catch { return []; }
}

@Injectable({ providedIn: 'root' })
export class IntentWorkspaceService {
  /** Developer-controlled capabilities; the UI cannot grant new permissions. */
  readonly capabilities = CAPABILITIES;
  readonly workspaces = signal<WorkspaceDefinition[]>(loadWorkspaces());
  readonly activeId = signal<string | null>(this.workspaces()[0]?.id ?? null);
  readonly active = computed(() => this.workspaces().find((w) => w.id === this.activeId()) ?? null);
  readonly storageWarning = signal('');

  async create(prompt: string, deck: Decklist, chosenStarters: readonly number[], samplesFallback = 10_000): Promise<WorkspaceDefinition> {
    this.assertCapability('deck.read');
    this.assertCapability('hand.simulate');
    this.assertCapability('workspace.compose');
    const cards = mainDeckSnapshot(deck.cards);
    const config = interpretWorkspaceRequest(prompt);
    const samples = config.samples ?? samplesFallback;
    const simulation = simulateOpeningHands({ cards, samples, handSize: 5, starterIds: chosenStarters, seed: Date.now() });
    const now = new Date().toISOString();
    const next: WorkspaceDefinition = {
      schemaVersion: 1, id: crypto.randomUUID(), name: `${deck.name} · Simulazioni`,
      deckId: deck.id, deckName: deck.name, createdAt: now, updatedAt: now,
      theme: config.theme, columns: config.columns, scale: config.scale,
      panels: config.panels, cards, simulation, revision: 1,
    };
    this.workspaces.update((all) => [next, ...all].slice(0, MAX_WORKSPACES));
    this.activeId.set(next.id);
    this.persist();
    return next;
  }

  async modify(prompt: string): Promise<void> {
    this.assertCapability('workspace.compose');
    const previous = this.active();
    if (!previous) throw new Error('Apri prima un ambiente di lavoro.');
    const next = interpretWorkspaceRequest(prompt, previous);
    const changes: Partial<WorkspaceDefinition> = {
      columns: next.columns, theme: next.theme, scale: next.scale, panels: next.panels,
    };
    if (next.samples && next.samples !== previous.simulation.samples) {
      this.assertCapability('hand.simulate');
      changes.simulation = simulateOpeningHands({
        cards: previous.cards, samples: next.samples, handSize: previous.simulation.handSize,
        starterIds: previous.simulation.starterIds, seed: previous.simulation.seed,
      });
    }
    this.updateActive(changes);
  }

  updateCriterion(starterIds: readonly number[]): void {
    const current = this.active();
    if (!current) return;
    this.assertCapability('hand.simulate');
    const simulation = simulateOpeningHands({
      cards: current.cards, samples: current.simulation.samples, handSize: current.simulation.handSize,
      starterIds, seed: current.simulation.seed,
    });
    this.updateActive({ simulation });
  }

  rerun(): void {
    const current = this.active();
    if (!current) return;
    this.assertCapability('hand.simulate');
    this.updateActive({ simulation: simulateOpeningHands({
      cards: current.cards, samples: current.simulation.samples, handSize: current.simulation.handSize,
      starterIds: current.simulation.starterIds, seed: Date.now(),
    }) });
  }

  updatePresentation(patch: { columns?: 1 | 2 | 3; theme?: WorkspaceTheme; scale?: WorkspaceDefinition['scale'] }): void {
    this.updateActive(patch);
  }

  setPanelVisible(kind: PanelKind, visible: boolean): void {
    const w = this.active();
    if (!w) return;
    this.updateActive({ panels: w.panels.map((p) => p.kind === kind ? { ...p, visible } : p) });
  }

  movePanel(kind: PanelKind, delta: -1 | 1): void {
    const w = this.active();
    if (!w) return;
    const panels = w.panels.map((p) => ({ ...p }));
    const i = panels.findIndex((p) => p.kind === kind);
    const other = i + delta;
    if (i < 0 || other < 0 || other >= panels.length) return;
    [panels[i], panels[other]] = [panels[other]!, panels[i]!];
    this.updateActive({ panels });
  }

  renameActive(name: string): void {
    if (name.trim()) this.updateActive({ name: name.trim().slice(0, 100) });
  }

  setActive(id: string): void {
    if (this.workspaces().some((w) => w.id === id)) this.activeId.set(id);
  }

  deleteWorkspace(id: string): void {
    this.workspaces.update((all) => all.filter((w) => w.id !== id));
    if (this.activeId() === id) this.activeId.set(this.workspaces()[0]?.id ?? null);
    this.persist();
  }

  isStale(w: WorkspaceDefinition, currentDeck: Decklist | null): boolean {
    if (!currentDeck || currentDeck.id !== w.deckId) return false;
    return w.simulation.deckFingerprint !== deckFingerprint(mainDeckSnapshot(currentDeck.cards));
  }

  private updateActive(changes: Partial<WorkspaceDefinition>): void {
    const current = this.active();
    if (!current) return;
    this.workspaces.update((all) => all.map((w) => w.id === current.id
      ? { ...w, ...changes, revision: w.revision + 1, updatedAt: new Date().toISOString() }
      : w));
    this.persist();
  }

  private assertCapability(id: typeof CAPABILITIES[number]['id']): void {
    if (!CAPABILITIES.some((cap) => cap.id === id)) throw new Error(`Capability non autorizzata: ${id}`);
  }

  private persist(): void {
    this.assertCapability('workspace.persist');
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.workspaces()));
      this.storageWarning.set('');
    } catch {
      this.storageWarning.set('Memoria locale esaurita o non disponibile: queste modifiche potrebbero non essere conservate.');
    }
  }
}
