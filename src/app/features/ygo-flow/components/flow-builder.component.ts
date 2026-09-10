import { CardPreviewDirective } from '../../../shared/ui/card-preview/card-preview.directive';
import { PreviewCard } from '../../../shared/ui/card-preview/card-preview.component';
import { YgoCard } from '../../../models/ygo-card.model';
import { YgoApiService } from '../../../services/ygo-api.service';
import { I18nService } from '../../../services/i18n.service';
import { RouterLink } from '@angular/router';
import { catchError, of, timer, switchMap } from 'rxjs';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  signal,
  effect,
  output,
  input,
} from '@angular/core';
import { FlowCard, FlowNode, FlowNodeKind } from '../../../models/ygo-flow.model';
import { YgoFlowStore } from '../stores/ygo-flow.store';
import { flowBounds, visibleFlow } from '../services/flow-graph.utils';

@Component({
  selector: 'app-flow-builder',
  standalone: true,
  imports: [CardPreviewDirective, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flow-builder.component.html',
})
export class FlowBuilderComponent {
  readonly store = inject(YgoFlowStore);
  private readonly api = inject(YgoApiService);
  private readonly i18n = inject(I18nService);
  readonly importFlow = output<void>();
  readonly exportFlow = output<void>();
  readonly exportImage = output<void>();
  readonly exportingImage = input(false);
  readonly catalogQuery = signal('');
  readonly catalogCards = signal<YgoCard[]>([]);
  readonly catalogLoading = signal(false);
  readonly selectedCard = signal<PreviewCard | null>(null);
  readonly detailLoading = signal(false);
  readonly cardTarget = signal<'next' | 'replace'>('next');
  constructor() {
    effect((onCleanup) => {
      const query = this.catalogQuery().trim(),
        lang = this.i18n.lang();
      this.catalogCards.set([]);
      this.catalogLoading.set(query.length >= 2);
      if (query.length < 2) return;
      const request = timer(300)
        .pipe(
          switchMap(() => this.api.searchCards$(query, lang, 20)),
          catchError(() => of([])),
        )
        .subscribe((cards) => {
          this.catalogCards.set(cards);
          this.catalogLoading.set(false);
        });
      onCleanup(() => request.unsubscribe());
    });
    effect((onCleanup) => {
      const node = this.node(),
        lang = this.i18n.lang();
      this.selectedCard.set(node?.cardId ? this.previewNode(node) : null);
      this.detailLoading.set(false);
      if (!node?.cardId || node.card?.desc) return;
      this.detailLoading.set(true);
      const request = this.api
        .getCardById$(node.cardId, lang)
        .pipe(catchError(() => of(null)))
        .subscribe((card) => {
          if (card) this.selectedCard.set(card);
          this.detailLoading.set(false);
        });
      onCleanup(() => request.unsubscribe());
    });
  }
  previewNode(node: FlowNode): PreviewCard {
    return node.card ?? { id: node.cardId!, name: node.name, imageUrlSmall: node.imageSmall };
  }
  previewDeck(card: FlowCard): PreviewCard {
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
  cardImage(card: PreviewCard): string {
    return card.card_images?.[0]?.image_url ?? card.imageUrlSmall ?? '';
  }
  selectNode(id: string): void {
    this.selected.set(id);
    if (matchMedia('(max-width:900px)').matches)
      requestAnimationFrame(() =>
        document
          .getElementById('flow-card-inspector')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
  }
  addCatalogCard(card: YgoCard): void {
    const current = this.node();
    if (this.cardTarget() === 'replace' && current) {
      this.store.attachCard(current.id, card);
      return;
    }
    const history = this.store.undoStack(),
      original = this.store.canvas();
    this.add('action', current, {
      uid: 'catalog-' + card.id,
      passcode: card.id,
      name: card.name,
      type: card.type,
      desc: card.desc,
      image: card.card_images[0]?.image_url ?? '',
      imageSmall: card.card_images[0]?.image_url_small ?? '',
      role: 'untagged',
    });
    this.store.attachCard(this.selected()!, card);
    this.store.undoStack.set([...history.slice(-49), original]);
  }
  hideImage(event: Event): void {
    (event.target as HTMLImageElement).hidden = true;
  }

  @ViewChild('viewport') viewport?: ElementRef<HTMLElement>;
  readonly selected = signal<string | null>(null);
  readonly search = signal('');
  readonly message = signal('');
  readonly expanded = signal(false);
  readonly trail = signal<string[]>([]);
  readonly kinds: { id: FlowNodeKind; label: string }[] = [
    { id: 'start', label: 'Inizio' },
    { id: 'action', label: 'Azione' },
    { id: 'condition', label: 'Decisione' },
    { id: 'outcome', label: 'Esito' },
    { id: 'note', label: 'Nota' },
  ];
  readonly graph = computed(() => visibleFlow(this.store.canvas()));
  readonly nodeIndex = computed(() => new Map(this.graph().nodes.map((n) => [n.id, n])));
  readonly node = computed(() => this.store.canvas().nodes.find((n) => n.id === this.selected()));
  readonly outgoing = computed(() =>
    this.store.canvas().edges.filter((e) => e.from === this.selected()),
  );
  readonly roots = computed(() =>
    this.store.canvas().nodes.filter((n) => !this.store.canvas().edges.some((e) => e.to === n.id)),
  );
  readonly bounds = computed(() => flowBounds(this.graph().nodes));
  readonly cards = computed(() =>
    [
      ...new Map(
        [...this.store.main(), ...this.store.extra(), ...this.store.side()].map((c) => [
          c.passcode,
          c,
        ]),
      ).values(),
    ].filter((c) => c.name.toLowerCase().includes(this.search().toLowerCase())),
  );
  readonly guided = computed(() =>
    this.store.canvas().nodes.find((n) => n.id === this.trail().at(-1)),
  );
  readonly choices = computed(() =>
    this.store.canvas().edges.filter((e) => e.from === this.guided()?.id),
  );
  private drag?: {
    id: string | null;
    x: number;
    y: number;
    nx: number;
    ny: number;
    changed: boolean;
  };
  advance(id: string): void {
    this.trail.update((items) => [...items, id]);
    this.focusNode(id);
  }
  focusNode(id: string): void {
    const node = this.store.canvas().nodes.find((n) => n.id === id),
      el = this.viewport?.nativeElement;
    if (!node || !el) return;
    this.selected.set(id);
    this.store.canvas.update((s) => ({
      ...s,
      nodes: s.nodes.map((n) => (n.collapsed ? { ...n, collapsed: false } : n)),
      panX: el.clientWidth / 2 - (node.x + 112) * s.zoom,
      panY: el.clientHeight / 2 - (node.y + 104) * s.zoom,
    }));
  }
  label(kind?: FlowNodeKind): string {
    return this.kinds.find((k) => k.id === (kind || 'action'))!.label;
  }
  name(id: string): string {
    return this.store.canvas().nodes.find((n) => n.id === id)?.name || '';
  }
  path(from: string, to: string): string {
    const a = this.nodeIndex().get(from),
      b = this.nodeIndex().get(to);
    if (!a || !b) return '';
    return `M ${a.x + 224} ${a.y + 104} C ${a.x + 274} ${a.y + 104}, ${b.x - 50} ${b.y + 104}, ${b.x} ${b.y + 104}`;
  }
  mid(from: string, to: string, axis: 'x' | 'y'): number {
    const a = this.nodeIndex().get(from),
      b = this.nodeIndex().get(to);
    return a && b ? (a[axis] + b[axis]) / 2 + (axis === 'x' ? 112 : 104) : 0;
  }
  add(kind: FlowNodeKind = 'action', parent?: FlowNode, card: FlowCard | null = null): void {
    const before = this.store.undoStack();
    const original = this.store.canvas();
    const s = this.store.canvas();
    const id = this.store.addNode(
      card,
      parent ? parent.x + 324 : (60 - s.panX) / s.zoom,
      parent ? parent.y + this.outgoing().length * 280 : (80 - s.panY) / s.zoom,
    );
    this.store.editNode(id, { kind, name: card?.name || this.label(kind) });
    if (parent) {
      this.store.connect(
        parent.id,
        id,
        parent.kind === 'condition' ? 'Condizione da definire' : 'Prosegui',
      );
      if (parent.collapsed) this.store.editNode(parent.id, { collapsed: false });
    }
    this.store.undoStack.set([...before.slice(-49), original]);
    this.selected.set(id);
  }
  link(target: string): void {
    const source = this.selected();
    if (!source || !target) return;
    this.message.set(
      this.store.connect(source, target, 'Alternativa')
        ? 'Collegamento aggiunto'
        : 'Collegamento non valido: già presente o crea un ciclo.',
    );
  }
  startDrag(event: PointerEvent, node?: FlowNode): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (node) this.selected.set(node.id);
    const s = this.store.canvas();
    this.drag = {
      id: node?.id ?? null,
      x: event.clientX,
      y: event.clientY,
      nx: node?.x ?? s.panX,
      ny: node?.y ?? s.panY,
      changed: false,
    };
  }
  @HostListener('window:pointermove', ['$event']) move(event: PointerEvent): void {
    if (!this.drag) return;
    const d = this.drag,
      dx = event.clientX - d.x,
      dy = event.clientY - d.y;
    if (!d.changed && Math.abs(dx) + Math.abs(dy) > 3) {
      if (d.id) this.store.checkpoint();
      d.changed = true;
    }
    if (!d.changed) return;
    if (d.id)
      this.store.moveNode(
        d.id,
        d.nx + dx / this.store.canvas().zoom,
        d.ny + dy / this.store.canvas().zoom,
      );
    else this.store.canvas.update((s) => ({ ...s, panX: d.nx + dx, panY: d.ny + dy }));
  }
  @HostListener('window:pointerup') end(): void {
    this.drag = undefined;
  }
  @HostListener('window:pointercancel') cancel(): void {
    this.drag = undefined;
  }
  @HostListener('window:keydown', ['$event']) key(event: KeyboardEvent): void {
    if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) return;
    if (event.key === 'Escape') {
      this.expanded.set(false);
      this.trail.set([]);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? this.store.redo() : this.store.undo();
    }
  }
  zoom(delta: number): void {
    const el = this.viewport?.nativeElement;
    if (!el) return;
    const s = this.store.canvas(),
      next = Math.max(0.15, Math.min(2, s.zoom + delta));
    this.store.canvas.set({
      ...s,
      zoom: next,
      panX: el.clientWidth / 2 - ((el.clientWidth / 2 - s.panX) * next) / s.zoom,
      panY: el.clientHeight / 2 - ((el.clientHeight / 2 - s.panY) * next) / s.zoom,
    });
  }
  wheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.zoom(event.deltaY < 0 ? 0.1 : -0.1);
    }
  }
  fit(): void {
    const el = this.viewport?.nativeElement;
    if (!el) return;
    const b = this.bounds(),
      zoom = Math.max(
        0.15,
        Math.min(1, el.clientWidth / b.width, (el.clientHeight - 50) / b.height),
      );
    this.store.canvas.update((s) => ({
      ...s,
      zoom,
      panX: (el.clientWidth - b.width * zoom) / 2 - b.x * zoom,
      panY: (el.clientHeight - b.height * zoom) / 2 - b.y * zoom,
    }));
  }
  arrange(): void {
    this.store.arrange();
    this.fit();
  }
  example(): void {
    const nodes: FlowNode[] = [
      ['start', 'Mano iniziale', 'Identifica starter, extender e risposte.'],
      ['action', 'Attiva lo starter', 'Dichiara l’effetto e verifica le risposte.'],
      ['condition', 'L’avversario risponde?', 'Scegli il ramo coerente con la situazione.'],
      ['action', 'Linea principale', 'Risolvi e sviluppa la tua sequenza.'],
      ['condition', 'Hai un extender?', 'Valuta le risorse rimaste in mano.'],
      ['action', 'Linea alternativa', 'Riparti da una risorsa indipendente.'],
      ['outcome', 'Campo obiettivo', 'Annota interazioni e risorse da conservare.'],
      ['outcome', 'Piano di riserva', 'Conserva risorse per il turno successivo.'],
    ].map(([kind, name, action], i) => ({
      id: 'demo-' + i,
      kind: kind as FlowNodeKind,
      name,
      action,
      cardId: null,
      imageSmall: '',
      interrupts: [],
      x: 0,
      y: 0,
    }));
    const edges = [
      [0, 1, 'Inizia'],
      [1, 2, 'Finestra di risposta'],
      [2, 3, 'No'],
      [2, 4, 'Sì'],
      [4, 5, 'Sì'],
      [4, 7, 'No'],
      [3, 6, 'Completa'],
      [5, 6, 'Recupera'],
    ].map(([from, to, label], i) => ({
      id: 'demo-edge-' + i,
      from: 'demo-' + from,
      to: 'demo-' + to,
      label: String(label),
    }));
    this.store.checkpoint();
    this.store.canvas.set({ nodes, edges, zoom: 1, panX: 0, panY: 0 });
    this.store.flowName.set('Esempio didattico · piano e alternative');
    this.arrange();
  }
}
