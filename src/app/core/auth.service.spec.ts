import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api } from './api';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { Me, TokenResponse } from './models';

const me: Me = {
  id: 1,
  email: 'a@b.c',
  full_name: 'Ana',
  role_id: 1,
  role_name: 'Agente',
  permissions: { tickets: 3, users: 0, roles: 0, clients: 1, dashboard: 1 },
};
const token = (t: string): TokenResponse => ({ access_token: t, token_type: 'bearer', expires_in: 900, user: me });

describe('AuthService', () => {
  let http: HttpTestingController;
  let auth: AuthService;
  let api: Api;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'login', children: [] }]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    api = TestBed.inject(Api);
  });
  afterEach(() => http.verify());

  it('guarda usuario y token tras el login y calcula permisos acumulativos', () => {
    auth.login('a@b.c', 'x').subscribe();
    http.expectOne('/api/auth/login').flush(token('t1'));
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.token()).toBe('t1');
    expect(auth.can('tickets', 1)).toBe(true);
    expect(auth.can('tickets', 3)).toBe(true);
    expect(auth.can('tickets', 4)).toBe(false);
    expect(auth.can('users', 1)).toBe(false);
    expect(auth.can('clients', 2)).toBe(false);
  });

  it('el cierre de sesión limpia el estado aunque el servidor falle', () => {
    auth.login('a@b.c', 'x').subscribe();
    http.expectOne('/api/auth/login').flush(token('t1'));
    auth.logout().subscribe();
    http.expectOne('/api/auth/logout').flush({}, { status: 500, statusText: 'err' });
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.token()).toBeNull();
  });

  it('restore() devuelve false si no hay cookie de refresco válida', () => {
    let result: boolean | undefined;
    auth.restore().subscribe((r) => (result = r));
    http.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'no' });
    expect(result).toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('envía el Bearer y, ante un 401, renueva una sola vez y reintenta', () => {
    auth.login('a@b.c', 'x').subscribe();
    http.expectOne('/api/auth/login').flush(token('viejo'));

    let body: unknown;
    api.get('/tickets').subscribe((r) => (body = r));
    const first = http.expectOne('/api/tickets');
    expect(first.request.headers.get('Authorization')).toBe('Bearer viejo');
    first.flush({}, { status: 401, statusText: 'expired' });

    http.expectOne('/api/auth/refresh').flush(token('nuevo'));
    const retry = http.expectOne('/api/tickets');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer nuevo');
    retry.flush({ ok: true });
    expect(body).toEqual({ ok: true });
  });

  it('si la renovación falla, cierra la sesión y propaga el error', () => {
    auth.login('a@b.c', 'x').subscribe();
    http.expectOne('/api/auth/login').flush(token('viejo'));
    let status: number | undefined;
    api.get('/tickets').subscribe({ error: (e) => (status = e.status) });
    http.expectOne('/api/tickets').flush({}, { status: 401, statusText: 'expired' });
    http.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'no' });
    expect(status).toBe(401);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('marca las peticiones a la API (credenciales y X-Requested-With) pero no las de terceros', () => {
    auth.refresh().subscribe({ error: () => undefined });
    const refresh = http.expectOne('/api/auth/refresh');
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    refresh.flush({}, { status: 401, statusText: 'no' });

    TestBed.inject(HttpClient).get('https://otro.example/datos').subscribe();
    const ext = http.expectOne('https://otro.example/datos');
    expect(ext.request.withCredentials).toBe(false);
    expect(ext.request.headers.has('X-Requested-With')).toBe(false);
    expect(ext.request.headers.has('Authorization')).toBe(false);
    ext.flush({});
  });

  it('un 401 en /auth/login no intenta renovar', () => {
    let status: number | undefined;
    auth.login('a@b.c', 'mal').subscribe({ error: (e) => (status = e.status) });
    http
      .expectOne('/api/auth/login')
      .flush({ error: { code: 'invalid_credentials', message: 'x' } }, { status: 401, statusText: 'no' });
    expect(status).toBe(401);
  });
});
