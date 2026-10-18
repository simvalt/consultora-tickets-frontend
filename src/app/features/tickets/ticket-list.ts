import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { DATEPICKER, DATEPICKER_PROVIDERS } from '../../shared/datepicker';
import { Api, Params, errorMessage } from '../../core/api';
import { CanDirective } from '../../core/can.directive';
import { toIsoDate } from '../../core/datetime';
import { Lookups } from '../../core/lookups.service';
import {
  LookupItem,
  Meta,
  Page,
  PRIORITIES,
  PRIORITY_LABELS,
  STATUSES,
  STATUS_LABELS,
  Ticket,
} from '../../core/models';
import { Notify } from '../../core/notify.service';
import { PagedList } from '../../core/paged-list';
import { PriorityBadge, StatusBadge } from '../../shared/badges';
import { ColumnPicker, TableColumns } from '../../shared/column-picker';
import { SELECT_SEARCH } from '../../shared/select-search';
import { EmptyState, ErrorState, LoadingBar, TableSkeleton } from '../../shared/states';

/** Claves = columnas de exportación del backend (mismo orden y selección en tabla y CSV). */
const TICKET_COLUMNS = [
  { key: 'folio', label: 'Folio' },
  { key: 'title', label: 'Título' },
  { key: 'client', label: 'Cliente' },
  { key: 'priority', label: 'Prioridad' },
  { key: 'status', label: 'Estatus' },
  { key: 'assignee', label: 'Responsable' },
  { key: 'due_at', label: 'Vencimiento' },
  { key: 'created_at', label: 'Creado' },
  { key: 'category', label: 'Categoría', visible: false },
  { key: 'description', label: 'Descripción', visible: false },
  { key: 'created_by', label: 'Creado por', visible: false },
  { key: 'updated_at', label: 'Modificado', visible: false },
  { key: 'started_at', label: 'Inicio de atención', visible: false },
  { key: 'closed_at', label: 'Cierre', visible: false },
  { key: 'resolution', label: 'Resolución', visible: false },
];

@Component({
  selector: 'app-ticket-list',
  imports: [
    TableSkeleton,
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    DATEPICKER,
    CanDirective,
    EmptyState,
    ErrorState,
    LoadingBar,
    StatusBadge,
    PriorityBadge,
    ColumnPicker,
    SELECT_SEARCH,
  ],
  providers: [DATEPICKER_PROVIDERS],
  template: `
    <div class="page-header">
      <h1>
        Tickets
        <span class="subtitle">
          @if (list.loaded()) {
            {{ list.total() }} {{ list.total() === 1 ? 'ticket' : 'tickets'
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
        <a *appCan="['tickets', 2]" mat-flat-button routerLink="/tickets/new" data-testid="new-ticket">
          <mat-icon>add</mat-icon> Nuevo ticket
        </a>
      </div>
    </div>

    <form class="filters" [formGroup]="filters">
      <mat-form-field appearance="outline" class="grow">
        <mat-label>Buscar por folio, título o descripción</mat-label>
        <input matInput formControlName="q" data-testid="search" />
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Estatus</mat-label>
        <mat-select formControlName="status" multiple data-testid="filter-status">
          <app-select-search #ss />
          @for (s of statusOptions | optionFilter: ss.term() : filters.value.status; track s.id) {
            <mat-option [value]="s.id">{{ s.name }}</mat-option>
          } @empty {
            <mat-option disabled>Sin coincidencias</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Prioridad</mat-label>
        <mat-select formControlName="priority" multiple data-testid="filter-priority">
          <app-select-search #sp />
          @for (p of priorityOptions | optionFilter: sp.term() : filters.value.priority; track p.id) {
            <mat-option [value]="p.id">{{ p.name }}</mat-option>
          } @empty {
            <mat-option disabled>Sin coincidencias</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <button
        mat-stroked-button
        type="button"
        class="more-toggle"
        (click)="moreFilters.set(!moreFilters())"
        [attr.aria-expanded]="moreFilters()"
        aria-controls="more-filters"
      >
        <mat-icon>tune</mat-icon> {{ moreFilters() ? 'Menos filtros' : 'Más filtros' }}
      </button>
    </form>
    <form class="filters more" id="more-filters" [class.open]="moreFilters()" [formGroup]="filters">
      <mat-form-field appearance="outline">
        <mat-label>Cliente</mat-label>
        <mat-select formControlName="client_id" data-testid="filter-client">
          <app-select-search #sc />
          <mat-option value="">Todos</mat-option>
          @for (c of clients() | optionFilter: sc.term() : filters.value.client_id; track c.id) {
            <mat-option [value]="c.id">{{ c.name }}</mat-option>
          } @empty {
            <mat-option disabled>Sin coincidencias</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Categoría</mat-label>
        <mat-select formControlName="category_id" data-testid="filter-category">
          <app-select-search #sk />
          <mat-option value="">Todas</mat-option>
          @for (c of categories() | optionFilter: sk.term() : filters.value.category_id; track c.id) {
            <mat-option [value]="c.id">{{ c.name }}</mat-option>
          } @empty {
            <mat-option disabled>Sin coincidencias</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Responsable</mat-label>
        <mat-select formControlName="assignee" data-testid="filter-assignee">
          <app-select-search #sa />
          <mat-option value="">Todos</mat-option>
          <mat-option value="none">Sin responsable</mat-option>
          @for (a of assignees() | optionFilter: sa.term() : filters.value.assignee; track a.id) {
            <mat-option [value]="a.id">{{ a.name }}</mat-option>
          } @empty {
            <mat-option disabled>Sin coincidencias</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="range">
        <mat-label>Creado entre</mat-label>
        <mat-date-range-input [rangePicker]="createdPicker">
          <input matStartDate formControlName="created_from" placeholder="dd/mm/aaaa" data-testid="created-from" />
          <input matEndDate formControlName="created_to" placeholder="dd/mm/aaaa" data-testid="created-to" />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="createdPicker" data-testid="created-picker" />
        <mat-date-range-picker #createdPicker />
        <mat-hint>dd/mm/aaaa a dd/mm/aaaa</mat-hint>
      </mat-form-field>
      <mat-checkbox formControlName="overdue">Sólo vencidos</mat-checkbox>
      <button mat-button type="button" (click)="clear()">Limpiar filtros</button>
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
          icon="confirmation_number"
          title="No hay tickets"
          hint="No se encontraron tickets con estos filtros."
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
          data-testid="ticket-table"
        >
          <ng-container matColumnDef="folio">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="folio">Folio</th>
            <td mat-cell *matCellDef="let t">
              <a class="link" [routerLink]="['/tickets', t.id]" (click)="$event.stopPropagation()">{{ t.folio }}</a>
            </td>
          </ng-container>
          <ng-container matColumnDef="title">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="title">Título</th>
            <td mat-cell *matCellDef="let t" class="clip">{{ t.title }}</td>
          </ng-container>
          <ng-container matColumnDef="description">
            <th mat-header-cell *matHeaderCellDef>Descripción</th>
            <td mat-cell *matCellDef="let t" class="clip">{{ t.description || 'Sin descripción' }}</td>
          </ng-container>
          <ng-container matColumnDef="client">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="client">Cliente</th>
            <td mat-cell *matCellDef="let t">{{ t.client_name }}</td>
          </ng-container>
          <ng-container matColumnDef="category">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="category">Categoría</th>
            <td mat-cell *matCellDef="let t">{{ t.category_name }}</td>
          </ng-container>
          <ng-container matColumnDef="priority">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="priority">Prioridad</th>
            <td mat-cell *matCellDef="let t"><app-priority-badge [priority]="t.priority" /></td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="status">Estatus</th>
            <td mat-cell *matCellDef="let t"><app-status-badge [status]="t.status" /></td>
          </ng-container>
          <ng-container matColumnDef="created_by">
            <th mat-header-cell *matHeaderCellDef>Creado por</th>
            <td mat-cell *matCellDef="let t">{{ t.created_by_name }}</td>
          </ng-container>
          <ng-container matColumnDef="assignee">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="assignee">Responsable</th>
            <td mat-cell *matCellDef="let t">{{ t.assignee_name || 'Sin responsable' }}</td>
          </ng-container>
          <ng-container matColumnDef="due_at">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="due_at">Vencimiento</th>
            <td mat-cell *matCellDef="let t" [class.overdue]="t.is_overdue">
              {{ t.due_at ? (t.due_at | date: 'dd/MM/yyyy HH:mm') : 'Sin fecha' }}
              @if (t.is_overdue) {
                <mat-icon class="inline-icon" aria-label="Vencido">warning</mat-icon>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="created_at">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="created_at">Creado</th>
            <td mat-cell *matCellDef="let t">{{ t.created_at | date: 'dd/MM/yyyy HH:mm' }}</td>
          </ng-container>
          <ng-container matColumnDef="updated_at">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="updated_at">Modificado</th>
            <td mat-cell *matCellDef="let t">{{ t.updated_at | date: 'dd/MM/yyyy HH:mm' }}</td>
          </ng-container>
          <ng-container matColumnDef="started_at">
            <th mat-header-cell *matHeaderCellDef>Inicio de atención</th>
            <td mat-cell *matCellDef="let t">
              {{ t.started_at ? (t.started_at | date: 'dd/MM/yyyy HH:mm') : 'Sin fecha' }}
            </td>
          </ng-container>
          <ng-container matColumnDef="closed_at">
            <th mat-header-cell *matHeaderCellDef>Cierre</th>
            <td mat-cell *matCellDef="let t">
              {{ t.closed_at ? (t.closed_at | date: 'dd/MM/yyyy HH:mm') : 'Sin fecha' }}
            </td>
          </ng-container>
          <ng-container matColumnDef="resolution">
            <th mat-header-cell *matHeaderCellDef>Resolución</th>
            <td mat-cell *matCellDef="let t" class="clip">{{ t.resolution || 'Sin resolución' }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="displayed()"></tr>
          <tr mat-row class="clickable" *matRowDef="let row; columns: displayed()" (click)="open(row)"></tr>
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
  styles: `
    .clip {
      max-width: 340px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .inline-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      vertical-align: text-bottom;
    }
    .range {
      flex: 1 1 260px;
    }
  `,
})
export class TicketList implements OnDestroy {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly notify = inject(Notify);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly lookups = inject(Lookups);

  readonly statusOptions = STATUSES.map((s) => ({ id: s, name: STATUS_LABELS[s] }));
  readonly priorityOptions = PRIORITIES.map((p) => ({ id: p, name: PRIORITY_LABELS[p] }));
  readonly cols = new TableColumns('cols:tickets', TICKET_COLUMNS);
  readonly displayed = computed(() => this.cols.visible());
  readonly list = new PagedList<Ticket>((p) => this.api.get<Page<Ticket>>('/tickets', p), 'created_at', 'desc');
  readonly clients = signal<LookupItem[]>([]);
  readonly assignees = signal<LookupItem[]>([]);
  readonly categories = signal<Meta['categories']>([]);
  readonly exporting = signal(false);
  /** En móvil los filtros secundarios van plegados para que la lista quede a la vista. */
  readonly moreFilters = signal(false);

  readonly filters = this.fb.group({
    q: this.fb.nonNullable.control(''),
    status: this.fb.nonNullable.control<string[]>([]),
    priority: this.fb.nonNullable.control<string[]>([]),
    client_id: this.fb.nonNullable.control<number | ''>(''),
    category_id: this.fb.nonNullable.control<number | ''>(''),
    assignee: this.fb.nonNullable.control<number | '' | 'none'>(''),
    created_from: this.fb.control<Date | null>(null),
    created_to: this.fb.control<Date | null>(null),
    overdue: this.fb.nonNullable.control(false),
  });

  constructor() {
    this.lookups.clients().subscribe({ next: (r) => this.clients.set(r), error: () => undefined });
    this.lookups.assignees().subscribe({ next: (r) => this.assignees.set(r), error: () => undefined });
    this.lookups.meta().subscribe({ next: (m) => this.categories.set(m.categories), error: () => undefined });
    this.apply();
    this.filters.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.apply());
  }

  ngOnDestroy(): void {
    this.list.destroy();
  }

  private apply(): void {
    const v = this.filters.getRawValue();
    const params: Params = {
      q: v.q.trim(),
      status: v.status,
      priority: v.priority,
      client_id: v.client_id,
      category_id: v.category_id,
      created_from: toIsoDate(v.created_from),
      created_to: toIsoDate(v.created_to),
      overdue: v.overdue ? true : undefined,
    };
    if (v.assignee === 'none') params['unassigned'] = true;
    else params['assignee_id'] = v.assignee;
    this.list.setFilters(params);
  }

  clear(): void {
    this.filters.reset();
  }

  sort(s: Sort): void {
    this.list.setSort(s.active, s.direction);
  }

  open(t: Ticket): void {
    void this.router.navigate(['/tickets', t.id]);
  }

  export(): void {
    this.exporting.set(true);
    // Mismos filtros y orden que el listado, y las columnas visibles en el orden elegido.
    const params = { ...this.list.queryParams(), columns: this.cols.visible() };
    this.api.downloadCsv('/tickets/export', params, 'tickets').subscribe({
      next: () => this.exporting.set(false),
      error: (e) => {
        this.exporting.set(false);
        this.notify.error(errorMessage(e, 'No se pudo exportar.'));
      },
    });
  }
}
