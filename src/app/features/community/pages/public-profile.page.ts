import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommunityIndexService, normalizeHandle } from '../services/community-index.service';
import { ProfileHeroComponent } from '../components/profile-hero.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { AuthStore } from '../../auth/stores/auth.store';
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { ToastService } from '../../../services/toast.service';
import { I18nService } from '../../../services/i18n.service';
import { CommunityPublicDeckEntry } from '../models/community.model';
import { YdkeExportDialogComponent } from '../../../components/decklist-editor/ydke-dialogs.component';
import { splitDeckIntoYdkeSections } from '../../../services/ydke.service';

@Component({
  selector: 'app-public-profile-page',
  standalone: true,
  imports: [PageHeaderComponent, ProfileHeroComponent, YdkeExportDialogComponent],
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

    <app-ydke-export-dialog
      [open]="ydkeDialogOpen()"
      [url]="ydkeUrl()"
      [hint]="ydkeHint()"
      (closed)="closeYdkeDialog()"
      (copy)="copyYdke()"
    />
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

  readonly ydkeDialogOpen = signal(false);
  readonly ydkeUrl = signal('');
  readonly ydkeHint = signal('');
  readonly loaded = signal(false);

  private readonly handle = computed(() => this.route.snapshot.paramMap.get('handle') ?? '');

  readonly profile = computed(() => {
    if (!this.loaded()) {
      return null;
    }
    const handle = this.handle();
    return handle ? this.community.profileByHandle(handle) : null;
  });

  readonly publicDecks = computed(() => {
    if (!this.loaded()) {
      return [];
    }
    const handle = this.handle();
    return handle ? this.community.publicDecksByHandle(handle) : [];
  });

  constructor() {
    void this.loadIndex();
  }

  private async loadIndex(): Promise<void> {
    this.community.rebuildFromLocal();
    await this.community.refreshFromCloud();
    this.loaded.set(true);
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
