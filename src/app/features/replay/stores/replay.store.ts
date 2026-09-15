import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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
  private readonly catalog = inject(PasscodeCatalogService);
  private readonly restrictions = inject(ReplayRestrictionCatalogService);
  private readonly gemini = inject(GeminiCoachService);
  private readonly i18n = inject(I18nService);

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
    this.coachErrorKey.set(null);
  }

  setFile(slotId: ReplaySlot['id'], file: File | null): void {
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
    this.analyses.set([]);
    this.deckAdvice.set(null);
    this.coachBrief.set(null);
    this.coachText.set(null);
    this.formErrorKey.set(null);
    this.coachErrorKey.set(null);
  }

  reset(): void {
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
        parsed.push(await this.parser.parseFile(file));
      }

      const dupes = findDuplicateHashes(parsed.map((p) => p.sha256));
      if (dupes.length > 0) {
        this.formErrorKey.set('replay.error.duplicateFiles');
        return;
      }

      const restrictionCatalog = this.restrictions.catalog();
      const analyses = parsed.map((p) => {
        const base = analyzeReplay(p);
        const restrictionTrace = buildRestrictionTrace(p, restrictionCatalog, this.resolveName);
        return { ...base, restrictionTrace };
      });
      this.analyses.set(analyses);
      this.deckAdvice.set(wantAdvice ? buildDeckAdvice(analyses) : null);

      const primary = analyses[0];
      if (primary?.restrictionTrace) {
        this.coachBrief.set(
          buildReplayCoachBrief(primary, primary.restrictionTrace, this.resolveName),
        );
      }

      if (this.geminiEnabled() && this.gemini.isUnlocked() && this.coachBrief()) {
        await this.runCoach();
      }
    } catch (err) {
      const key =
        err instanceof Error && err.message.startsWith('replay.')
          ? err.message
          : 'replay.error.parseFailed';
      this.formErrorKey.set(key);
    } finally {
      this.busy.set(false);
    }
  }

  async runCoach(): Promise<void> {
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
      this.coachText.set(text);
    } catch (err) {
      this.coachErrorKey.set(
        err instanceof Error && err.message.startsWith('replay.')
          ? err.message
          : 'replay.gemini.error.request',
      );
    } finally {
      this.coachBusy.set(false);
    }
  }
}
