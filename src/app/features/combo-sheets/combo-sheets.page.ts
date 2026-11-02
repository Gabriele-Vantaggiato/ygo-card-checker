import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { catchError, firstValueFrom, forkJoin, of, switchMap, timeout } from 'rxjs';
import { I18nService } from '../../services/i18n.service';
import { YgoApiService } from '../../services/ygo-api.service';
import { PasscodeCatalogService } from '../../services/passcode-catalog.service';
import { ComboDiagramCard, ComboSheet, ComboSheetGuide, isComboSheet, newComboGuide, newComboSheet } from './combo-sheet.model';
import { ComboSheetLibraryService, MAX_SHEET_BYTES } from './combo-sheet-library.service';
import { ComboDiagramComponent } from './combo-diagram.component';
import { ComboCardPickerComponent } from './combo-card-picker.component';
import { DecklistStore } from '../decklist/stores/decklist.store';
import { EffectScriptService } from '../../services/effect-script.service';
import { ReplayLineMemoryService } from '../../services/replay-line-memory.service';
import { FormatStore } from '../../core/stores/format.store';
import { generateComboSheet } from './combo-sheet-generation';
import { isComboDeckRecipe } from './combo-deck-recipe';
import { YdkeService } from '../../services/ydke.service';
import { sheetFromImport, toMdpro4Draft } from './combo-sheet-io';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, ComboDiagramComponent, ComboCardPickerComponent],
  templateUrl: './combo-sheets.page.html',
})
export class ComboSheetsPage {
  readonly library = inject(ComboSheetLibraryService);
  readonly decks = inject(DecklistStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly effects = inject(EffectScriptService);
  private readonly replayMemory = inject(ReplayLineMemoryService);
  private readonly format = inject(FormatStore);
  private readonly http = inject(HttpClient);
  readonly selectedDeckId = signal(this.route.snapshot.queryParamMap.get('deckId') || this.decks.activeDecklist()?.id || '');
  readonly sourceCard = signal(Number(this.route.snapshot.queryParamMap.get('cardId')) || null);
  readonly generating = signal(false);
  readonly importingDeck = signal(false);
  readonly ydkeText = signal('');
  readonly importedDeckName = signal('Mazzo Zombie · YDKE');
  private readonly ydke = inject(YdkeService);
  private destroyed = false;
  private generationRequest = 0;
  private readonly api = inject(YgoApiService);
  private readonly i18n = inject(I18nService);
  private readonly catalog = toSignal(inject(PasscodeCatalogService).ensureLoaded$());
  readonly draft = signal<ComboSheet | null>(null);
  readonly tabIndex = signal(0);
  readonly guideIndex = signal(0);
  readonly editing = signal(false);
  readonly dirty = signal(false);
  readonly status = signal('');
  readonly query = signal('');
  readonly loadingExample = signal(false);
  readonly pendingDelete = signal<string | null>(null);
  readonly sheets = computed(() => this.library.sheets().filter(s => {
    const id = this.sourceCard();
    return `${s.title} ${s.tags.join(' ')} ${s.tabs.flatMap(tab => [tab.title, ...tab.combos.map(g => `${g.title} ${g.startingCards.map(cardId => this.catalog()?.get(cardId)?.n || '').join(' ')}`)]).join(' ')}`.toLowerCase().includes(this.query().toLowerCase()) &&
      (!id || s.tabs.some(tab => tab.combos.some(g => [...g.startingCards, ...g.endCards, ...g.requiredCards, ...g.playsAround, ...(g.startFlow || []).map(f => f.card), ...(g.endFlow || []).map(f => f.card), ...g.steps.flatMap(step => [...step.cards, ...(step.flow || []).map(f => f.card)])].includes(id))));
  }));
  readonly tab = computed(() => this.draft()?.tabs[this.tabIndex()]);
  readonly guide = computed(() => this.tab()?.combos[this.guideIndex()]);
  readonly guideCardIds = computed(() => {
    const g = this.guide();
    return g ? [...new Set([...g.startingCards, ...g.endCards, ...g.requiredCards, ...g.playsAround, ...g.steps.flatMap(s => [...s.cards, ...(s.flow || []).map(f => f.card)]), ...(g.startFlow || []).map(f => f.card), ...(g.endFlow || []).map(f => f.card)])].filter(Boolean) : [];
  });
  readonly cards = toSignal(toObservable(computed(() => ({ ids: this.guideCardIds(), lang: this.i18n.lang() }))).pipe(
    switchMap(({ ids, lang }) => ids.length ? this.api.getCardsByIds$(ids, lang) : of([])),
  ), { initialValue: [] });
  readonly names = computed(() => ({
    ...Object.fromEntries(this.guideCardIds().map(id => [id, this.catalog()?.get(id)?.n || `#${id}`])),
    ...Object.fromEntries(this.cards().map(c => [c.id, c.name])),
  }));

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.generationRequest++; this.destroyed = true; });
  }

  async importAndGenerate(): Promise<void> {
    if (this.importingDeck() || this.generating()) return;
    const format = this.format.selectedFormat();
    if (!format) { this.status.set(this.t('Attendi il caricamento del formato.', 'Wait for the format to load.')); return; }
    try {
      const sections = this.ydke.parseUrl(this.ydkeText());
      if (!sections.main.length || sections.main.length > 60 || sections.extra.length > 15 || sections.side.length > 15) throw new Error();
    } catch { this.status.set(this.t('Codice YDKE non valido: controlla Main, Extra e Side.', 'Invalid YDKE: check Main, Extra and Side.')); return; }
    this.importingDeck.set(true); this.status.set('');
    const request = ++this.generationRequest;
    const id = this.decks.createDecklist(this.importedDeckName().trim().slice(0, 120) || this.t('Mazzo importato', 'Imported deck'));
    try {
      const result = await firstValueFrom(this.decks.importFromYdke$(this.ydkeText(), id, true, format, { preserveSource: true }).pipe(timeout(60000)));
      if (!result.ok) { this.decks.deleteDecklist(id); this.status.set(this.t('Non riesco a risolvere tutte le carte. Il mazzo originale non è stato importato parzialmente.', 'Unable to resolve all cards. The source deck was not partially imported.')); return; }
      if (this.destroyed || request !== this.generationRequest) return;
      this.selectedDeckId.set(id);
      await this.router.navigate([], { relativeTo: this.route, queryParams: { deckId: id }, queryParamsHandling: 'merge', replaceUrl: true });
      const generated = await this.generateFromDeck();
      if (!this.destroyed && generated && this.draft()?.id === generated.id) this.save();
    } catch {
      this.decks.deleteDecklist(id);
      if (!this.destroyed) this.status.set(this.t('Importazione non riuscita. Controlla la connessione e riprova.', 'Import failed. Check the connection and try again.'));
    } finally { this.importingDeck.set(false); }
  }

  async generateFromDeck(): Promise<ComboSheet | null> {
    const deck = this.decks.decklists().find(d => d.id === this.selectedDeckId());
    if (!deck || this.generating()) return null;
    const snapshot = structuredClone(deck);
    const format = this.format.selectedFormat();
    const formatName = format?.name[this.i18n.lang()] || this.format.formatId();
    const italian = this.i18n.lang() === 'it';
    const request = ++this.generationRequest;
    this.generating.set(true); this.status.set('');
    try {
      const [scripts, template, recipeData] = await firstValueFrom(forkJoin([
        this.effects.ensureStudyLoaded$(),
        this.http.get<unknown>('/assets/data/combo-sheets/starter-example.json').pipe(catchError(() => of(null))),
        this.http.get<unknown>('/assets/data/combo-sheets/deck-recipes.json').pipe(catchError(() => of([]))),
      ]).pipe(timeout(15000)));
      if (request !== this.generationRequest) return null;
      const recipes = Array.isArray(recipeData) ? recipeData.filter(isComboDeckRecipe) : [];
      const result = generateComboSheet(snapshot, scripts, this.replayMemory.observations(), isComboSheet(template) ? template : null, formatName, italian, recipes);
      if (!result.sheet) {
        this.status.set(this.t('Non ho dati sufficienti per questo mazzo. Nessuna combo è stata inventata: puoi creare una scheda manuale o importare replay per aggiungere sequenze osservate.', 'Insufficient data for this deck. No combo was invented: create a manual sheet or import replays to add observed sequences.')); return null;
      }
      this.sourceCard.set(null); this.open(result.sheet); this.dirty.set(true);
      this.status.set(this.t(`Scheda generata: ${result.templates} linee da modello, ${result.observed} sequenze osservate, ${result.drafts} starter da sviluppare. Effetti disponibili per ${result.coveredCards}/${result.mainCards} carte diverse del Main Deck. Rivedila e salvala.`, `Generated sheet: ${result.templates} template routes, ${result.observed} observed sequences, ${result.drafts} starters to develop. Effects available for ${result.coveredCards}/${result.mainCards} distinct Main Deck cards. Review and save it.`));
      return result.sheet;
    } catch {
      if (request === this.generationRequest) this.status.set(this.t('Non riesco a caricare i dati per la generazione. Riprova.', 'Unable to load generation data. Try again.'));
      return null;
    } finally { this.generating.set(false); }
  }

  t(it: string, en: string): string { return this.i18n.lang() === 'it' ? it : en; }
  diagram(ids: number[]): ComboDiagramCard[] { return ids.map(card => ({ card, join: 'none', action: 'none', zone: 'none', caption: '' })); }
  notes(guide: ComboSheetGuide): [string, string][] { return Object.entries(guide.cardNotes || {}); }
  appendCard(key: 'startingCards' | 'endCards' | 'requiredCards' | 'playsAround', card: number): void {
    this.updateGuide(g => {
      if (g[key].length >= 200) return;
      g[key].push(card);
      const diagram = key === 'startingCards' ? g.startFlow : key === 'endCards' ? g.endFlow : undefined;
      if (diagram && diagram.length < 200) diagram.push({ card, join: 'plus', action: 'none', zone: 'none', caption: '' });
    });
  }
  appendStepCard(index: number, card: number): void {
    this.updateGuide(g => {
      const step = g.steps[index]; if (step.cards.length >= 200) return;
      step.cards.push(card);
      if (step.flow && step.flow.length < 200) step.flow.push({ card, join: 'arrow', action: 'none', zone: 'none', caption: '' });
    });
  }
  addDiagramCard(index: number): void {
    this.updateGuide(g => { const step = g.steps[index]; step.flow ??= this.diagram(step.cards); if (step.flow.length < 200) step.flow.push({ card: 0, join: 'arrow', action: 'none', zone: 'none', caption: '' }); });
  }
  setOccurrence(index: number, occurrence: number, key: keyof ComboDiagramCard, value: string | number): void {
    this.updateGuide(g => { const item = g.steps[index].flow?.[occurrence]; if (!item) return; if (key === 'card') item.card = Number(value); else item[key] = String(value); });
  }
  removeOccurrence(index: number, occurrence: number): void { this.updateGuide(g => g.steps[index].flow?.splice(occurrence, 1)); }
  count(sheet: ComboSheet): number { return sheet.tabs.reduce((n, t) => n + t.combos.length, 0); }

  open(sheet: ComboSheet): void {
    this.generationRequest++;
    this.draft.set(structuredClone(sheet)); this.tabIndex.set(0); this.guideIndex.set(0);
    this.editing.set(false); this.dirty.set(false); this.status.set('');
  }
  create(): void {
    const sheet = newComboSheet();
    const id = this.sourceCard();
    if (id) { sheet.tabs[0].combos[0].startingCards = [id]; sheet.title = (this.catalog()?.get(id)?.n || `#${id}`).slice(0, 200); }
    this.open(sheet); this.editing.set(true); this.dirty.set(true);
  }
  back(): void {
    if (this.dirty() && !this.save()) return;
    this.draft.set(null);
  }
  selectTab(index: number): void { this.tabIndex.set(index); this.guideIndex.set(0); }
  update(change: (sheet: ComboSheet) => void): void {
    const draft = this.draft(); if (!draft) return;
    const next = structuredClone(draft); change(next); this.draft.set(next); this.dirty.set(true); this.status.set('');
  }
  updateGuide(change: (guide: ComboSheetGuide) => void): void {
    this.update(s => { const g = s.tabs[this.tabIndex()]?.combos[this.guideIndex()]; if (g) change(g); });
  }
  setTitle(value: string): void { this.update(s => s.title = value); }
  setDescription(value: string): void { this.update(s => s.description = value); }
  setAuthor(value: string): void { this.update(s => s.author = value); }
  setTags(value: string): void { this.update(s => s.tags = value.split(',').map(t => t.trim()).filter(Boolean)); }
  setTabTitle(value: string): void { this.update(s => s.tabs[this.tabIndex()].title = value); }
  setGuideTitle(value: string): void { this.updateGuide(g => g.title = value); }
  setGuideDescription(value: string): void { this.updateGuide(g => g.description = value); }
  setCardList(key: 'startingCards' | 'endCards' | 'requiredCards' | 'playsAround', raw: string): void {
    const ids = raw.trim() ? raw.trim().split(/[\s,;]+/).map(Number) : [];
    if (ids.some(id => !Number.isSafeInteger(id) || id < 0 || id > 999999999) || ids.length > 200) {
      this.status.set(this.t('Inserisci passcode numerici separati da virgole.', 'Enter numeric passcodes separated by commas.')); return;
    }
    this.updateGuide(g => { g[key] = ids; if (key === 'startingCards') delete g.startFlow; if (key === 'endCards') delete g.endFlow; });
  }
  addTab(): void { this.update(s => s.tabs.push({ id: crypto.randomUUID(), title: this.t('Nuovo starter', 'New starter'), combos: [newComboGuide()] })); this.selectTab(this.draft()!.tabs.length - 1); }
  addGuide(): void { this.update(s => s.tabs[this.tabIndex()].combos.push(newComboGuide())); this.guideIndex.set(this.tab()!.combos.length - 1); }
  removeGuide(): void { this.update(s => s.tabs[this.tabIndex()].combos.splice(this.guideIndex(), 1)); this.guideIndex.set(0); }
  addStep(): void { this.updateGuide(g => g.steps.push({ title: this.t('Nuovo passaggio', 'New step'), text: '', kind: 'action', cards: [] })); }
  setStep(index: number, key: 'title' | 'text' | 'kind', value: string): void { this.updateGuide(g => g.steps[index][key] = value); }
  setStepCards(index: number, raw: string): void {
    const ids = raw.trim() ? raw.trim().split(/[\s,;]+/).map(Number) : [];
    if (ids.length > 200 || ids.some(id => !Number.isSafeInteger(id) || id < 0 || id > 999999999)) { this.status.set(this.t('Passcode non validi.', 'Invalid passcodes.')); return; }
    this.updateGuide(g => { g.steps[index].cards = ids; delete g.steps[index].flow; });
  }
  removeStep(index: number): void { this.updateGuide(g => g.steps.splice(index, 1)); }
  moveStep(index: number, direction: number): void {
    this.updateGuide(g => { const target = index + direction; if (target >= 0 && target < g.steps.length) [g.steps[index], g.steps[target]] = [g.steps[target], g.steps[index]]; });
  }
  save(): boolean {
    const sheet = this.draft(); if (!sheet) return false;
    if (!isComboSheet(sheet) || new Blob([JSON.stringify(sheet)]).size > MAX_SHEET_BYTES) {
      this.status.set(this.t('Controlla titolo e contenuti. Limite scheda: 2 MB.', 'Check the title and contents. Sheet limit: 2 MB.')); return false;
    }
    const saved = this.library.save(sheet);
    this.dirty.set(!saved);
    this.status.set(saved ? this.t('Scheda salvata su questo dispositivo.', 'Sheet saved on this device.') : this.t('Salvataggio non disponibile. Esporta il JSON per conservare la scheda.', 'Saving unavailable. Export JSON to keep your sheet.'));
    return saved;
  }
  duplicate(): void {
    const copy = structuredClone(this.draft()!); copy.id = crypto.randomUUID(); copy.title += this.t(' · copia', ' · copy'); this.open(copy); this.dirty.set(true); this.editing.set(true);
  }
  deleteSheet(id: string): void { this.library.remove(id); this.pendingDelete.set(null); }
  exportSheet(mdpro4 = false): void {
    const sheet = this.draft(); if (!sheet) return;
    const payload = mdpro4 ? toMdpro4Draft(sheet) : sheet;
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = mdpro4 ? `${payload.id}.json` : `${sheet.title.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 80) || 'combo'}.json`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (mdpro4) this.status.set(this.t('File MDPro4 scaricato. Copialo in %USERPROFILE%\\AppData\\LocalLow\\YGO\\MDPro4\\ComboSheets\\drafts e riapri My combo sheets. La pubblicazione online resta separata.', 'MDPro4 file downloaded. Copy it to %USERPROFILE%\\AppData\\LocalLow\\YGO\\MDPro4\\ComboSheets\\drafts and reopen My combo sheets. Online publication is separate.'));
  }
  async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
    try {
      if (file.size > MAX_SHEET_BYTES) throw new Error();
      const data = sheetFromImport(JSON.parse(await file.text())); if (!data) throw new Error();
      // Import as a new local copy; never overwrite an existing sheet by foreign ID.
      data.id = crypto.randomUUID(); this.open(data); this.dirty.set(true); this.save();
    } catch { this.status.set(this.t('File non valido: scegli una scheda combo JSON (massimo 2 MB).', 'Invalid file: choose a combo sheet JSON (maximum 2 MB).')); }
    finally { input.value = ''; }
  }
  async example(): Promise<void> {
    this.loadingExample.set(true);
    try {
      const response = await fetch('/assets/data/combo-sheets/starter-example.json'); if (!response.ok) throw new Error();
      const sheet: unknown = await response.json(); if (!isComboSheet(sheet)) throw new Error();
      sheet.id = crypto.randomUUID(); this.open(sheet); this.dirty.set(true); this.save();
    } catch { this.status.set(this.t('Esempio non disponibile. Riprova.', 'Example unavailable. Try again.')); }
    finally { this.loadingExample.set(false); }
  }
}
