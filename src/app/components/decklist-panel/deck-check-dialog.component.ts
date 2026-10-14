import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormatStore } from '../../core/stores/format.store';
import { DecklistStore } from '../../features/decklist/stores/decklist.store';
import { DeckCheckResult, DeckCheckService } from '../../services/deck-check.service';
import { I18nService } from '../../services/i18n.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DeckIssue } from '../../utils/deck-check.utils';

/** "Controlla mazzi": legality report of every saved deck for the active format. */
@Component({
  selector: 'app-deck-check-dialog',
  standalone: true,
  imports: [A11yModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <dialog class="modal modal-open" open aria-modal="true" aria-labelledby="deck-check-title" (keydown.escape)="close()">
        <div class="modal-box duel-modal w-full max-w-2xl overflow-x-hidden" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
          <h3 id="deck-check-title" class="font-display font-semibold text-2xl">{{ 'decklist.check.title' | translate }}</h3>
          <p class="text-sm text-base-content/60 mt-1.5">{{ 'decklist.check.hint' | translate: { format: formatName() } }}</p>

          <div class="mt-4 space-y-2 min-w-0" aria-live="polite">
            @if (loading()) {
              <div class="flex justify-center py-8"><span class="loading loading-spinner"></span></div>
            } @else if (results().length === 0) {
              <p class="text-sm text-base-content/60">{{ 'decklist.check.noDecks' | translate }}</p>
            } @else {
              <p class="text-sm" [class.text-success]="problemCount() === 0" [class.text-warning]="problemCount() > 0">
                {{ 'decklist.check.summary' | translate: { problems: '' + problemCount(), total: '' + results().length } }}
              </p>
              <ul class="space-y-2 max-h-[60vh] overflow-y-auto">
                @for (result of results(); track result.deckId) {
                  <li class="rounded-lg border p-3 min-w-0" [class.border-success]="result.issues.length === 0" [class.border-warning]="result.issues.length > 0">
                    <div class="flex items-center gap-2 min-w-0">
                      <span aria-hidden="true">{{ result.issues.length === 0 ? '✓' : '⚠' }}</span>
                      <span class="font-medium truncate min-w-0 flex-1">{{ result.deckName }}</span>
                      <span class="badge badge-ghost badge-sm tabular-nums shrink-0">{{ result.cardCount }}</span>
                      <button type="button" class="btn btn-ghost btn-xs shrink-0" (click)="openDeck(result.deckId)">{{ 'decklist.check.open' | translate }}</button>
                    </div>
                    @if (result.issues.length > 0) {
                      <ul class="mt-2 space-y-0.5 text-xs text-base-content/70">
                        @for (issue of result.issues; track $index) {
                          <li class="break-words">• {{ describe(issue) }}</li>
                        }
                      </ul>
                    }
                  </li>
                }
              </ul>
            }
          </div>

          <div class="modal-action mt-4">
            <button type="button" class="btn btn-primary" (click)="close()">{{ 'decklist.check.close' | translate }}</button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" (click)="close()">close</button>
        </form>
      </dialog>
    }
  `,
})
export class DeckCheckDialogComponent {
  private readonly checker = inject(DeckCheckService);
  private readonly decklistStore = inject(DecklistStore);
  private readonly formatStore = inject(FormatStore);
  private readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = signal(false);
  readonly closed = output<void>();
  readonly deckSelected = output<string>();

  readonly loading = signal(false);
  readonly results = signal<DeckCheckResult[]>([]);
  readonly problemCount = computed(() => this.results().filter((r) => r.issues.length > 0).length);
  readonly formatName = computed(() => {
    const format = this.formatStore.selectedFormat();
    return format ? format.name[this.i18n.lang()] : '';
  });

  show(): void {
    const format = this.formatStore.selectedFormat();
    this.open.set(true);
    this.results.set([]);
    if (!format) return;
    this.loading.set(true);
    this.checker
      .checkDecks$(this.decklistStore.decklists(), format)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (results) => {
          this.results.set(results);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  close(): void {
    this.open.set(false);
    this.closed.emit();
  }

  openDeck(deckId: string): void {
    this.deckSelected.emit(deckId);
    this.close();
  }

  describe(issue: DeckIssue): string {
    const params = {
      name: issue.cardName ?? '',
      found: '' + (issue.found ?? 0),
      allowed: '' + (issue.allowed ?? 0),
      format: this.formatName(),
    };
    return this.i18n.t(`decklist.check.issue.${issue.kind}`, params);
  }
}
