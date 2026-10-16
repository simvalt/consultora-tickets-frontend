import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { Level, ModuleKey } from './models';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).createUrlTree(['/']) : true;
};

/** Exige un nivel mínimo en un módulo; si no lo tiene, muestra «acceso denegado». */
export const permissionGuard =
  (module: ModuleKey, level: number): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    return auth.can(module, level) ? true : inject(Router).createUrlTree(['/forbidden']);
  };

const HOME_ORDER: { module: ModuleKey; path: string }[] = [
  { module: 'dashboard', path: '/dashboard' },
  { module: 'tickets', path: '/tickets' },
  { module: 'clients', path: '/clients' },
  { module: 'users', path: '/users' },
  { module: 'roles', path: '/roles' },
];

/** Redirige «/» a la primera sección a la que el usuario tiene acceso. */
export const homeRedirect: CanActivateFn = (): UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const target = HOME_ORDER.find((h) => auth.can(h.module, Level.Read));
  return router.createUrlTree([target?.path ?? '/forbidden']);
};
