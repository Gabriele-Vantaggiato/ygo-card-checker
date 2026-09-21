import { Injectable, signal } from '@angular/core';

export type AiProvider = 'local' | 'openrouter' | 'gemini' | 'ollama';

export interface AiProviderPreferences {
  provider: AiProvider;
  openRouterModel: string;
  openRouterApiKey: string;
}

const STORAGE_KEY = 'ygo-ai-provider-preferences';
const DEFAULTS: AiProviderPreferences = { provider: 'gemini', openRouterModel: 'openrouter/free', openRouterApiKey: '' };

@Injectable({ providedIn: 'root' })
export class AiProviderPreferencesService {
  readonly preferences = signal<AiProviderPreferences>(this.read());

  update(patch: Partial<AiProviderPreferences>): void {
    const current = this.preferences();
    const next: AiProviderPreferences = {
      provider: patch.provider ?? current.provider,
      openRouterModel: (patch.openRouterModel ?? current.openRouterModel).trim().slice(0, 160) || DEFAULTS.openRouterModel,
      openRouterApiKey: (patch.openRouterApiKey ?? current.openRouterApiKey).trim().slice(0, 300),
    };
    this.preferences.set(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage is optional */ }
  }

  private read(): AiProviderPreferences {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<AiProviderPreferences>;
      const provider = raw.provider === 'openrouter' || raw.provider === 'gemini' || raw.provider === 'ollama' || raw.provider === 'local' ? raw.provider : DEFAULTS.provider;
      return { provider, openRouterModel: typeof raw.openRouterModel === 'string' && raw.openRouterModel.trim() ? raw.openRouterModel.trim().slice(0, 160) : DEFAULTS.openRouterModel, openRouterApiKey: typeof raw.openRouterApiKey === 'string' ? raw.openRouterApiKey.slice(0, 300) : '' };
    } catch { return { ...DEFAULTS }; }
  }
}
