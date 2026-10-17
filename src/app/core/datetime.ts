/** Fecha local (sin hora) en formato yyyy-mm-dd, el que esperan los filtros de la API. */
export function toIsoDate(date: Date | null | undefined): string {
  if (!date || isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Hoy menos `days` días, a medianoche local. */
export function daysAgo(days = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

export function startOfMonth(): Date {
  const d = daysAgo(0);
  d.setDate(1);
  return d;
}

export function startOfYear(): Date {
  const d = daysAgo(0);
  d.setMonth(0, 1);
  return d;
}

/** ISO UTC del servidor → Date (o null). */
export function fromIso(iso: string | null | undefined): Date | null {
  return iso ? new Date(iso) : null;
}

/** Date local → ISO UTC para el servidor (o null). */
export function toIso(date: Date | null | undefined): string | null {
  return date && !isNaN(date.getTime()) ? date.toISOString() : null;
}

/** Une la fecha (día) con la hora (hh:mm) de dos controles; sin hora se usa el final del día (23:59). */
export function combineDateTime(date: Date | null | undefined, time: Date | null | undefined): Date | null {
  if (!date || isNaN(date.getTime())) return null;
  const result = new Date(date);
  if (time && !isNaN(time.getTime())) result.setHours(time.getHours(), time.getMinutes(), 0, 0);
  else result.setHours(23, 59, 0, 0);
  return result;
}

export function formatDuration(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} días`;
}
