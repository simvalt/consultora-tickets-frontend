import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { ChangePasswordDialog } from '../layout/change-password-dialog';
import { AuthService } from './auth.service';
import { Page } from './models';
import { PagedList } from './paged-list';
import { safeReturnUrl } from './safe-url';

describe('safeReturnUrl (redirección abierta)', () => {
  it.each([
    ['/tickets/5', '/tickets/5'],
    ['/tickets?status=cerrado', '/tickets?status=cerrado'],
    [null, '/'],
    ['', '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeReturnUrl(input)).toBe(expected);
  });
});

describe('PagedList: quitar el orden', () => {
  it('vuelve al orden por defecto del listado', () => {
    const list = new PagedList<number>(
      () => of({ items: [], total: 0, page: 1, page_size: 20, pages: 1 } as Page<number>),
      'created_at',
      'desc',
    );
    list.setSort('title', 'asc');
    expect([list.sort(), list.order()]).toEqual(['title', 'asc']);
    list.setSort('title', '');
    expect([list.sort(), list.order()]).toEqual(['created_at', 'desc']);
  });
});

describe('ChangePasswordDialog', () => {
  let http: HttpTestingController;
  const close = vi.fn();

  beforeEach(() => {
    close.mockReset();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: MatDialogRef, useValue: { close } }],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('valida campos y coincidencia antes de llamar al servidor', () => {
    const dialog = TestBed.createComponent(ChangePasswordDialog).componentInstance;
    dialog.save();
    http.expectNone('/api/auth/change-password');
    dialog.form.setValue({ current_password: 'Actual#12345', new_password: 'Nueva#123456', confirm: 'Otra#1234567' });
    dialog.save();
    expect(dialog.form.hasError('mismatch')).toBe(true);
    http.expectNone('/api/auth/change-password');
    dialog.form.setValue({ current_password: 'Actual#12345', new_password: 'corta', confirm: 'corta' });
    dialog.save();
    http.expectNone('/api/auth/change-password');
  });

  it('envía la petición, aplica la nueva sesión y cierra', () => {
    const dialog = TestBed.createComponent(ChangePasswordDialog).componentInstance;
    dialog.form.setValue({ current_password: 'Actual#12345', new_password: 'Nueva#123456', confirm: 'Nueva#123456' });
    dialog.save();
    const req = http.expectOne('/api/auth/change-password');
    expect(req.request.body).toEqual({ current_password: 'Actual#12345', new_password: 'Nueva#123456' });
    req.flush({
      access_token: 'nuevo',
      token_type: 'bearer',
      expires_in: 900,
      user: {
        id: 1,
        email: 'a@b.c',
        full_name: 'A',
        role_id: 1,
        role_name: 'R',
        permissions: { tickets: 1, users: 0, roles: 0, clients: 0, dashboard: 0 },
      },
    });
    expect(TestBed.inject(AuthService).token()).toBe('nuevo');
    expect(close).toHaveBeenCalledWith(true);
  });

  it('muestra el error del servidor (contraseña actual incorrecta)', () => {
    const dialog = TestBed.createComponent(ChangePasswordDialog).componentInstance;
    dialog.form.setValue({ current_password: 'mala', new_password: 'Nueva#123456', confirm: 'Nueva#123456' });
    dialog.save();
    http
      .expectOne('/api/auth/change-password')
      .flush(
        { error: { code: 'invalid_current_password', message: 'La contraseña actual no es correcta.' } },
        { status: 400, statusText: 'x' },
      );
    expect(dialog.error()).toBe('La contraseña actual no es correcta.');
    expect(close).not.toHaveBeenCalled();
  });
});
