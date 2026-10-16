import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { debounceTime } from 'rxjs';
import { Api, Params, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { formatDuration, localDate } from '../../core/datetime';
import { Lookups } from '../../core/lookups.service';
import { Dashboard, LookupItem, Meta, PRIORITIES, PRIORITY_LABELS } from '../../core/models';
import { Notify } from '../../core/notify.service';
import { EmptyState, ErrorState, LoadingBar } from '../../shared/states';
import { ChartComponent } from './chart';

@Component({
  selector: 'app-dashboard',
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ChartComponent,
    EmptyState,
    ErrorState,
    LoadingBar,
  ],
  template: `
    <div class="page-header">
      <h1>Dashboard</h1>
      <div class="actions">
        <button mat-stroked-button (click)="export()" [disabled]="exporting()" data-testid="export">
          <mat-icon>download</mat-icon> Exportar CSV
        </button>
      </div>
    </div>

    <form class="filters" [formGroup]="filters">
      <mat-form-field appearance="outline">
        <mat-label>Creados desde</mat-label>
        <input matInput type="date" formControlName="date_from" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Creados hasta</mat-label>
        <input matInput type="date" formControlName="date_to" />
      </mat-form-field>
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
        <mat-label>Responsable</mat-label>
        <mat-select formControlName="assignee_id">
          <mat-option value="">Todos</mat-option>
          @for (a of assignees(); track a.id) {
            <mat-option [value]="a.id">{{ a.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Prioridad</mat-label>
        <mat-select formControlName="priority">
          <mat-option value="">Todas</mat-option>
          @for (p of priorities; track p) {
            <mat-option [value]="p">{{ priorityLabels[p] }}</mat-option>
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
    </form>
    <p class="muted note">
      Los indicadores y distribuciones usan la <strong>fecha de creación</strong> del ticket dentro del periodo. En la
      gráfica diaria, «Creados» usa la fecha de creación y «Cerrados» la fecha del evento de cierre (por eso un ticket
      puede cerrarse en el periodo aunque se haya creado antes). Las fechas se agrupan por día UTC.
    </p>

    <app-loading-bar [active]="loading()" />
    @if (error()) {
      <app-error-state [message]="error()!"
        ><button mat-stroked-button (click)="load()">Reintentar</button></app-error-state
      >
    } @else if (data(); as d) {
      @if (d.total === 0 && !hasSeries()) {
        <div class="card">
          <app-empty-state
            icon="insights"
            title="Sin datos para mostrar"
            hint="No hay tickets con los filtros seleccionados."
          />
        </div>
      } @else {
        <div class="kpis" data-testid="kpis">
          <div class="kpi">
            <span class="kpi-label">Total</span><span class="kpi-value" data-testid="kpi-total">{{ d.total }}</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Abiertos</span><span class="kpi-value" data-testid="kpi-open">{{ d.open }}</span>
          </div>
          <div class="kpi warn">
            <span class="kpi-label">Pendientes</span><span class="kpi-value">{{ d.pending }}</span>
          </div>
          <div class="kpi ok">
            <span class="kpi-label">Cerrados</span><span class="kpi-value">{{ d.closed }}</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Cancelados</span><span class="kpi-value">{{ d.cancelled }}</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Rechazados</span><span class="kpi-value">{{ d.rejected }}</span>
          </div>
          <div class="kpi bad">
            <span class="kpi-label">Vencidos</span
            ><span class="kpi-value" data-testid="kpi-overdue">{{ d.overdue }}</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Resolución promedio</span
            ><span class="kpi-value small">{{ duration(d.avg_resolution_hours) }}</span>
          </div>
        </div>

        <div class="grid">
          <section class="card wide">
            <h2>
              Creados y cerrados por día
              <small class="muted"
                >({{ d.series_from | date: 'dd/MM/yyyy' }} – {{ d.series_to | date: 'dd/MM/yyyy' }})</small
              >
            </h2>
            <app-chart
              type="line"
              [labels]="seriesLabels()"
              [series]="seriesData()"
              [height]="280"
              ariaLabel="Tickets creados y cerrados por día"
            />
          </section>
          <section class="card">
            <h2>Por estatus</h2>
            <app-chart
              type="doughnut"
              [labels]="labels(d.by_status)"
              [series]="[{ label: 'Tickets', data: counts(d.by_status) }]"
              ariaLabel="Distribución por estatus"
            />
          </section>
          <section class="card">
            <h2>Por prioridad</h2>
            <app-chart
              type="bar"
              [labels]="labels(d.by_priority)"
              [series]="[{ label: 'Tickets', data: counts(d.by_priority) }]"
              ariaLabel="Distribución por prioridad"
            />
          </section>
          <section class="card">
            <h2>Abiertos por responsable</h2>
            @if (d.open_by_assignee.length) {
              <table class="mini">
                <tbody>
                  @for (r of d.open_by_assignee; track r.key) {
                    <tr>
                      <td>{{ r.label }}</td>
                      <td class="num">{{ r.count | number }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="muted">No hay tickets abiertos.</p>
            }
          </section>
          <section class="card">
            <h2>Tickets por cliente</h2>
            @if (d.by_client.length) {
              <table class="mini">
                <tbody>
                  @for (r of d.by_client; track r.key) {
                    <tr>
                      <td>{{ r.label }}</td>
                      <td class="num">{{ r.count | number }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="muted">No hay tickets.</p>
            }
          </section>
        </div>
      }
    }
  `,
  styles: `
    .note {
      margin: 0 0 16px;
      font-size: 0.85rem;
      max-width: 900px;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .kpi {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .kpi-label {
      color: var(--muted);
      font-size: 0.82rem;
    }
    .kpi-value {
      font-size: 1.8rem;
      font-weight: 600;
      line-height: 1.1;
    }
    .kpi-value.small {
      font-size: 1.4rem;
    }
    .kpi.warn .kpi-value {
      color: #92400e;
    }
    .kpi.ok .kpi-value {
      color: var(--success);
    }
    .kpi.bad .kpi-value {
      color: var(--danger);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
    }
    .wide {
      grid-column: 1 / -1;
    }
    .mini {
      width: 100%;
      border-collapse: collapse;
    }
    .mini td {
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
    }
    .mini .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
  `,
})
export class DashboardPage {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly lookups = inject(Lookups);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly priorities = PRIORITIES;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly clients = signal<LookupItem[]>([]);
  readonly assignees = signal<LookupItem[]>([]);
  readonly categories = signal<Meta['categories']>([]);
  readonly data = signal<Dashboard | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly exporting = signal(false);

  readonly filters = this.fb.nonNullable.group({
    date_from: [localDate(29)],
    date_to: [localDate(0)],
    client_id: [''],
    assignee_id: [''],
    priority: [''],
    category_id: [''],
  });

  readonly seriesLabels = computed(() =>
    (this.data()?.series ?? []).map((p) => p.date.slice(5).split('-').reverse().join('/')),
  );
  readonly seriesData = computed(() => [
    { label: 'Creados', data: (this.data()?.series ?? []).map((p) => p.created) },
    { label: 'Cerrados', data: (this.data()?.series ?? []).map((p) => p.closed), color: '#2a9d62' },
  ]);
  readonly hasSeries = computed(() => (this.data()?.series ?? []).some((p) => p.created || p.closed));

  constructor() {
    this.lookups.clients().subscribe({ next: (r) => this.clients.set(r), error: () => undefined });
    this.lookups.assignees().subscribe({ next: (r) => this.assignees.set(r), error: () => undefined });
    this.lookups.meta().subscribe({ next: (m) => this.categories.set(m.categories), error: () => undefined });
    this.load();
    this.filters.valueChanges.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  labels(items: { label: string }[]): string[] {
    return items.map((i) => i.label);
  }
  counts(items: { count: number }[]): number[] {
    return items.map((i) => i.count);
  }
  duration(h: number | null): string {
    return formatDuration(h);
  }

  private params(): Params {
    return this.filters.getRawValue();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.get<Dashboard>('/dashboard', this.params()).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(errorMessage(e, 'No se pudieron cargar las métricas.'));
      },
    });
  }

  export(): void {
    this.exporting.set(true);
    this.api.downloadCsv('/dashboard/export', this.params(), 'dashboard').subscribe({
      next: () => this.exporting.set(false),
      error: (e) => {
        this.exporting.set(false);
        this.notify.error(errorMessage(e, 'No se pudo exportar.'));
      },
    });
  }
}
