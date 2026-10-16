import { defineConfig } from '@playwright/test';

/**
 * Pruebas E2E contra el sistema completo (frontend + backend + BD con datos demo).
 * Variables: E2E_BASE_URL (por defecto http://localhost:4200) y E2E_BROWSER_CHANNEL
 * (por defecto «chrome»: usa el Chrome instalado; con «chromium» usa el que descarga `npx playwright install`).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4200',
    channel: process.env['E2E_BROWSER_CHANNEL'] ?? 'chrome',
    trace: 'retain-on-failure',
    locale: 'es-MX',
  },
});
