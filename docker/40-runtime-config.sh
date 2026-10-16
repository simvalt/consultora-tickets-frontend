#!/bin/sh
# Genera config.js en cada arranque a partir de API_URL (configuración en tiempo de ejecución, sin recompilar).
set -eu
API_URL_ESCAPED=$(printf '%s' "${API_URL:-/api}" | sed "s/[\\\\']/\\\\&/g")
printf "window.APP_CONFIG = { apiUrl: '%s' };\n" "$API_URL_ESCAPED" > /usr/share/nginx/html/config.js
echo "config.js generado (apiUrl=${API_URL:-/api})"
