import { Injectable, inject } from '@angular/core';
import type { AuthChangeEvent, Provider, Session } from '@supabase/supabase-js';
import { SupabaseService } from '../../../core/services/supabase.service';
import { UserProfile } from '../models/user-profile.model';
import { AuthStore } from '../stores/auth.store';
import { DeckSyncService } from '../../community/services/deck-sync.service';

type OAuthProvider = Extract<Provider, 'google' | 'discord'>;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly store = inject(AuthStore);
  private readonly deckSync = inject(DeckSyncService);

  enabled(): boolean {
    return this.supabase.enabled();
  }

  async init(): Promise<void> {
    if (!this.enabled()) {
      this.store.initialized.set(true);
      return;
    }

    const client = this.supabase.getClient();
    if (!client) {
      this.store.initialized.set(true);
      return;
    }

    const { data } = await client.auth.getSession();
    await this.applySession(data.session);

    client.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      void this.applySession(session);
    });

    this.store.initialized.set(true);
  }

  async signInWithProvider(provider: OAuthProvider): Promise<void> {
    const client = this.supabase.getClient();
    if (!client) {
      return;
    }

    this.store.loading.set(true);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    this.store.loading.set(false);

    if (error) {
      throw error;
    }
  }

  async signOut(): Promise<void> {
    const client = this.supabase.getClient();
    if (!client) {
      return;
    }

    this.store.loading.set(true);
    const { error } = await client.auth.signOut();
    this.store.loading.set(false);

    if (error) {
      throw error;
    }

    this.store.clear();
  }

  async handleAuthCallback(): Promise<void> {
    const client = this.supabase.getClient();
    if (!client) {
      return;
    }

    const { data, error } = await client.auth.getSession();
    if (error) {
      throw error;
    }
    await this.applySession(data.session);
  }

  private async applySession(session: Session | null): Promise<void> {
    this.store.setSession(session);
    if (!session?.user) {
      this.store.setProfile(null);
      return;
    }

    await this.ensureProfile(session.user.id, session.user.user_metadata);
    await this.loadProfile(session.user.id);
    await this.deckSync.pullAndMerge();
  }

  private async ensureProfile(
    userId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const client = this.supabase.getClient();
    if (!client) {
      return;
    }

    const displayName =
      (typeof metadata['full_name'] === 'string' && metadata['full_name']) ||
      (typeof metadata['name'] === 'string' && metadata['name']) ||
      null;
    const avatarUrl =
      (typeof metadata['avatar_url'] === 'string' && metadata['avatar_url']) ||
      (typeof metadata['picture'] === 'string' && metadata['picture']) ||
      null;

    await client.from('profiles').upsert(
      {
        id: userId,
        display_name: displayName,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
  }

  private async loadProfile(userId: string): Promise<void> {
    const client = this.supabase.getClient();
    if (!client) {
      return;
    }

    const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error || !data) {
      this.store.setProfile(null);
      return;
    }

    this.store.setProfile(mapProfileRow(data));
  }
}

function mapProfileRow(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row['id']),
    handle: typeof row['handle'] === 'string' ? row['handle'] : null,
    displayName: typeof row['display_name'] === 'string' ? row['display_name'] : null,
    avatarUrl: typeof row['avatar_url'] === 'string' ? row['avatar_url'] : null,
    bio: typeof row['bio'] === 'string' ? row['bio'] : null,
    createdAt: String(row['created_at'] ?? ''),
    updatedAt: String(row['updated_at'] ?? ''),
  };
}
