import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/services/auth.service';
import { AuthStore } from '../../auth/stores/auth.store';
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { FormatStore } from '../../../core/stores/format.store';
import { I18nService } from '../../../services/i18n.service';
import { ToastService } from '../../../services/toast.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { DuelPanelComponent } from '../../../shared/ui/duel-panel/duel-panel.component';
import { FavoriteCardRef, TournamentEntry } from '../../community/models/community.model';
import { CommunityIndexService, normalizeHandle } from '../../community/services/community-index.service';
import { ProfileHeroComponent } from '../../community/components/profile-hero.component';
import { FavoriteCardPickerComponent } from '../../community/components/favorite-card-picker.component';
import { CommunityPublicDeckEntry } from '../../community/models/community.model';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    PageHeaderComponent,
    DuelPanelComponent,
    ProfileHeroComponent,
    FavoriteCardPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page-main page-stack">
      <app-page-header titleKey="profile.title" [subtitleKey]="auth.enabled() ? 'profile.subtitleCloud' : 'profile.subtitleLocal'">
        @if (hasPreview()) {
          <button type="button" class="btn btn-ghost btn-sm" (click)="editing.set(!editing())">
            {{ (editing() ? 'profile.preview' : 'profile.edit') | translate }}
          </button>
        }
      </app-page-header>

      @if (hasPreview() && !editing()) {
        <app-profile-hero
          [profile]="previewProfile()!"
          [publicDecks]="previewDecks()"
          (deckSelected)="openDeck($event)"
        />
      }

      @if (!hasPreview() || editing()) {
        <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-start">
          <app-duel-panel [title]="'profile.section.identity' | translate">
            <div class="p-3 sm:p-4 space-y-3">
              @if (!auth.enabled()) {
                <p class="text-xs text-base-content/60 leading-relaxed">{{ 'profile.localHint' | translate }}</p>
              }

              <label class="form-control">
                <span class="label-text text-xs">{{ 'profile.displayName' | translate }}</span>
                <input class="input input-bordered input-sm" name="displayName" [(ngModel)]="displayName" />
              </label>

              <label class="form-control">
                <span class="label-text text-xs">{{ 'profile.handle' | translate }}</span>
                <input
                  class="input input-bordered input-sm"
                  name="handle"
                  [(ngModel)]="handle"
                  [placeholder]="'profile.handlePlaceholder' | translate"
                />
              </label>

              <label class="form-control">
                <span class="label-text text-xs">{{ 'profile.bio' | translate }}</span>
                <textarea class="textarea textarea-bordered textarea-sm min-h-20" name="bio" [(ngModel)]="bio"></textarea>
              </label>

              <app-favorite-card-picker [value]="favoriteCard" (valueChange)="favoriteCard = $event" />

              <div class="flex flex-wrap gap-2 pt-1">
                <button type="button" class="btn btn-primary btn-sm" (click)="save()">
                  {{ 'profile.save' | translate }}
                </button>
                @if (store.isAuthenticated()) {
                  <button type="button" class="btn btn-ghost btn-sm" (click)="signOut()">
                    {{ 'auth.signOut' | translate }}
                  </button>
                }
              </div>
            </div>
          </app-duel-panel>

          <div class="space-y-4">
            <app-duel-panel [title]="'profile.section.decks' | translate">
              <div class="p-3 sm:p-4 space-y-2">
                @for (deck of decklistStore.decklists(); track deck.id) {
                  <div class="flex items-center gap-2 rounded-lg border border-base-300/60 px-3 py-2">
                    <button
                      type="button"
                      class="flex-1 min-w-0 text-left hover:opacity-80"
                      (click)="openDeckById(deck.id)"
                    >
                      <span class="font-medium text-sm truncate block">{{ deck.name }}</span>
                      <span class="text-xs text-base-content/55 tabular-nums">{{ deckSummary(deck.id) }}</span>
                    </button>
                    <label class="label cursor-pointer gap-1.5 shrink-0 py-0">
                      <span class="label-text text-xs">{{ 'profile.deckPublic' | translate }}</span>
                      <input
                        type="checkbox"
                        class="toggle toggle-primary toggle-xs"
                        [checked]="decklistStore.isDeckPublic(deck.id)"
                        (change)="togglePublic(deck.id, $any($event.target).checked)"
                      />
                    </label>
                  </div>
                } @empty {
                  <p class="text-sm text-base-content/60">{{ 'profile.decksEmpty' | translate }}</p>
                }
              </div>
            </app-duel-panel>

            <app-duel-panel [title]="'profile.section.tournaments' | translate">
              <div class="p-3 sm:p-4 space-y-3">
                @for (event of tournaments; track event.id) {
                  <div class="flex items-start justify-between gap-2 rounded-lg border border-base-300/50 px-3 py-2">
                    <div class="min-w-0">
                      <p class="font-medium text-sm">{{ event.name }}</p>
                      <p class="text-xs text-base-content/60">
                        {{ event.eventDate }} · {{ event.formatLabel }}
                        @if (event.placement) {
                          · {{ event.placement }}
                        }
                      </p>
                    </div>
                    <button type="button" class="btn btn-ghost btn-xs shrink-0" (click)="removeTournament(event.id)">
                      {{ 'profile.tournamentRemove' | translate }}
                    </button>
                  </div>
                }

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-base-300/40">
                  <input class="input input-bordered input-sm" [(ngModel)]="newTournamentName" [placeholder]="'profile.tournamentName' | translate" />
                  <input class="input input-bordered input-sm" type="date" [(ngModel)]="newTournamentDate" />
                  <input class="input input-bordered input-sm" [(ngModel)]="newTournamentFormat" [placeholder]="'profile.tournamentFormat' | translate" />
                  <input class="input input-bordered input-sm" [(ngModel)]="newTournamentPlacement" [placeholder]="'profile.tournamentPlacement' | translate" />
                </div>
                <button type="button" class="btn btn-outline btn-sm" (click)="addTournament()">
                  {{ 'profile.tournamentAdd' | translate }}
                </button>
              </div>
            </app-duel-panel>

            @if (hasPreview()) {
              <a class="btn btn-link btn-sm px-0" routerLink="/community">
                {{ 'profile.openExplore' | translate }}
              </a>
            }
          </div>
        </div>
      }
    </main>
  `,
})
export class ProfilePage {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(AuthStore);
  protected readonly decklistStore = inject(DecklistStore);
  protected readonly formatStore = inject(FormatStore);
  private readonly community = inject(CommunityIndexService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);

  readonly editing = signal(false);

  displayName = '';
  handle = '';
  bio = '';
  favoriteCard: FavoriteCardRef | null = null;
  tournaments: TournamentEntry[] = [];

  newTournamentName = '';
  newTournamentDate = '';
  newTournamentFormat = '';
  newTournamentPlacement = '';

  readonly hasPreview = computed(() => {
    const local = this.store.localProfile();
    return Boolean(local?.displayName?.trim() && local?.handle?.trim());
  });

  readonly previewProfile = computed(() => {
    this.community.rebuildFromLocal();
    const handle = this.store.handle();
    return handle ? this.community.profileByHandle(handle) : null;
  });

  readonly previewDecks = computed((): CommunityPublicDeckEntry[] => {
    const handle = this.store.handle();
    return handle ? this.community.publicDecksByHandle(normalizeHandle(handle)) : [];
  });

  constructor() {
    const existing = this.store.localProfile();
    if (existing) {
      this.displayName = existing.displayName;
      this.handle = existing.handle;
      this.bio = existing.bio;
      this.favoriteCard = existing.favoriteCard;
      this.tournaments = [...existing.tournaments];
    } else if (this.store.displayLabel()) {
      this.displayName = this.store.displayLabel() ?? '';
      this.handle = this.store.handle() ?? '';
    }
    this.community.rebuildFromLocal();
  }

  save(): void {
    if (!this.displayName.trim() || !this.handle.trim()) {
      this.toast.info(this.i18n.t('profile.handleRequired'));
      return;
    }
    this.auth.saveLocalProfile({
      displayName: this.displayName,
      handle: this.handle,
      bio: this.bio,
      avatarUrl: null,
      favoriteCard: this.favoriteCard,
      tournaments: this.tournaments,
      updatedAt: new Date().toISOString(),
    });
    this.editing.set(false);
    this.toast.success(this.i18n.t('profile.saved'));
  }

  signOut(): void {
    void this.auth.signOut();
    void this.router.navigateByUrl('/');
  }

  openDeckById(deckId: string): void {
    this.decklistStore.setActiveDecklist(deckId);
    void this.router.navigateByUrl('/decklist');
  }

  openDeck(deck: CommunityPublicDeckEntry): void {
    this.openDeckById(deck.deckId);
  }

  togglePublic(deckId: string, isPublic: boolean): void {
    this.decklistStore.setDeckPublic(deckId, isPublic);
  }

  deckSummary(deckId: string): string {
    const total = this.decklistStore.totalCardsForDeck(deckId);
    const format = this.formatStore.selectedFormat()?.name[this.i18n.lang()] ?? '—';
    return this.i18n.t('decklist.tile.subtitle', { count: `${total}`, format });
  }

  addTournament(): void {
    if (!this.newTournamentName.trim()) {
      return;
    }
    this.tournaments = [
      ...this.tournaments,
      {
        id: crypto.randomUUID(),
        name: this.newTournamentName.trim(),
        eventDate: this.newTournamentDate || '—',
        formatLabel: this.newTournamentFormat.trim() || '—',
        placement: this.newTournamentPlacement.trim(),
      },
    ];
    this.newTournamentName = '';
    this.newTournamentDate = '';
    this.newTournamentFormat = '';
    this.newTournamentPlacement = '';
  }

  removeTournament(id: string): void {
    this.tournaments = this.tournaments.filter((item) => item.id !== id);
  }
}
