import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  CardRoleTag,
  FlowCanvasState,
  FlowCard,
  HypergeoResult,
  WizardAnalysis,
  YgoFlowDocument,
} from '../../../models/ygo-flow.model';
import { FormatStore } from '../../../core/stores/format.store';
import { I18nService } from '../../../services/i18n.service';
import { ToastService } from '../../../services/toast.service';
import { YdkeService } from '../../../services/ydke.service';
import { hypergeometricAtLeastOne, toPercent } from '../../../utils/hypergeo.utils';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { CardPreviewDirective } from '../../../shared/ui/card-preview/card-preview.directive';
import { PreviewCard } from '../../../shared/ui/card-preview/card-preview.component';
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { FlowBuilderComponent } from '../components/flow-builder.component';
import { FlowZoneKey, YgoFlowStore } from '../stores/ygo-flow.store';
import { YgoFlowIoService, isYgoFlowDocument } from '../services/ygo-flow-io.service';
import {
  FlowTemplateId,
  HandSample,
  flowRoots,
  flowTemplate,
  nextFlowNodes,
  sampleHands,
} from '../services/flow-study.utils';

type Section = 'library' | 'canvas' | 'training' | 'hands' | 'insights';
interface PracticeRecord {
  id: string;
  name: string;
  result: 'learned' | 'review';
  note: string;
  steps: string[];
  date: string;
}
interface Baseline {
  name: string;
  formatId: string;
  draws: number;
  profile: HypergeoResult;
  date: string;
}

@Component({
  selector: 'app-ygo-flow-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, TranslatePipe, CardPreviewDirective, FlowBuilderComponent],
  providers: [YgoFlowStore],
  templateUrl: './ygo-flow.page.html',
})
export class YgoFlowPage implements OnInit {
  readonly store = inject(YgoFlowStore);
  readonly format = inject(FormatStore);
  readonly decks = inject(DecklistStore);
  private readonly route = inject(ActivatedRoute);
  private readonly io = inject(YgoFlowIoService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly ydke = inject(YdkeService);

  readonly section = signal<Section>('library');
  readonly query = signal('');
  readonly onlyDeck = signal(false);
  readonly deleted = signal<YgoFlowDocument | null>(null);
  readonly exportingPng = signal(false);
  readonly importText = signal('');
  readonly compose = signal(false);
  readonly chosenHand = signal<number[]>([]);
  readonly selected = signal<{ uid: string; zone: FlowZoneKey } | null>(null);
  readonly batch = signal<HandSample | null>(null);
  readonly baseline = signal<Baseline | null>(this.readBaseline());
  readonly practiceGraph = signal<FlowCanvasState | null>(null);
  readonly practiceName = signal('');
  readonly practicePath = signal<string[]>([]);
  readonly practiceNote = signal('');
  readonly practiceSaved = signal(false);
  readonly challenge = signal(true);
  readonly reveal = signal(false);
  private historyWritable = true;
  readonly history = signal<PracticeRecord[]>(this.readHistory());

  readonly tabs: { id: Section; it: string; en: string; number: string }[] = [
    { id: 'library', it: 'I tuoi Flow', en: 'Your Flows', number: '01' },
    { id: 'canvas', it: 'Costruisci', en: 'Build', number: '02' },
    { id: 'training', it: 'Allenati', en: 'Practice', number: '03' },
    { id: 'hands', it: 'Prova una mano', en: 'Test a hand', number: '04' },
    { id: 'insights', it: 'Analizza', en: 'Analyze', number: '05' },
  ];
  readonly templates: {
    id: FlowTemplateId;
    title: string;
    en: string;
    copy: string;
    copyEn: string;
    icon: string;
  }[] = [
    {
      id: 'opening',
      title: 'La prima giocata',
      en: 'Your opening play',
      copy: 'Dallo starter al campo che cerchi.',
      copyEn: 'From your starter to your target board.',
      icon: '↗',
    },
    {
      id: 'recovery',
      title: 'Dopo l’interruzione',
      en: 'After the interruption',
      copy: 'Trova la risorsa per ripartire.',
      copyEn: 'Find the resource to recover.',
      icon: '↪',
    },
    {
      id: 'second',
      title: 'Andare secondo',
      en: 'Going second',
      copy: 'Esche, risposte e campo avversario.',
      copyEn: 'Baits, responses and opposing boards.',
      icon: '⇄',
    },
    {
      id: 'grind',
      title: 'Il turno successivo',
      en: 'The next turn',
      copy: 'Conserva risorse. Prepara il seguito.',
      copyEn: 'Conserve resources. Plan your follow-up.',
      icon: '↻',
    },
  ];
  readonly roles: { id: CardRoleTag; it: string; en: string }[] = [
    { id: 'starter', it: 'Starter', en: 'Starter' },
    { id: 'extender', it: 'Extender', en: 'Extender' },
    { id: 'handtrap', it: 'Hand trap', en: 'Hand trap' },
    { id: 'interaction', it: 'Interazione', en: 'Interaction' },
    { id: 'untagged', it: 'Da assegnare', en: 'Unassigned' },
  ];
  readonly cardName = (card: FlowCard): string => card.name;
  readonly zones: { id: FlowZoneKey; it: string; en: string }[] = [
    { id: 'monsters', it: 'Mostri', en: 'Monsters' },
    { id: 'spellTraps', it: 'Magie / Trappole', en: 'Spells / Traps' },
    { id: 'gy', it: 'Cimitero', en: 'Graveyard' },
    { id: 'banish', it: 'Bandite', en: 'Banished' },
    { id: 'extra', it: 'Extra Deck', en: 'Extra Deck' },
    { id: 'deck', it: 'Deck', en: 'Deck' },
  ];
  readonly documents = computed(() => {
    const q = this.query().trim().toLocaleLowerCase();
    return this.store.library
      .documents()
      .filter(
        (d) =>
          (!this.onlyDeck() || d.context?.deckId === this.store.context()?.deckId) &&
          (!q ||
            `${d.name} ${d.context?.deckName} ${d.canvas.nodes.map((n) => n.name).join(' ')}`
              .toLocaleLowerCase()
              .includes(q)),
      );
  });
  readonly uniqueMain = computed(() => {
    const unique = new Map<number, { card: FlowCard; count: number }>();
    for (const card of this.store.main()) {
      const entry = unique.get(card.passcode);
      if (entry) entry.count++;
      else unique.set(card.passcode, { card, count: 1 });
    }
    return [...unique.values()];
  });
  readonly unassigned = computed(
    () => this.store.main().filter((c) => c.role === 'untagged').length,
  );
  readonly importedDeck = computed(() => {
    const context = this.store.context();
    return context?.deckId && !this.decks.decklists().some(d => d.id === context.deckId)
      ? context : null;
  });
  readonly outdated = computed(() => {
    const c = this.store.context();
    const deck = this.decks.decklists().find((d) => d.id === c?.deckId);
    return !!deck && deck.updatedAt !== c?.deckUpdatedAt;
  });
  readonly formatId = computed(() => this.store.context()?.formatId || this.format.formatId());
  readonly formatName = computed(() => {
    const f = this.format.formats().find((f) => f.id === this.formatId());
    return f ? f.name[this.i18n.lang()] : this.formatId();
  });
  readonly roots = computed(() => (this.practiceGraph() ? flowRoots(this.practiceGraph()!) : []));
  readonly currentStep = computed(
    () => this.practiceGraph()?.nodes.find((n) => n.id === this.practicePath().at(-1)) ?? null,
  );
  readonly nextSteps = computed(() =>
    this.practiceGraph() && this.currentStep()
      ? nextFlowNodes(this.practiceGraph()!, this.currentStep()!.id)
      : [],
  );
  readonly pathSteps = computed(() =>
    this.practicePath().flatMap(
      (id) => this.practiceGraph()?.nodes.filter((n) => n.id === id) ?? [],
    ),
  );
  readonly baselineCompatible = computed(
    () =>
      this.baseline()?.draws === this.store.handSize() &&
      this.baseline()?.formatId === this.formatId(),
  );

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const section = params.get('section');
    if (this.tabs.some((t) => t.id === section)) this.section.set(section as Section);
    const deckId = params.get('deckId');
    if (deckId && deckId !== this.store.context()?.deckId) this.changeDeck(deckId);
    else if (this.store.ydkeInput()) this.store.loadYdke();
    else if (!this.store.canvas().nodes.length && this.decks.activeDecklist()?.cards.length)
      this.changeDeck(this.decks.activeDecklist()!.id);
  }
  t(it: string, en: string): string {
    return this.i18n.lang() === 'it' ? it : en;
  }
  percent(p: number): string {
    return toPercent(p, 1);
  }
  delta(current: number, previous: number): string {
    const d = (current - previous) * 100;
    return `${d > 0 ? '+' : ''}${d.toFixed(1)} pp`;
  }
  roleName(role: CardRoleTag): string {
    const r = this.roles.find((r) => r.id === role)!;
    return this.t(r.it, r.en);
  }
  previewCard(card: FlowCard): PreviewCard {
    return (
      this.store.resolvedDeck()?.byId.get(card.passcode) ?? {
        id: card.passcode,
        name: card.name,
        type: card.type,
        desc: card.desc,
        imageUrlSmall: card.imageSmall,
      }
    );
  }
  access(copies: number): string {
    return this.percent(
      hypergeometricAtLeastOne(this.store.main().length, copies, this.store.handSize()),
    );
  }
  changeDeck(id: string): void {
    const deck = this.decks.decklists().find((d) => d.id === id);
    if (!deck) return;
    this.store.newDocument(`Flow · ${deck.name}`);
    this.store.context.set({
      deckId: id,
      deckName: deck.name,
      deckUpdatedAt: deck.updatedAt,
      formatId: this.format.formatId(),
      banlistDate: this.format.selectedFormat()?.banlistEffectiveDate ?? null,
    });
    this.store.loadFromDecklist(id);
    this.resetHandControls();
  }
  changeFormat(id: string): void {
    const f = this.format.formats().find((f) => f.id === id);
    if (!f) return;
    this.store.newDocument(this.store.flowName(), this.store.canvas());
    this.format.setFormatId(id);
    this.store.context.update((c) => ({
      deckId: c?.deckId ?? null,
      deckName: c?.deckName ?? '',
      deckUpdatedAt: c?.deckUpdatedAt ?? '',
      formatId: id,
      banlistDate: f.banlistEffectiveDate,
    }));
    this.batch.set(null);
  }
  newFlow(template?: FlowTemplateId): void {
    const data = this.templates.find((t) => t.id === template);
    this.store.newDocument(
      data ? this.t(data.title, data.en) : this.t('Il mio Flow', 'My Flow'),
      template ? flowTemplate(template, this.i18n.lang() === 'en') : undefined,
    );
    this.store.persistNow();
    this.section.set('canvas');
  }
  open(doc: YgoFlowDocument): void {
    this.store.loadDocument(doc);
    this.resetHandControls();
    this.section.set('canvas');
  }
  duplicate(doc?: YgoFlowDocument): void {
    if (doc) this.open(doc);
    this.store.duplicateDocument();
    this.section.set('canvas');
  }
  remove(doc: YgoFlowDocument): void {
    if (!doc.id) return;
    if (doc.id === this.store.documentId()) this.store.newDocument();
    this.store.library.remove(doc.id);
    this.deleted.set(doc);
  }
  undoDelete(): void {
    const d = this.deleted();
    if (d) this.store.library.save(d);
    this.deleted.set(null);
  }
  startPractice(doc?: YgoFlowDocument): void {
    if (doc) this.open(doc);
    if (!this.store.canvas().nodes.length) return;
    this.store.persistNow();
    const graph = structuredClone(this.store.canvas());
    this.practiceGraph.set(graph);
    this.practiceName.set(this.store.flowName());
    this.practicePath.set(
      flowRoots(graph)
        .slice(0, 1)
        .map((n) => n.id),
    );
    this.practiceNote.set('');
    this.practiceSaved.set(false);
    this.reveal.set(!this.challenge());
    this.section.set('training');
  }
  chooseRoot(id: string): void {
    if (!this.roots().some((n) => n.id === id)) return;
    this.practicePath.set([id]);
    this.practiceSaved.set(false);
    this.reveal.set(!this.challenge());
  }
  advance(id: string): void {
    if (!this.nextSteps().some((n) => n.node.id === id)) return;
    this.practicePath.update((p) => [...p, id]);
    this.practiceSaved.set(false);
    this.reveal.set(!this.challenge());
  }
  back(): void {
    this.practicePath.update((p) => p.slice(0, -1));
    this.practiceSaved.set(false);
    this.reveal.set(!this.challenge());
  }
  savePractice(result: 'learned' | 'review'): void {
    if (!this.currentStep() || this.nextSteps().length || this.practiceSaved()) return;
    const record: PracticeRecord = {
      id: crypto.randomUUID(),
      name: this.practiceName(),
      result,
      note: this.practiceNote().slice(0, 2000),
      steps: this.pathSteps().map((n) => n.name),
      date: new Date().toISOString(),
    };
    this.history.update((h) => [record, ...h].slice(0, 100));
    this.practiceSaved.set(true);
    try {
      if (!this.historyWritable) throw new Error();
      localStorage.setItem('ygo-flow-practice-v1', JSON.stringify(this.history()));
    } catch {
      this.toast.error(
        this.t(
          'Sessione disponibile solo finché questa pagina resta aperta. Esporta il diario per conservarla.',
          'Session available only while this page stays open. Export your journal to keep it.',
        ),
      );
    }
  }
  setSeed(value: string): void {
    this.store.seed.set(value);
    this.batch.set(null);
  }
  draw(replay = false): void {
    this.batch.set(null);
    if (replay) this.store.drawHand();
    else this.store.redrawHand();
    this.selected.set(null);
    this.compose.set(false);
  }
  changeHandSize(value: string): void {
    this.store.handSize.set(value === '6' ? 6 : 5);
    this.store.resetSolitaire();
    this.resetHandControls();
  }
  chooseCard(id: number): void {
    const copies = this.uniqueMain().find((c) => c.card.passcode === id)?.count ?? 0;
    if (
      this.chosenHand().length < this.store.handSize() &&
      this.chosenHand().filter((c) => c === id).length < copies
    )
      this.chosenHand.update((h) => [...h, id]);
  }
  chosenCount(id: number): number {
    return this.chosenHand().filter((c) => c === id).length;
  }
  removeChosen(id: number): void {
    const index = this.chosenHand().indexOf(id);
    if (index >= 0) this.chosenHand.update((h) => h.filter((_, i) => i !== index));
  }
  useHand(): void {
    if (this.store.composeHand(this.chosenHand())) {
      this.compose.set(false);
      this.selected.set(null);
    }
  }
  selectCard(card: FlowCard, zone: FlowZoneKey): void {
    this.selected.set(this.selected()?.uid === card.uid ? null : { uid: card.uid, zone });
  }
  moveTo(zone: FlowZoneKey): void {
    const s = this.selected();
    if (s) this.store.moveCard(s.uid, s.zone, zone);
    this.selected.set(null);
  }
  setRole(id: number, role: string): void {
    if (this.roles.some((r) => r.id === role)) {
      this.store.setRole(id, role as CardRoleTag);
      this.batch.set(null);
    }
  }
  createFromAnalysis(analysis: WizardAnalysis): void {
    this.store.newDocument(
      this.t('Studio · ', 'Study · ') + (analysis.starters[0]?.name ?? this.store.flowName()),
    );
    this.store.pushHandComboToCanvas(analysis);
    this.store.persistNow();
    this.section.set('canvas');
  }
  runBatch(): void {
    this.batch.set(sampleHands(this.store.main(), this.store.handSize(), this.store.seed()));
  }
  replayExample(seed: string): void {
    this.store.seed.set(seed);
    this.draw(true);
    this.section.set('hands');
  }
  saveBaseline(): void {
    const profile = this.store.hypergeo();
    if (!profile) return;
    const value = {
      name: this.store.selectedDeckName() || this.store.flowName(),
      formatId: this.formatId(),
      draws: this.store.handSize(),
      profile,
      date: new Date().toISOString(),
    };
    this.baseline.set(value);
    try {
      localStorage.setItem('ygo-flow-baseline-v1', JSON.stringify(value));
      this.toast.success(
        this.t(
          'Riferimento salvato. Cambia mazzo o ruoli per confrontare.',
          'Baseline saved. Change decks or roles to compare.',
        ),
      );
    } catch {
      this.toast.error(
        this.t(
          'Riferimento disponibile solo in questa sessione.',
          'Baseline available only in this session.',
        ),
      );
    }
  }
  exportJson(): void {
    this.io.downloadJson(
      this.store.exportDocument(),
      `${
        this.store
          .flowName()
          .replace(/[^a-zA-Z0-9_-]+/g, '-')
          .slice(0, 70) || 'flow'
      }.ygoflow`,
    );
  }
  exportArchive(): void {
    this.store.persistNow();
    this.download(
      JSON.stringify(this.store.library.documents(), null, 2),
      'flow-studio-archive.json',
    );
  }
  exportJournal(): void {
    this.download(JSON.stringify(this.history(), null, 2), 'flow-studio-journal.json');
  }
  exportBase64(): void {
    this.io.downloadBase64(this.store.exportDocument());
  }
  exportYdk(): void {
    try {
      const s = this.ydke.parseUrl(this.store.exportDocument().ydke);
      this.download(
        [
          '#created by YGOCardChecker',
          '#main',
          ...s.main,
          '#extra',
          ...s.extra,
          '!side',
          ...s.side,
        ].join('\n'),
        'flow-snapshot.ydk',
      );
    } catch {
      this.toast.error(
        this.t('Carica un mazzo prima di esportare.', 'Load a deck before exporting.'),
      );
    }
  }
  async exportPng(): Promise<void> {
    this.exportingPng.set(true);
    try {
      const result = await this.io.exportPng(this.store.canvas());
      if (!result.ok) this.toast.error(this.i18n.t(result.errorKey));
    } catch {
      this.toast.error(this.i18n.t('flow.io.error.exportFailed'));
    } finally {
      this.exportingPng.set(false);
    }
  }
  async onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      this.toast.error(this.t('Il limite è 15 MB.', 'The limit is 15 MB.'));
      return;
    }
    try {
      this.importDocument(await file.text());
    } catch {
      this.toast.error(this.t('Impossibile leggere il file.', 'Unable to read the file.'));
    }
  }
  importDocument(raw: string, base64 = false): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* Single document parser reports the error. */
    }
    if (!base64 && Array.isArray(parsed)) {
      if (!parsed.length || !parsed.every(isYgoFlowDocument)) {
        this.toast.error(this.i18n.t('flow.io.error.invalidFormat'));
        return;
      }
      for (const doc of parsed) this.store.library.save({ ...doc, id: crypto.randomUUID() });
      this.section.set('library');
    } else {
      const result = base64 ? this.io.parseBase64(raw) : this.io.parseJson(raw);
      if (!result.ok) {
        this.toast.error(this.i18n.t(result.errorKey));
        return;
      }
      this.open({ ...result.value, id: crypto.randomUUID() });
      this.store.persistNow();
    }
    this.importText.set('');
    this.toast.success(this.i18n.t('flow.io.imported'));
  }
  private resetHandControls(): void {
    this.batch.set(null);
    this.compose.set(false);
    this.chosenHand.set([]);
    this.selected.set(null);
  }
  private download(text: string, filename: string): void {
    const url = URL.createObjectURL(
      new Blob([text], { type: filename.endsWith('.ydk') ? 'text/plain' : 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  private readHistory(): PracticeRecord[] {
    try {
      const raw = localStorage.getItem('ygo-flow-practice-v1');
      if (!raw) return [];
      const value: unknown = JSON.parse(raw);
      if (
        !Array.isArray(value) ||
        !value.every(
          (v) =>
            v &&
            typeof v.id === 'string' &&
            typeof v.name === 'string' &&
            typeof v.note === 'string' &&
            ['learned', 'review'].includes(v.result) &&
            Array.isArray(v.steps) &&
            v.steps.every((s: unknown) => typeof s === 'string') &&
            Number.isFinite(Date.parse(v.date)),
        )
      )
        throw new Error();
      return value.slice(0, 100);
    } catch {
      this.historyWritable = false;
      return [];
    }
  }
  private readBaseline(): Baseline | null {
    try {
      const v = JSON.parse(localStorage.getItem('ygo-flow-baseline-v1') || 'null');
      return v &&
        typeof v.name === 'string' &&
        typeof v.formatId === 'string' &&
        [5, 6].includes(v.draws) &&
        Number.isFinite(Date.parse(v.date)) &&
        v.profile &&
        ['pAtLeastOneStarter', 'pStarterPlusExtenderOrTrap', 'pBrick'].every(
          (k) => Number.isFinite(v.profile[k]) && v.profile[k] >= 0 && v.profile[k] <= 1,
        )
        ? v
        : null;
    } catch {
      return null;
    }
  }
}
