import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { Level, ModuleKey } from '../core/models';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  module: ModuleKey;
}

const NAV: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard', module: 'dashboard' },
  { path: '/tickets', label: 'Tickets', icon: 'confirmation_number', module: 'tickets' },
  { path: '/clients', label: 'Clientes', icon: 'business', module: 'clients' },
  { path: '/users', label: 'Usuarios', icon: 'group', module: 'users' },
  { path: '/roles', label: 'Roles y permisos', icon: 'admin_panel_settings', module: 'roles' },
];

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
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
        <div class="brand"><mat-icon aria-hidden="true">support_agent</mat-icon> Consultora Tickets</div>
        <nav aria-label="Navegación principal">
          <mat-nav-list>
            @for (item of items(); track item.path) {
              <a mat-list-item [routerLink]="item.path" routerLinkActive="active-link" (click)="menuOpen.set(false)">
                <mat-icon matListItemIcon aria-hidden="true">{{ item.icon }}</mat-icon>
                <span matListItemTitle>{{ item.label }}</span>
              </a>
            }
          </mat-nav-list>
        </nav>
      </mat-sidenav>

      <mat-sidenav-content>
        <mat-toolbar class="topbar">
          @if (isMobile()) {
            <button mat-icon-button (click)="menuOpen.set(!menuOpen())" aria-label="Abrir menú">
              <mat-icon>menu</mat-icon>
            </button>
          }
          <span class="spacer"></span>
          <button mat-button [matMenuTriggerFor]="userMenu" data-testid="user-menu">
            <mat-icon aria-hidden="true">account_circle</mat-icon>
            <span class="user-name">{{ auth.user()?.full_name }}</span>
          </button>
          <mat-menu #userMenu="matMenu">
            <div class="menu-user">
              <strong>{{ auth.user()?.full_name }}</strong>
              <small>{{ auth.user()?.email }}</small>
              <small>Rol: {{ auth.user()?.role_name }}</small>
            </div>
            <button mat-menu-item (click)="logout()" data-testid="logout">
              <mat-icon>logout</mat-icon>
              <span>Cerrar sesión</span>
            </button>
          </mat-menu>
        </mat-toolbar>
        <main class="content" id="main">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
})
export class Shell {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly menuOpen = signal(false);
  readonly isMobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 899px)')
      .pipe(map((s) => s.matches)),
    { initialValue: false },
  );
  readonly items = computed(() => NAV.filter((n) => this.auth.can(n.module, Level.Read)));

  logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
