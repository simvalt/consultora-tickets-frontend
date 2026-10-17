/**
 * Mejoras de interfaz: icono propio, columnas configurables (tabla y CSV), selectores de fecha,
 * atajos de periodo en el dashboard y búsqueda dentro de los selects.
 */
import { Page, expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const ADMIN = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@consultora.local',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin#Local1234',
};

async function login(page: Page) {
  await page.goto('/login');
  await page.getByTestId('email').fill(ADMIN.email);
  await page.getByTestId('password').fill(ADMIN.password);
  await page.getByTestId('submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function downloadCsv(page: Page): Promise<string[][]> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
  const text = readFileSync((await download.path())!, 'utf-8').replace(/^﻿/, '');
  return text
    .trim()
    .split('\r\n')
    .map((line) => line.split(','));
}

const pad = (n: number) => String(n).padStart(2, '0');
const ddmmyyyy = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

test('la aplicación usa su propio icono, no el de Angular', async ({ page, request }) => {
  await page.goto('/login');
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', 'favicon.svg');
  const svg = await request.get('/favicon.svg');
  expect(svg.ok()).toBe(true);
  expect(await svg.text()).toContain('Consultora Tickets');
  const ico = await request.get('/favicon.ico');
  expect(ico.ok()).toBe(true);
  expect((await ico.body()).length).toBeLessThan(10_000); // el de Angular pesa ~15 KB
  await expect(page.locator('.login-brand img')).toBeVisible();
});

test('columnas: ocultar, mostrar y reordenar se refleja en la tabla y en el CSV', async ({ page }) => {
  await login(page);
  await page.goto('/tickets');
  const table = page.getByTestId('ticket-table');
  await expect(table).toBeVisible();

  await page.getByTestId('columns').click();
  await page.getByTestId('col-title').getByRole('checkbox').click(); // ocultar Título
  await page.getByTestId('col-category').getByRole('checkbox').click(); // mostrar Categoría
  await page.getByRole('button', { name: 'Subir Responsable' }).click(); // Responsable antes que Estatus
  await page.keyboard.press('Escape');

  const headers = (await table.locator('th').allInnerTexts()).map((h) => h.trim());
  expect(headers).toEqual([
    'Folio',
    'Cliente',
    'Prioridad',
    'Responsable',
    'Estatus',
    'Vencimiento',
    'Creado',
    'Categoría',
  ]);

  const csv = await downloadCsv(page);
  expect(csv[0]).toEqual(headers); // mismas columnas y mismo orden que la tabla
  expect(csv.slice(1).every((row) => /^TCK-\d{6}$/.test(row[0]))).toBe(true);

  // La preferencia se recuerda al recargar y «Restablecer» vuelve al estado inicial.
  await page.reload();
  await expect(table.locator('th').first()).toHaveText('Folio');
  expect((await table.locator('th').allInnerTexts()).map((h) => h.trim())).toEqual(headers);
  await page.getByTestId('columns').click();
  await page.getByTestId('columns-reset').click();
  await page.keyboard.press('Escape');
  await expect(table.locator('th').nth(1)).toHaveText('Título');
});

test('columnas también en usuarios, roles y clientes (exportación incluida)', async ({ page }) => {
  await login(page);
  for (const [path, key, label] of [
    ['/users', 'email', 'Correo'],
    ['/roles', 'description', 'Descripción'],
    ['/clients', 'phone', 'Teléfono'],
  ] as const) {
    await page.goto(path);
    await page.getByTestId('columns').click();
    await page.getByTestId(`col-${key}`).getByRole('checkbox').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('th', { hasText: label })).toHaveCount(0);
    const csv = await downloadCsv(page);
    expect(csv[0]).not.toContain(label);
    expect(csv[0].length).toBeGreaterThan(0);
  }
});

test('búsqueda dentro de los selects filtra sin distinguir acentos y permite elegir con el teclado', async ({
  page,
}) => {
  await login(page);
  await page.goto('/tickets');
  await page.getByTestId('filter-client').click();
  const search = page.getByTestId('select-search');
  await expect(search).toBeFocused();
  await search.fill('logistica');
  const options = page.getByRole('option');
  await expect(options).toHaveText(['Todos', 'Logística Rápida']);
  await search.fill('zzz');
  await expect(page.getByRole('option', { name: 'Sin coincidencias' })).toBeVisible();
  await search.fill('acme');
  await search.press('Enter'); // la primera coincidencia queda resaltada
  await expect(page.locator('.mat-mdc-select-panel')).toHaveCount(0); // el panel se cierra y no se reabre
  await expect(page.getByTestId('filter-client')).toContainText('Acme Industrial');

  // El espacio escribe en la búsqueda (no selecciona) y al reabrir el campo está vacío.
  await page.getByTestId('filter-assignee').click();
  await page.getByTestId('select-search').pressSequentially('sin resp');
  await expect(page.getByRole('option', { name: 'Sin responsable' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('filter-assignee').click();
  await expect(page.getByTestId('select-search')).toHaveValue('');
});

test('filtro de fechas de tickets con calendario', async ({ page }) => {
  await login(page);
  await page.goto('/tickets');
  await page.getByTestId('created-picker').click();
  const today = new Date();
  // Elegir del 1 del mes en curso a hoy en el calendario.
  await page.getByRole('button', { name: new RegExp(`^1 de .* de ${today.getFullYear()}$`) }).click();
  await page.getByRole('button', { name: new RegExp(`^${today.getDate()} de .* de ${today.getFullYear()}$`) }).click();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  await expect(page.getByTestId('created-from')).toHaveValue(ddmmyyyy(first));
  await expect(page.getByTestId('created-to')).toHaveValue(ddmmyyyy(today));
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/tickets?') && r.url().includes('created_from=')),
    page.getByTestId('created-to').blur(),
  ]);
  const url = new URL(resp.url());
  expect(url.searchParams.get('created_from')).toBe(
    `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(first.getDate())}`,
  );
});

test('dashboard: atajos de periodo y rango editable por el usuario', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('date-from')).toHaveValue(ddmmyyyy(daysAgo(29)));
  await page.getByTestId('presets').getByText('7 días').click();
  await expect(page.getByTestId('date-from')).toHaveValue(ddmmyyyy(daysAgo(6)));
  await expect(page.getByTestId('date-to')).toHaveValue(ddmmyyyy(daysAgo(0)));

  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/dashboard?') && r.url().includes('date_from=2026-01-01')),
    (async () => {
      await page.getByTestId('date-from').fill('01/01/2026');
      await page.getByTestId('date-to').fill('31/03/2026');
      await page.getByTestId('date-to').blur();
    })(),
  ]);
  expect(new URL(resp.url()).searchParams.get('date_to')).toBe('2026-03-31');
  // Un rango manual desmarca los atajos.
  await expect(page.getByTestId('presets').locator('.mat-button-toggle-checked')).toHaveCount(0);

  await page.getByTestId('presets').getByText('Todo').click();
  await expect(page.getByTestId('date-from')).toHaveValue('');
  await expect(page.getByTestId('kpi-total')).toBeVisible();
});

test('vencimiento con calendario y hora al crear un ticket', async ({ page }) => {
  await login(page);
  await page.goto('/tickets/new');
  await page.getByTestId('title').fill(`UX vencimiento ${Date.now()}`);
  await page.getByTestId('client').click();
  await page.getByTestId('select-search').fill('acme');
  await page.getByRole('option', { name: /Acme/ }).click();
  await page.getByTestId('category').click();
  await page.getByRole('option', { name: 'Incidente' }).click();

  // Primero la hora y después la fecha (y al revés): ninguna pisa a la otra.
  await page.getByTestId('due-time').fill('14:30');
  await page.getByTestId('due-time').blur();
  await page.getByTestId('due-date').fill('15/12/2030');
  await page.getByTestId('due-date').blur();
  await page.getByTestId('save-ticket').click();
  await expect(page).toHaveURL(/\/tickets\/\d+$/);
  await expect(page.getByText('15/12/2030 14:30')).toBeVisible();
});

test('vencimiento: elegir fecha con el calendario conserva la hora y sin hora vence a las 23:59', async ({ page }) => {
  await login(page);
  await page.goto('/tickets/new');
  await page.getByTestId('title').fill(`UX vencimiento 2 ${Date.now()}`);
  await page.getByTestId('client').click();
  await page.getByRole('option', { name: /Acme/ }).click();
  await page.getByTestId('category').click();
  await page.getByRole('option', { name: 'Incidente' }).click();
  // Sólo hora: el formulario pide la fecha.
  await page.getByTestId('due-time').fill('08:15');
  await page.getByTestId('due-time').blur();
  await page.getByTestId('save-ticket').click();
  await expect(page.getByText('Indica también la fecha')).toBeVisible();
  // Fecha desde el calendario: el día 20 del mes siguiente.
  await page.getByTestId('due-picker').click();
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await page.getByRole('button', { name: /^20 de / }).click();
  await expect(page.getByTestId('due-time')).toHaveValue('08:15');
  await page.getByTestId('save-ticket').click();
  await expect(page).toHaveURL(/\/tickets\/\d+$/);
  const next = new Date();
  next.setMonth(next.getMonth() + 1, 20);
  const p2 = (n: number) => String(n).padStart(2, '0');
  await expect(page.getByText(`${p2(20)}/${p2(next.getMonth() + 1)}/${next.getFullYear()} 08:15`)).toBeVisible();

  // Editar: quitar la hora deja el vencimiento a las 23:59 del mismo día.
  await page.getByTestId('edit').click();
  await expect(page.getByTestId('due-time')).toHaveValue('08:15');
  await page.getByTestId('due-time').fill('');
  await page.getByTestId('due-time').blur();
  await page.getByTestId('save-ticket').click();
  await expect(page.getByText(`20/${p2(next.getMonth() + 1)}/${next.getFullYear()} 23:59`)).toBeVisible();
});
