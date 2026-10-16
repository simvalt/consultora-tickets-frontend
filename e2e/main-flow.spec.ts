import { Page, expect, test } from '@playwright/test';

// Credenciales LOCALES de demostración (database/seed). No existen en producción.
const ADMIN = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@consultora.local',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin#Local1234',
};
const READER = {
  email: process.env['E2E_READER_EMAIL'] ?? 'consulta@consultora.local',
  password: process.env['E2E_READER_PASSWORD'] ?? 'Demo#Local1234',
};

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByTestId('email').fill(user.email);
  await page.getByTestId('password').fill(user.password);
  await page.getByTestId('submit').click();
  // Esperar a que la sesión quede abierta antes de navegar (si no, se cancela la solicitud de login).
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function pick(page: Page, testId: string, optionName: string | RegExp) {
  await page.getByTestId(testId).click();
  await page.getByRole('option', { name: optionName }).first().click();
}

/** Guarda el diálogo abierto y espera a que se cierre por completo. */
async function saveDialog(page: Page, testId: string) {
  await page.getByTestId(testId).click();
  await expect(page.locator('mat-dialog-container')).toHaveCount(0);
}

test('login incorrecto muestra un error y no abre sesión', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('email').fill(ADMIN.email);
  await page.getByTestId('password').fill('contraseña-incorrecta');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('login-error')).toContainText('incorrectos');
  await expect(page).toHaveURL(/\/login/);
});

test('flujo principal: login, crear ticket, asignar, cambiar estatus y cerrar', async ({ page }) => {
  const title = `E2E ${Date.now()}`;
  await login(page, ADMIN);
  await expect(page).toHaveURL(/\/dashboard/);

  // Crear
  await page.goto('/tickets');
  await page.getByTestId('new-ticket').click();
  await page.getByTestId('title').fill(title);
  await page.getByTestId('description').fill('Creado por la prueba E2E');
  await pick(page, 'client', /Acme/);
  await pick(page, 'category', /Incidente/);
  await pick(page, 'priority', /Alta/);
  await page.getByTestId('save-ticket').click();
  await expect(page).toHaveURL(/\/tickets\/\d+$/);
  await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
  await expect(page.getByTestId('status')).toContainText('Sin inicio');
  await expect(page.getByTestId('assignee')).toContainText('Sin responsable');

  // Asignar
  await page.getByTestId('assign').click();
  await pick(page, 'assign-select', /Carlos/);
  await saveDialog(page, 'assign-save');
  await expect(page.getByTestId('assignee')).toContainText('Carlos');

  // Sin inicio → Iniciado → En proceso
  for (const next of [/^Iniciado/, /^En proceso/]) {
    await page.getByTestId('change-status').click();
    await pick(page, 'new-status', next);
    await saveDialog(page, 'status-save');
  }
  await expect(page.getByTestId('status')).toContainText('En proceso');

  // Pendiente exige motivo
  await page.getByTestId('change-status').click();
  await pick(page, 'new-status', /^Pendiente/);
  await page.getByTestId('status-save').click();
  await expect(page.getByText('El motivo es obligatorio')).toBeVisible();
  await page.getByTestId('status-reason').fill('Esperando datos del cliente');
  await saveDialog(page, 'status-save');
  await expect(page.getByTestId('status')).toContainText('Pendiente');

  // Pendiente → En proceso → Cerrado (exige resolución)
  await page.getByTestId('change-status').click();
  await pick(page, 'new-status', /^En proceso/);
  await saveDialog(page, 'status-save');
  await expect(page.getByTestId('status')).toContainText('En proceso');

  await page.getByTestId('change-status').click();
  await pick(page, 'new-status', /^Cerrado/);
  await page.getByTestId('status-save').click();
  await expect(page.getByText('El resumen de la resolución es obligatorio')).toBeVisible();
  await page.getByTestId('status-resolution').fill('Se corrigió la configuración');
  await saveDialog(page, 'status-save');

  await expect(page.getByTestId('status')).toContainText('Cerrado');
  await expect(page.getByTestId('resolution')).toContainText('Se corrigió la configuración');
  const history = page.getByTestId('history');
  await expect(history).toContainText('Asignado a Carlos');
  await expect(history).toContainText('Sin inicio → Iniciado');
  await expect(history).toContainText('En proceso → Cerrado');
  await expect(history).toContainText('Esperando datos del cliente');

  // Comentario interno
  await page.getByTestId('comment-body').fill('Verificado con el cliente');
  await page.getByTestId('comment-send').click();
  await expect(page.getByText('Verificado con el cliente')).toBeVisible();

  // Aparece en el listado (búsqueda en servidor)
  await page.goto('/tickets');
  await page.getByTestId('search').fill(title);
  await expect(page.getByTestId('ticket-table').getByText(title)).toBeVisible();
});

test('un usuario de sólo lectura no ve acciones de escritura y recibe «acceso denegado»', async ({ page }) => {
  await login(page, READER);
  await page.goto('/tickets');
  await expect(page.getByTestId('ticket-table')).toBeVisible();
  await expect(page.getByTestId('new-ticket')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);

  await page.getByTestId('ticket-table').locator('a.link').first().click();
  await expect(page.getByTestId('folio')).toBeVisible();
  await expect(page.getByTestId('change-status')).toHaveCount(0);
  await expect(page.getByTestId('edit')).toHaveCount(0);
  await expect(page.getByTestId('delete')).toHaveCount(0);

  await page.goto('/users');
  await expect(page.getByText('Acceso denegado')).toBeVisible();
  await page.goto('/tickets/999999');
  await expect(page.getByText('El ticket no existe')).toBeVisible();
  await page.goto('/ruta-que-no-existe');
  await expect(page.getByText('Página no encontrada')).toBeVisible();
});

test('la exportación CSV descarga los registros filtrados', async ({ page }) => {
  await login(page, ADMIN);
  await page.goto('/tickets');
  await page.getByTestId('search').fill('acceso');
  await expect(page.getByTestId('ticket-table')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
  expect(download.suggestedFilename()).toMatch(/^tickets-\d{8}-\d{6}\.csv$/);
});
