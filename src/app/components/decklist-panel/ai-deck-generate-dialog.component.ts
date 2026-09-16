import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { DecklistStore } from '../../features/decklist/stores/decklist.store';
import { FormatStore } from '../../core/stores/format.store';
import { GeminiCoachService } from '../../services/gemini-coach.service';
import { I18nService } from '../../services/i18n.service';
import { countTextDeckLines, parseDeckText } from '../../services/deck-text.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { GeminiKeyPanelComponent } from '../../shared/ui/gemini-key-panel/gemini-key-panel.component';

type Stage = 'prompt' | 'preview' | 'created';

/**
 * Generates a full decklist from a natural-language prompt via Gemini, then imports it
 * through the exact same text pipeline as manual paste (parseDeckText → resolveCardByName$)
 * so an invented card name simply comes back "unresolved" — Gemini never touches the catalog.
 * Also surfaces Gemini's own reasoning (separate from the parsed card list) so the user has
 * something concrete to read and push back on when refining.
 */
@Component({
  selector: 'app-ai-deck-generate-dialog',
  standalone: true,
  imports: [A11yModule, FormsModule, TranslatePipe, GeminiKeyPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <dialog class="modal modal-open" open aria-modal="true" aria-labelledby="ai-deck-title" (keydown.escape)="close()">
        <div class="modal-box duel-modal max-w-xl" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
          <h3 id="ai-deck-title" class="font-display font-semibold text-2xl">{{ 'decklist.aiGen.title' | translate }}</h3>
          <p class="text-sm text-base-content/60 mt-1.5 leading-relaxed">{{ 'decklist.aiGen.hint' | translate }}</p>

          <div class="mt-5 space-y-5">
            <app-gemini-key-panel />

            @if (stage() === 'prompt') {
              <div class="space-y-2">
                <label class="form-control">
                  <span class="label-text text-sm font-medium">{{ 'decklist.aiGen.promptLabel' | translate }}</span>
                  <textarea
                    class="textarea textarea-bordered min-h-24 mt-1"
                    [placeholder]="'decklist.aiGen.promptPlaceholder' | translate"
                    [ngModel]="prompt()"
                    (ngModelChange)="prompt.set($event)"
                    [disabled]="generating()"
                  ></textarea>
                </label>
                @if (errorKey(); as err) {
                  <p class="text-xs text-error">{{ err | translate }}</p>
                }
              </div>
              <div class="modal-action">
                <button type="button" class="btn btn-ghost" (click)="close()">{{ 'decklist.dialog.cancel' | translate }}</button>
                <button
                  type="button"
                  class="btn btn-primary gap-2"
                  [disabled]="!prompt().trim() || !gemini.unlocked() || generating()"
                  (click)="generate()"
                >
                  @if (generating()) { <span class="loading loading-spinner loading-xs"></span> }
                  {{ 'decklist.aiGen.generate' | translate }}
                </button>
              </div>
            }

            @if (stage() === 'preview') {
              <div class="space-y-5">
                @if (reasoning()) {
                  <div class="space-y-1.5">
                    <p class="duel-eyebrow">{{ 'decklist.aiGen.reasoningEyebrow' | translate }}</p>
                    <p class="text-sm text-base-content/75 leading-relaxed">{{ reasoning() }}</p>
                  </div>
                }

                <div class="space-y-2 pt-1 border-t border-base-300/50">
                  <div class="flex items-center justify-between gap-2 pt-4">
                    <span class="text-sm font-medium">{{ 'decklist.aiGen.listLabel' | translate }}</span>
                    <span class="badge badge-ghost badge-sm font-normal tabular-nums">
                      {{ 'decklist.aiGen.previewCount' | translate: { main: '' + previewCounts().main, extra: '' + previewCounts().extra, side: '' + previewCounts().side } }}
                    </span>
                  </div>
                  <textarea
                    class="textarea textarea-bordered w-full min-h-32 font-mono text-xs"
                    [ngModel]="resultText()"
                    (ngModelChange)="resultText.set($event)"
                  ></textarea>
                  <p class="text-xs text-base-content/50">{{ 'decklist.aiGen.editableHint' | translate }}</p>
                </div>

                <div class="space-y-2 pt-1 border-t border-base-300/50">
                  <label class="form-control pt-4">
                    <span class="label-text text-sm font-medium">{{ 'decklist.aiGen.refineLabel' | translate }}</span>
                    <div class="flex flex-wrap gap-2 mt-1">
                      <input
                        type="text"
                        class="input input-bordered input-sm flex-1 min-w-0"
                        [placeholder]="'decklist.aiGen.refinePlaceholder' | translate"
                        [ngModel]="refinePrompt()"
                        (ngModelChange)="refinePrompt.set($event)"
                        [disabled]="generating()"
                        (keydown.enter)="refine()"
                      />
                      <button type="button" class="btn btn-outline btn-sm" [disabled]="!refinePrompt().trim() || generating()" (click)="refine()">
                        @if (generating()) { <span class="loading loading-spinner loading-xs"></span> }
                        {{ 'decklist.aiGen.refine' | translate }}
                      </button>
                    </div>
                  </label>
                  @if (errorKey(); as err) {
                    <p class="text-xs text-error">{{ err | translate }}</p>
                  }
                </div>

                <label class="form-control pt-1 border-t border-base-300/50">
                  <span class="label-text text-sm font-medium pt-4">{{ 'decklist.create.placeholder' | translate }}</span>
                  <input type="text" class="input input-bordered input-sm mt-1" [(ngModel)]="deckName" />
                </label>
              </div>

              <div class="modal-action">
                <button type="button" class="btn btn-ghost" (click)="stage.set('prompt')">{{ 'decklist.aiGen.back' | translate }}</button>
                <button type="button" class="btn btn-primary gap-2" [disabled]="importing()" (click)="confirmCreate()">
                  @if (importing()) { <span class="loading loading-spinner loading-xs"></span> }
                  {{ 'decklist.aiGen.create' | translate }}
                </button>
              </div>
            }

            @if (stage() === 'created') {
              <div class="rounded-lg border border-success/40 bg-success/10 p-3 space-y-2">
                <p class="text-sm font-medium">{{ 'decklist.aiGen.createdTitle' | translate }}</p>
                @if (unresolved().length) {
                  <p class="text-xs text-warning">
                    {{ 'decklist.aiGen.unresolved' | translate: { count: '' + unresolved().length } }}
                    {{ unresolved().join(', ') }}
                  </p>
                }
              </div>
              <div class="modal-action flex-wrap">
                <button type="button" class="btn btn-outline btn-sm" (click)="openFlowExample()">{{ 'decklist.aiGen.flowExample' | translate }}</button>
                <button type="button" class="btn btn-primary btn-sm" (click)="openInEditor()">{{ 'decklist.aiGen.openEditor' | translate }}</button>
              </div>
            }
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" (click)="close()">close</button>
        </form>
      </dialog>
    }
  `,
})
export class AiDeckGenerateDialogComponent {
  protected readonly gemini = inject(GeminiCoachService);
  private readonly decklistStore = inject(DecklistStore);
  private readonly formatStore = inject(FormatStore);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = signal(false);
  readonly closed = output<void>();
  readonly deckReady = output<string>();

  readonly stage = signal<Stage>('prompt');
  readonly prompt = signal('');
  readonly refinePrompt = signal('');
  readonly resultText = signal('');
  readonly reasoning = signal('');
  readonly generating = signal(false);
  readonly importing = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly unresolved = signal<string[]>([]);
  deckName = '';
  private createdDeckId: string | null = null;

  readonly previewCounts = computed(() => {
    try {
      return countTextDeckLines(parseDeckText(this.resultText()));
    } catch {
      return { main: 0, extra: 0, side: 0 };
    }
  });

  show(): void {
    this.stage.set('prompt');
    this.prompt.set('');
    this.refinePrompt.set('');
    this.resultText.set('');
    this.reasoning.set('');
    this.errorKey.set(null);
    this.unresolved.set([]);
    this.deckName = '';
    this.createdDeckId = null;
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
    this.closed.emit();
  }

  generate(): void {
    if (!this.prompt().trim() || !this.gemini.unlocked() || this.generating()) return;
    this.generating.set(true);
    this.errorKey.set(null);
    this.gemini
      .generateDeck$(this.prompt(), this.i18n.lang())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ reasoning, deckText }) => {
          this.generating.set(false);
          if (!deckText.trim()) {
            this.errorKey.set('replay.gemini.error.empty');
            return;
          }
          this.resultText.set(deckText);
          this.reasoning.set(reasoning);
          this.deckName = this.prompt().trim().slice(0, 80);
          this.stage.set('preview');
        },
        error: (err: unknown) => {
          this.generating.set(false);
          this.errorKey.set(err instanceof Error ? err.message : 'replay.gemini.error.request');
        },
      });
  }

  refine(): void {
    if (!this.refinePrompt().trim() || this.generating()) return;
    this.generating.set(true);
    this.errorKey.set(null);
    this.gemini
      .generateDeck$(this.refinePrompt(), this.i18n.lang(), this.resultText())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ reasoning, deckText }) => {
          this.generating.set(false);
          if (!deckText.trim()) {
            this.errorKey.set('replay.gemini.error.empty');
            return;
          }
          this.resultText.set(deckText);
          this.reasoning.set(reasoning);
          this.refinePrompt.set('');
        },
        error: (err: unknown) => {
          this.generating.set(false);
          this.errorKey.set(err instanceof Error ? err.message : 'replay.gemini.error.request');
        },
      });
  }

  confirmCreate(): void {
    const format = this.formatStore.selectedFormat();
    const text = this.resultText().trim();
    if (!text || !format || this.importing()) return;
    this.importing.set(true);
    this.errorKey.set(null);
    const id = this.decklistStore.createDecklist(this.deckName.trim() || undefined);
    this.decklistStore
      .importFromText$(text, id, true, format)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.importing.set(false);
          if (!result.ok && result.errorKey) {
            this.errorKey.set(result.errorKey);
            return;
          }
          this.unresolved.set(result.unresolved);
          this.createdDeckId = id;
          this.stage.set('created');
        },
        error: () => {
          this.importing.set(false);
          this.errorKey.set('decklist.feedback.textInvalid');
        },
      });
  }

  openInEditor(): void {
    if (!this.createdDeckId) return;
    const id = this.createdDeckId;
    this.deckReady.emit(id);
    this.close();
  }

  openFlowExample(): void {
    if (!this.createdDeckId) return;
    const id = this.createdDeckId;
    this.close();
    void this.router.navigate(['/flow'], { queryParams: { deckId: id, section: 'hands' } });
  }
}
