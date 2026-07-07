import { Injectable, computed, signal } from '@angular/core';
import type { Session, User } from '@supabase/supabase-js';
import { LocalProfile } from '../models/local-profile.model';
import { UserProfile } from '../models/user-profile.model';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  readonly initialized = signal(false);
  readonly loading = signal(false);
  readonly session = signal<Session | null>(null);
  readonly profile = signal<UserProfile | null>(null);
  readonly localProfile = signal<LocalProfile | null>(null);

  readonly user = computed((): User | null => this.session()?.user ?? null);
  readonly isCloudAuthenticated = computed(() => this.session() !== null);
  readonly isLocalAuthenticated = computed(() => this.localProfile() !== null);
  readonly isAuthenticated = computed(
    () => this.isCloudAuthenticated() || this.isLocalAuthenticated(),
  );

  readonly displayLabel = computed(() => {
    const local = this.localProfile();
    if (local?.displayName) {
      return local.displayName;
    }
    const profile = this.profile();
    if (profile?.displayName) {
      return profile.displayName;
    }
    const user = this.user();
    return user?.user_metadata?.['full_name'] ?? user?.email ?? null;
  });

  readonly avatarUrl = computed(() => {
    const local = this.localProfile();
    if (local?.favoriteCard?.imageUrlSmall) {
      return local.favoriteCard.imageUrlSmall;
    }
    if (local?.avatarUrl) {
      return local.avatarUrl;
    }
    const profile = this.profile();
    if (profile?.avatarUrl) {
      return profile.avatarUrl;
    }
    const user = this.user();
    return (user?.user_metadata?.['avatar_url'] as string | undefined) ?? null;
  });

  readonly handle = computed(() => {
    const local = this.localProfile();
    if (local?.handle) {
      return local.handle;
    }
    return this.profile()?.handle ?? null;
  });

  setSession(session: Session | null): void {
    this.session.set(session);
  }

  setProfile(profile: UserProfile | null): void {
    this.profile.set(profile);
  }

  setLocalProfile(profile: LocalProfile | null): void {
    this.localProfile.set(profile);
  }

  clear(): void {
    this.session.set(null);
    this.profile.set(null);
    this.localProfile.set(null);
  }

  clearLocal(): void {
    this.localProfile.set(null);
  }
}
