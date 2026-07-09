import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommunityIndexService } from '../services/community-index.service';
import { CommunityProfileEntry, CommunityPublicDeckEntry } from '../models/community.model';
import { PublicDeckCardComponent } from '../components/public-deck-card.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { AuthStore } from '../../auth/stores/auth.store';
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { ToastService } from '../../../services/toast.service';
import { I18nService } from '../../../services/i18n.service';
import { normalizeHandle } from '../services/community-index.service';
import { YdkeExportDialogComponent } from '../../../components/decklist-editor/ydke-dialogs.component';
import { splitDeckIntoYdkeSections } from '../../../services/ydke.service';

type ExploreTab = 'profiles' | 'decks';

@Component({
  selector: 'app-explore-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    PageHeaderComponent,
    PublicDeckCardComponent,
    YdkeExportDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page-main page-stack">
      <app-page-header
        titleKey="community.explore.title"
        [subtitleKey]="subtitleKey()"
      />

      <div class="duel-panel p-3 sm:p-4 space-y-3">
        <label class="form-control">
          <span class="label-text text-xs">{{ 'community.explore.search' | translate }}</span>
          <input
            class="input input-bordered input-sm"
            name="query"
            [(ngModel)]="query"
            (ngModelChange)="onSearch()"
            [placeholder]="'community.explore.searchPlaceholder' | translate"
          />
        </label>

        <div role="tablist" class="tabs tabs-box tabs-sm bg-base-200/80 p-0.5 rounded-lg w-fit">
          <button
            type="button"
            role="tab"
            class="tab text-sm px-3"
            [class.tab-active]="tab() === 'profiles'"
            (click)="setTab('profiles')"
          >
            {{ 'community.explore.tabProfiles' | translate }}
          </button>
          <button
            type="button"
            role="tab"
            class="tab text-sm px-3"
            [class.tab-active]="tab() === 'decks'"
            (click)="setTab('decks')"
          >
            {{ 'community.explore.tabDecks' | translate }}
          </button>
        </div>
      </div>

      @if (tab() === 'profiles') {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          @for (profile of profileResults(); track profile.handle) {
            <a
              class="duel-panel p-4 hover:border-primary/40 transition-colors block"
              [routerLink]="['/community/u', profile.handle]"
            >
              <div class="flex items-center gap-3">
                @if (profile.favoriteCard?.imageUrlSmall; as img) {
                  <img class="h-16 w-11 object-cover rounded" [src]="img" [alt]="" />
                } @else {
                  <div class="h-16 w-11 rounded bg-base-300/40 flex items-center justify-center font-display text-lg">
                    {{ profile.displayName.charAt(0).toUpperCase() }}
                  </div>
                }
                <div class="min-w-0">
                  <p class="font-semibold truncate">{{ profile.displayName }}</p>
                  <p class="text-xs text-primary">@{{ profile.handle }}</p>
                  <p class="text-xs text-base-content/55 mt-1">
                    {{ 'community.explore.deckCount' | translate: { count: '' + profile.publicDeckCount } }}
                  </p>
                </div>
              </div>
            </a>
          } @empty {
            <p class="text-sm text-base-content/60 col-span-full p-4">{{ 'community.explore.profilesEmpty' | translate }}</p>
          }
        </div>
      } @else {
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          @for (deck of deckResults(); track deck.cloudId ?? (deck.ownerHandle + deck.deckId)) {
            <app-public-deck-card [deck]="deck" (selected)="openDeck($event)" />
          } @empty {
            <p class="text-sm text-base-content/60 col-span-full p-4">{{ 'community.explore.decksEmpty' | translate }}</p>
          }
        </div>
      }
    </main>

    <app-ydke-export-dialog
      [open]="ydkeDialogOpen()"
      [url]="ydkeUrl()"
      [hint]="ydkeHint()"
      (closed)="closeYdkeDialog()"
      (copy)="copyYdke()"
    />
  `,
})
export class ExplorePage {
  private readonly community = inject(CommunityIndexService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authStore = inject(AuthStore);
  private readonly decklistStore = inject(DecklistStore);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  query = '';
  readonly tab = signal<ExploreTab>('profiles');
  readonly profileResults = signal<CommunityProfileEntry[]>([]);
  readonly deckResults = signal<CommunityPublicDeckEntry[]>([]);
  readonly ydkeDialogOpen = signal(false);
  readonly ydkeUrl = signal('');
  readonly ydkeHint = signal('');

  readonly subtitleKey = computed(() =>
    this.community.cloudEnabled()
      ? 'community.explore.subtitleCloud'
      : 'community.explore.subtitle',
  );

  constructor() {
    void this.loadIndex();
    const params = this.route.snapshot.queryParamMap;
    const tab = params.get('tab');
    if (tab === 'decks') {
      this.tab.set('decks');
    }
    this.query = params.get('q') ?? '';
  }

  private async loadIndex(): Promise<void> {
    this.community.rebuildFromLocal();
    await this.community.refreshFromCloud();
    this.onSearch();
  }

  setTab(tab: ExploreTab): void {
    this.tab.set(tab);
    this.onSearch();
  }

  onSearch(): void {
    this.profileResults.set(this.community.searchProfiles(this.query));
    this.deckResults.set(this.community.searchPublicDecks(this.query));
  }

  openDeck(deck: CommunityPublicDeckEntry): void {
    const localHandle = this.authStore.handle();
    const isOwnDeck = localHandle && normalizeHandle(localHandle) === deck.ownerHandle && !deck.isRemote;

    if (isOwnDeck) {
      this.decklistStore.setActiveDecklist(deck.deckId);
      void this.router.navigateByUrl('/decklist');
      return;
    }

    const ydke = deck.ydkeUrl ?? this.decklistStore.encodeYdke(deck.deckId);
    if (!ydke) {
      this.toast.info(this.i18n.t('community.explore.deckYdkeMissing'));
      return;
    }

    const sections = splitDeckIntoYdkeSections(
      this.decklistStore.getDeckById(deck.deckId)?.cards ?? [],
    );
    this.ydkeUrl.set(ydke);
    this.ydkeHint.set(
      this.i18n.translate('decklist.ydke.hint', {
        main: `${sections.main.length}`,
        extra: `${sections.extra.length}`,
        side: `${sections.side.length}`,
      }),
    );
    this.ydkeDialogOpen.set(true);
  }

  closeYdkeDialog(): void {
    this.ydkeDialogOpen.set(false);
    this.ydkeUrl.set('');
    this.ydkeHint.set('');
  }

  copyYdke(): void {
    const url = this.ydkeUrl();
    if (!url) {
      return;
    }
    void navigator.clipboard.writeText(url).then(() => {
      this.toast.success(this.i18n.t('decklist.feedback.ydkeCopied'));
    });
  }
}
