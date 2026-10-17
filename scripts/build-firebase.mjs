#!/usr/bin/env node
/**
 * Compilación para Firebase Hosting.
 *
 *   API_URL=https://tickets-api.sivalt.com/api npm run build:firebase
 *
 * 1. Compila Angular en modo producción.
 * 2. Escribe dist/.../browser/config.js con la URL de la API (no hay nginx que lo genere en Firebase).
 * 3. Regenera firebase.json: SPA, cabeceras de seguridad y una CSP cuyo connect-src permite SÓLO la API indicada.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = 'dist/consultora-tickets-frontend/browser';

const apiUrl = (process.env.API_URL ?? '').replace(/\/+$/, '');
let api;
try {
  api = new URL(apiUrl);
} catch {
  console.error('Define API_URL, por ejemplo: API_URL=https://tickets-api.sivalt.com/api');
  process.exit(1);
}
const isLocal = ['localhost', '127.0.0.1'].includes(api.hostname);
if (api.protocol !== 'https:' && !isLocal) {
  console.error('API_URL debe usar https (la cookie de sesión es Secure).');
  process.exit(1);
}

if (!process.argv.includes('--skip-build')) {
  const ng = spawnSync(
    process.execPath,
    ['node_modules/@angular/cli/bin/ng.js', 'build', '--configuration', 'production'],
    {
      cwd: root,
      stdio: 'inherit',
    },
  );
  if (ng.status !== 0) process.exit(ng.status ?? 1);
}

writeFileSync(
  join(root, publicDir, 'config.js'),
  `// Generado por scripts/build-firebase.mjs\nwindow.APP_CONFIG = { apiUrl: ${JSON.stringify(apiUrl)} };\n`,
);

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${api.origin}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const noStore = [{ key: 'Cache-Control', value: 'no-store' }];
const firebase = {
  hosting: {
    public: publicDir,
    ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
    rewrites: [{ source: '**', destination: '/index.html' }],
    headers: [
      {
        source: '**',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
      // Bundles con hash en el nombre (main-XXXX.js, chunk-XXXX.js, styles-XXXX.css) y fuentes: caché de un año.
      {
        source: '**/*-*.@(js|css)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      { source: '/media/**', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      // index.html, config.js y rutas de la SPA: siempre frescos.
      { source: '/', headers: noStore },
      { source: '/index.html', headers: noStore },
      { source: '/config.js', headers: noStore },
      { source: '**/!(*.*)', headers: noStore },
    ],
  },
};
writeFileSync(join(root, 'firebase.json'), JSON.stringify(firebase, null, 2) + '\n');
console.log(`\nListo para Firebase: API ${apiUrl}\n  config.js y firebase.json generados (connect-src ${api.origin}).`);
console.log('  Despliega con: npx firebase-tools@15.32.1 deploy --only hosting');
