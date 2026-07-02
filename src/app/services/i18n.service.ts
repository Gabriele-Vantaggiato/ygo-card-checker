import { Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, forkJoin } from 'rxjs';
import { map, tap } from 'rxjs/operators';

export type Lang = 'it' | 'en';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly storageKey = 'ygo-checker-lang';
  private readonly dictionaries = new Map<Lang, Record<string, string>>();
  private readonly langSubject = new BehaviorSubject<Lang>(this.readStoredLang());

  readonly lang$ = this.langSubject.asObservable();
  readonly lang = toSignal(this.lang$, { initialValue: this.langSubject.value });

  constructor(private readonly http: HttpClient) {}

  init$(): Observable<void> {
    return forkJoin([this.loadDictionary$('it'), this.loadDictionary$('en')]).pipe(
      map(() => undefined),
    );
  }

  setLang(lang: Lang): void {
    this.langSubject.next(lang);
    localStorage.setItem(this.storageKey, lang);
  }

  translate(key: string, params?: Record<string, string>): string {
    const dict = this.dictionaries.get(this.langSubject.value);
    let text = dict?.[key] ?? key;

    if (params) {
      for (const [paramKey, value] of Object.entries(params)) {
        text = text.replace(`{${paramKey}}`, value);
      }
    }

    return text;
  }

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
