import { Routes } from '@angular/router';
import { Observable } from 'rxjs';
import { Level } from './core/models';
import { authGuard, guestGuard, homeRedirect, permissionGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Iniciar sesión',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', canActivate: [homeRedirect], children: [] },
      {
        path: 'dashboard',
        title: 'Dashboard',
        canActivate: [permissionGuard('dashboard', Level.Read)],
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'tickets',
        title: 'Tickets',
        canActivate: [permissionGuard('tickets', Level.Read)],
        loadComponent: () => import('./features/tickets/ticket-list').then((m) => m.TicketList),
      },
      {
        path: 'tickets/new',
        canDeactivate: [(form: TicketFormLike) => form.canLeave()],
        title: 'Nuevo ticket',
        canActivate: [permissionGuard('tickets', Level.Insert)],
        loadComponent: () => import('./features/tickets/ticket-form').then((m) => m.TicketForm),
      },
      {
        path: 'tickets/:id/edit',
        canDeactivate: [(form: TicketFormLike) => form.canLeave()],
        title: 'Editar ticket',
        canActivate: [permissionGuard('tickets', Level.Update)],
        loadComponent: () => import('./features/tickets/ticket-form').then((m) => m.TicketForm),
      },
      {
        path: 'tickets/:id',
        title: 'Detalle de ticket',
        canActivate: [permissionGuard('tickets', Level.Read)],
        loadComponent: () => import('./features/tickets/ticket-detail').then((m) => m.TicketDetailPage),
      },
      {
        path: 'users',
        title: 'Usuarios',
        canActivate: [permissionGuard('users', Level.Read)],
        loadComponent: () => import('./features/users/users').then((m) => m.UsersPage),
      },
      {
        path: 'roles',
        title: 'Roles y permisos',
        canActivate: [permissionGuard('roles', Level.Read)],
        loadComponent: () => import('./features/roles/roles').then((m) => m.RolesPage),
      },
      {
        path: 'clients',
        title: 'Clientes',
        canActivate: [permissionGuard('clients', Level.Read)],
        loadComponent: () => import('./features/clients/clients').then((m) => m.ClientsPage),
      },
      {
        path: 'forbidden',
        title: 'Acceso denegado',
        loadComponent: () => import('./features/errors/errors').then((m) => m.Forbidden),
      },
      {
        path: '**',
        title: 'No encontrado',
        loadComponent: () => import('./features/errors/errors').then((m) => m.NotFound),
      },
    ],
  },
];

/** Lo mínimo del formulario de ticket que necesita la guardia de salida (sin importar el componente perezoso). */
interface TicketFormLike {
  canLeave(): Observable<boolean>;
}
