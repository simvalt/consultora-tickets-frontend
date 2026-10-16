# consultora-tickets-frontend

SPA en **Angular 22** (TypeScript, componentes standalone + signals, Angular Material) del sistema interno de tickets. Parte de la solución de tres repositorios; **la guía para levantar todo está en el README de `consultora-tickets-backend`** (su `docker-compose.yml` construye este repositorio desde `../consultora-tickets-frontend`).

## Requisitos

Node.js 22 LTS (≥ 22.12) y npm. Versiones de dependencias fijadas en `package.json` (exactas) y `package-lock.json`. Fuentes e iconos son locales (`material-icons`), sin CDN.

## Instalación y ejecución

```bash
npm ci
npm start            # http://localhost:4200 — proxy de /api hacia http://localhost:8000 (proxy.conf.json)
```

Necesita el backend en `:8000` (ver guía principal). Credenciales **locales** de demostración: `admin@consultora.local` / `Admin#Local1234` (otros usuarios en la guía del backend).

## Pruebas, lint y compilación

```bash
npm test             # Vitest (ng test): 26 pruebas — auth/interceptor (renovación de token), guards, permisos,
                     #   PagedList, utilidades y el flujo principal por componentes (login → crear → asignar → estatus → cerrar)
npm run lint         # angular-eslint
npm run build        # compilación de producción en dist/ (presupuesto inicial < 1 MB)
npm run e2e          # Playwright contra el sistema real (frontend + backend + datos demo en marcha)
```

E2E (`e2e/main-flow.spec.ts`): login incorrecto; **login → crear ticket → asignar → iniciado → en proceso → pendiente (motivo) → cerrado (resolución) → historial y comentario**; usuario de sólo lectura sin acciones de escritura + páginas de acceso denegado/no encontrado; exportación CSV. Usa el Chrome instalado (`E2E_BROWSER_CHANNEL=chrome`, por defecto); con `E2E_BROWSER_CHANNEL=chromium` usa el navegador de `npx playwright install chromium`. `E2E_BASE_URL` (por defecto `http://localhost:4200`) y `E2E_ADMIN_*`/`E2E_READER_*` permiten apuntar a otro entorno.

## Configuración y variables

- **Tiempo de ejecución** (`public/config.js` → `window.APP_CONFIG.apiUrl`, por defecto `/api`). En Docker se regenera al arrancar a partir de `API_URL`, sin recompilar. Mantén la API en el **mismo origen** (recomendado) para que la cookie de refresco `HttpOnly` funcione sin CORS.
- Variables del contenedor: `BACKEND_URL` (destino del proxy `/api`, por defecto `http://backend:8000`) y `API_URL` (prefijo que usa el navegador). Ver `.env.example`.

## Docker

```bash
docker build -t consultora-tickets-frontend .
docker run --rm -p 4200:8080 -e BACKEND_URL=http://host.docker.internal:8000 consultora-tickets-frontend
```

Imagen multi-stage (`node:22-alpine` → `nginx-unprivileged`, puerto 8080, usuario sin privilegios). `docker/nginx.conf.template`: SPA con *fallback* a `index.html`, proxy `/api`, caché inmutable para bundles con hash, `no-store` para `index.html`/`config.js`, cabeceras de seguridad y **CSP estricta** (`script-src 'self'`), `/healthz`, respeto de `X-Forwarded-Proto` y plantilla comentada para la IP real tras Cloudflare.

## Arquitectura

```
src/app/
  core/       Auth (token en memoria + refresh por cookie), interceptor (Bearer + renovación única ante 401),
              guards (auth, permiso por módulo/nivel, redirección inicial), directiva *appCan, Api (HTTP + CSV),
              PagedList (estado de listados), servicios de lookups
  layout/     Shell responsivo (sidenav fijo en escritorio, menú desplegable en móvil)
  shared/     Diálogo de confirmación, estados vacío/error/carga, badges, paginador en español
  features/   login · dashboard (Chart.js) · tickets (lista, formulario, detalle + diálogos) · users · roles · clients · errors
```

Decisiones: rutas con *lazy loading*; el **access token vive sólo en memoria** y se restaura al recargar con la cookie `HttpOnly` de refresco; la interfaz **oculta** acciones con `*appCan` y bloquea rutas con `permissionGuard`, pero la autorización real está en el backend; las listas paginan/filtran/ordenan en servidor y el botón **Exportar CSV** pide al backend los mismos filtros y orden (todas las páginas); fechas en UTC en la API y mostradas en la zona horaria del navegador; textos en español (locale `es`).

## Permisos en la interfaz

Los niveles son acumulativos (Leer < Insertar < Editar < Eliminar). Sin lectura del módulo no aparece en el menú ni se puede abrir (→ «Acceso denegado»). «Nuevo» requiere Insertar; editar, **cambiar estatus, asignar y comentar** requieren Editar; eliminar/desactivar requiere Eliminar. La matriz de roles sólo permite otorgar niveles que el usuario ya tiene.

## Limitaciones conocidas

- Sólo tema claro. Tras recargar, la app hace una llamada de renovación (`/auth/refresh`) que devuelve 401 si no hay sesión (se ve en la consola; es esperado).
- Los filtros de listados no se reflejan en la URL.
- El presupuesto de bundle inicial admite hasta 750 kB sin aviso (Angular Material + Router).
