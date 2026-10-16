import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const isAuthEndpoint = (url: string) => /\/auth\/(login|refresh|logout)$/.test(url);

/** Añade el Bearer token y, ante un 401, intenta renovar la sesión una vez antes de cerrar sesión. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const withToken = (r: HttpRequest<unknown>) => {
    const token = auth.token();
    return token && !isAuthEndpoint(r.url) ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : r;
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
