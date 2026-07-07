import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
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
  imports: [TranslatePipe, VerdictBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as vm) {
      <div class="lg:hidden rounded-xl border border-base-300 bg-base-100 p-3 flex flex-col gap-3">
        <div class="flex gap-3 items-start">
          @if (vm.imageUrl; as src) {
            <img [src]="src" [alt]="vm.name" class="w-14 h-20 object-cover rounded-lg shrink-0" />
          }
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-sm leading-tight">{{ vm.name }}</p>
            @if (vm.legality; as legality) {
              <app-verdict-badge class="mt-1" mode="verdict" [verdict]="legality.verdict" size="xs" />
            }
            <div class="join mt-2">
              <button type="button" class="btn btn-xs join-item" [disabled]="vm.qty === 0" (click)="decrement.emit()">
                −
              </button>
              <span class="btn btn-xs join-item btn-disabled tabular-nums no-animation">×{{ vm.qty }}</span>
              <button type="button" class="btn btn-xs join-item" [disabled]="!vm.canAdd" (click)="increment.emit()">
                +
              </button>
            </div>
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-xs btn-circle text-error shrink-0"
            [disabled]="vm.qty === 0"
            [attr.aria-label]="'decklist.editor.removeCopy' | translate"
            (click)="removeCopy.emit()"
          >
            ✕
          </button>
        </div>
        @if (vm.desc; as desc) {
          <section class="rounded-lg bg-base-200/50 p-2.5 max-h-32 overflow-y-auto">
            <h3 class="text-[10px] font-semibold uppercase tracking-wide text-base-content/60 mb-1">
              {{ 'result.effect' | translate }}
            </h3>
            <p class="text-xs leading-relaxed whitespace-pre-line text-base-content/90">{{ desc }}</p>
          </section>
        }
      </div>
    }
  `,
})
export class DeckCardInspectMobileComponent {
  readonly view = input<DeckCardInspectViewModel | null>(null);

  readonly increment = output<void>();
  readonly decrement = output<void>();
  readonly removeCopy = output<void>();
}
