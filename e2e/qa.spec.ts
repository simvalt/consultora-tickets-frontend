/**
 * QA ampliado de la interfaz contra el sistema real con datos demo.
 * Cada prueba deja los datos como los encontró (o crea registros con nombres únicos).
 */
import { Page, expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ADMIN = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@consultora.local',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin#Local1234',
};
const DEMO_PASSWORD = process.env['E2E_READER_PASSWORD'] ?? 'Demo#Local1234';
const uid = () => Date.now().toString(36);

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByTestId('email').fill(user.email);
  await page.getByTestId('password').fill(user.password);
  await page.getByTestId('submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function pick(page: Page, testId: string, option: string | RegExp) {
  await page.getByTestId(testId).click();
  await page.getByRole('option', { name: option }).first().click();
}

async function closeDialog(page: Page, testId: string) {
  await page.getByTestId(testId).click();
  await expect(page.locator('mat-dialog-container')).toHaveCount(0);
}

async function newTicket(page: Page, title: string) {
  await page.goto('/tickets/new');
  await page.getByTestId('title').fill(title);
  await pick(page, 'client', /Acme/);
  await pick(page, 'category', /Incidente/);
  await page.getByTestId('save-ticket').click();
  await expect(page).toHaveURL(/\/tickets\/\d+$/);
}

// ------------------------------------------------------------ sesión
test.describe('sesión y navegación', () => {
  test('la sesión sobrevive a recargar la página y se cierra con «Cerrar sesión»', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/tickets');
    // Esperar a que esta navegacion restaure la sesion antes de recargar.
    // Recargar durante el refresh cancela su respuesta y puede perder la cookie rotada.
    await expect(page.getByTestId('ticket-table')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('ticket-table')).toBeVisible();
    await page.getByTestId('user-menu').click();
    await page.getByTestId('logout').click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/tickets');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Ftickets/);
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
  });

  test('tras iniciar sesión vuelve a la ruta pedida, pero nunca a un dominio externo', async ({ page }) => {
    await page.goto('/clients');
    await expect(page).toHaveURL(/returnUrl=%2Fclients/);
    await page.getByTestId('email').fill(ADMIN.email);
    await page.getByTestId('password').fill(ADMIN.password);
    await page.getByTestId('submit').click();
    await expect(page).toHaveURL(/\/clients$/);

    await page.context().clearCookies();
    await page.goto('/login?returnUrl=%2F%2Fevil.example.com');
    await page.getByTestId('email').fill(ADMIN.email);
    await page.getByTestId('password').fill(ADMIN.password);
    await page.getByTestId('submit').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
    expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL ?? 'http://localhost:4200').host);
  });

  test('sin cookie de refresco, recargar lleva al login', async ({ page, context }) => {
    await login(page, ADMIN);
    await context.clearCookies();
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
  });

  test('validaciones del formulario de login y login con Enter', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('submit').click();
    await expect(page.getByText('Ingresa un correo válido')).toBeVisible();
    await expect(page.getByText('La contraseña es obligatoria')).toBeVisible();
    await page.getByTestId('email').fill('no-es-correo');
    await page.getByTestId('password').fill('x');
    await page.getByTestId('password').press('Enter');
    await expect(page).toHaveURL(/\/login/);
    await page.getByTestId('email').fill(ADMIN.email);
    await page.getByTestId('password').fill(ADMIN.password);
    await page.getByTestId('password').press('Enter');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('un usuario inactivo no puede entrar y ve el motivo', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('email').fill('inactivo@consultora.local');
    await page.getByTestId('password').fill(DEMO_PASSWORD);
    await page.getByTestId('submit').click();
    await expect(page.getByTestId('login-error')).toContainText('inactivo');
  });

  test('menú lateral según permisos de cada rol demo', async ({ page, context }) => {
    const expected: Record<string, string[]> = {
      'supervisor@consultora.local': ['Dashboard', 'Tickets', 'Clientes', 'Usuarios'],
      'agente1@consultora.local': ['Dashboard', 'Tickets', 'Clientes'],
      'capturista@consultora.local': ['Tickets', 'Clientes'],
    };
    for (const [email, items] of Object.entries(expected)) {
      await context.clearCookies();
      await login(page, { email, password: DEMO_PASSWORD });
      const nav = page.getByRole('navigation', { name: 'Navegación principal' });
      for (const label of ['Dashboard', 'Tickets', 'Clientes', 'Usuarios', 'Roles y permisos']) {
        await expect(nav.getByRole('link', { name: label })).toHaveCount(items.includes(label) ? 1 : 0);
      }
    }
  });
});

// ------------------------------------------------------------ tickets
test.describe('tickets', () => {
  test.beforeEach(async ({ page }) => login(page, ADMIN));

  test('crear exige campos obligatorios y editar actualiza los datos', async ({ page }) => {
    await page.goto('/tickets/new');
    await page.getByTestId('save-ticket').click();
    await expect(page.getByText('El título es obligatorio')).toBeVisible();
    await expect(page.getByText('Selecciona un cliente')).toBeVisible();
    const title = `QA editar ${uid()}`;
    await newTicket(page, title);
    await page.getByTestId('edit').click();
    await page.getByTestId('title').fill(`${title} (editado)`);
    await pick(page, 'priority', /Crítica/);
    await page.getByTestId('save-ticket').click();
    await expect(page.getByRole('heading', { name: /\(editado\)/ })).toBeVisible();
    await expect(page.getByText('Crítica')).toBeVisible();
  });

  test('rechazar sin responsable, reabrir un cerrado y estados finales sin acciones', async ({ page }) => {
    await newTicket(page, `QA rechazo ${uid()}`);
    await page.getByTestId('change-status').click();
    await pick(page, 'new-status', /^Rechazado/);
    await page.getByTestId('status-reason').fill('Fuera de alcance');
    await closeDialog(page, 'status-save');
    await expect(page.getByTestId('status')).toContainText('Rechazado');
    await expect(page.getByTestId('change-status')).toHaveCount(0); // sin transiciones
    await expect(page.getByTestId('assign')).toHaveCount(0);

    await newTicket(page, `QA reapertura ${uid()}`);
    await page.getByTestId('change-status').click();
    await pick(page, 'new-status', /^Iniciado/);
    await pick(page, 'status-assignee', /Lucía/);
    await closeDialog(page, 'status-save');
    for (const s of [/^En proceso/]) {
      await page.getByTestId('change-status').click();
      await pick(page, 'new-status', s);
      await closeDialog(page, 'status-save');
    }
    await page.getByTestId('change-status').click();
    await pick(page, 'new-status', /^Cerrado/);
    await page.getByTestId('status-resolution').fill('Listo');
    await closeDialog(page, 'status-save');
    await page.getByTestId('change-status').click();
    await pick(page, 'new-status', /reapertura/);
    await page.getByTestId('status-save').click();
    await expect(page.getByText('El motivo es obligatorio')).toBeVisible();
    await page.getByTestId('status-reason').fill('El cliente reporta que sigue fallando');
    await closeDialog(page, 'status-save');
    await expect(page.getByTestId('status')).toContainText('En proceso');
    await expect(page.getByTestId('history')).toContainText('Reapertura: Cerrado → En proceso');
    await expect(page.getByTestId('resolution')).toHaveCount(0);
  });

  test('eliminar pide confirmación: cancelar no borra, confirmar sí', async ({ page }) => {
    const title = `QA borrar ${uid()}`;
    await newTicket(page, title);
    const url = page.url();
    await page.getByTestId('delete').click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('mat-dialog-container')).toHaveCount(0);
    await expect(page).toHaveURL(url);
    await expect(page.getByTestId('folio')).toBeVisible();
    await page.getByTestId('delete').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
    await expect(page).toHaveURL(/\/tickets$/);
    await page.getByTestId('search').fill(title);
    await expect(page.getByText('No hay tickets')).toBeVisible();
    await page.goto(url);
    await expect(page.getByText('El ticket no existe')).toBeVisible();
  });

  test('filtros, orden por columna, paginación y estado vacío', async ({ page }) => {
    await page.goto('/tickets');
    const table = page.getByTestId('ticket-table');
    await expect(table).toBeVisible();
    const range = page.locator('.mat-mdc-paginator-range-label');
    await expect(range).toContainText('1–20 de');
    await page.getByRole('button', { name: 'Página siguiente' }).click();
    await expect(range).toContainText('21–40 de');

    await page.getByRole('button', { name: 'Folio' }).click(); // orden ascendente por folio
    await expect(table.locator('tbody tr').first()).toContainText('TCK-000001');
    await expect(range).toContainText('1–20 de'); // cambiar el orden vuelve a la primera página

    await page.getByText('Sólo vencidos').click();
    await expect(table.locator('tbody tr').first().locator('.overdue')).toBeVisible();
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();

    await page.getByTestId('search').fill('zzzz-no-existe-zzzz');
    await expect(page.getByText('No hay tickets')).toBeVisible();
  });

  test('la exportación CSV respeta el filtro y trae acentos y BOM', async ({ page }) => {
    await page.goto('/tickets');
    // Esperar a que el listado se recargue con el filtro (la búsqueda tiene un retardo de 300 ms).
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/tickets?') && r.url().includes('q=impresora')),
      page.getByTestId('search').fill('impresora'),
    ]);
    const total = Number((await page.locator('.mat-mdc-paginator-range-label').innerText()).split(' de ')[1]);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
    const text = readFileSync((await download.path())!, 'utf-8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toContain('Título');
    expect(lines.length - 1).toBe(total);
    expect(lines.slice(1).every((l) => /impresora/i.test(l))).toBe(true);
  });
});

// ---------------------------------------------- usuarios, roles y clientes
test.describe('administración', () => {
  test.beforeEach(async ({ page }) => login(page, ADMIN));

  test('crear un cliente, validar duplicado y desactivarlo con confirmación', async ({ page }) => {
    const name = `QA Cliente ${uid()}`;
    await page.goto('/clients');
    await page.getByTestId('new-client').click();
    await page.getByTestId('client-save').click();
    await expect(page.getByText('El nombre es obligatorio')).toBeVisible();
    await page.getByTestId('client-name').fill(name);
    await closeDialog(page, 'client-save');
    await page.getByTestId('new-client').click();
    await page.getByTestId('client-name').fill(name.toUpperCase());
    await page.getByTestId('client-save').click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Ya existe');
    await page.getByRole('button', { name: 'Cancelar' }).click();

    await page.getByPlaceholder('Nombre, contacto o correo').fill(name);
    const row = page.getByRole('row').filter({ hasText: name });
    await row.getByRole('button', { name: 'Desactivar cliente' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Desactivar' }).click();
    await expect(row).toContainText('Inactivo');
    // Un cliente inactivo ya no aparece al crear tickets.
    await page.goto('/tickets/new');
    await page.getByTestId('client').click();
    await expect(page.getByRole('option', { name })).toHaveCount(0);
  });

  test('crear un rol con la matriz y JSON, asignarlo a un usuario nuevo y entrar con él', async ({ page, context }) => {
    const role = `QA Rol ${uid()}`;
    const email = `qa.${uid()}@consultora.local`;
    const password = `QA-${randomUUID()}`;
    await page.goto('/roles');
    await page.getByTestId('new-role').click();
    await page.getByTestId('role-name').fill(role);
    await page.getByTestId('perm-json-tab').click();
    await page.getByTestId('perm-json').fill('{"tickets": "leer", "clientes": "ver"}');
    await closeDialog(page, 'role-save');
    await expect(page.getByRole('row').filter({ hasText: role })).toContainText('Leer');

    await page.goto('/users');
    await page.getByTestId('new-user').click();
    await page.getByTestId('user-name').fill('Usuario QA');
    await page.getByTestId('user-email').fill(email);
    await pick(page, 'user-role', role);
    await page.getByTestId('user-password').fill('corta');
    await page.getByTestId('user-save').click();
    await expect(page.getByText('Mínimo 10 caracteres').last()).toBeVisible();
    await page.getByTestId('user-password').fill(password);
    await closeDialog(page, 'user-save');

    await context.clearCookies();
    await login(page, { email, password });
    await expect(page).toHaveURL(/\/tickets/); // sin dashboard: entra a la primera sección permitida
    await expect(page.getByTestId('new-ticket')).toHaveCount(0);
  });

  test('no se ofrece editar ni desactivar el propio rol ni el propio usuario', async ({ page }) => {
    await page.goto('/roles');
    await expect(page.getByRole('row').filter({ hasText: 'Administrador' })).toContainText('Tu rol');
    await page.goto('/users');
    await page.getByTestId('search-users').fill(ADMIN.email);
    const me = page.getByRole('row').filter({ hasText: ADMIN.email });
    await expect(me.getByRole('button', { name: 'Desactivar usuario' })).toHaveCount(0);
    await me.getByRole('button', { name: 'Editar usuario' }).click();
    await expect(page.getByText('No puedes cambiar tus propios permisos')).toBeVisible();
    await expect(page.getByTestId('user-password')).toHaveCount(0);
  });

  test('cambiar la propia contraseña (y restaurarla)', async ({ page, context }) => {
    const email = 'agente3@consultora.local';
    await context.clearCookies();
    await login(page, { email, password: DEMO_PASSWORD });
    const change = async (current: string, next: string) => {
      await page.getByTestId('user-menu').click();
      await page.getByTestId('change-password').click();
      await page.getByTestId('cp-current').fill(current);
      await page.getByTestId('cp-new').fill(next);
      await page.getByTestId('cp-confirm').fill(next);
    };
    await change('incorrecta', 'OtraClave#2026');
    await page.getByTestId('cp-save').click();
    await expect(page.getByTestId('cp-error')).toContainText('no es correcta');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('mat-dialog-container')).toHaveCount(0);

    await change(DEMO_PASSWORD, 'OtraClave#2026');
    await page.getByTestId('cp-confirm').fill('distinta#2026');
    await page.getByTestId('cp-save').click();
    await expect(page.getByText('Las contraseñas no coinciden')).toBeVisible();
    await page.getByTestId('cp-confirm').fill('OtraClave#2026');
    await closeDialog(page, 'cp-save');
    await expect(page.getByText('Contraseña actualizada')).toBeVisible();
    await page.reload(); // la nueva cookie de sesión sigue siendo válida
    await expect(page.getByTestId('user-menu')).toBeVisible();

    await change('OtraClave#2026', DEMO_PASSWORD); // restaurar dato demo
    await closeDialog(page, 'cp-save');
  });
});

// --------------------------------------------------------------- dashboard
test.describe('dashboard', () => {
  test('los filtros cambian los indicadores y coinciden con el listado', async ({ page }) => {
    await login(page, ADMIN);
    const kpi = page.getByTestId('kpi-total');
    await expect(kpi).toBeVisible();
    const before = Number(await kpi.innerText());
    await page.locator('mat-select[formcontrolname="priority"]').click();
    await page.getByRole('option', { name: 'Crítica' }).click();
    await expect(kpi).not.toHaveText(String(before));
    const critical = Number(await kpi.innerText());
    expect(critical).toBeLessThan(before);
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('sin datos en el periodo muestra el estado vacío', async ({ page }) => {
    await login(page, ADMIN);
    // Escribir a mano también funciona (formato dd/mm/aaaa).
    await page.getByTestId('date-from').fill('01/01/2001');
    await page.getByTestId('date-to').fill('31/01/2001');
    await page.getByTestId('date-to').blur();
    await expect(page.getByText('Sin datos para mostrar')).toBeVisible();
  });
});

// ------------------------------------------------------------- responsive
test.describe('móvil', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('menú plegable, tabla con desplazamiento y detalle en una columna', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.getByRole('link', { name: 'Tickets' }).click();
    await expect(page.getByTestId('ticket-table')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1); // sin desplazamiento horizontal de la página completa
    await page.getByTestId('ticket-table').locator('a.link').first().click();
    await expect(page.getByTestId('folio')).toBeVisible();
  });
});
