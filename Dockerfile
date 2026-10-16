# --- Compilación ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npx ng build --configuration production

# --- Servidor estático + proxy /api (nginx sin privilegios, puerto 8080) ---
FROM nginxinc/nginx-unprivileged:1.27-alpine
# BACKEND_URL: dónde está la API para el proxy /api. API_URL: prefijo que usa el navegador (config.js).
ENV BACKEND_URL=http://backend:8000 \
    API_URL=/api
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --chmod=755 docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build --chown=101:101 /app/dist/consultora-tickets-frontend/browser /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
