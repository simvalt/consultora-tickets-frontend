import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeEs from '@angular/common/locales/es';
import {
  ApplicationConfig,
  LOCALE_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  inject,
} from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { AuthService } from './core/auth.service';
import { spanishPaginatorIntl } from './shared/paginator-intl';
import { provideSpanishDates } from './core/date-adapter';

registerLocaleData(localeEs, 'es');

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Transición entre vistas: sólo el contenido (view-transition-name en .content); respeta «reducir movimiento».
    provideRouter(routes, withComponentInputBinding(), withViewTransitions({ skipInitialTransition: true })),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: LOCALE_ID, useValue: 'es' },
    { provide: MatPaginatorIntl, useFactory: spanishPaginatorIntl },
    ...provideSpanishDates(),
    // Iconos de línea (Material Icons Outlined, autoalojados) en toda la aplicación.
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-icons-outlined', 'mat-ligature-font');
    }),
    // Intenta restaurar la sesión con la cookie de refresco antes de resolver las rutas.
    provideAppInitializer(() => firstValueFrom(inject(AuthService).restore())),
  ],
};
