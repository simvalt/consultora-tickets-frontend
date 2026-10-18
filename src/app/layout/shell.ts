import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { Level, ModuleKey } from '../core/models';
import { Notify } from '../core/notify.service';
import { ThemePreference, ThemeService } from '../core/theme.service';
import { ChangePasswordDialog } from './change-password-dialog';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  module: ModuleKey;
}

/** Agrupado por propósito: el trabajo diario arriba, la administración aparte. */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operación',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: 'space_dashboard', module: 'dashboard' },
      { path: '/tickets', label: 'Tickets', icon: 'confirmation_number', module: 'tickets' },
      { path: '/clients', label: 'Clientes', icon: 'apartment', module: 'clients' },
    ],
  },
  {
    label: 'Administración',
    items: [
      { path: '/users', label: 'Usuarios', icon: 'group', module: 'users' },
      { path: '/roles', label: 'Roles y permisos', icon: 'admin_panel_settings', module: 'roles' },
    ],
  },
];

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
  ],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="!isMobile() || menuOpen()"
        (closedStart)="menuOpen.set(false)"
        class="shell-nav"
      >
        <div class="nav-inner">
          <a class="brand" routerLink="/" (click)="menuOpen.set(false)">
            <img src="favicon.svg" alt="" width="30" height="30" />
            <span>Consultora <strong>Tickets</strong></span>
          </a>

          <nav aria-label="Navegación principal" class="nav">
            @for (group of groups(); track group.label) {
              <p class="nav-group">{{ group.label }}</p>
              @for (item of group.items; track item.path) {
                <a
                  class="nav-link"
                  [routerLink]="item.path"
                  routerLinkActive="active"
                  ariaCurrentWhenActive="page"
                  (click)="menuOpen.set(false)"
                >
                  <mat-icon aria-hidden="true">{{ item.icon }}</mat-icon>
                  <span>{{ item.label }}</span>
                </a>
              }
            }
          </nav>

          <button class="user" type="button" [matMenuTriggerFor]="userMenu" data-testid="user-menu">
            <span class="avatar" aria-hidden="true">{{ initials() }}</span>
            <span class="user-text">
              <span class="user-name">{{ auth.user()?.full_name }}</span>
              <span class="user-role">{{ auth.user()?.role_name }}</span>
            </span>
            <mat-icon aria-hidden="true">unfold_more</mat-icon>
          </button>
          <mat-menu #userMenu="matMenu" yPosition="above" class="user-menu">
            <div class="menu-user">
              <strong>{{ auth.user()?.full_name }}</strong>
              <small>{{ auth.user()?.email }}</small>
            </div>
            <p class="menu-label">Apariencia</p>
            @for (opt of themeOptions; track opt.value) {
              <button
                mat-menu-item
                (click)="theme.set(opt.value)"
                [attr.aria-checked]="theme.preference() === opt.value"
                role="menuitemradio"
                [attr.data-testid]="'theme-' + opt.value"
              >
                <mat-icon>{{ opt.icon }}</mat-icon>
                <span>{{ opt.label }}</span>
                @if (theme.preference() === opt.value) {
                  <mat-icon class="check" aria-hidden="true">check</mat-icon>
                }
              </button>
            }
            <div class="menu-sep" role="separator"></div>
            <button mat-menu-item (click)="changePassword()" data-testid="change-password">
              <mat-icon>key</mat-icon>
              <span>Cambiar contraseña</span>
            </button>
            <button mat-menu-item (click)="logout()" data-testid="logout">
              <mat-icon>logout</mat-icon>
              <span>Cerrar sesión</span>
            </button>
          </mat-menu>
        </div>
      </mat-sidenav>

      <mat-sidenav-content>
        @if (isMobile()) {
          <header class="topbar">
            <button mat-icon-button (click)="menuOpen.set(!menuOpen())" aria-label="Abrir menú">
              <mat-icon>menu</mat-icon>
            </button>
            <img src="favicon.svg" alt="" width="24" height="24" />
            <span class="topbar-title">Consultora Tickets</span>
          </header>
        }
        <main class="content" id="main">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .shell {
      height: 100dvh;
    }
    .shell-nav {
      width: 256px;
      border-right: 1px solid var(--border);
    }
    .nav-inner {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 18px 12px 12px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 10px 18px;
      color: var(--text);
      text-decoration: none;
      font-size: 1rem;
      letter-spacing: -0.01em;
    }
    .brand img {
      border-radius: 8px;
      box-shadow: var(--shadow-sm);
    }
    .brand strong {
      font-weight: 650;
    }
    .nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      overflow-y: auto;
    }
    .nav-group {
      margin: 14px 10px 6px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--muted);
    }
    .nav-group:first-child {
      margin-top: 0;
    }
    .nav-link {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 38px;
      padding: 0 10px;
      border-radius: 10px;
      color: var(--text);
      text-decoration: none;
      font-size: 0.9063rem;
      font-weight: 500;
      transition:
        background-color 120ms ease,
        transform 120ms var(--ease-out);
    }
    .nav-link mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: var(--muted);
    }
    .nav-link:hover {
      background: color-mix(in srgb, var(--text) 6%, transparent);
    }
    .nav-link:active {
      transform: scale(0.98);
    }
    .nav-link.active {
      background: var(--surface);
      box-shadow: var(--shadow-sm);
      font-weight: 600;
    }
    .nav-link.active mat-icon {
      color: var(--accent);
    }
    .user {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      margin-top: 12px;
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--surface);
      color: var(--text);
      cursor: pointer;
      text-align: left;
      box-shadow: var(--shadow-sm);
      transition: transform 120ms var(--ease-out);
    }
    .user:active {
      transform: scale(0.98);
    }
    .avatar {
      flex: none;
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: var(--accent-soft);
      color: var(--accent-strong);
      font-weight: 650;
      font-size: 0.8125rem;
    }
    .user-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .user-name {
      font-weight: 600;
      font-size: 0.875rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .user-role {
      font-size: 0.75rem;
      color: var(--muted);
    }
    .user mat-icon {
      color: var(--muted);
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .menu-user {
      display: flex;
      flex-direction: column;
      padding: 10px 16px 12px;
      gap: 2px;
      border-bottom: 1px solid var(--border);
    }
    .menu-user small {
      color: var(--muted);
    }
    .menu-label {
      margin: 10px 16px 2px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--muted);
    }
    .menu-sep {
      height: 1px;
      margin: 6px 0;
      background: var(--border);
    }
    .check {
      margin-left: auto;
      margin-right: 0;
      color: var(--accent);
    }
    /* Barra superior móvil: material translúcido, el contenido se desplaza por debajo. */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 3;
      display: flex;
      align-items: center;
      gap: 8px;
      height: 56px;
      padding: 0 8px;
      background: color-mix(in srgb, var(--bg) 72%, transparent);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    }
    .topbar img {
      border-radius: 6px;
    }
    .topbar-title {
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    @media (prefers-reduced-transparency: reduce) {
      .topbar {
        background: var(--bg);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
    }
  `,
})
export class Shell {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  readonly menuOpen = signal(false);
  readonly isMobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 899px)')
      .pipe(map((s) => s.matches)),
    { initialValue: false },
  );
  readonly groups = computed(() =>
    NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => this.auth.can(n.module, Level.Read)) })).filter(
      (g) => g.items.length > 0,
    ),
  );
  readonly initials = computed(() =>
    (this.auth.user()?.full_name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join(''),
  );
  readonly themeOptions: { value: ThemePreference; label: string; icon: string }[] = [
    { value: 'system', label: 'Como el sistema', icon: 'contrast' },
    { value: 'light', label: 'Claro', icon: 'light_mode' },
    { value: 'dark', label: 'Oscuro', icon: 'dark_mode' },
  ];

  changePassword(): void {
    this.dialog
      .open(ChangePasswordDialog, { width: '440px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((ok) => ok && this.notify.success('Contraseña actualizada. Se cerraron tus otras sesiones.'));
  }

  logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
