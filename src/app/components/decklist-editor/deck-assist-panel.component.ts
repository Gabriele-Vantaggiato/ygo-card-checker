import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DeckAnalysis, DeckAnalysisSuggestion, DeckRoleCardRef } from '../../features/deck-builder/deck-analysis.model';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { DuelPanelComponent } from '../../shared/ui/duel-panel/duel-panel.component';
import { LoadingSkeletonComponent } from '../../shared/ui/loading-skeleton/loading-skeleton.component';

@Component({
  selector: 'app-deck-assist-panel',
  standalone: true,
  imports: [TranslatePipe, DuelPanelComponent, LoadingSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-duel-panel panelClass="overflow-hidden flex flex-col">
      <div class="duel-panel-header flex flex-wrap items-center justify-between gap-2 normal-case tracking-normal">
        <span>{{ 'decklist.assist.title' | translate }}</span>
        @if (formatLabel(); as format) {
          <span class="badge badge-outline badge-primary badge-xs font-normal">{{ format }}</span>
        }
      </div>

      <div class="p-2 sm:p-3 lg:min-h-0 lg:max-h-[min(60vh,34rem)] lg:overflow-y-auto lg:overscroll-y-contain">
        @if (loading()) {
          <app-loading-skeleton [rows]="5" rowClass="h-14 w-full" />
        } @else if (analysis().status === 'empty_deck') {
          <p class="text-sm text-base-content/60 text-center py-4">{{ 'decklist.assist.emptyDeck' | translate }}</p>
        } @else if (!analysis().aiUsed) {
          <p class="text-sm text-base-content/60 text-center py-4">{{ 'decklist.assist.needsGemini' | translate }}</p>
        } @else {
          <ul class="space-y-3">
            @for (role of analysis().roles; track role.id) {
              <li class="rounded-xl border border-base-300/40 bg-base-100/70 p-3">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-semibold uppercase tracking-wide text-base-content/70">
                    {{ role.labelKey | translate }}
                  </span>
                  <span
                    class="badge badge-sm tabular-nums"
                    [class.badge-success]="role.cardsInDeck.length > 0"
                    [class.badge-warning]="role.cardsInDeck.length === 0"
                  >
                    {{ role.cardsInDeck.length }}
                  </span>
                </div>

                @if (role.cardsInDeck.length > 0) {
                  <p class="text-[11px] text-base-content/55 mt-1 truncate">
                    {{ cardNames(role.cardsInDeck) }}
                  </p>
                }

                @if (role.suggestions.length > 0) {
                  <ul class="mt-2 space-y-1.5">
                    @for (suggestion of role.suggestions; track suggestion.cardId) {
                      <li>
                        <button
                          type="button"
                          class="w-full flex items-center gap-2.5 p-1.5 rounded-lg border border-base-300/40 bg-base-200/40 hover:border-primary/35 hover:bg-primary/5 text-left transition-colors"
                          (click)="cardSelected.emit(suggestion)"
                        >
                          <img
                            [src]="suggestion.imageUrlSmall"
                            [alt]=""
                            class="w-8 h-11 object-cover rounded shadow-sm shrink-0"
                            loading="lazy"
                          />
                          <div class="flex-1 min-w-0">
                            <p class="text-xs font-medium truncate">{{ suggestion.name }}</p>
                            <p class="text-[10px] text-base-content/55 truncate">{{ suggestion.reason }}</p>
                          </div>
                        </button>
                      </li>
                    }
                  </ul>
                }
              </li>
            }
          </ul>
        }
      </div>
    </app-duel-panel>
  `,
})
export class DeckAssistPanelComponent {
  readonly loading = input(false);
  readonly analysis = input.required<DeckAnalysis>();
  readonly formatLabel = input<string | null>(null);

  readonly cardSelected = output<DeckAnalysisSuggestion>();

  cardNames(cards: readonly DeckRoleCardRef[]): string {
    return cards.map((c) => c.name).join(', ');
  }
}
