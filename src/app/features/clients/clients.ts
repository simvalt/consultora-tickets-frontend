import { Component, computed, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DatePipe } from '@angular/common';
import { debounceTime } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { CanDirective } from '../../core/can.directive';
import { Client, Page } from '../../core/models';
import { Notify } from '../../core/notify.service';
import { PagedList } from '../../core/paged-list';
import { confirm } from '../../shared/confirm-dialog';
import { ColumnPicker, TableColumns } from '../../shared/column-picker';
import { SELECT_SEARCH } from '../../shared/select-search';
import { EmptyState, ErrorState, LoadingBar, TableSkeleton } from '../../shared/states';
import { notBlank } from '../../core/validators';

/** Claves = columnas de exportación del backend. */
const CLIENT_COLUMNS = [
  { key: 'name', label: 'Nombre' },
  { key: 'contact_name', label: 'Contacto' },
  { key: 'email', label: 'Correo' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'is_active', label: 'Estado' },
  { key: 'created_at', label: 'Creado' },
];

@Component({
  selector: 'app-client-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Editar cliente' : 'Nuevo cliente' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        @if (error()) {
          <p class="banner error" role="alert">{{ error() }}</p>
        }
        <div class="form-grid">
          <mat-form-field appearance="outline" class="span2">
            <mat-label>Nombre</mat-label>
            <input matInput formControlName="name" maxlength="150" data-testid="client-name" />
            @if (form.controls.name.touched && form.controls.name.invalid) {
              <mat-error>El nombre es obligatorio</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Contacto</mat-label>
            <input matInput formControlName="contact_name" maxlength="150" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Teléfono</mat-label>
            <input matInput formControlName="phone" maxlength="40" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="span2">
            <mat-label>Correo</mat-label>
            <input matInput type="email" formControlName="email" maxlength="255" />
            @if (form.controls.email.invalid) {
              <mat-error>Correo no válido</mat-error>
            }
          </mat-form-field>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="saving()" data-testid="client-save">Guardar</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class ClientDialog {
  readonly data = inject<Client | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ClientDialog>);
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = this.fb.nonNullable.group({
    name: [this.data?.name ?? '', [notBlank, Validators.maxLength(150)]],
    contact_name: [this.data?.contact_name ?? ''],
    email: [this.data?.email ?? '', [Validators.email]],
    phone: [this.data?.phone ?? ''],
  });

  save(): void {
    if (this.saving()) return; // doble clic: ya hay un envío en curso
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const body = this.form.getRawValue();
    const req = this.data
      ? this.api.patch<Client>(`/clients/${this.data.id}`, body)
      : this.api.post<Client>('/clients', body);
    req.subscribe({
      next: (c) => this.ref.close(c),
      error: (e) => {
        this.saving.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}

@Component({
  selector: 'app-clients',
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
        Clientes
        <span class="subtitle">
          @if (list.loaded()) {
            {{ list.total() }} {{ list.total() === 1 ? 'cliente' : 'clientes'
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
        <button *appCan="['clients', 2]" mat-flat-button (click)="edit(null)" data-testid="new-client">
          <mat-icon>add</mat-icon> Nuevo cliente
        </button>
      </div>
    </div>

    <form class="filters" [formGroup]="filters">
      <mat-form-field appearance="outline" class="grow">
        <mat-label>Buscar</mat-label>
        <input matInput formControlName="q" maxlength="100" placeholder="Nombre, contacto o correo" />
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
        <app-empty-state icon="business" title="No hay clientes" hint="Ajusta los filtros o crea un nuevo cliente." />
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
            <th mat-header-cell *matHeaderCellDef mat-sort-header="name">Nombre</th>
            <td mat-cell *matCellDef="let c" [class.inactive]="!c.is_active">{{ c.name }}</td>
          </ng-container>
          <ng-container matColumnDef="contact_name">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="contact_name">Contacto</th>
            <td mat-cell *matCellDef="let c">{{ c.contact_name || 'Sin contacto' }}</td>
          </ng-container>
          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="email">Correo</th>
            <td mat-cell *matCellDef="let c">{{ c.email || 'Sin correo' }}</td>
          </ng-container>
          <ng-container matColumnDef="phone">
            <th mat-header-cell *matHeaderCellDef>Teléfono</th>
            <td mat-cell *matCellDef="let c">{{ c.phone || 'Sin teléfono' }}</td>
          </ng-container>
          <ng-container matColumnDef="is_active">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="is_active">Estado</th>
            <td mat-cell *matCellDef="let c">
              <span class="badge" [class]="c.is_active ? 'status-cerrado' : 'status-sin_inicio'">{{
                c.is_active ? 'Activo' : 'Inactivo'
              }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="created_at">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="created_at">Creado</th>
            <td mat-cell *matCellDef="let c">{{ c.created_at | date: 'dd/MM/yyyy' }}</td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef><span class="sr-only">Acciones</span></th>
            <td mat-cell *matCellDef="let c" class="row-actions">
              <button *appCan="['clients', 3]" mat-icon-button (click)="edit(c)" aria-label="Editar cliente">
                <mat-icon>edit</mat-icon>
              </button>
              @if (c.is_active) {
                <button
                  *appCan="['clients', 4]"
                  mat-icon-button
                  (click)="deactivate(c)"
                  aria-label="Desactivar cliente"
                >
                  <mat-icon>block</mat-icon>
                </button>
              } @else {
                <button *appCan="['clients', 3]" mat-icon-button (click)="activate(c)" aria-label="Reactivar cliente">
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
export class ClientsPage implements OnDestroy {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly cols = new TableColumns('cols:clients', CLIENT_COLUMNS);
  /** Columnas elegidas por el usuario + acciones (siempre al final, no exportable). */
  readonly displayed = computed(() => [...this.cols.visible(), 'actions']);
  readonly stateOptions = [
    { id: 'true', name: 'Activos' },
    { id: 'false', name: 'Inactivos' },
  ];
  readonly list = new PagedList<Client>((p) => this.api.get<Page<Client>>('/clients', p), 'name');
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

  edit(client: Client | null): void {
    this.dialog
      .open(ClientDialog, { data: client, width: '560px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.notify.success(client ? 'Cliente actualizado' : 'Cliente creado');
          this.list.load();
        }
      });
  }

  deactivate(c: Client): void {
    confirm(this.dialog, {
      title: 'Desactivar cliente',
      message: `«${c.name}» ya no podrá usarse en tickets nuevos. Sus tickets actuales se conservan.`,
      confirmLabel: 'Desactivar',
      danger: true,
    }).subscribe((ok) => ok && this.toggle(c, false));
  }

  activate(c: Client): void {
    this.toggle(c, true);
  }

  private toggle(c: Client, active: boolean): void {
    const req = active
      ? this.api.post<Client>(`/clients/${c.id}/activate`)
      : this.api.delete<Client>(`/clients/${c.id}`);
    req.subscribe({
      next: () => {
        this.notify.success(active ? 'Cliente reactivado' : 'Cliente desactivado');
        this.list.load();
      },
      error: (e) => this.notify.error(errorMessage(e)),
    });
  }

  export(): void {
    this.exporting.set(true);
    this.api
      .downloadCsv('/clients/export', { ...this.list.queryParams(), columns: this.cols.visible() }, 'clientes')
      .subscribe({
        next: () => this.exporting.set(false),
        error: (e) => {
          this.exporting.set(false);
          this.notify.error(errorMessage(e, 'No se pudo exportar.'));
        },
      });
  }
}
