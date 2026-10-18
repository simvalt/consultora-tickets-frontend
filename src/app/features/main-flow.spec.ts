/**
 * Flujo principal a nivel de componentes con el backend simulado (HttpTestingController):
 * login → crear ticket → asignar → cambiar estatus → cerrar (con las validaciones de la interfaz).
 * El flujo completo contra el sistema real está en e2e/main-flow.spec.ts (Playwright).
 */
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { EMPTY, of } from 'rxjs';
import { authInterceptor } from '../core/auth.interceptor';
import { AuthService } from '../core/auth.service';
import { Me, TicketDetail } from '../core/models';
import { Login } from './login/login';
import { AssignDialog, StatusDialog } from './tickets/ticket-dialogs';
import { TicketDetailPage } from './tickets/ticket-detail';
import { TicketForm } from './tickets/ticket-form';
import { provideSpanishDates } from '../core/date-adapter';

const admin: Me = {
  id: 1,
  email: 'admin@x.y',
  full_name: 'Admin',
  role_id: 1,
  role_name: 'Administrador',
  permissions: { tickets: 4, users: 4, roles: 4, clients: 4, dashboard: 4 },
};

const ticket = (over: Partial<TicketDetail> = {}): TicketDetail => ({
  id: 7,
  folio: 'TCK-000007',
  title: 'Falla',
  description: '',
  client_id: 1,
  client_name: 'Acme',
  category_id: 1,
  category_name: 'Incidente',
  priority: 'media',
  status: 'sin_inicio',
  created_by: 1,
  created_by_name: 'Admin',
  assignee_id: null,
  assignee_name: null,
  resolution: null,
  created_at: '2030-01-01T00:00:00Z',
  updated_at: '2030-01-01T00:00:00Z',
  started_at: null,
  closed_at: null,
  due_at: null,
  is_overdue: false,
  allowed_transitions: ['iniciado', 'cancelado', 'rechazado'],
  ...over,
});

describe('flujo principal', () => {
  let http: HttpTestingController;
  let dialogData: unknown;
  const close = vi.fn();

  beforeEach(() => {
    close.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: MAT_DIALOG_DATA, useFactory: () => dialogData },
        { provide: MatDialogRef, useValue: { close: (r: unknown) => close(r) } },
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        ...provideSpanishDates(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('login: valida el formulario y abre la sesión', async () => {
    const fixture = TestBed.createComponent(Login);
    const login = fixture.componentInstance;
    login.submit();
    http.expectNone('/api/auth/login'); // formulario vacío: no se envía

    login.form.setValue({ email: 'admin@x.y', password: 'secreta' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    login.submit();
    const req = http.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({ email: 'admin@x.y', password: 'secreta' });
    req.flush({ access_token: 't', token_type: 'bearer', expires_in: 900, user: admin });
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('login: muestra el error del servidor sin abrir sesión', () => {
    const login = TestBed.createComponent(Login).componentInstance;
    login.form.setValue({ email: 'admin@x.y', password: 'mala' });
    login.submit();
    http
      .expectOne('/api/auth/login')
      .flush(
        { error: { code: 'invalid_credentials', message: 'Correo o contraseña incorrectos.' } },
        { status: 401, statusText: 'x' },
      );
    expect(login.error()).toBe('Correo o contraseña incorrectos.');
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
  });

  it('crear ticket: exige campos obligatorios y envía el cuerpo esperado', () => {
    TestBed.inject(AuthService).user.set(admin);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(TicketForm);
    fixture.detectChanges();
    http.expectOne('/api/lookups/clients').flush([{ id: 1, name: 'Acme' }]);
    http.expectOne('/api/meta').flush({ categories: [{ id: 1, name: 'Incidente' }] });
    http.expectOne('/api/lookups/assignees').flush([{ id: 2, name: 'Agente Uno' }]);
    const form = fixture.componentInstance;

    form.save();
    http.expectNone('/api/tickets');
    expect(form.form.controls.title.touched).toBe(true);

    form.form.patchValue({
      title: '  Servidor caído ',
      description: 'Detalle',
      client_id: 1,
      category_id: 1,
      priority: 'alta',
      assignee_id: 2,
    });
    form.save();
    const req = http.expectOne('/api/tickets');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({
      title: 'Servidor caído',
      client_id: 1,
      category_id: 1,
      priority: 'alta',
      assignee_id: 2,
      due_at: null,
    });
    req.flush(ticket({ id: 9, folio: 'TCK-000009' }));
    expect(navigate).toHaveBeenCalledWith(['/tickets', 9]);
  });

  it('asignar: envía el responsable elegido', () => {
    TestBed.inject(AuthService).user.set(admin);
    dialogData = { ticket: ticket() };
    const fixture = TestBed.createComponent(AssignDialog);
    http.expectOne('/api/lookups/assignees').flush([{ id: 2, name: 'Agente Uno' }]);
    fixture.componentInstance.form.setValue({ assignee_id: 2 });
    fixture.componentInstance.save();
    const req = http.expectOne('/api/tickets/7/assign');
    expect(req.request.body).toEqual({ assignee_id: 2 });
    req.flush(ticket({ assignee_id: 2, assignee_name: 'Agente Uno' }));
    expect(close).toHaveBeenCalled();
  });

  it('editar espera la carga antes de permitir escribir y conserva el cambio del usuario', () => {
    TestBed.inject(AuthService).user.set(admin);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(TicketForm);
    fixture.componentRef.setInput('id', '7');
    fixture.detectChanges();
    http.expectOne('/api/lookups/clients').flush([{ id: 1, name: 'Acme' }]);
    http.expectOne('/api/meta').flush({ categories: [{ id: 1, name: 'Incidente' }] });
    http.expectOne('/api/lookups/assignees').flush([]);
    expect(fixture.nativeElement.querySelector('[data-testid="title"]')).toBeNull();
    http.expectOne('/api/tickets/7').flush(ticket());
    fixture.detectChanges();
    const title: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="title"]');
    title.value = 'Titulo editado';
    title.dispatchEvent(new Event('input'));
    fixture.componentInstance.save();
    const request = http.expectOne('/api/tickets/7');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body.title).toBe('Titulo editado');
    request.flush(ticket({ title: 'Titulo editado' }));
  });

  it('espera el refresco para abrir otro cambio de estatus con las transiciones actuales', () => {
    TestBed.inject(AuthService).user.set(admin);
    const fixture = TestBed.createComponent(TicketDetailPage);
    fixture.componentRef.setInput('id', '7');
    fixture.detectChanges();
    const flushDetail = (detail: TicketDetail) => {
      http.expectOne('/api/tickets/7').flush(detail);
      http.expectOne('/api/tickets/7/comments').flush([]);
      http.expectOne('/api/tickets/7/events').flush([]);
      fixture.detectChanges();
    };
    flushDetail(ticket());
    const updated = ticket({
      status: 'iniciado',
      assignee_id: 2,
      allowed_transitions: ['en_proceso', 'pendiente', 'cancelado'],
    });
    const open = vi
      .spyOn(TestBed.inject(MatDialog), 'open')
      .mockReturnValue({ afterClosed: () => of(updated) } as MatDialogRef<unknown>);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="change-status"]');
    button.click();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    button.click();
    expect(open).toHaveBeenCalledTimes(1);
    flushDetail(updated);
    expect(button.disabled).toBe(false);
    open.mockReturnValue({ afterClosed: () => EMPTY } as unknown as MatDialogRef<unknown>);
    button.click();
    const config = open.mock.lastCall?.[1] as { data: { ticket: TicketDetail } };
    expect(config.data.ticket.allowed_transitions).toContain('en_proceso');
  });

  function statusDialog(t: TicketDetail) {
    TestBed.inject(AuthService).user.set(admin);
    dialogData = { ticket: t };
    const fixture = TestBed.createComponent(StatusDialog);
    http.expectOne('/api/lookups/assignees').flush([{ id: 2, name: 'Agente Uno' }]);
    return { dialog: fixture.componentInstance };
  }

  it('estatus: iniciar sin responsable pide elegir uno', () => {
    const { dialog } = statusDialog(ticket());
    dialog.form.controls.status.setValue('iniciado');
    expect(dialog.needsAssignee()).toBe(true);
    dialog.save();
    http.expectNone('/api/tickets/7/status');
    dialog.form.controls.assignee_id.setValue(2);
    dialog.save();
    const req = http.expectOne('/api/tickets/7/status');
    expect(req.request.body).toEqual({ status: 'iniciado', assignee_id: 2 });
    req.flush(ticket({ status: 'iniciado', assignee_id: 2 }));
  });

  it('estatus: pendiente exige motivo y cerrar exige resumen de resolución', () => {
    const { dialog } = statusDialog(
      ticket({ status: 'en_proceso', assignee_id: 2, allowed_transitions: ['pendiente', 'cerrado', 'cancelado'] }),
    );
    dialog.form.controls.status.setValue('pendiente');
    expect(dialog.needsReason()).toBe(true);
    dialog.save();
    http.expectNone('/api/tickets/7/status');
    dialog.form.controls.reason.setValue('Esperando al cliente');
    dialog.save();
    http.expectOne('/api/tickets/7/status').flush(ticket({ status: 'pendiente', assignee_id: 2 }));
    dialog.save(); // un segundo clic mientras se cierra el diálogo no vuelve a enviar
    http.expectNone('/api/tickets/7/status');

    // el diálogo se cierra tras guardar: el siguiente cambio abre uno nuevo
    const { dialog: next } = statusDialog(
      ticket({ status: 'pendiente', assignee_id: 2, allowed_transitions: ['en_proceso', 'cerrado', 'cancelado'] }),
    );
    next.form.controls.status.setValue('cerrado');
    expect(next.needsResolution()).toBe(true);
    next.form.controls.resolution.setValue('   ');
    next.save();
    http.expectNone('/api/tickets/7/status');
    next.form.controls.resolution.setValue('Se reinició el servicio');
    next.save();
    const req = http.expectOne('/api/tickets/7/status');
    expect(req.request.body).toEqual({ status: 'cerrado', resolution: 'Se reinició el servicio' });
    req.flush(ticket({ status: 'cerrado', assignee_id: 2, allowed_transitions: ['en_proceso'] }));
  });

  it('estatus: reabrir un ticket cerrado exige motivo', () => {
    const { dialog } = statusDialog(ticket({ status: 'cerrado', assignee_id: 2, allowed_transitions: ['en_proceso'] }));
    dialog.form.controls.status.setValue('en_proceso');
    expect(dialog.isReopen('en_proceso')).toBe(true);
    expect(dialog.needsReason()).toBe(true);
    dialog.save();
    http.expectNone('/api/tickets/7/status');
  });

  it('estatus: muestra el error de transición inválida del servidor', () => {
    const { dialog } = statusDialog(ticket());
    dialog.form.controls.status.setValue('cancelado');
    dialog.form.controls.reason.setValue('Duplicado');
    dialog.save();
    http
      .expectOne('/api/tickets/7/status')
      .flush(
        { error: { code: 'invalid_transition', message: 'No se puede pasar de «A» a «B».' } },
        { status: 409, statusText: 'x' },
      );
    expect(dialog.error()).toContain('No se puede pasar');
    expect(close).not.toHaveBeenCalled();
  });
});
