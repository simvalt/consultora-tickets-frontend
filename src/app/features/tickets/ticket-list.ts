import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
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
import { Api, Params, errorMessage } from '../../core/api';
import { CanDirective } from '../../core/can.directive';
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
import { EmptyState, ErrorState, LoadingBar } from '../../shared/states';

@Component({
  selector: 'app-ticket-list',
  imports: [
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
    CanDirective,
    EmptyState,
    ErrorState,
    LoadingBar,
    StatusBadge,
    PriorityBadge,
  ],
  template: `
    <div class="page-header">
      <h1>Tickets</h1>
      <div class="actions">
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
        <mat-select formControlName="status" multiple>
          @for (s of statuses; track s) {
            <mat-option [value]="s">{{ statusLabels[s] }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Prioridad</mat-label>
        <mat-select formControlName="priority" multiple>
          @for (p of priorities; track p) {
            <mat-option [value]="p">{{ priorityLabels[p] }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </form>
    <form class="filters" [formGroup]="filters">
      <mat-form-field appearance="outline">
        <mat-label>Cliente</mat-label>
        <mat-select formControlName="client_id">
          <mat-option value="">Todos</mat-option>
          @for (c of clients(); track c.id) {
            <mat-option [value]="c.id">{{ c.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Categoría</mat-label>
        <mat-select formControlName="category_id">
          <mat-option value="">Todas</mat-option>
          @for (c of categories(); track c.id) {
            <mat-option [value]="c.id">{{ c.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Responsable</mat-label>
        <mat-select formControlName="assignee">
          <mat-option value="">Todos</mat-option>
          <mat-option value="none">Sin responsable</mat-option>
          @for (a of assignees(); track a.id) {
            <mat-option [value]="a.id">{{ a.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Creado desde</mat-label>
        <input matInput type="date" formControlName="created_from" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Creado hasta</mat-label>
        <input matInput type="date" formControlName="created_to" />
      </mat-form-field>
      <mat-checkbox formControlName="overdue">Sólo vencidos</mat-checkbox>
      <button mat-button type="button" (click)="clear()">Limpiar filtros</button>
    </form>

    <app-loading-bar [active]="list.loading()" />
    @if (list.error()) {
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
            <td mat-cell *matCellDef="let t" class="title-cell">{{ t.title }}</td>
          </ng-container>
          <ng-container matColumnDef="client">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="client">Cliente</th>
            <td mat-cell *matCellDef="let t">{{ t.client_name }}</td>
          </ng-container>
          <ng-container matColumnDef="priority">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="priority">Prioridad</th>
            <td mat-cell *matCellDef="let t"><app-priority-badge [priority]="t.priority" /></td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="status">Estatus</th>
            <td mat-cell *matCellDef="let t"><app-status-badge [status]="t.status" /></td>
          </ng-container>
          <ng-container matColumnDef="assignee">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="assignee">Responsable</th>
            <td mat-cell *matCellDef="let t">{{ t.assignee_name || 'Sin responsable' }}</td>
          </ng-container>
          <ng-container matColumnDef="due_at">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="due_at">Vence</th>
            <td mat-cell *matCellDef="let t" [class.overdue]="t.is_overdue">
              {{ t.due_at ? (t.due_at | date: 'dd/MM/yyyy HH:mm') : '—' }}
              @if (t.is_overdue) {
                <mat-icon class="inline-icon" aria-label="Vencido">warning</mat-icon>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="created_at">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="created_at">Creado</th>
            <td mat-cell *matCellDef="let t">{{ t.created_at | date: 'dd/MM/yyyy HH:mm' }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row class="clickable" *matRowDef="let row; columns: columns" (click)="open(row)"></tr>
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
    .title-cell {
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
  `,
})
export class TicketList implements OnDestroy {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly notify = inject(Notify);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly lookups = inject(Lookups);

  readonly statuses = STATUSES;
  readonly priorities = PRIORITIES;
  readonly statusLabels = STATUS_LABELS;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly columns = ['folio', 'title', 'client', 'priority', 'status', 'assignee', 'due_at', 'created_at'];
  readonly list = new PagedList<Ticket>((p) => this.api.get<Page<Ticket>>('/tickets', p), 'created_at', 'desc');
  readonly clients = signal<LookupItem[]>([]);
  readonly assignees = signal<LookupItem[]>([]);
  readonly categories = signal<Meta['categories']>([]);
  readonly exporting = signal(false);

  readonly filters = this.fb.nonNullable.group({
    q: [''],
    status: [[] as string[]],
    priority: [[] as string[]],
    client_id: [''],
    category_id: [''],
    assignee: [''],
    created_from: [''],
    created_to: [''],
    overdue: [false],
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
      created_from: v.created_from,
      created_to: v.created_to,
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
    this.api.downloadCsv('/tickets/export', this.list.queryParams(), 'tickets').subscribe({
      next: () => this.exporting.set(false),
      error: (e) => {
        this.exporting.set(false);
        this.notify.error(errorMessage(e, 'No se pudo exportar.'));
      },
    });
  }
}
