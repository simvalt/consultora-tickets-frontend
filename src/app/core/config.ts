/** Configuración en tiempo de ejecución: `config.js` se genera al arrancar el contenedor (API_URL). */
interface RuntimeConfig {
  apiUrl?: string;
}

declare global {
  interface Window {
    APP_CONFIG?: RuntimeConfig;
  }
}

export function apiUrl(): string {
  const url = (typeof window !== 'undefined' && window.APP_CONFIG?.apiUrl) || '/api';
  return url.replace(/\/+$/, '');
}
