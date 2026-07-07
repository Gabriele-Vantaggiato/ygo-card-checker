import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { communityConfig, isCommunityEnabled } from '../config/community.config';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private client: SupabaseClient | null = null;

  enabled(): boolean {
    return isCommunityEnabled();
  }

  getClient(): SupabaseClient | null {
    if (!this.enabled()) {
      return null;
    }
    if (!this.client) {
      this.client = createClient(communityConfig.supabaseUrl, communityConfig.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }
    return this.client;
  }
}
