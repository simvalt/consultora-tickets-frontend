export type ModuleKey = 'tickets' | 'users' | 'roles' | 'clients' | 'dashboard';
export type Permissions = Record<ModuleKey, number>;

export const Level = { None: 0, Read: 1, Insert: 2, Update: 3, Delete: 4 } as const;
export const LEVEL_LABELS: Record<number, string> = {
  0: 'Nada',
  1: 'Leer',
  2: 'Insertar',
  3: 'Editar',
  4: 'Eliminar',
};
export const LEVEL_HINTS: Record<number, string> = {
  0: 'Sin acceso',
  1: 'Consultar',
  2: 'Consultar y crear',
  3: 'Consultar, crear y modificar',
  4: 'Consultar, crear, modificar y eliminar',
};
export const MODULES: { key: ModuleKey; label: string }[] = [
  { key: 'tickets', label: 'Tickets' },
  { key: 'users', label: 'Usuarios' },
  { key: 'roles', label: 'Roles y permisos' },
  { key: 'clients', label: 'Clientes' },
  { key: 'dashboard', label: 'Dashboard' },
];

export type TicketStatus =
  'sin_inicio' | 'iniciado' | 'en_proceso' | 'pendiente' | 'cancelado' | 'cerrado' | 'rechazado';
export type TicketPriority = 'baja' | 'media' | 'alta' | 'critica';

export const STATUS_LABELS: Record<TicketStatus, string> = {
  sin_inicio: 'Sin inicio',
  iniciado: 'Iniciado',
  en_proceso: 'En proceso',
  pendiente: 'Pendiente',
  cancelado: 'Cancelado',
  cerrado: 'Cerrado',
  rechazado: 'Rechazado',
};
export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};
export const STATUSES = Object.keys(STATUS_LABELS) as TicketStatus[];
export const PRIORITIES = Object.keys(PRIORITY_LABELS) as TicketPriority[];
/** Estatus que exigen motivo; el cierre exige resumen de resolución. */
export const REASON_REQUIRED: TicketStatus[] = ['pendiente', 'cancelado', 'rechazado'];

export interface Me {
  id: number;
  email: string;
  full_name: string;
  role_id: number;
  role_name: string;
  permissions: Permissions;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: Me;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface LookupItem {
  id: number;
  name: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role_id: number;
  role_name: string;
  /** Permisos efectivos (rol + overrides). */
  permissions: Permissions;
  /** Sólo los niveles propios del usuario (sobrescriben al rol por módulo). */
  permission_overrides: Partial<Permissions>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface Role {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  permissions: Permissions;
  user_count: number;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: number;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: number;
  folio: string;
  title: string;
  description: string;
  client_id: number;
  client_name: string;
  category_id: number;
  category_name: string;
  priority: TicketPriority;
  status: TicketStatus;
  created_by: number;
  created_by_name: string;
  assignee_id: number | null;
  assignee_name: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  closed_at: string | null;
  due_at: string | null;
  is_overdue: boolean;
}

export interface TicketDetail extends Ticket {
  allowed_transitions: TicketStatus[];
}

export interface TicketComment {
  id: number;
  ticket_id: number;
  author_id: number;
  author_name: string;
  body: string;
  created_at: string;
}

export interface TicketEvent {
  id: number;
  event_type: 'created' | 'status_change' | 'assignment' | 'reopen' | 'deleted';
  from_status: TicketStatus | null;
  to_status: TicketStatus | null;
  from_assignee_id: number | null;
  from_assignee_name: string | null;
  to_assignee_id: number | null;
  to_assignee_name: string | null;
  actor_name: string;
  reason: string | null;
  created_at: string;
}

export interface CountItem {
  key: string;
  label: string;
  count: number;
}

export interface Dashboard {
  total: number;
  open: number;
  pending: number;
  closed: number;
  cancelled: number;
  rejected: number;
  overdue: number;
  avg_resolution_hours: number | null;
  by_status: CountItem[];
  by_priority: CountItem[];
  open_by_assignee: CountItem[];
  by_client: CountItem[];
  series: { date: string; created: number; closed: number }[];
  series_from: string;
  series_to: string;
}

export interface Meta {
  categories: { id: number; name: string }[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: { field: string; message: string }[] | null };
}
