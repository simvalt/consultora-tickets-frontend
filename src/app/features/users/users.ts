import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { debounceTime } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CanDirective } from '../../core/can.directive';
import { Lookups, RoleLookup } from '../../core/lookups.service';
import { LookupItem, Page, User } from '../../core/models';
import { Notify } from '../../core/notify.service';
import { PagedList } from '../../core/paged-list';
import { confirm } from '../../shared/confirm-dialog';
import { PermMap } from '../../core/permissions-json';
import { PermissionsEditor } from '../../shared/permissions-editor';
import { ColumnPicker, TableColumns } from '../../shared/column-picker';
import { SELECT_SEARCH } from '../../shared/select-search';
import { EmptyState, ErrorState, LoadingBar, TableSkeleton } from '../../shared/states';

/** Claves = columnas de exportación del backend. */
const USER_COLUMNS = [
  { key: 'full_name', label: 'Nombre' },
  { key: 'email', label: 'Correo' },
  { key: 'role', label: 'Rol' },
  { key: 'is_active', label: 'Estado' },
  { key: 'last_login_at', label: 'Último acceso' },
  { key: 'created_at', label: 'Creado', visible: false },
];

@Component({
  selector: 'app-user-dialog',
  imports: [
    SELECT_SEARCH,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    PermissionsEditor,
  ],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Editar usuario' : 'Nuevo usuario' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        @if (error()) {
          <p class="banner error" role="alert">{{ error() }}</p>
        }
        <div class="form-grid">
          <mat-form-field appearance="outline" class="span2">
            <mat-label>Nombre completo</mat-label>
            <input matInput formControlName="full_name" maxlength="150" data-testid="user-name" />
            @if (form.controls.full_name.touched && form.controls.full_name.invalid) {
              <mat-error>El nombre es obligatorio</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" class="span2">
            <mat-label>Correo electrónico</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="off" data-testid="user-email" />
            @if (form.controls.email.touched && form.controls.email.invalid) {
              <mat-error>Ingresa un correo válido</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Rol</mat-label>
            <mat-select formControlName="role_id" data-testid="user-role">
              <app-select-search #sr />
              @for (r of roles() | optionFilter: sr.term() : form.value.role_id; track r.id) {
                <mat-option [value]="r.id">{{ r.name }}</mat-option>
              } @empty {
                <mat-option disabled>Sin coincidencias</mat-option>
              }
            </mat-select>
            @if (form.controls.role_id.touched && form.controls.role_id.invalid) {
              <mat-error>Selecciona un rol</mat-error>
            }
            @if (isSelf) {
              <mat-hint>No puedes cambiar tu propio rol</mat-hint>
            }
          </mat-form-field>
          @if (isSelf) {
            <p class="muted span2">Tu contraseña se cambia desde el menú de usuario → «Cambiar contraseña».</p>
          } @else {
            <mat-form-field appearance="outline">
              <mat-label>{{ data ? 'Nueva contraseña (opcional)' : 'Contraseña' }}</mat-label>
              <input
                matInput
                type="password"
                formControlName="password"
                autocomplete="new-password"
                data-testid="user-password"
              />
              <mat-hint>Mínimo 10 caracteres</mat-hint>
              @if (form.controls.password.touched && form.controls.password.invalid) {
                <mat-error>Mínimo 10 caracteres</mat-error>
              }
            </mat-form-field>
          }
        </div>
        <h3 class="perm-title">Permisos propios del usuario</h3>
        <p class="muted perm-help">
          Además de su rol, puedes sobrescribir el nivel de módulos concretos. Lo que no se defina se hereda del rol.
        </p>
        @if (isSelf) {
          <p class="banner info">No puedes cambiar tus propios permisos.</p>
        } @else {
          <app-permissions-editor [(value)]="overrides" mode="user" [inherited]="inheritedPerms()" />
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="saving()" data-testid="user-save">Guardar</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .perm-title {
      margin: 12px 0 0;
      font-size: 1rem;
    }
    .perm-help {
      margin: 2px 0 8px;
      font-size: 0.85rem;
    }
  `,
})
export class UserDialog {
  readonly data = inject<User | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<UserDialog>);
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  readonly roles = signal<RoleLookup[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isSelf = this.data?.id === this.auth.user()?.id;
  readonly overrides = signal<PermMap>(this.data?.permission_overrides ?? {});
  private readonly roleId = signal<number | null>(this.data?.role_id ?? null);
  readonly inheritedPerms = computed(() => this.roles().find((r) => r.id === this.roleId())?.permissions ?? {});
  readonly form = this.fb.nonNullable.group({
    full_name: [this.data?.full_name ?? '', [Validators.required, Validators.maxLength(150)]],
    email: [this.data?.email ?? '', [Validators.required, Validators.email]],
    role_id: [this.data?.role_id ?? (null as number | null), [Validators.required]],
    password: ['', this.data ? [Validators.minLength(10)] : [Validators.required, Validators.minLength(10)]],
  });

  constructor() {
    inject(Lookups)
      .roles()
      .subscribe((r) => this.roles.set(r));
    if (this.isSelf) this.form.controls.role_id.disable();
    this.form.controls.role_id.valueChanges.subscribe((id) => this.roleId.set(id));
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const body: Record<string, unknown> = { full_name: v.full_name, email: v.email, role_id: v.role_id };
    if (!this.isSelf) body['permission_overrides'] = this.overrides();
    if (v.password) body['password'] = v.password;
    const req = this.data ? this.api.patch<User>(`/users/${this.data.id}`, body) : this.api.post<User>('/users', body);
    req.subscribe({
      next: (u) => this.ref.close(u),
      error: (e) => {
        this.saving.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}

@Component({
  selector: 'app-users',
  imports: [
    TableSkeleton,
    ColumnPicker,
    SELECT_SEARCH,
    ReactiveFormsModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    DatePipe,
    CanDirective,
    EmptyState,
    ErrorState,
    LoadingBar,
  ],
  template: `
    <div class="page-header">
      <h1>
        Usuarios
        <span class="subtitle">
          @if (list.loaded()) {
            {{ list.total() }} {{ list.total() === 1 ? 'usuario' : 'usuarios'
            }}{{ list.filtered() ? ' con estos filtros' : '' }}
          } @else {
            Cargando…
          }
        </span>
      </h1>
      <div class="actions">
        <app-column-picker [columns]="cols" />
        <button mat-stroked-button (click)="export()" [disabled]="exporting()" data-testid="export">
          <mat-icon>download</mat-icon> Exportar CSV
        </button>
        <button *appCan="['users', 2]" mat-flat-button (click)="edit(null)" data-testid="new-user">
          <mat-icon>person_add</mat-icon> Nuevo usuario
        </button>
      </div>
    </div>

    <form class="filters" [formGroup]="filters">
      <mat-form-field appearance="outline" class="grow">
        <mat-label>Buscar</mat-label>
        <input matInput formControlName="q" placeholder="Nombre o correo" data-testid="search-users" />
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Rol</mat-label>
        <mat-select formControlName="role_id">
          <app-select-search #sr />
          <mat-option value="">Todos</mat-option>
          @for (r of roles() | optionFilter: sr.term() : filters.value.role_id; track r.id) {
            <mat-option [value]="r.id">{{ r.name }}</mat-option>
          } @empty {
            <mat-option disabled>Sin coincidencias</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Estado</mat-label>
        <mat-select formControlName="is_active">
          <app-select-search #se />
          <mat-option value="">Todos</mat-option>
          @for (o of stateOptions | optionFilter: se.term() : filters.value.is_active; track o.id) {
            <mat-option [value]="o.id">{{ o.name }}</mat-option>
          } @empty {
            <mat-option disabled>Sin coincidencias</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </form>

    <app-loading-bar [active]="list.loading() && list.loaded()" />
    @if (!list.loaded()) {
      <app-table-skeleton />
    } @else if (list.error()) {
      <app-error-state [message]="list.error()!"
        ><button mat-stroked-button (click)="list.load()">Reintentar</button></app-error-state
      >
    } @else if (list.loaded() && list.total() === 0) {
      <div class="table-wrap">
        <app-empty-state icon="group" title="No hay usuarios" hint="Ajusta los filtros o crea un nuevo usuario." />
      </div>
    } @else {
      <div class="table-wrap">
        <table
          mat-table
          [dataSource]="list.items()"
          matSort
          [matSortActive]="list.sort()"
          [matSortDirection]="list.order()"
          (matSortChange)="sort($event)"
        >
          <ng-container matColumnDef="full_name">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="full_name">Nombre</th>
            <td mat-cell *matCellDef="let u" [class.inactive]="!u.is_active">{{ u.full_name }}</td>
          </ng-container>
          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="email">Correo</th>
            <td mat-cell *matCellDef="let u">{{ u.email }}</td>
          </ng-container>
          <ng-container matColumnDef="role">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="role">Rol</th>
            <td mat-cell *matCellDef="let u">{{ u.role_name }}</td>
          </ng-container>
          <ng-container matColumnDef="is_active">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="is_active">Estado</th>
            <td mat-cell *matCellDef="let u">
              <span class="badge" [class]="u.is_active ? 'status-cerrado' : 'status-sin_inicio'">{{
                u.is_active ? 'Activo' : 'Inactivo'
              }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="created_at">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="created_at">Creado</th>
            <td mat-cell *matCellDef="let u">{{ u.created_at | date: 'dd/MM/yyyy' }}</td>
          </ng-container>
          <ng-container matColumnDef="last_login_at">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="last_login_at">Último acceso</th>
            <td mat-cell *matCellDef="let u">
              {{ u.last_login_at ? (u.last_login_at | date: 'dd/MM/yyyy HH:mm') : 'Nunca' }}
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef><span class="sr-only">Acciones</span></th>
            <td mat-cell *matCellDef="let u" class="row-actions">
              <button *appCan="['users', 3]" mat-icon-button (click)="edit(u)" aria-label="Editar usuario">
                <mat-icon>edit</mat-icon>
              </button>
              @if (u.is_active) {
                @if (u.id !== me()?.id) {
                  <button
                    *appCan="['users', 4]"
                    mat-icon-button
                    (click)="deactivate(u)"
                    aria-label="Desactivar usuario"
                  >
                    <mat-icon>block</mat-icon>
                  </button>
                }
              } @else {
                <button *appCan="['users', 3]" mat-icon-button (click)="activate(u)" aria-label="Reactivar usuario">
                  <mat-icon>check_circle</mat-icon>
                </button>
              }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="displayed()"></tr>
          <tr mat-row *matRowDef="let row; columns: displayed()"></tr>
        </table>
        <mat-paginator
          [length]="list.total()"
          [pageIndex]="list.page() - 1"
          [pageSize]="list.pageSize()"
          [pageSizeOptions]="[10, 20, 50, 100]"
          (page)="list.setPage($event.pageIndex, $event.pageSize)"
        />
      </div>
    }
  `,
})
export class UsersPage implements OnDestroy {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  readonly me = inject(AuthService).user;

  readonly cols = new TableColumns('cols:users', USER_COLUMNS);
  /** Columnas elegidas por el usuario + acciones (siempre al final, no exportable). */
  readonly displayed = computed(() => [...this.cols.visible(), 'actions']);
  readonly stateOptions = [
    { id: 'true', name: 'Activos' },
    { id: 'false', name: 'Inactivos' },
  ];
  readonly list = new PagedList<User>((p) => this.api.get<Page<User>>('/users', p), 'full_name');
  readonly roles = signal<LookupItem[]>([]);
  readonly exporting = signal(false);
  readonly filters = this.fb.nonNullable.group({ q: [''], role_id: [''], is_active: [''] });

  constructor() {
    inject(Lookups)
      .roles()
      .subscribe({ next: (r) => this.roles.set(r), error: () => this.roles.set([]) });
    this.apply();
    this.filters.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.apply());
  }

  ngOnDestroy(): void {
    this.list.destroy();
  }

  private apply(): void {
    this.list.setFilters(this.filters.getRawValue());
  }

  sort(s: Sort): void {
    this.list.setSort(s.active, s.direction);
  }

  edit(user: User | null): void {
    this.dialog
      .open(UserDialog, { data: user, width: '560px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.notify.success(user ? 'Usuario actualizado' : 'Usuario creado');
          this.list.load();
        }
      });
  }

  deactivate(u: User): void {
    confirm(this.dialog, {
      title: 'Desactivar usuario',
      message: `«${u.full_name}» perderá el acceso de inmediato. Sus tickets e historial se conservan.`,
      confirmLabel: 'Desactivar',
      danger: true,
    }).subscribe((ok) => ok && this.toggle(u, false));
  }

  activate(u: User): void {
    this.toggle(u, true);
  }

  private toggle(u: User, active: boolean): void {
    const req = active ? this.api.post<User>(`/users/${u.id}/activate`) : this.api.delete<User>(`/users/${u.id}`);
    req.subscribe({
      next: () => {
        this.notify.success(active ? 'Usuario reactivado' : 'Usuario desactivado');
        this.list.load();
      },
      error: (e) => this.notify.error(errorMessage(e)),
    });
  }

  export(): void {
    this.exporting.set(true);
    this.api
      .downloadCsv('/users/export', { ...this.list.queryParams(), columns: this.cols.visible() }, 'usuarios')
      .subscribe({
        next: () => this.exporting.set(false),
        error: (e) => {
          this.exporting.set(false);
          this.notify.error(errorMessage(e, 'No se pudo exportar.'));
        },
      });
  }
}
