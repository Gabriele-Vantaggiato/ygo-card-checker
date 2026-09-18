import { Injectable } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { supabase } from '../core/supabase-client';

export interface AuthResult {
  ok: boolean;
  errorMessage?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sessionSubject = new BehaviorSubject<Session | null>(null);
  /** Emits the current session, then every change (sign in/out/token refresh). */
  readonly session$: Observable<Session | null> = this.sessionSubject.asObservable();

  constructor() {
    supabase.auth.getSession().then(({ data }) => this.sessionSubject.next(data.session));
    supabase.auth.onAuthStateChange((_event, session) => this.sessionSubject.next(session));
  }

  get currentUser(): User | null {
    return this.sessionSubject.value?.user ?? null;
  }

  isLoggedIn(): boolean {
    return this.sessionSubject.value !== null;
  }

  async signUpWithPassword(email: string, password: string): Promise<AuthResult> {
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? { ok: false, errorMessage: error.message } : { ok: true };
  }

  async signInWithPassword(email: string, password: string): Promise<AuthResult> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { ok: false, errorMessage: error.message } : { ok: true };
  }

  /**
   * Requires the Google provider to be configured in the Supabase dashboard
   * (Authentication > Providers > Google, with a Google Cloud OAuth client
   * id/secret) — that's a one-time manual setup step outside this codebase.
   */
  async signInWithGoogle(): Promise<AuthResult> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return error ? { ok: false, errorMessage: error.message } : { ok: true };
  }

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }
}
