import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Decklist } from '../../../models/decklist.model';
import { associateReplayDeck } from '../utils/replay-flow';
import { ComboWizardService } from '../../ygo-flow/services/combo-wizard.service';
import { ReplayLineMemoryService } from '../../../services/replay-line-memory.service';
import { compareLine, openingLine } from '../../../utils/replay-lines';
import { FlowCard } from '../../../models/ygo-flow.model';
import {
  ReplayAnalysis,
  ReplayDeckAdvice,
  ReplaySlot,
} from '../../../models/replay.model';
import { ReplayCoachBrief } from '../../../models/replay-restriction.model';
import { PasscodeCatalogService } from '../../../services/passcode-catalog.service';
import { ReplayRestrictionCatalogService } from '../../../services/replay-restriction-catalog.service';
import { GeminiCoachService } from '../../../services/gemini-coach.service';
import { I18nService } from '../../../services/i18n.service';
import { findDuplicateHashes } from '../utils/file-hash.utils';
import { analyzeReplay } from '../utils/missplay-analyzer';
import { buildDeckAdvice } from '../utils/deck-advice';
import { buildRestrictionTrace } from '../utils/restriction-engine';
import { buildReplayCoachBrief } from '../utils/coach-brief';
import { Yrp3dParserService } from '../services/yrp3d-parser.service';

function emptySlots(): ReplaySlot[] {
  return [
    { id: 'primary', file: null, errorKey: null },
    { id: 'extra1', file: null, errorKey: null },
    { id: 'extra2', file: null, errorKey: null },
  ];
}

@Injectable()
export class ReplayStore {
  private readonly parser = inject(Yrp3dParserService);
  private readonly wizard = inject(ComboWizardService);
  private readonly lineMemory = inject(ReplayLineMemoryService);
  private readonly catalog = inject(PasscodeCatalogService);
  private readonly restrictions = inject(ReplayRestrictionCatalogService);
  private readonly gemini = inject(GeminiCoachService);
  private readonly i18n = inject(I18nService);

  readonly selectedDeck = signal<Decklist | null>(null);
  setDeck(deck: Decklist | null): void { this.clearResults(); this.selectedDeck.set(deck ? structuredClone(deck) : null); }
  private analysisRun = 0;
  private coachRun = 0;
  readonly observedLines = this.lineMemory.observations;
  clearLearning(): void { this.lineMemory.clear(); this.clearResults(); }

  readonly deckAdviceEnabled = signal(false);
  readonly geminiEnabled = signal(false);
  readonly slots = signal<ReplaySlot[]>(emptySlots());
  readonly busy = signal(false);
  readonly coachBusy = signal(false);
  readonly formErrorKey = signal<string | null>(null);
  readonly analyses = signal<ReplayAnalysis[]>([]);
  readonly deckAdvice = signal<ReplayDeckAdvice | null>(null);
  readonly coachBrief = signal<ReplayCoachBrief | null>(null);
  readonly coachText = signal<string | null>(null);
  readonly coachErrorKey = signal<string | null>(null);

  readonly primaryAnalysis = computed(() => this.analyses()[0] ?? null);
  readonly canAnalyze = computed(() => {
    const slots = this.slots();
    if (!slots[0].file) return false;
    if (!this.deckAdviceEnabled()) return true;
    return !!slots[1].file && !!slots[2].file;
  });

  setDeckAdviceEnabled(enabled: boolean): void {
    this.clearResults();
    this.deckAdviceEnabled.set(enabled);
    this.formErrorKey.set(null);
    if (!enabled) {
      this.slots.update((slots) =>
        slots.map((s) => (s.id === 'primary' ? s : { ...s, file: null, errorKey: null })),
      );
    }
  }

  setGeminiEnabled(enabled: boolean): void {
    this.geminiEnabled.set(enabled);
    if (!enabled) { this.coachRun++; this.coachBusy.set(false); this.coachText.set(null); }
    this.coachErrorKey.set(null);
  }

  setFile(slotId: ReplaySlot['id'], file: File | null): void {
    this.clearResults();
    this.formErrorKey.set(null);
    this.slots.update((slots) =>
      slots.map((s) => {
        if (s.id !== slotId) return s;
        if (!file) return { ...s, file: null, errorKey: null };
        if (!file.name.toLowerCase().endsWith('.yrp3d')) {
          return { ...s, file: null, errorKey: 'replay.error.badExtension' };
        }
        if (file.size <= 0 || file.size > this.parser.maxBytes) {
          return { ...s, file: null, errorKey: 'replay.error.fileSize' };
        }
        return { ...s, file, errorKey: null };
      }),
    );
  }

  clearResults(): void {
    this.analysisRun++; this.coachRun++;
    this.busy.set(false); this.coachBusy.set(false);
    this.analyses.set([]);
    this.deckAdvice.set(null);
    this.coachBrief.set(null);
    this.coachText.set(null);
    this.formErrorKey.set(null);
    this.coachErrorKey.set(null);
  }

  reset(): void {
    this.selectedDeck.set(null);
    this.slots.set(emptySlots());
    this.deckAdviceEnabled.set(false);
    this.geminiEnabled.set(false);
    this.busy.set(false);
    this.coachBusy.set(false);
    this.clearResults();
  }

  private resolveName = (code: number) => this.catalog.get(code)?.n ?? `#${code}`;

  async analyze(): Promise<void> {
    if (this.busy() || !this.canAnalyze()) return;

    const run = ++this.analysisRun;
    this.coachRun++; this.coachBusy.set(false);
    this.busy.set(true);
    this.formErrorKey.set(null);
    this.analyses.set([]);
    this.deckAdvice.set(null);
    this.coachBrief.set(null);
    this.coachText.set(null);
    this.coachErrorKey.set(null);

    try {
      await firstValueFrom(this.catalog.ensureLoaded$());
      await firstValueFrom(this.restrictions.ensureLoaded$());
      await firstValueFrom(this.wizard.ensureReady$());
      if (run !== this.analysisRun) return;

      const wantAdvice = this.deckAdviceEnabled();
      const files = this.slots()
        .filter((s) => (wantAdvice ? true : s.id === 'primary'))
        .map((s) => s.file)
        .filter((f): f is File => !!f);

      if (wantAdvice && files.length !== 3) {
        this.formErrorKey.set('replay.error.needThree');
        return;
      }

      const parsed = [];
      for (const file of files) {
        const replay = await this.parser.parseFile(file);
        const selected = this.selectedDeck();
        const associated = selected ? associateReplayDeck(replay,selected) : replay;
        if (!associated) { if (run === this.analysisRun) this.formErrorKey.set('replay.flow.deckMismatch'); return; }
        parsed.push(associated);
        if (run !== this.analysisRun) return;
      }

      const dupes = findDuplicateHashes(parsed.map((p) => p.sha256));
      if (dupes.length > 0) {
        this.formErrorKey.set('replay.error.duplicateFiles');
        return;
      }

      const restrictionCatalog = this.restrictions.catalog();
      // Record the whole batch; recommendations always exclude their own replay hash.
      this.lineMemory.record(parsed);
      const analyses: ReplayAnalysis[] = parsed.map((p) => {
        const base = analyzeReplay(p);
        const restrictionTrace = buildRestrictionTrace(p, restrictionCatalog, this.resolveName);
        const opening = openingLine(p);
        const toCards = (codes: readonly number[]): FlowCard[] => codes.map((code, i) => ({
          uid: `${code}-${i}`, passcode: code, name: this.resolveName(code), type: this.catalog.get(code)?.t ?? '',
          desc: '', imageSmall: '', image: '', role: 'untagged',
        }));
        const deck = p.decks ? { main: toCards(p.decks.focus.main), extra: toCards(p.decks.focus.extra), side: [] } : undefined;
        const recommended = opening ? this.wizard.recommendReplayLine(opening, toCards(opening.openingHand), deck) : null;
        const lineComparisons = opening && recommended
          ? [compareLine(p, opening, recommended.actions, restrictionTrace, recommended.games)] : [];
        for (const comparison of lineComparisons) {
          if (comparison.status === 'deviation') base.findings.push({
            kind: 'suboptimal_line', severity: 'info',
            titleKey: 'replay.findings.suboptimalLine.title', detailKey: comparison.evidenceGames ? 'replay.findings.suboptimalLine.detail' : 'replay.findings.suboptimalLine.curated',
            count: comparison.evidenceGames, meta: { turn: comparison.turn, games: comparison.evidenceGames },
          });
        }
        return { ...base, restrictionTrace, lineComparisons };
      });
      this.analyses.set(analyses);
      this.lineMemory.rememberAnalyses(analyses);
      this.deckAdvice.set(wantAdvice ? buildDeckAdvice(analyses) : null);

      const primary = analyses[0];
      if (primary?.restrictionTrace) {
        this.coachBrief.set(
          buildReplayCoachBrief(primary, primary.restrictionTrace, this.resolveName, [...this.lineMemory.recentGames()].reverse()),
        );
      }

      if (this.geminiEnabled() && this.gemini.isUnlocked() && this.coachBrief()) {
        await this.runCoach();
      }
    } catch (err) {
      if (run !== this.analysisRun) return;
      const key =
        err instanceof Error && err.message.startsWith('replay.')
          ? err.message
          : 'replay.error.parseFailed';
      this.formErrorKey.set(key);
    } finally {
      if (run === this.analysisRun) this.busy.set(false);
    }
  }

  async runCoach(): Promise<void> {
    if (this.coachBusy()) return;
    const run = ++this.coachRun;
    const brief = this.coachBrief();
    if (!brief || !this.gemini.isUnlocked()) {
      this.coachErrorKey.set('replay.gemini.error.locked');
      return;
    }
    this.coachBusy.set(true);
    this.coachErrorKey.set(null);
    this.coachText.set(null);
    try {
      const lang = this.i18n.lang();
      const text = await firstValueFrom(this.gemini.coach$(brief, lang));
      if (run === this.coachRun) this.coachText.set(text);
    } catch (err) {
      if (run !== this.coachRun) return;
      this.coachErrorKey.set(
        err instanceof Error && err.message.startsWith('replay.')
          ? err.message
          : 'replay.gemini.error.request',
      );
    } finally {
      if (run === this.coachRun) this.coachBusy.set(false);
    }
  }
}
