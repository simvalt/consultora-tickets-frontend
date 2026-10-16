/**
 * Sólo se aceptan rutas internas de la aplicación como destino tras el login
 * («/tickets/5»). Se rechazan URLs absolutas o relativas al protocolo («//evil.com», «/\\evil.com»).
 */
export function safeReturnUrl(url: string | null | undefined): string {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return '/';
  return url;
}
