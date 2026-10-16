import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard, homeRedirect, permissionGuard } from './guards';
import { Me } from './models';

function setUser(perms: Partial<Me['permissions']> | null) {
  const auth = TestBed.inject(AuthService);
  auth.user.set(
    perms === null
      ? null
      : {
          id: 1,
          email: 'a@b.c',
          full_name: 'A',
          role_id: 1,
          role_name: 'R',
          permissions: { tickets: 0, users: 0, roles: 0, clients: 0, dashboard: 0, ...perms },
        },
  );
}
const run = (guard: typeof authGuard, url = '/x') =>
  TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));

describe('guards', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] }));

  it('authGuard redirige al login conservando la URL', () => {
    setUser(null);
    const r = run(authGuard, '/tickets') as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(r)).toBe('/login?returnUrl=%2Ftickets');
    setUser({});
    expect(run(authGuard)).toBe(true);
  });

  it('permissionGuard aplica la escalera de niveles', () => {
    setUser({ tickets: 2 });
    expect(run(permissionGuard('tickets', 1))).toBe(true);
    expect(run(permissionGuard('tickets', 2))).toBe(true);
    const denied = run(permissionGuard('tickets', 3)) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(denied)).toBe('/forbidden');
    expect(TestBed.inject(Router).serializeUrl(run(permissionGuard('users', 1)) as UrlTree)).toBe('/forbidden');
  });

  it('homeRedirect lleva a la primera sección permitida', () => {
    const router = TestBed.inject(Router);
    setUser({ tickets: 1, clients: 1 });
    expect(router.serializeUrl(run(homeRedirect) as UrlTree)).toBe('/tickets');
    setUser({ dashboard: 1 });
    expect(router.serializeUrl(run(homeRedirect) as UrlTree)).toBe('/dashboard');
    setUser({});
    expect(router.serializeUrl(run(homeRedirect) as UrlTree)).toBe('/forbidden');
  });
});
