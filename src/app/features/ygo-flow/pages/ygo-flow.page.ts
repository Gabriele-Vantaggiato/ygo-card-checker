import { CardPreviewDirective } from '../../../shared/ui/card-preview/card-preview.directive';
import { PreviewCard } from '../../../shared/ui/card-preview/card-preview.component';
import { FlowBuilderComponent } from '../components/flow-builder.component';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FlowCard, YgoFlowDocument } from '../../../models/ygo-flow.model';
import { I18nService } from '../../../services/i18n.service';
import { ToastService } from '../../../services/toast.service';
import { toPercent } from '../../../utils/hypergeo.utils';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { DuelPanelComponent } from '../../../shared/ui/duel-panel/duel-panel.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { YgoFlowIoResult, YgoFlowIoService } from '../services/ygo-flow-io.service';
import { FlowZoneKey, YgoFlowStore } from '../stores/ygo-flow.store';

type FlowSection = 'canvas' | 'solitaire' | 'wizard' | 'hypergeo' | 'io';
type WizardTab = 'hand' | 'all' | 'chokepoints';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ygo-flow-page',
  standalone: true,
  imports: [
    FlowBuilderComponent,
    CardPreviewDirective,
    RouterLink,
    TranslatePipe,
    PageHeaderComponent,
    DuelPanelComponent,
    EmptyStateComponent,
  ],
  providers: [YgoFlowStore],
  template: `
    <main class="page-main page-stack lg:max-w-[1600px] fade-in-panel">
      <app-page-header titleKey="flow.pageTitle" subtitleKey="flow.pageSubtitle" />
      <input
        #flowFile
        type="file"
        accept=".ygoflow,.json,application/json"
        hidden
        (change)="onImportFile($event)"
      />

      <section class="surface-elevated rounded-xl border border-base-300/60 p-3 sm:p-4 space-y-2">
        @if (store.errorKey(); as err) {
          <div class="alert alert-warning alert-sm py-2">
            <span>{{ err | translate }}</span>
          </div>
        }
        @if (store.deckOptions().length === 0) {
          <div class="flex flex-col sm:flex-row sm:items-center gap-2">
            <p class="text-sm text-base-content/70 flex-1">{{ 'flow.deck.empty' | translate }}</p>
            <a routerLink="/decklist" class="btn btn-primary btn-sm">{{
              'flow.deck.openDecklist' | translate
            }}</a>
          </div>
        } @else {
          <div class="flex flex-col sm:flex-row gap-2 sm:items-center">
            <label
              class="text-xs font-medium text-base-content/60 sm:w-28 shrink-0"
              for="flow-deck-select"
            >
              {{ 'flow.deck.label' | translate }}
            </label>
            <select
              id="flow-deck-select"
              class="select select-bordered select-sm flex-1"
              [value]="store.selectedDeckId() ?? ''"
              (change)="onDeckSelect($any($event.target).value)"
            >
              <option value="">Seleziona un mazzo (facoltativo)</option>
              @for (deck of store.deckOptions(); track deck.id) {
                <option [value]="deck.id">{{ deck.name }} ({{ deck.count }})</option>
              }
            </select>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              [disabled]="store.loading() || !store.selectedDeckId()"
              (click)="store.loadFromDecklist()"
            >
              @if (store.loading()) {
                <span class="loading loading-spinner loading-xs"></span>
              }
              {{ 'flow.deck.load' | translate }}
            </button>
            <a routerLink="/decklist" class="btn btn-ghost btn-sm">{{
              'flow.deck.manage' | translate
            }}</a>
          </div>
        }
        @if (store.hasDeck()) {
          <p class="text-xs text-base-content/60">
            @if (store.selectedDeckName(); as name) {
              <span class="font-medium text-base-content/80">{{ name }}</span>
              <span aria-hidden="true"> · </span>
            }
            {{
              'flow.deck.summary'
                | translate
                  : {
                      main: store.main().length.toString(),
                      extra: store.extra().length.toString(),
                      side: store.side().length.toString(),
                    }
            }}
          </p>
        }
      </section>

      <nav role="tablist" class="tabs tabs-box tabs-sm w-fit flex-wrap">
        <button
          type="button"
          role="tab"
          class="tab"
          [class.tab-active]="activeSection() === 'canvas'"
          (click)="activeSection.set('canvas')"
        >
          {{ 'flow.section.canvas' | translate }}
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          [class.tab-active]="activeSection() === 'solitaire'"
          (click)="activeSection.set('solitaire')"
        >
          {{ 'flow.section.solitaire' | translate }}
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          [class.tab-active]="activeSection() === 'wizard'"
          (click)="activeSection.set('wizard')"
        >
          {{ 'flow.section.wizard' | translate }}
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          [class.tab-active]="activeSection() === 'hypergeo'"
          (click)="activeSection.set('hypergeo')"
        >
          {{ 'flow.section.hypergeo' | translate }}
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          [class.tab-active]="activeSection() === 'io'"
          (click)="activeSection.set('io')"
        >
          {{ 'flow.section.io' | translate }}
        </button>
      </nav>

      @switch (activeSection()) {
        @case ('canvas') {
          <app-flow-builder
            (importFlow)="flowFile.click()"
            (exportFlow)="exportJson()"
            (exportImage)="exportPng()"
            [exportingImage]="exportingPng()"
          />
        }
        @case ('solitaire') {
          @if (!store.hasDeck()) {
            <app-empty-state titleKey="flow.emptyDeck" hostClass="py-10" />
          } @else {
            <div class="space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <button type="button" class="btn btn-primary btn-sm" (click)="store.drawHand()">
                  {{ 'flow.solitaire.drawHand' | translate }}
                </button>
                <button
                  type="button"
                  class="btn btn-outline btn-sm"
                  [disabled]="store.solitaire().deck.length === 0"
                  (click)="store.drawOne()"
                >
                  {{ 'flow.solitaire.drawOne' | translate }}
                </button>
                <button type="button" class="btn btn-ghost btn-sm" (click)="store.resetSolitaire()">
                  {{ 'flow.solitaire.reset' | translate }}
                </button>
                <span class="text-xs text-base-content/60">
                  {{
                    'flow.solitaire.deckLeft'
                      | translate: { count: store.solitaire().deck.length.toString() }
                  }}
                </span>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                @for (zone of zoneKeys; track zone) {
                  <div class="flow-zone-drop p-2 space-y-1.5">
                    <p class="text-[11px] font-semibold uppercase text-base-content/60">
                      {{ 'flow.solitaire.zone.' + zone | translate }}
                    </p>
                    <div class="flex flex-wrap gap-1 min-h-14">
                      @for (card of store.solitaire()[zone]; track card.uid) {
                        <button
                          type="button"
                          class="w-9 shrink-0 rounded"
                          [class.ring-2]="selectedCardUid() === card.uid"
                          [class.ring-info]="selectedCardUid() === card.uid"
                          [cardPreview]="previewCard(card)"
                          (click)="onZoneCardClick(card, zone)"
                        >
                          <img
                            [src]="card.imageSmall"
                            [alt]="card.name"
                            class="w-9 h-13 object-cover rounded"
                            loading="lazy"
                          />
                        </button>
                      }
                    </div>
                    @if (selectedCardUid() && selectedCardZone() !== zone) {
                      <button
                        type="button"
                        class="btn btn-xs btn-outline btn-block"
                        (click)="moveSelectedTo(zone)"
                      >
                        {{ 'flow.solitaire.moveHere' | translate }}
                      </button>
                    }
                  </div>
                }
              </div>

              <div class="text-xs text-base-content/60 space-y-0.5 max-h-32 overflow-y-auto">
                @for (entry of store.solitaire().log; track $index) {
                  <p>{{ entry }}</p>
                }
              </div>
            </div>
          }
        }

        @case ('wizard') {
          @if (!store.hasDeck()) {
            <app-empty-state titleKey="flow.emptyDeck" hostClass="py-10" />
          } @else {
            <div class="space-y-3">
              <div role="tablist" class="tabs tabs-box tabs-sm w-fit">
                <button
                  type="button"
                  role="tab"
                  class="tab"
                  [class.tab-active]="wizardTab() === 'hand'"
                  (click)="wizardTab.set('hand')"
                >
                  {{ 'flow.wizard.tab.hand' | translate }}
                </button>
                <button
                  type="button"
                  role="tab"
                  class="tab"
                  [class.tab-active]="wizardTab() === 'all'"
                  (click)="wizardTab.set('all')"
                >
                  {{ 'flow.wizard.tab.allStarters' | translate }}
                </button>
                <button
                  type="button"
                  role="tab"
                  class="tab"
                  [class.tab-active]="wizardTab() === 'chokepoints'"
                  (click)="wizardTab.set('chokepoints')"
                >
                  {{ 'flow.wizard.tab.chokepoints' | translate }}
                </button>
              </div>

              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn btn-outline btn-sm" (click)="store.redrawHand()">
                  {{ 'flow.wizard.redrawHand' | translate }}
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  [disabled]="!store.wizardHandAnalysis()"
                  (click)="loadFlowchart()"
                >
                  {{ 'flow.wizard.loadFlowchart' | translate }}
                </button>
              </div>

              @switch (wizardTab()) {
                @case ('hand') {
                  @if (store.wizardHandAnalysis(); as analysis) {
                    <app-duel-panel
                      [title]="
                        (analysis.kind === 'combo'
                          ? 'flow.wizard.result.combo'
                          : 'flow.wizard.result.brick'
                        ) | translate
                      "
                    >
                      <div class="p-3 space-y-2">
                        @if (analysis.lines.length > 0) {
                          <ol class="combo-timeline">
                            @for (step of analysis.lines; track step.order) {
                              <li class="combo-timeline-item">
                                <span class="combo-timeline-marker">{{ step.order }}</span>
                                <div class="min-w-0 flex-1">
                                  <p class="text-sm font-medium">{{ step.title }}</p>
                                  <p class="text-xs text-base-content/60">{{ step.detail }}</p>
                                </div>
                              </li>
                            }
                          </ol>
                        }
                        @for (line of analysis.advice; track $index) {
                          <p class="text-xs text-info">{{ line }}</p>
                        }
                      </div>
                    </app-duel-panel>
                  } @else {
                    <app-empty-state titleKey="flow.wizard.noHand" hostClass="py-8" />
                  }
                }
                @case ('all') {
                  @if (store.wizardAllStarters().length === 0) {
                    <app-empty-state titleKey="flow.wizard.noStarters" hostClass="py-8" />
                  } @else {
                    <div class="space-y-2">
                      @for (analysis of store.wizardAllStarters(); track $index) {
                        <app-duel-panel [title]="analysis.starters[0]?.name ?? ''">
                          <div class="p-3 space-y-1">
                            @for (step of analysis.lines; track step.order) {
                              <p class="text-xs">
                                <span class="text-info">{{ step.order }}.</span> {{ step.title }} —
                                {{ step.detail }}
                              </p>
                            }
                          </div>
                        </app-duel-panel>
                      }
                    </div>
                  }
                }
                @case ('chokepoints') {
                  @if (store.wizardChokepoints().length === 0) {
                    <app-empty-state titleKey="flow.wizard.noChokepoints" hostClass="py-8" />
                  } @else {
                    <ul class="space-y-1.5">
                      @for (line of store.wizardChokepoints(); track $index) {
                        <li class="text-sm text-base-content/80">• {{ line }}</li>
                      }
                    </ul>
                  }
                }
              }
            </div>
          }
        }

        @case ('hypergeo') {
          @if (!store.hasDeck()) {
            <app-empty-state titleKey="flow.emptyDeck" hostClass="py-10" />
          } @else {
            <div class="space-y-3">
              @if (store.hypergeo(); as hg) {
                <app-duel-panel [title]="'flow.hypergeo.title' | translate">
                  <div class="p-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                    <div>
                      <p class="text-2xl font-bold text-info">{{ hg.starters }}</p>
                      <p class="text-[11px] text-base-content/60">
                        {{ 'flow.hypergeo.starters' | translate }}
                      </p>
                    </div>
                    <div>
                      <p class="text-2xl font-bold text-info">{{ hg.extenders }}</p>
                      <p class="text-[11px] text-base-content/60">
                        {{ 'flow.hypergeo.extenders' | translate }}
                      </p>
                    </div>
                    <div>
                      <p class="text-2xl font-bold text-info">{{ hg.handtraps }}</p>
                      <p class="text-[11px] text-base-content/60">
                        {{ 'flow.hypergeo.handtraps' | translate }}
                      </p>
                    </div>
                    <div>
                      <p class="text-2xl font-bold text-success">
                        {{ percent(hg.pAtLeastOneStarter) }}
                      </p>
                      <p class="text-[11px] text-base-content/60">
                        {{ 'flow.hypergeo.pStarter' | translate }}
                      </p>
                    </div>
                    <div>
                      <p class="text-2xl font-bold text-warning">{{ percent(hg.pBrick) }}</p>
                      <p class="text-[11px] text-base-content/60">
                        {{ 'flow.hypergeo.pBrick' | translate }}
                      </p>
                    </div>
                    <div>
                      <p class="text-2xl font-bold text-secondary">
                        {{ percent(hg.pStarterPlusExtenderOrTrap) }}
                      </p>
                      <p class="text-[11px] text-base-content/60">
                        {{ 'flow.hypergeo.pComboPlusBackup' | translate }}
                      </p>
                    </div>
                  </div>
                </app-duel-panel>
              }

              <app-duel-panel [title]="'flow.roles.title' | translate">
                <ul class="divide-y divide-base-300/60 max-h-96 overflow-y-auto">
                  @for (card of uniqueMainCards(); track card.passcode) {
                    <li class="flex items-center gap-2 p-2">
                      <img
                        [src]="card.imageSmall"
                        [alt]=""
                        class="w-8 h-11 object-cover rounded shrink-0"
                        loading="lazy"
                      />
                      <span class="text-sm flex-1 min-w-0 truncate">{{ card.name }}</span>
                      <select
                        class="select select-xs select-bordered w-28"
                        [value]="card.role"
                        (change)="store.setRole(card.passcode, $any($event.target).value)"
                      >
                        <option value="untagged">{{ 'flow.role.untagged' | translate }}</option>
                        <option value="starter">{{ 'flow.role.starter' | translate }}</option>
                        <option value="extender">{{ 'flow.role.extender' | translate }}</option>
                        <option value="handtrap">{{ 'flow.role.handtrap' | translate }}</option>
                      </select>
                    </li>
                  }
                </ul>
              </app-duel-panel>
            </div>
          }
        }

        @case ('io') {
          <div class="grid sm:grid-cols-2 gap-4">
            <app-duel-panel [title]="'flow.io.exportTitle' | translate">
              <div class="p-3 space-y-2">
                <button
                  type="button"
                  class="btn btn-primary btn-sm btn-block"
                  [disabled]="!store.hasDeck()"
                  (click)="exportJson()"
                >
                  {{ 'flow.io.exportJson' | translate }}
                </button>
                <button
                  type="button"
                  class="btn btn-outline btn-sm btn-block"
                  [disabled]="!store.hasDeck()"
                  (click)="exportBase64()"
                >
                  {{ 'flow.io.exportBase64' | translate }}
                </button>
                @if (base64Output()) {
                  <textarea
                    class="textarea textarea-bordered textarea-xs w-full h-20 font-mono"
                    readonly
                    [value]="base64Output()"
                  ></textarea>
                  <button type="button" class="btn btn-ghost btn-xs" (click)="copyBase64()">
                    {{ 'flow.io.copy' | translate }}
                  </button>
                }
                <button
                  type="button"
                  class="btn btn-outline btn-sm btn-block"
                  [disabled]="store.canvas().nodes.length === 0 || exportingPng()"
                  (click)="exportPng()"
                >
                  @if (exportingPng()) {
                    <span class="loading loading-spinner loading-xs"></span>
                  }
                  {{ 'flow.io.exportPng' | translate }}
                </button>
              </div>
            </app-duel-panel>

            <app-duel-panel [title]="'flow.io.importTitle' | translate">
              <div class="p-3 space-y-3">
                <label class="btn btn-outline btn-sm btn-block cursor-pointer">
                  {{ 'flow.io.importFile' | translate }}
                  <input
                    type="file"
                    accept=".ygoflow,.json,application/json"
                    class="hidden"
                    (change)="onImportFile($event)"
                  />
                </label>

                <div class="space-y-1">
                  <textarea
                    class="textarea textarea-bordered textarea-xs w-full h-20 font-mono"
                    [value]="importJsonText()"
                    (input)="importJsonText.set($any($event.target).value)"
                    [attr.placeholder]="'flow.io.pasteJson' | translate"
                  ></textarea>
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs"
                    [disabled]="!importJsonText().trim()"
                    (click)="importJson()"
                  >
                    {{ 'flow.io.importConfirm' | translate }}
                  </button>
                </div>

                <div class="space-y-1">
                  <textarea
                    class="textarea textarea-bordered textarea-xs w-full h-16 font-mono"
                    [value]="importBase64Text()"
                    (input)="importBase64Text.set($any($event.target).value)"
                    [attr.placeholder]="'flow.io.pasteBase64' | translate"
                  ></textarea>
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs"
                    [disabled]="!importBase64Text().trim()"
                    (click)="importBase64()"
                  >
                    {{ 'flow.io.importConfirm' | translate }}
                  </button>
                </div>
              </div>
            </app-duel-panel>
          </div>
        }
      }
    </main>
  `,
})
export class YgoFlowPage implements OnInit {
  protected readonly store = inject(YgoFlowStore);
  private readonly io = inject(YgoFlowIoService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly activeSection = signal<FlowSection>('canvas');
  protected readonly wizardTab = signal<WizardTab>('hand');

  protected readonly selectedCardUid = signal<string | null>(null);
  protected readonly selectedCardZone = signal<FlowZoneKey | null>(null);

  protected readonly base64Output = signal('');
  protected readonly exportingPng = signal(false);
  protected readonly importJsonText = signal('');
  protected readonly importBase64Text = signal('');

  protected readonly zoneKeys: readonly FlowZoneKey[] = ['hand', 'monsters', 'spellTraps', 'gy'];

  ngOnInit(): void {
    if (this.store.ydkeInput()) this.store.loadYdke();
    else if (this.store.deckOptions().length && !this.store.canvas().nodes.length)
      this.store.loadFromDecklist();
  }

  onDeckSelect(deckId: string): void {
    this.store.setSelectedDeckId(deckId);
    this.store.loadFromDecklist(deckId);
  }

  protected readonly uniqueMainCards = computed<FlowCard[]>(() => {
    const seen = new Set<number>();
    const result: FlowCard[] = [];
    for (const card of this.store.main()) {
      if (!seen.has(card.passcode)) {
        seen.add(card.passcode);
        result.push(card);
      }
    }
    return result;
  });

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
  percent(value: number): string {
    return toPercent(value, 0);
  }

  onZoneCardClick(card: FlowCard, zone: FlowZoneKey): void {
    if (this.selectedCardUid() === card.uid) {
      this.selectedCardUid.set(null);
      this.selectedCardZone.set(null);
      return;
    }
    this.selectedCardUid.set(card.uid);
    this.selectedCardZone.set(zone);
  }

  moveSelectedTo(zone: FlowZoneKey): void {
    const uid = this.selectedCardUid();
    const from = this.selectedCardZone();
    if (!uid || !from) {
      return;
    }
    this.store.moveCard(uid, from, zone);
    this.selectedCardUid.set(null);
    this.selectedCardZone.set(null);
  }

  loadFlowchart(): void {
    this.store.pushWizardHandToCanvas();
    this.activeSection.set('canvas');
  }

  exportJson(): void {
    const filename =
      (this.store
        .flowName()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .slice(0, 70) || 'flow') + '.ygoflow';
    this.io.downloadJson(this.store.exportDocument(), filename);
  }

  exportBase64(): void {
    this.base64Output.set(this.io.serializeBase64(this.store.exportDocument()));
  }

  copyBase64(): void {
    const text = this.base64Output();
    if (!text || !navigator.clipboard) {
      return;
    }
    void navigator.clipboard.writeText(text).then(() => {
      this.toast.success(this.i18n.translate('flow.io.copied'));
    });
  }

  async exportPng(): Promise<void> {
    this.exportingPng.set(true);
    try {
      const result = await this.io.exportPng(this.store.canvas());
      if (!result.ok) this.toast.error(this.i18n.translate(result.errorKey));
    } catch {
      this.toast.error(this.i18n.translate('flow.io.error.exportFailed'));
    } finally {
      this.exportingPng.set(false);
    }
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      this.toast.error('File troppo grande: il limite è 15 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => this.toast.error('Impossibile leggere il file. Riprova.');
    reader.onload = () => {
      this.applyImportResult(this.io.parseJson(String(reader.result ?? '')));
    };
    reader.readAsText(file);
  }

  importJson(): void {
    this.applyImportResult(this.io.parseJson(this.importJsonText()));
  }

  importBase64(): void {
    this.applyImportResult(this.io.parseBase64(this.importBase64Text()));
  }

  private applyImportResult(result: YgoFlowIoResult<YgoFlowDocument>): void {
    if (!result.ok) {
      this.toast.error(this.i18n.translate(result.errorKey));
      return;
    }
    this.store.loadDocument(result.value);
    this.activeSection.set('canvas');
    this.importJsonText.set('');
    this.importBase64Text.set('');
    this.toast.success(this.i18n.translate('flow.io.imported'));
  }
}
