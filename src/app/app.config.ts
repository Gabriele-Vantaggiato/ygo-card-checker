import {
  APP_INITIALIZER,
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { FormatConfigService } from './services/format-config.service';
import { I18nService } from './services/i18n.service';

function initApp(i18n: I18nService, formatConfig: FormatConfigService): () => Promise<void> {
  return () =>
    firstValueFrom(
      
      forkJoin([i18n.init$(), formatConfig.loadFormats$()]).pipe(map(() => undefined)),
    );
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: initApp,
      deps: [I18nService, FormatConfigService],
      multi: true,
    },
  ],
};
