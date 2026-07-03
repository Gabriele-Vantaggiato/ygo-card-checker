import { Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';

export type Lang = 'it' | 'en';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly storageKey = 'ygo-checker-lang';
  private readonly dictionaries = new Map<Lang, Record<string, string>>();

  readonly lang = signal<Lang>(this.readStoredLang());

  /** @deprecated Prefer `lang` signal. Kept for RxJS pipelines during migration. */
  readonly lang$ = toObservable(this.lang).pipe(distinctUntilChanged());

  constructor(private readonly http: HttpClient) {}

  init$(): Observable<void> {
    return forkJoin([this.loadDictionary$('it'), this.loadDictionary$('en')]).pipe(
      map(() => undefined),
    );
  }

  setLang(lang: Lang): void {
    if (lang === this.lang()) {
      return;
    }
    this.lang.set(lang);
    localStorage.setItem(this.storageKey, lang);
  }

  translate(key: string, params?: Record<string, string>): string {
    const dict = this.dictionaries.get(this.lang());
    let text = dict?.[key] ?? key;

    if (params) {
      for (const [paramKey, value] of Object.entries(params)) {
        text = text.replace(`{${paramKey}}`, value);
      }
    }

    return text;
  }

  /** @deprecated Prefer the `translate` pipe in templates. */
  t(key: string, params?: Record<string, string>): string {
    return this.translate(key, params);
  }

  private loadDictionary$(lang: Lang): Observable<Record<string, string>> {
    return this.http.get<Record<string, string>>(`/assets/i18n/${lang}.json`).pipe(
      tap((data) => this.dictionaries.set(lang, data)),
    );
  }

  private readStoredLang(): Lang {
    const stored = localStorage.getItem(this.storageKey);
    return stored === 'en' ? 'en' : 'it';
  }
}
