import { Component, computed, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
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
import { LEVEL_LABELS, MODULES, Page, Role } from '../../core/models';
import { PermMap } from '../../core/permissions-json';
import { Notify } from '../../core/notify.service';
import { PagedList } from '../../core/paged-list';
import { confirm } from '../../shared/confirm-dialog';
import { PermissionsEditor } from '../../shared/permissions-editor';
import { ColumnPicker, TableColumns } from '../../shared/column-picker';
import { SELECT_SEARCH } from '../../shared/select-search';
import { EmptyState, ErrorState, LoadingBar, TableSkeleton } from '../../shared/states';

/** Claves = columnas de exportación del backend. */
const ROLE_COLUMNS = [
  { key: 'name', label: 'Rol' },
  { key: 'description', label: 'Descripción' },
  ...MODULES.map((m) => ({ key: m.key, label: m.label })),
  { key: 'user_count', label: 'Usuarios' },
  { key: 'is_active', label: 'Estado' },
];

@Component({
  selector: 'app-role-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    PermissionsEditor,
  ],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Editar rol' : 'Nuevo rol' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        @if (error()) {
          <p class="banner error" role="alert">{{ error() }}</p>
        }
        <mat-form-field appearance="outline" class="full">
          <mat-label>Nombre del rol</mat-label>
          <input matInput formControlName="name" maxlength="80" data-testid="role-name" />
          @if (form.controls.name.touched && form.controls.name.invalid) {
            <mat-error>El nombre es obligatorio</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Descripción</mat-label>
          <input matInput formControlName="description" maxlength="255" />
        </mat-form-field>

        <h3 class="matrix-title">Permisos por módulo</h3>
        <app-permissions-editor [(value)]="perms" mode="role" />
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="saving()" data-testid="role-save">Guardar</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .matrix-title {
      margin: 8px 0 0;
      font-size: 1rem;
    }
    .matrix-help {
      margin: 2px 0 12px;
      font-size: 0.85rem;
    }
    .matrix-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 0;
      border-top: 1px solid var(--border);
    }
    .matrix-module {
      display: flex;
      flex-direction: column;
      min-width: 190px;
    }
    mat-button-toggle-group {
      flex-wrap: wrap;
    }
  `,
})
export class RoleDialog {
  readonly data = inject<Role | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<RoleDialog>);
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly perms = signal<PermMap>(
    this.data?.permissions ?? { tickets: 0, users: 0, roles: 0, clients: 0, dashboard: 0 },
  );
  readonly form = this.fb.nonNullable.group({
    name: [this.data?.name ?? '', [Validators.required, Validators.maxLength(80)]],
    description: [this.data?.description ?? ''],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const body = { ...this.form.getRawValue(), permissions: this.perms() };
    const req = this.data ? this.api.patch<Role>(`/roles/${this.data.id}`, body) : this.api.post<Role>('/roles', body);
    req.subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => {
        this.saving.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}

@Component({
  selector: 'app-roles',
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
    CanDirective,
    EmptyState,
    ErrorState,
    LoadingBar,
  ],
  template: `
    <div class="page-header">
      <h1>
        Roles y permisos
        <span class="subtitle">
          @if (list.loaded()) {
            {{ list.total() }} {{ list.total() === 1 ? 'rol' : 'roles'
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
        <button *appCan="['roles', 2]" mat-flat-button (click)="edit(null)" data-testid="new-role">
          <mat-icon>add</mat-icon> Nuevo rol
        </button>
      </div>
    </div>

    <form class="filters" [formGroup]="filters">
      <mat-form-field appearance="outline" class="grow">
        <mat-label>Buscar</mat-label>
        <input matInput formControlName="q" placeholder="Nombre o descripción" />
        <mat-icon matSuffix>search</mat-icon>
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
        <app-empty-state
          icon="admin_panel_settings"
          title="No hay roles"
          hint="Ajusta los filtros o crea un nuevo rol."
        />
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
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="name">Rol</th>
            <td mat-cell *matCellDef="let r" [class.inactive]="!r.is_active">
              <strong>{{ r.name }}</strong>
            </td>
          </ng-container>
          <ng-container matColumnDef="description">
            <th mat-header-cell *matHeaderCellDef>Descripción</th>
            <td mat-cell *matCellDef="let r" class="muted">{{ r.description || 'Sin descripción' }}</td>
          </ng-container>
          @for (m of modules; track m.key) {
            <ng-container [matColumnDef]="m.key">
              <th mat-header-cell *matHeaderCellDef>{{ m.label }}</th>
              <td mat-cell *matCellDef="let r">
                <span class="badge" [class]="'lvl lvl-' + r.permissions[m.key]">{{
                  labels[r.permissions[m.key]]
                }}</span>
              </td>
            </ng-container>
          }
          <ng-container matColumnDef="user_count">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="user_count">Usuarios</th>
            <td mat-cell *matCellDef="let r">{{ r.user_count }}</td>
          </ng-container>
          <ng-container matColumnDef="is_active">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="is_active">Estado</th>
            <td mat-cell *matCellDef="let r">
              <span class="badge" [class]="r.is_active ? 'status-cerrado' : 'status-sin_inicio'">{{
                r.is_active ? 'Activo' : 'Inactivo'
              }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef><span class="sr-only">Acciones</span></th>
            <td mat-cell *matCellDef="let r" class="row-actions">
              @if (r.id !== me()?.role_id) {
                <button *appCan="['roles', 3]" mat-icon-button (click)="edit(r)" aria-label="Editar rol">
                  <mat-icon>edit</mat-icon>
                </button>
                @if (r.is_active) {
                  <button *appCan="['roles', 4]" mat-icon-button (click)="deactivate(r)" aria-label="Desactivar rol">
                    <mat-icon>block</mat-icon>
                  </button>
                } @else {
                  <button *appCan="['roles', 3]" mat-icon-button (click)="activate(r)" aria-label="Reactivar rol">
                    <mat-icon>check_circle</mat-icon>
                  </button>
                }
              } @else {
                <small class="muted">Tu rol</small>
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
          [pageSizeOptions]="[10, 20, 50]"
          (page)="list.setPage($event.pageIndex, $event.pageSize)"
        />
      </div>
    }
  `,
  styles: `
    :host ::ng-deep .lvl-0 {
      --tone: var(--muted);
    }
    :host ::ng-deep .lvl-1 {
      --tone: var(--st-iniciado);
    }
    :host ::ng-deep .lvl-2 {
      --tone: var(--st-en_proceso);
    }
    :host ::ng-deep .lvl-3 {
      --tone: var(--warning);
    }
    :host ::ng-deep .lvl-4 {
      --tone: var(--danger);
    }
  `,
})
export class RolesPage implements OnDestroy {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  readonly me = inject(AuthService).user;

  readonly modules = MODULES;
  readonly labels = LEVEL_LABELS;
  readonly cols = new TableColumns('cols:roles', ROLE_COLUMNS);
  /** Columnas elegidas por el usuario + acciones (siempre al final, no exportable). */
  readonly displayed = computed(() => [...this.cols.visible(), 'actions']);
  readonly stateOptions = [
    { id: 'true', name: 'Activos' },
    { id: 'false', name: 'Inactivos' },
  ];
  readonly list = new PagedList<Role>((p) => this.api.get<Page<Role>>('/roles', p), 'name');
  readonly exporting = signal(false);
  readonly filters = this.fb.nonNullable.group({ q: [''], is_active: [''] });

  constructor() {
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

  edit(role: Role | null): void {
    this.dialog
      .open(RoleDialog, { data: role, width: '720px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.notify.success(role ? 'Rol actualizado' : 'Rol creado');
          this.list.load();
        }
      });
  }

  deactivate(r: Role): void {
    confirm(this.dialog, {
      title: 'Desactivar rol',
      message: `El rol «${r.name}» dejará de poder asignarse. Sólo es posible si no tiene usuarios activos.`,
      confirmLabel: 'Desactivar',
      danger: true,
    }).subscribe((ok) => ok && this.toggle(r, false));
  }

  activate(r: Role): void {
    this.toggle(r, true);
  }

  private toggle(r: Role, active: boolean): void {
    const req = active ? this.api.post<Role>(`/roles/${r.id}/activate`) : this.api.delete<Role>(`/roles/${r.id}`);
    req.subscribe({
      next: () => {
        this.notify.success(active ? 'Rol reactivado' : 'Rol desactivado');
        this.list.load();
      },
      error: (e) => this.notify.error(errorMessage(e)),
    });
  }

  export(): void {
    this.exporting.set(true);
    this.api
      .downloadCsv('/roles/export', { ...this.list.queryParams(), columns: this.cols.visible() }, 'roles')
      .subscribe({
        next: () => this.exporting.set(false),
        error: (e) => {
          this.exporting.set(false);
          this.notify.error(errorMessage(e, 'No se pudo exportar.'));
        },
      });
  }
}
