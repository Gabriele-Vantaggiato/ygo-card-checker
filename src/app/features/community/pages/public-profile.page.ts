import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommunityIndexService, normalizeHandle } from '../services/community-index.service';
import { ProfileHeroComponent } from '../components/profile-hero.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { AuthStore } from '../../auth/stores/auth.store';
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { ToastService } from '../../../services/toast.service';
import { I18nService } from '../../../services/i18n.service';
import { CommunityPublicDeckEntry } from '../models/community.model';

@Component({
  selector: 'app-public-profile-page',
  standalone: true,
  imports: [PageHeaderComponent, ProfileHeroComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page-main page-stack">
      @if (profile(); as entry) {
        <header class="page-header">
          <h1 class="page-title">{{ entry.displayName }}</h1>
          <p class="page-subtitle">@{{ entry.handle }}</p>
        </header>
        <app-profile-hero
          [profile]="entry"
          [publicDecks]="publicDecks()"
          (deckSelected)="openDeck($event)"
        />
      } @else {
        <app-page-header titleKey="community.profile.notFound" subtitleKey="community.profile.notFoundHint" />
      }
    </main>
  `,
})
export class PublicProfilePage {
  private readonly route = inject(ActivatedRoute);
  private readonly community = inject(CommunityIndexService);
  private readonly router = inject(Router);
  private readonly authStore = inject(AuthStore);
  private readonly decklistStore = inject(DecklistStore);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  private readonly handle = computed(() => this.route.snapshot.paramMap.get('handle') ?? '');

  readonly profile = computed(() => {
    this.community.rebuildFromLocal();
    const handle = this.handle();
    return handle ? this.community.profileByHandle(handle) : null;
  });

  readonly publicDecks = computed(() => {
    const handle = this.handle();
    return handle ? this.community.publicDecksByHandle(handle) : [];
  });

  openDeck(deck: CommunityPublicDeckEntry): void {
    const localHandle = this.authStore.handle();
    if (!localHandle || normalizeHandle(localHandle) !== deck.ownerHandle) {
      this.toast.info(this.i18n.t('community.explore.deckLocalOnly'));
      return;
    }
    this.decklistStore.setActiveDecklist(deck.deckId);
    void this.router.navigateByUrl('/decklist');
  }
}
