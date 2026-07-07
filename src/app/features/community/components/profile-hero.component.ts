import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CommunityProfileEntry,
  CommunityPublicDeckEntry,
} from '../models/community.model';
import { PublicDeckCardComponent } from './public-deck-card.component';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-profile-hero',
  standalone: true,
  imports: [RouterLink, PublicDeckCardComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="profile-layout">
      <aside class="profile-sidebar duel-panel">
        <div class="profile-favorite-card">
          @if (profile().favoriteCard?.imageUrlSmall; as img) {
            <img class="profile-favorite-img" [src]="img" [alt]="profile().favoriteCard!.name" />
          } @else {
            <div class="profile-favorite-fallback font-display">
              {{ profile().displayName.charAt(0).toUpperCase() }}
            </div>
          }
        </div>
        <h2 class="profile-display-name">{{ profile().displayName }}</h2>
        @if (profile().handle) {
          <p class="profile-handle">@{{ profile().handle }}</p>
        }
        @if (profile().bio) {
          <p class="profile-bio">{{ profile().bio }}</p>
        }
      </aside>

      <div class="profile-main space-y-4">
        <section class="duel-panel">
          <div class="duel-panel-header px-3 sm:px-4 py-2 border-b border-base-300/50">
            <h3 class="text-sm font-semibold">{{ 'profile.section.stats' | translate }}</h3>
          </div>
          <ul class="profile-stats-list">
            <li>
              <span>{{ 'profile.stats.publicDecks' | translate }}</span>
              <span class="profile-stat-value">{{ profile().publicDeckCount }}</span>
            </li>
            <li>
              <span>{{ 'profile.stats.tournaments' | translate }}</span>
              <span class="profile-stat-value">{{ profile().tournaments.length }}</span>
            </li>
          </ul>
        </section>

        <section class="duel-panel">
          <div class="duel-panel-header px-3 sm:px-4 py-2 border-b border-base-300/50">
            <h3 class="text-sm font-semibold">{{ 'profile.section.tournaments' | translate }}</h3>
          </div>
          <div class="p-3 sm:p-4">
            @for (event of profile().tournaments; track event.id) {
              <div class="profile-tournament-row">
                <div>
                  <p class="font-medium text-sm">{{ event.name }}</p>
                  <p class="text-xs text-base-content/60">
                    {{ event.eventDate }} · {{ event.formatLabel }}
                    @if (event.placement) {
                      · {{ event.placement }}
                    }
                  </p>
                </div>
              </div>
            } @empty {
              <p class="text-sm text-base-content/60">{{ 'profile.tournamentsEmpty' | translate }}</p>
            }
          </div>
        </section>

        <section class="duel-panel">
          <div class="duel-panel-header px-3 sm:px-4 py-2 border-b border-base-300/50 flex items-center justify-between gap-2">
            <h3 class="text-sm font-semibold">{{ 'profile.section.publicDecks' | translate }}</h3>
            @if (profile().handle) {
              <a
                class="btn btn-primary btn-xs"
                [routerLink]="['/community']"
                [queryParams]="{ tab: 'decks', q: profile().handle }"
              >
                {{ 'profile.viewAllDecks' | translate: { name: profile().displayName } }}
              </a>
            }
          </div>
          <div class="p-3 sm:p-4">
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              @for (deck of publicDecks(); track deck.deckId) {
                <app-public-deck-card [deck]="deck" [showOwner]="false" (selected)="deckSelected.emit($event)" />
              } @empty {
                <p class="text-sm text-base-content/60 col-span-full">{{ 'profile.publicDecksEmpty' | translate }}</p>
              }
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
})
export class ProfileHeroComponent {
  readonly profile = input.required<CommunityProfileEntry>();
  readonly publicDecks = input.required<CommunityPublicDeckEntry[]>();
  readonly deckSelected = output<CommunityPublicDeckEntry>();
}
