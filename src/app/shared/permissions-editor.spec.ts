import { provideHttpClient } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../core/auth.service';
import { PermMap, parsePermissionsJson, permissionsToJson } from '../core/permissions-json';
import { PermissionsEditor } from './permissions-editor';

describe('permissions-json', () => {
  it('acepta nombres de nivel, números y alias de módulo (ejemplo del requerimiento)', () => {
    const res = parsePermissionsJson(
      '{"Ticket": "crear", "Analítica": "ver", "Usuario": "editar", "Permisos": "leer", "clientes": 4, "roles": "0"}',
    );
    expect(res).toEqual({
      ok: true,
      value: { tickets: 2, dashboard: 1, users: 3, roles: 0, clients: 4 },
    });
  });

  it('rechaza JSON inválido, módulos o niveles desconocidos', () => {
    expect(parsePermissionsJson('{').ok).toBe(false);
    expect(parsePermissionsJson('[1]').ok).toBe(false);
    expect(parsePermissionsJson('{"nada": 1}')).toMatchObject({ ok: false });
    expect(parsePermissionsJson('{"tickets": "mucho"}')).toMatchObject({ ok: false });
    expect(parsePermissionsJson('{"tickets": 9}')).toMatchObject({ ok: false });
    expect(parsePermissionsJson('')).toEqual({ ok: true, value: {} });
  });

  it('serializa con nombres de nivel y sólo los módulos definidos', () => {
    expect(JSON.parse(permissionsToJson({ tickets: 2, dashboard: 1 }))).toEqual({
      tickets: 'insertar',
      dashboard: 'leer',
    });
    expect(permissionsToJson({})).toBe('{}');
  });
});

@Component({
  imports: [PermissionsEditor],
  template: `<app-permissions-editor [(value)]="value" [mode]="mode" />`,
})
class Host {
  value = signal<PermMap>({});
  mode: 'role' | 'user' = 'user';
}

describe('PermissionsEditor', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    TestBed.inject(AuthService).user.set({
      id: 1,
      email: 'a@b.c',
      full_name: 'A',
      role_id: 1,
      role_name: 'Admin',
      permissions: { tickets: 4, users: 4, roles: 4, clients: 4, dashboard: 4 },
    });
  });

  function setup(mode: 'role' | 'user', value: PermMap) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.mode = mode;
    fixture.componentInstance.value.set(value);
    fixture.detectChanges();
    const editor = fixture.debugElement.children[0].componentInstance as PermissionsEditor;
    return { fixture, host: fixture.componentInstance, editor };
  }

  it('escribir JSON actualiza el valor (modo usuario: lo omitido se hereda)', () => {
    const { fixture, host, editor } = setup('user', { clients: 1 });
    editor.onJson('{"tickets": "crear", "dashboard": "ver"}');
    fixture.detectChanges();
    expect(host.value()).toEqual({ tickets: 2, dashboard: 1 });
    expect(editor.jsonError()).toBeNull();
  });

  it('en modo rol los módulos omitidos quedan en «Nada»', () => {
    const { host, editor } = setup('role', { tickets: 1, users: 1, roles: 1, clients: 1, dashboard: 1 });
    editor.onJson('{"tickets": "editar"}');
    expect(host.value()).toEqual({ tickets: 3, users: 0, roles: 0, clients: 0, dashboard: 0 });
  });

  it('JSON inválido muestra error y no cambia el valor', () => {
    const { host, editor } = setup('user', { tickets: 2 });
    editor.onJson('{"tickets": ');
    expect(editor.jsonError()).toBeTruthy();
    editor.onJson('{"tickets": "eliminar"}');
    expect(host.value()).toEqual({ tickets: 4 });
    editor.onJson('{"tickets": "mucho"}');
    expect(editor.jsonError()).toContain('Nivel no válido');
    expect(host.value()).toEqual({ tickets: 4 });
  });

  it('no permite otorgar niveles superiores a los propios', () => {
    TestBed.inject(AuthService).user.update((u) => ({ ...u!, permissions: { ...u!.permissions, tickets: 2 } }));
    const { host, editor } = setup('user', {});
    editor.onJson('{"tickets": "editar"}');
    expect(editor.jsonError()).toContain('supera tus permisos');
    expect(host.value()).toEqual({});
  });

  it('la matriz actualiza el valor y el JSON; «Heredar» elimina el override', () => {
    const { fixture, host, editor } = setup('user', {});
    editor.setLevel('tickets', 2);
    fixture.detectChanges();
    expect(host.value()).toEqual({ tickets: 2 });
    expect(JSON.parse(editor.jsonText())).toEqual({ tickets: 'insertar' });
    editor.setLevel('tickets', null);
    fixture.detectChanges();
    expect(host.value()).toEqual({});
  });
});
