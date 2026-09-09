import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, input, output } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { VerdictBadgeComponent } from '../../shared/ui/verdict-badge/verdict-badge.component';
import { DuelPanelComponent } from '../../shared/ui/duel-panel/duel-panel.component';
import { DeckCardInspectViewModel } from './decklist-editor.model';

@Component({
  selector: 'app-deck-card-inspect-panel',
  standalone: true,
  imports: [TranslatePipe, VerdictBadgeComponent, DuelPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-duel-panel
      [title]="'decklist.editor.preview' | translate"
      panelClass="flex flex-col overflow-hidden max-h-[min(22rem,40vh)] lg:max-h-none"
    >
      <div class="flex-1 min-h-0 flex flex-col p-3">
        @if (view(); as vm) {
          <div class="flex flex-col gap-3 min-h-0 flex-1">
            <div class="flex gap-3 shrink-0">
              @if (vm.imageUrl; as src) {
                <img [src]="src" [alt]="vm.name" class="w-20 rounded-lg shadow-md shrink-0" />
              }
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-sm leading-tight line-clamp-2">{{ vm.name }}</p>
                <p class="text-[11px] text-base-content/60 mt-1">{{ vm.type }}</p>
                @if (vm.legality; as legality) {
                  <div class="flex flex-wrap gap-1 mt-2">
                    <app-verdict-badge mode="verdict" [verdict]="legality.verdict" size="xs" />
                    <app-verdict-badge mode="quantity" [banlistStatus]="legality.banlistStatus" size="xs" />
                  </div>
                }
              </div>
            </div>

            @if (vm.descLoading) {
              <p class="text-xs text-base-content/50">{{ 'search.loading' | translate }}</p>
            } @else if (vm.desc; as desc) {
              <section class="rounded-lg bg-base-200/50 p-2.5 flex-1 min-h-0 flex flex-col">
                <h3 class="text-[10px] font-semibold uppercase tracking-wide text-base-content/60 mb-1.5 shrink-0">
                  {{ 'result.effect' | translate }}
                </h3>
                <p class="text-xs leading-relaxed whitespace-pre-line text-base-content/90 overflow-y-auto min-h-0 flex-1">
                  {{ desc }}
                </p>
              </section>
            }

            <div class="shrink-0 space-y-2 pt-1 border-t border-base-300">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-base-content/60">
                  {{ vm.inDeckLabelKey | translate: vm.inDeckLabelParams }}
                </span>
                <div class="join">
                  <button type="button" class="btn btn-sm join-item" [disabled]="vm.qty === 0" (click)="decrement.emit()">
                    −
                  </button>
                  <span class="btn btn-sm join-item btn-disabled tabular-nums no-animation">×{{ vm.qty }}</span>
                  <button type="button" class="btn btn-sm join-item" [disabled]="!vm.canAdd" (click)="increment.emit()">
                    +
                  </button>
                </div>
              </div>
              @if (vm.qty > 0) {
                <button type="button" class="btn btn-ghost btn-xs text-error w-full" (click)="removeCopy.emit()">
                  {{ 'decklist.editor.removeCopy' | translate }}
                </button>
              }
              <button type="button" class="btn btn-ghost btn-xs w-full text-primary/80" (click)="openInSearch.emit()">
                {{ 'decklist.editor.openInSearch' | translate }}
              </button>
            </div>
          </div>
        } @else {
          <p class="text-sm text-base-content/50 text-center px-2 py-8">
            {{ 'decklist.editor.inspectHint' | translate }}
          </p>
        }
      </div>
    </app-duel-panel>
  `,
})
export class DeckCardInspectPanelComponent {
  readonly view = input<DeckCardInspectViewModel | null>(null);

  readonly increment = output<void>();
  readonly decrement = output<void>();
  readonly removeCopy = output<void>();
  readonly openInSearch = output<void>();
}

@Component({
  selector: 'app-deck-card-inspect-mobile',
  standalone: true,
  imports: [TranslatePipe, VerdictBadgeComponent, A11yModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isMobile() && view(); as vm) {
      <div class="mobile-card-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-card-title" (keydown.escape)="closed.emit()">
        <button type="button" class="mobile-card-backdrop" [attr.aria-label]="'ux.closeCard' | translate" (click)="closed.emit()"></button>
        <section class="mobile-card-content" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
          <div class="mobile-card-handle" aria-hidden="true"></div>
          <header class="flex items-center gap-3 px-5 pb-4 border-b border-base-300">
            <p id="mobile-card-title" class="font-display text-xl font-semibold flex-1">{{ vm.name }}</p>
            <button cdkFocusInitial type="button" class="btn btn-ghost btn-sm btn-circle" [attr.aria-label]="'ux.closeCard' | translate" (click)="closed.emit()">✕</button>
          </header>
          <div class="mobile-card-scroll">
            <div class="flex items-start gap-4">
              @if (vm.imageUrl; as src) { <img [src]="src" [alt]="vm.name" class="w-28 rounded-lg shadow-xl" /> }
              <div class="space-y-3"><p class="text-sm text-base-content/70">{{ vm.type }}</p>
                @if (vm.legality; as legality) {
                  <app-verdict-badge mode="verdict" [verdict]="legality.verdict" size="sm" />
                  <app-verdict-badge mode="quantity" [banlistStatus]="legality.banlistStatus" size="sm" />
                }
                <p class="text-sm">{{ vm.inDeckLabelKey | translate: vm.inDeckLabelParams }}</p>
              </div>
            </div>
            <section class="mt-5 rounded-xl bg-base-200 p-4">
              <h3 class="text-xs uppercase tracking-widest text-primary mb-3">{{ 'result.effect' | translate }}</h3>
              @if (vm.descLoading) { <p role="status">{{ 'search.loading' | translate }}</p> }
              @else { <p class="text-sm leading-relaxed whitespace-pre-line">{{ vm.desc || ('ux.previewUnavailable' | translate) }}</p> }
            </section>
          </div>
          <footer class="mobile-card-actions">
            <p class="text-xs text-base-content/65 mb-3">{{ 'ux.copyHelp' | translate }}</p>
            <div class="flex gap-3 items-center">
              <button type="button" class="btn btn-outline flex-1" [disabled]="vm.qty === 0" (click)="decrement.emit()" [attr.aria-label]="'ux.lessCopy' | translate">−</button>
              <span class="font-display text-2xl tabular-nums px-4" aria-live="polite">×{{ vm.qty }}</span>
              <button type="button" class="btn btn-primary flex-1" [disabled]="!vm.canAdd" (click)="increment.emit()" [attr.aria-label]="'ux.moreCopy' | translate">＋</button>
            </div>
          </footer>
        </section>
      </div>
    }
  `,
})
export class DeckCardInspectMobileComponent {
  readonly view = input<DeckCardInspectViewModel | null>(null);
  readonly increment = output<void>();
  readonly decrement = output<void>();
  readonly removeCopy = output<void>();
  readonly closed = output<void>();
  private readonly media = window.matchMedia('(max-width: 1023px)');
  readonly isMobile = signal(this.media.matches);
  constructor() {
    const changed = (event: MediaQueryListEvent): void => this.isMobile.set(event.matches);
    this.media.addEventListener('change', changed);
    inject(DestroyRef).onDestroy(() => this.media.removeEventListener('change', changed));
  }
}
