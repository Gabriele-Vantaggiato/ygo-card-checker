import { Injectable } from '@angular/core';
import { EMPTY_LOCAL_PROFILE, LocalProfile } from '../models/local-profile.model';

const STORAGE_KEY = 'ygo-checker-local-profile';

@Injectable({ providedIn: 'root' })
export class LocalProfileService {
  load(): LocalProfile | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as LocalProfile;
      if (!parsed.displayName?.trim()) {
        return null;
      }
      return {
        ...EMPTY_LOCAL_PROFILE,
        ...parsed,
        displayName: parsed.displayName.trim(),
        handle: parsed.handle?.trim() ?? '',
        bio: parsed.bio ?? '',
        favoriteCard: parsed.favoriteCard ?? null,
        tournaments: Array.isArray(parsed.tournaments) ? parsed.tournaments : [],
      };
    } catch {
      return null;
    }
  }

  save(profile: LocalProfile): void {
    const payload: LocalProfile = {
      ...profile,
      displayName: profile.displayName.trim(),
      handle: profile.handle.trim(),
      bio: profile.bio.trim(),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}
