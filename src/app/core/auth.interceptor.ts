import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { apiUrl } from './config';

const isAuthEndpoint = (url: string) => /\/auth\/(login|refresh|logout)$/.test(url);

/**
 * Peticiones a la API:
 * - `withCredentials`: necesario cuando la API está en otro origen (Firebase → tickets-api.sivalt.com) para que
 *   el navegador envíe y guarde la cookie HttpOnly de refresco. En mismo origen no cambia nada.
 * - `X-Requested-With`: el backend lo exige en /auth/refresh y /auth/logout (protección CSRF).
 * - Bearer token y, ante un 401, una única renovación de sesión antes de volver al login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const base = apiUrl();

  const withToken = (r: HttpRequest<unknown>) => {
    if (!r.url.startsWith(base)) return r; // nunca enviar credenciales a terceros
    const token = auth.token();
    const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
    if (token && !isAuthEndpoint(r.url)) headers['Authorization'] = `Bearer ${token}`;
    return r.clone({ setHeaders: headers, withCredentials: true });
  };

  return next(withToken(req)).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !isAuthEndpoint(req.url)) {
        return auth.refresh().pipe(
          switchMap(() => next(withToken(req))),
          catchError(() => {
            auth.clearSession();
            void router.navigate(['/login'], { queryParams: { expired: 1 } });
            return throwError(() => err);
          }),
        );
      }
      return throwError(() => err);
    }),
  );
};
