import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, signal, inject } from '@angular/core';
import { FormatSelectorComponent } from '../../../components/format-selector/format-selector.component';
import { CardDetailTabsComponent } from '../../../components/card-detail-tabs/card-detail-tabs.component';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { OverlayStore } from '../stores/overlay.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-overlay-page',
  standalone: true,
  imports: [FormatSelectorComponent, CardDetailTabsComponent, TranslatePipe, PageHeaderComponent],
  providers: [OverlayStore],
  template: `
    <main class="page-main page-stack overlay-page">
      <app-page-header titleKey="overlay.pageTitle" subtitleKey="overlay.pageSubtitle" />

      <section class="overlay-guide">
        <div><p class="duel-eyebrow">DUEL COMPANION</p><h2>{{ 'overlay.guideTitle' | translate }}</h2><p>{{ 'overlay.guideHint' | translate }}</p></div>
        <ol class="overlay-steps">
          <li><span>01</span><div><strong>{{ 'overlay.step1' | translate }}</strong><p>{{ 'overlay.step1Hint' | translate }}</p></div></li>
          <li><span>02</span><div><strong>{{ 'overlay.step2' | translate }}</strong><p>{{ 'overlay.step2Hint' | translate }}</p></div></li>
          <li><span>03</span><div><strong>{{ 'overlay.step3' | translate }}</strong><p>{{ (store.captureSupported() ? 'overlay.step3Hint' : 'overlay.step3ImageHint') | translate }}</p></div></li>
        </ol>
      </section>
      @if (store.errorKey(); as err) {
        <div class="alert alert-warning alert-sm py-2 flex-col items-start gap-1" role="alert">
          <span>{{ err | translate: store.statusParams() }}</span>
          <span class="text-xs opacity-80">{{ 'overlay.fallbackHint' | translate }}</span>
        </div>
      }

      <div class="sm:hidden deck-context-bar">
        <app-format-selector
          [inline]="true"
          [showLabel]="true"
          [formats]="store.formats()"
          [selectedId]="store.selectedFormatId()"
          (selectedChange)="store.setFormatId($event)"
        />
      </div>

      <section class="overlay-workspace surface-elevated" [class.overlay-dragging]="dragging()" (dragover)="onDragOver($event)" (dragleave)="onDragLeave($event)" (drop)="onDrop($event)">
        <div class="overlay-drop-intro">
          <div class="scan-emblem" aria-hidden="true"><span>✦</span></div>
          <div><p class="duel-eyebrow">{{ 'overlay.workspaceLabel' | translate }}</p><h2>{{ 'overlay.dropTitle' | translate }}</h2><p>{{ 'overlay.dropHint' | translate }}</p></div>
        </div>
        @if (!store.captureSupported()) {
          <div class="alert alert-info alert-sm py-2">
            <span>{{ 'overlay.liveDesktopOnly' | translate }}</span>
          </div>
          <div class="flex flex-col gap-2">
            <label class="btn btn-primary btn-lg w-full cursor-pointer gap-2">
              {{ 'overlay.camera' | translate }}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                class="sr-only"
                [disabled]="busy()"
                (change)="onFile($event)"
              />
            </label>
            <label class="btn btn-outline btn-md w-full cursor-pointer">
              {{ 'overlay.upload' | translate }}
              <input type="file" accept="image/*" class="sr-only" [disabled]="busy()" (change)="onFile($event)" />
            </label>
          </div>
          <p class="text-xs text-base-content/70">{{ 'overlay.hintMobile' | translate }}</p>
        } @else {
          <div class="flex flex-wrap gap-2">
            @if (!store.liveActive()) {
              <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="store.startLive()">
                {{ 'overlay.liveStart' | translate }}
              </button>
            } @else {
              <button type="button" class="btn btn-warning btn-sm" (click)="store.stopLive()">
                {{ 'overlay.liveStop' | translate }}
              </button>
              <span class="badge badge-success badge-sm self-center">{{
                'overlay.liveOn' | translate
              }}</span>
            }

            <button type="button" class="btn btn-outline btn-sm" [disabled]="busy()" (click)="store.pasteFromClipboard()">
              {{ 'overlay.paste' | translate }}
            </button>

            <label class="btn btn-outline btn-sm cursor-pointer">
              {{ 'overlay.upload' | translate }}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                class="sr-only" [disabled]="busy()"
                (change)="onFile($event)"
              />
            </label>
          </div>

          @if (store.liveActive()) {
            <div
              class="rounded-xl border-2 border-primary/40 bg-primary/10 p-3 sm:p-4 flex flex-col gap-2"
            >
              <button
                type="button"
                class="btn btn-primary btn-lg w-full gap-2"
                (click)="store.scanNow()"
              >
                @if (store.phase() === 'ocr' || store.phase() === 'resolving') {
                  <span class="loading loading-spinner loading-sm"></span>
                }
                {{ 'overlay.scanNow' | translate }}
              </button>
              @if (store.pipSupported()) {
                <button
                  type="button"
                  class="btn btn-outline btn-sm w-full"
                  (click)="store.openPipNow()"
                >
                  {{ 'overlay.openPip' | translate }}
                </button>
              }
              <p class="text-xs text-base-content/70 text-center">
                {{ 'overlay.scanNowHint' | translate }}
              </p>
            </div>
          }

          <p class="text-xs text-base-content/60">{{ 'overlay.hintDesktop' | translate }}</p>
        }

        @if (store.statusKey(); as status) {
          <p class="overlay-status" role="status" aria-live="polite">
            {{ status | translate: store.statusParams() }}
          </p>
        }

        <div class="overlay-manual flex flex-col sm:flex-row gap-3">
          <label class="form-control flex-1 min-w-0">
            <span class="label py-0 pb-1">
              <span class="label-text text-xs">{{ 'overlay.manualLabel' | translate }}</span>
            </span>
            <input
              type="search"
              class="input input-bordered w-full"
              [value]="store.manualQuery()"
              (input)="store.setManualQuery($any($event.target).value)"
              (keydown.enter)="lookupManual()"
              [attr.placeholder]="'overlay.manualPlaceholder' | translate"
            />
          </label>
          <button
            type="button"
            class="btn btn-outline sm:self-end"
            [disabled]="store.manualQuery().trim().length < 2 || busy()"
            (click)="lookupManual()"
          >
            {{ 'overlay.manualLookup' | translate }}
          </button>
        </div>

        @if (store.ocrPreview()) {
          <details class="text-xs text-base-content/50">
            <summary class="cursor-pointer">{{ 'overlay.ocrPreview' | translate }}</summary>
            <pre class="mt-1 whitespace-pre-wrap font-mono">{{ store.ocrPreview() }}</pre>
          </details>
        }
      </section>

      <app-card-detail-tabs
        [card]="store.selectedCard()"
        [result]="store.legalityResult()"
        [format]="store.selectedFormat()"
        [relatedLoading]="store.relatedLoading()"
        [relatedAvailable]="store.relatedAvailable()"
        [relatedSeries]="store.relatedSeries()"
        [relatedMentions]="store.relatedMentions()"
        [relatedEffects]="store.relatedEffects()"
        [relatedTags]="store.relatedTags()"
        [relatedGroups]="store.relatedGroups()"
        [relatedSuggestions]="store.relatedSuggestions()"
        (relatedCardSelect)="store.openRelatedCard($event)"
      />
    </main>
  `,
})
export class OverlayPage {
  protected readonly store = inject(OverlayStore);
  readonly dragging = signal(false);
  readonly busy = computed(() => ['capturing', 'ocr', 'resolving'].includes(this.store.phase()));

  lookupManual(): void { if (!this.busy()) this.store.lookupManual(); }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.busy()) this.dragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    const target = event.currentTarget as HTMLElement;
    if (!(event.relatedTarget instanceof Node) || !target.contains(event.relatedTarget)) this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.busy()) return;
    const file = Array.from(event.dataTransfer?.files ?? []).find(file => file.type.startsWith('image/'));
    if (file) this.store.processFile(file);
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => this.store.destroy());
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'F2' && this.store.liveActive()) {
      event.preventDefault();
      this.store.scanNow();
    }
  }

  @HostListener('window:paste', ['$event'])
  onWindowPaste(event: ClipboardEvent): void {
    if (this.busy()) return;
    const items = event.clipboardData?.items;
    if (!items) {
      return;
    }
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          this.store.processFile(file);
        }
        return;
      }
    }
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file && !this.busy()) {
      this.store.processFile(file);
    }
    input.value = '';
  }
}
