import { Injectable, Injector, inject } from '@angular/core';
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { AuthStore } from '../../auth/stores/auth.store';
import { DeckCloudService } from './deck-cloud.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ToastService } from '../../../services/toast.service';
import { I18nService } from '../../../services/i18n.service';
import { mergeDeckStorage } from './deck-sync.merge';

@Injectable({ providedIn: 'root' })
export class DeckSyncService {
  private readonly injector = inject(Injector);
  private readonly supabase = inject(SupabaseService);
  private readonly cloud = inject(DeckCloudService);
  private readonly authStore = inject(AuthStore);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pushing = false;

  enabled(): boolean {
    return this.supabase.enabled();
  }

  schedulePush(): void {
    const userId = this.authStore.user()?.id;
    if (!this.enabled() || !userId || this.decklistStore().syncPaused()) {
      return;
    }

    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
    }

    this.pushTimer = setTimeout(() => {
      void this.pushNow(userId);
    }, 1500);
  }

  async pullAndMerge(): Promise<void> {
    const userId = this.authStore.user()?.id;
    if (!this.enabled() || !userId) {
      return;
    }

    try {
      const local = this.decklistStore().snapshot();
      const remote = await this.cloud.fetchUserDecks(userId);
      const merged = mergeDeckStorage(local, remote);
      this.decklistStore().applyRemoteStorage(merged);
      await this.cloud.upsertUserDecks(userId, merged.decklists);
      this.toast.success(this.i18n.t('community.sync.success'));
    } catch {
      this.toast.error(this.i18n.t('community.sync.error'));
    }
  }

  private async pushNow(userId: string): Promise<void> {
    if (this.pushing) {
      return;
    }

    this.pushing = true;
    try {
      const storage = this.decklistStore().snapshot();
      await this.cloud.upsertUserDecks(userId, storage.decklists);
    } catch {
      this.toast.error(this.i18n.t('community.sync.pushError'));
    } finally {
      this.pushing = false;
    }
  }

  private decklistStore(): DecklistStore {
    return this.injector.get(DecklistStore);
  }
}
