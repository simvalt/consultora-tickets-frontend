import { LEVEL_LABELS, MODULES, ModuleKey } from './models';

/** Permisos parciales por módulo (en un usuario, los módulos ausentes heredan del rol). */
export type PermMap = Partial<Record<ModuleKey, number>>;

const LEVEL_NAMES = ['nada', 'leer', 'insertar', 'editar', 'eliminar'];
const LEVEL_ALIASES: Record<string, number> = {
  nada: 0,
  ninguno: 0,
  none: 0,
  leer: 1,
  ver: 1,
  consultar: 1,
  read: 1,
  insertar: 2,
  crear: 2,
  insert: 2,
  create: 2,
  editar: 3,
  modificar: 3,
  update: 3,
  edit: 3,
  eliminar: 4,
  borrar: 4,
  delete: 4,
};
const MODULE_ALIASES: Record<string, ModuleKey> = {
  ticket: 'tickets',
  tickets: 'tickets',
  usuario: 'users',
  usuarios: 'users',
  users: 'users',
  user: 'users',
  rol: 'roles',
  roles: 'roles',
  permisos: 'roles',
  permiso: 'roles',
  cliente: 'clients',
  clientes: 'clients',
  clients: 'clients',
  dashboard: 'dashboard',
  analitica: 'dashboard',
  analítica: 'dashboard',
};

export const levelName = (level: number): string => LEVEL_NAMES[level] ?? String(level);

/** Texto JSON editable: {"tickets": "insertar", "dashboard": "leer"}. */
export function permissionsToJson(map: PermMap): string {
  const out: Record<string, string> = {};
  for (const m of MODULES) {
    const level = map[m.key];
    if (level !== undefined) out[m.key] = levelName(level);
  }
  return JSON.stringify(out, null, 2);
}

export type ParseResult = { ok: true; value: PermMap } | { ok: false; error: string };

/** Interpreta el JSON: acepta niveles por nombre (leer, crear, editar...) o número 0-4 y alias de módulo. */
export function parsePermissionsJson(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text.trim() === '' ? '{}' : text);
  } catch {
    return { ok: false, error: 'JSON no válido' };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Debe ser un objeto, por ejemplo {"tickets": "crear"}' };
  }
  const value: PermMap = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    const module = MODULE_ALIASES[key.trim().toLowerCase()];
    if (!module) {
      return { ok: false, error: `Módulo desconocido: «${key}». Usa: ${MODULES.map((m) => m.key).join(', ')}` };
    }
    let level: number | undefined;
    if (typeof v === 'number' && Number.isInteger(v)) level = v;
    else if (typeof v === 'string')
      level = LEVEL_ALIASES[v.trim().toLowerCase()] ?? (/^\d$/.test(v.trim()) ? Number(v) : undefined);
    if (level === undefined || level < 0 || level > 4) {
      return { ok: false, error: `Nivel no válido para «${key}». Usa: ${LEVEL_NAMES.join(', ')}` };
    }
    value[module] = level;
  }
  return { ok: true, value };
}

export const LEVEL_OPTIONS = Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value: Number(value), label }));
