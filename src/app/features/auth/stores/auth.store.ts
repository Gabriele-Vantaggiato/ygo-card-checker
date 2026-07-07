import { Injectable, computed, signal } from '@angular/core';
import type { Session, User } from '@supabase/supabase-js';
import { UserProfile } from '../models/user-profile.model';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  readonly initialized = signal(false);
  readonly loading = signal(false);
  readonly session = signal<Session | null>(null);
  readonly profile = signal<UserProfile | null>(null);

  readonly user = computed((): User | null => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  readonly displayLabel = computed(() => {
    const profile = this.profile();
    if (profile?.displayName) {
      return profile.displayName;
    }
    const user = this.user();
    return user?.user_metadata?.['full_name'] ?? user?.email ?? null;
  });

  readonly avatarUrl = computed(() => {
    const profile = this.profile();
    if (profile?.avatarUrl) {
      return profile.avatarUrl;
    }
    const user = this.user();
    return (user?.user_metadata?.['avatar_url'] as string | undefined) ?? null;
  });

  setSession(session: Session | null): void {
    this.session.set(session);
  }

  setProfile(profile: UserProfile | null): void {
    this.profile.set(profile);
  }

  clear(): void {
    this.session.set(null);
    this.profile.set(null);
  }
}
