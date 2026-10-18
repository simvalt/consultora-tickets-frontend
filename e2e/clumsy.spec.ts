/**
 * «Usuario torpe»: el flujo completo hecho como lo haría alguien con prisa y sin leer.
 * Doble clic en todo, espacios, fechas imposibles, URLs inventadas, pestañas desactualizadas.
 * Además de lo que cada prueba comprueba, ninguna puede provocar un 5xx ni un error de JavaScript.
 */
import { Page, Request, expect, test as base } from '@playwright/test';

const ADMIN = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@consultora.local',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin#Local1234',
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/** Vigila la página: 5xx, errores no capturados y diálogos nativos (un alert sería una inyección). */
const test = base.extend<{ watch: { requests: Request[] } }>({
  watch: [
    async ({ page }, use) => {
      const problems: string[] = [];
      const requests: Request[] = [];
      page.on('request', (r) => requests.push(r));
      page.on('response', (r) => {
        if (r.status() >= 500) problems.push(`${r.status()} ${r.request().method()} ${r.url()}`);
      });
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('dialog', (d) => {
        problems.push(`dialog nativo: ${d.message()}`);
        void d.dismiss();
      });
      await use({ requests });
      expect(problems, 'sin 5xx, errores JS ni diálogos nativos').toEqual([]);
    },
    { auto: true },
  ],
});

const calls = (w: { requests: Request[] }, method: string, path: RegExp) =>
  w.requests.filter((r) => r.method() === method && path.test(new URL(r.url()).pathname)).length;

async function login(page: Page) {
  await page.goto('/login');
  await page.getByTestId('email').fill(ADMIN.email);
  await page.getByTestId('password').fill(ADMIN.password);
  await page.getByTestId('submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function pick(page: Page, testId: string, option: string | RegExp) {
  await page.getByTestId(testId).click();
  await page.getByRole('option', { name: option }).first().click();
}

async function newTicket(page: Page, title: string) {
  await page.goto('/tickets/new');
  await page.getByTestId('title').fill(title);
  await pick(page, 'client', /Acme/);
  await pick(page, 'category', /Incidente/);
  await page.getByTestId('save-ticket').click();
  await expect(page).toHaveURL(/\/tickets\/\d+$/);
}

// ----------------------------------------------------------------- login
test.describe('login torpe', () => {
  test('pega el correo con espacios y mayúsculas y aun así entra', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('email').fill(`  ${ADMIN.email.toUpperCase()}  `);
    await page.getByTestId('password').fill(ADMIN.password);
    await page.getByTestId('submit').click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('aporrea el botón con una contraseña mala: un solo intento y un mensaje claro', async ({ page, watch }) => {
    await page.goto('/login');
    await page.getByTestId('email').fill(`nadie.${uid()}@consultora.local`);
    await page.getByTestId('password').fill('equivocada');
    await page.getByTestId('submit').dblclick();
    await page.getByTestId('submit').click({ trial: true });
    await expect(page.getByTestId('login-error')).toBeVisible();
    expect(calls(watch, 'POST', /\/api\/auth\/login$/)).toBe(1);
    await expect(page.getByTestId('password')).toHaveValue('equivocada'); // no le borra lo escrito
  });

  test('ya dentro, vuelve al login con «Atrás» o escribiendo la URL y no se queda en el formulario', async ({
    page,
  }) => {
    await login(page);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/login');
    await expect(page).not.toHaveURL(/\/login/);
  });
});

// --------------------------------------------------------------- tickets
test.describe('tickets torpe', () => {
  test.beforeEach(async ({ page }) => login(page));

  test('título de puros espacios o de dos letras no se guarda y se explica por qué', async ({ page }) => {
    await page.goto('/tickets/new');
    await pick(page, 'client', /Acme/);
    await pick(page, 'category', /Incidente/);
    for (const bad of ['     ', 'ab', '  ab  ']) {
      await page.getByTestId('title').fill(bad);
      await page.getByTestId('save-ticket').click();
      await expect(page).toHaveURL(/\/tickets\/new$/);
      await expect(page.getByText('El título es obligatorio (mínimo 3 caracteres)')).toBeVisible();
    }
  });

  test('fechas imposibles, texto en la fecha y hora sin fecha: avisa y no guarda', async ({ page, watch }) => {
    await page.goto('/tickets/new');
    await page.getByTestId('title').fill(`Torpe fechas ${uid()}`);
    await pick(page, 'client', /Acme/);
    await pick(page, 'category', /Incidente/);
    for (const bad of ['31/02/2026', 'mañana', '99/99/9999']) {
      await page.getByTestId('due-date').fill(bad);
      await page.getByTestId('due-date').blur();
      await page.getByTestId('save-ticket').click();
      await expect(page.getByText('Fecha no válida (dd/mm/aaaa)')).toBeVisible();
      await expect(page).toHaveURL(/\/tickets\/new$/);
    }
    await page.getByTestId('due-date').fill('');
    await page.getByTestId('due-time').fill('10:30');
    await page.getByTestId('due-time').blur();
    await page.getByTestId('save-ticket').click();
    await expect(page.getByText('Indica también la fecha')).toBeVisible();
    expect(calls(watch, 'POST', /\/api\/tickets$/)).toBe(0);
  });

  test('vencimiento en el pasado al crear: se le avisa antes de guardar', async ({ page, watch }) => {
    await page.goto('/tickets/new');
    await page.getByTestId('title').fill(`Torpe pasado ${uid()}`);
    await pick(page, 'client', /Acme/);
    await pick(page, 'category', /Incidente/);
    await page.getByTestId('due-date').fill('01/01/2020');
    await page.getByTestId('due-date').blur();
    await page.getByTestId('save-ticket').click();
    await expect(page.getByText('El vencimiento ya pasó')).toBeVisible();
    expect(calls(watch, 'POST', /\/api\/tickets$/)).toBe(0);
  });

  test('doble clic en Guardar crea un solo ticket; HTML y emojis se muestran como texto', async ({ page, watch }) => {
    const title = `<img src=x onerror=alert(1)> Torpe 🙃 ${uid()}`;
    await page.goto('/tickets/new');
    await page.getByTestId('title').fill(title);
    await page.getByTestId('description').fill('<script>alert("hola")</script>\n\nSegunda línea');
    await pick(page, 'client', /Acme/);
    await pick(page, 'category', /Incidente/);
    await page.getByTestId('save-ticket').dblclick();
    await expect(page).toHaveURL(/\/tickets\/\d+$/);
    await expect(page.getByRole('heading', { name: /Torpe 🙃/ })).toContainText('<img src=x');
    await expect(page.getByText('<script>alert("hola")</script>')).toBeVisible();
    expect(calls(watch, 'POST', /\/api\/tickets$/)).toBe(1);
  });

  test('escribe y pulsa «Cancelar»: se le pregunta antes de perder lo escrito', async ({ page }) => {
    await page.goto('/tickets/new');
    await page.getByTestId('title').fill('Algo que no quiero perder');
    await page.getByRole('link', { name: 'Cancelar' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Descartar cambios');
    await dialog.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(page).toHaveURL(/\/tickets\/new$/);
    await expect(page.getByTestId('title')).toHaveValue('Algo que no quiero perder');
    // por el menú lateral también pregunta; esta vez descarta
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Tickets' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Descartar' }).click();
    await expect(page).toHaveURL(/\/tickets$/);
    // sin cambios no pregunta nada
    await page.goto('/tickets/new');
    await page.getByRole('link', { name: 'Cancelar' }).click();
    await expect(page).toHaveURL(/\/tickets$/);
  });

  test('comentario de puros espacios no se puede enviar; doble clic publica uno solo', async ({ page, watch }) => {
    await newTicket(page, `Torpe comentario ${uid()}`);
    await page.getByTestId('comment-body').fill('      \n   ');
    await expect(page.getByTestId('comment-send')).toBeDisabled();
    await page.getByTestId('comment-body').fill('Ya lo revisé');
    await page.getByTestId('comment-send').dblclick();
    await expect(page.getByRole('heading', { name: 'Comentarios internos (1)' })).toBeVisible();
    await expect(page.getByTestId('comment-body')).toHaveValue('');
    expect(calls(watch, 'POST', /\/api\/tickets\/\d+\/comments$/)).toBe(1);
  });

  test('diálogo de estatus: Escape no cambia nada, sin motivo no deja, doble clic aplica una vez', async ({
    page,
    watch,
  }) => {
    await newTicket(page, `Torpe estatus ${uid()}`);
    await page.getByTestId('change-status').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('mat-dialog-container')).toHaveCount(0);
    await expect(page.getByTestId('status')).toContainText('Sin inicio');

    await page.getByTestId('change-status').click();
    await pick(page, 'new-status', /^Rechazado/);
    await page.getByTestId('status-save').click();
    await expect(page.getByText('El motivo es obligatorio')).toBeVisible();
    await page.getByTestId('status-reason').fill('   ');
    await page.getByTestId('status-save').click();
    await expect(page.getByText('El motivo es obligatorio')).toBeVisible();
    await page.getByTestId('status-reason').fill('No aplica');
    await page.getByTestId('status-save').dblclick();
    await expect(page.locator('mat-dialog-container')).toHaveCount(0);
    await expect(page.getByTestId('status')).toContainText('Rechazado');
    expect(calls(watch, 'POST', /\/api\/tickets\/\d+\/status$/)).toBe(1);
    await expect(page.locator('.mat-mdc-snack-bar-container.error, .snack-error')).toHaveCount(0);
  });

  test('dos pestañas: la desactualizada intenta un cambio imposible y recibe un aviso entendible', async ({
    page,
    context,
  }) => {
    await newTicket(page, `Torpe pestañas ${uid()}`);
    const url = page.url();
    const other = await context.newPage();
    await other.goto(url);
    await expect(other.getByTestId('status')).toContainText('Sin inicio');

    await page.getByTestId('change-status').click();
    await pick(page, 'new-status', /^Rechazado/);
    await page.getByTestId('status-reason').fill('Duplicado');
    await page.getByTestId('status-save').click();
    await expect(page.getByTestId('status')).toContainText('Rechazado');

    await other.getByTestId('change-status').click();
    await pick(other, 'new-status', /^Iniciado/);
    await pick(other, 'status-assignee', /Lucía/);
    await other.getByTestId('status-save').click();
    await expect(other.getByRole('dialog').getByRole('alert')).toContainText(/no se puede|no permitid|transición|cambió/i);
    await other.close();
  });

  test('borrar con doble clic en «Eliminar» no muestra errores y el ticket desaparece', async ({ page, watch }) => {
    await newTicket(page, `Torpe borrar ${uid()}`);
    await page.getByTestId('delete').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).dblclick();
    await expect(page).toHaveURL(/\/tickets$/);
    expect(calls(watch, 'DELETE', /\/api\/tickets\/\d+$/)).toBe(1);
  });

  test('búsquedas raras no rompen nada', async ({ page }) => {
    await page.goto('/tickets');
    await expect(page.getByTestId('ticket-table')).toBeVisible();
    for (const q of ['%', '_', "'; DROP TABLE tickets; --", '<b>x</b>', '🙃🙃', '\\', 'x'.repeat(300), '   ']) {
      await page.getByTestId('search').fill(q);
      await page.waitForTimeout(450); // debounce de la búsqueda
      await expect(page.getByTestId('ticket-table').or(page.getByText('No hay tickets'))).toBeVisible();
    }
  });

  test('en la página 2 se pone a buscar: vuelve a la primera página', async ({ page }) => {
    await page.goto('/tickets');
    const range = page.locator('.mat-mdc-paginator-range-label');
    await page.getByRole('button', { name: 'Página siguiente' }).click();
    await expect(range).toContainText('21-');
    await page.getByTestId('search').fill('TCK');
    await expect(range).toContainText(/^\s*1-/);
  });

  test('intenta ocultar todas las columnas: siempre queda al menos una', async ({ page }) => {
    await page.goto('/tickets');
    await page.getByTestId('columns').click();
    const boxes = page.getByRole('menu').getByRole('checkbox');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) {
      const box = boxes.nth(i);
      if ((await box.isChecked()) && (await box.isEnabled())) await box.click();
    }
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('ticket-table').locator('th')).not.toHaveCount(0);
    await page.getByTestId('columns').click();
    await page.getByTestId('columns-reset').click();
    await page.keyboard.press('Escape');
  });

  test('exporta con un filtro que no trae nada: CSV con sólo encabezados', async ({ page }) => {
    await page.goto('/tickets');
    await page.getByTestId('search').fill(`nada-${uid()}`);
    await expect(page.getByText('No hay tickets')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByTestId('export').click();
    const path = await (await download).path();
    const { readFileSync } = await import('node:fs');
    const lines = readFileSync(path!, 'utf-8').trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
  });

  test('URLs inventadas llevan a páginas entendibles', async ({ page }) => {
    for (const path of ['/tickets/abc', '/tickets/0', '/tickets/-5', '/tickets/1.5', '/tickets/99999999999999999999']) {
      await page.goto(path);
      await expect(page.getByText(/no existe|no encontrad/i).first()).toBeVisible();
    }
    await page.goto('/esto-no-existe');
    await expect(page.getByText(/no encontrad|no existe/i).first()).toBeVisible();
    await page.goto('/tickets/99999999999999999999/edit');
    await expect(page.getByText(/no existe|no encontrad/i).first()).toBeVisible();
  });
});

// ---------------------------------------------------------- administración
test.describe('administración torpe', () => {
  test.beforeEach(async ({ page }) => login(page));

  test('cliente: nombre en blanco, correo inválido y duplicado con otras mayúsculas', async ({ page }) => {
    await page.goto('/clients');
    await page.getByTestId('new-client').click();
    await page.getByTestId('client-name').fill('    ');
    await page.getByTestId('client-save').click();
    await expect(page.getByText('El nombre es obligatorio')).toBeVisible();
    await page.getByTestId('client-name').fill(`Cliente torpe ${uid()}`);
    await page.getByLabel('Correo').fill('esto no es correo');
    await page.getByTestId('client-save').click();
    await expect(page.getByText('Correo no válido')).toBeVisible();
    await page.getByLabel('Correo').fill('');
    await page.getByTestId('client-name').fill('  ACME INDUSTRIAL ');
    await page.getByTestId('client-save').click();
    await expect(page.getByRole('dialog')).toContainText(/ya existe/i);
  });

  test('usuario: correo repetido en mayúsculas y contraseña corta', async ({ page }) => {
    await page.goto('/users');
    await page.getByTestId('new-user').click();
    await page.getByTestId('user-name').fill('  Fulano Torpe  ');
    await page.getByTestId('user-email').fill(`  ${ADMIN.email.toUpperCase()} `);
    await pick(page, 'user-role', /Agente/);
    await page.getByTestId('user-password').fill('123');
    await page.getByTestId('user-save').click();
    await expect(page.getByRole('dialog')).toContainText(/mínimo|al menos|10/i);
    await page.getByTestId('user-password').fill('Larga#Segura123');
    await page.getByTestId('user-save').click();
    await expect(page.getByRole('dialog')).toContainText(/ya existe|ya está registrado|en uso/i);
  });

  test('rol: JSON roto o con niveles absurdos no se guarda', async ({ page, watch }) => {
    await page.goto('/roles');
    await page.getByTestId('new-role').click();
    await page.getByTestId('role-name').fill(`Torpe ${uid()}`);
    await page.getByTestId('perm-json-tab').click();
    const json = page.getByTestId('perm-json');
    for (const bad of ['{tickets: 9', '{"tickets": 9}', '{"tickets": "superadmin"}', '[]', '"hola"', '{"naves": 1}']) {
      await json.fill(bad);
      await expect(page.getByTestId('perm-json-error')).toBeVisible();
      await page.getByTestId('role-save').click();
      await expect(page.getByRole('dialog')).toBeVisible();
    }
    expect(calls(watch, 'POST', /\/api\/roles$/)).toBe(0);
    await page.keyboard.press('Escape');
  });

  test('cambiar contraseña: actual mala, confirmación distinta y nueva corta', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('user-menu').click();
    await page.getByTestId('change-password').click();
    await page.getByTestId('cp-current').fill(ADMIN.password);
    await page.getByTestId('cp-new').fill('Nueva#Clave12345');
    await page.getByTestId('cp-confirm').fill('Nueva#Clave1234');
    await page.getByTestId('cp-save').click();
    await expect(page.getByRole('dialog')).toContainText(/no coinciden/i);
    await page.getByTestId('cp-new').fill('corta');
    await page.getByTestId('cp-confirm').fill('corta');
    await page.getByTestId('cp-save').click();
    await expect(page.getByRole('dialog')).toContainText(/mínimo|al menos|10/i);
    await page.getByTestId('cp-current').fill('no-es-la-mia');
    await page.getByTestId('cp-new').fill('Nueva#Clave12345');
    await page.getByTestId('cp-confirm').fill('Nueva#Clave12345');
    await page.getByTestId('cp-save').click();
    await expect(page.getByTestId('cp-error')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

// ---------------------------------------------------------------- dashboard
test.describe('dashboard torpe', () => {
  test.beforeEach(async ({ page }) => login(page));

  test('rango al revés o con texto: no rompe y lo explica', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('kpi-open')).toBeVisible();
    await page.getByTestId('date-from').fill('01/12/2026');
    await page.getByTestId('date-to').fill('01/01/2026');
    await page.getByTestId('date-to').blur();
    await expect(page.getByText('La fecha inicial es posterior a la final')).toBeVisible();
    await page.getByTestId('date-from').fill('ayer');
    await page.getByTestId('date-from').blur();
    await expect(page.getByText('Fecha no válida (dd/mm/aaaa)')).toBeVisible();
    await page.getByRole('radio', { name: '30 días' }).click();
    await expect(page.getByText('La fecha inicial es posterior a la final')).toHaveCount(0);
    await expect(page.getByTestId('kpi-open')).toBeVisible();
  });
});

// ------------------------------------------------------------------ sesión
test.describe('sesión torpe', () => {
  test('cierra sesión en una pestaña y sigue trabajando en otra: termina en el login', async ({ page, context }) => {
    await login(page);
    await newTicket(page, `Torpe sesión ${uid()}`);
    const other = await context.newPage();
    await other.goto('/dashboard');
    await expect(other.getByTestId('kpi-open')).toBeVisible();
    await other.getByTestId('user-menu').click();
    await other.getByTestId('logout').click();
    await expect(other).toHaveURL(/\/login/);

    // la pestaña donde no se cerró sesión se entera sola, sin esperar a que caduque su token
    await expect(page).toHaveURL(/\/login/);
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await other.close();
  });
});
