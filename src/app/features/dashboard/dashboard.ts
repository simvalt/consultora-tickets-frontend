import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { debounceTime } from 'rxjs';
import { DATEPICKER, DATEPICKER_PROVIDERS, rangeProblem } from '../../shared/datepicker';
import { Api, Params, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { daysAgo, formatDuration, startOfMonth, startOfYear, toIsoDate } from '../../core/datetime';
import { Lookups } from '../../core/lookups.service';
import { Dashboard, LookupItem, Meta, PRIORITIES, PRIORITY_LABELS } from '../../core/models';
import { Notify } from '../../core/notify.service';
import { SELECT_SEARCH } from '../../shared/select-search';
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
    MatButtonToggleModule,
    DATEPICKER,
    SELECT_SEARCH,
    ChartComponent,
    EmptyState,
    ErrorState,
    LoadingBar,
  ],
  providers: [DATEPICKER_PROVIDERS],
  template: `
    <div class="page-header">
      <h1>
        Dashboard
        <span class="subtitle">{{ periodLabel() }}</span>
      </h1>
      <div class="actions">
        <button mat-stroked-button (click)="export()" [disabled]="exporting()" data-testid="export">
          <mat-icon>download</mat-icon> Exportar CSV
        </button>
      </div>
    </div>

    <form class="filters" [formGroup]="filters">
      <mat-form-field appearance="outline" class="range">
        <mat-label>Periodo (fecha de creación)</mat-label>
        <mat-date-range-input [rangePicker]="periodPicker">
          <input matStartDate formControlName="date_from" placeholder="Desde" data-testid="date-from" />
          <input matEndDate formControlName="date_to" placeholder="Hasta" data-testid="date-to" />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="periodPicker" data-testid="period-picker" />
        <mat-date-range-picker #periodPicker />
        <mat-hint>dd/mm/aaaa · vacío = todo</mat-hint>
        @if (rangeError(); as msg) {
          <mat-error>{{ msg }}</mat-error>
        }
      </mat-form-field>
      <mat-button-toggle-group
        class="presets"
        [value]="preset()"
        (change)="applyPreset($event.value)"
        aria-label="Periodos rápidos"
        data-testid="presets"
      >
        @for (p of presets; track p.id) {
          <mat-button-toggle [value]="p.id">{{ p.label }}</mat-button-toggle>
        }
      </mat-button-toggle-group>
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
        <mat-select formControlName="client_id">
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
        <mat-label>Responsable</mat-label>
        <mat-select formControlName="assignee_id">
          <app-select-search #sa />
          <mat-option value="">Todos</mat-option>
          @for (a of assignees() | optionFilter: sa.term() : filters.value.assignee_id; track a.id) {
            <mat-option [value]="a.id">{{ a.name }}</mat-option>
          } @empty {
            <mat-option disabled>Sin coincidencias</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Prioridad</mat-label>
        <mat-select formControlName="priority" data-testid="dash-priority">
          <app-select-search #sp />
          <mat-option value="">Todas</mat-option>
          @for (p of priorityOptions | optionFilter: sp.term() : filters.value.priority; track p.id) {
            <mat-option [value]="p.id">{{ p.name }}</mat-option>
          } @empty {
            <mat-option disabled>Sin coincidencias</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Categoría</mat-label>
        <mat-select formControlName="category_id">
          <app-select-search #sk />
          <mat-option value="">Todas</mat-option>
          @for (c of categories() | optionFilter: sk.term() : filters.value.category_id; track c.id) {
            <mat-option [value]="c.id">{{ c.name }}</mat-option>
          } @empty {
            <mat-option disabled>Sin coincidencias</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </form>
    <details class="note">
      <summary><mat-icon aria-hidden="true">info</mat-icon> ¿Qué fecha usa cada métrica?</summary>
      <p>
        Los indicadores y distribuciones cuentan los tickets <strong>creados</strong> dentro del periodo. En la gráfica
        diaria, «Creados» usa la fecha de creación y «Cerrados» la fecha del evento de cierre, así que un ticket puede
        cerrarse en el periodo aunque se haya creado antes. Los días se agrupan en UTC.
      </p>
    </details>

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
        <div class="bento" data-testid="kpis">
          <section class="tile hero">
            <span class="tile-label">Abiertos</span>
            <span class="tile-value" data-testid="kpi-open">{{ d.open }}</span>
            <span class="tile-foot">
              de <strong class="num" data-testid="kpi-total">{{ d.total }}</strong> tickets en el periodo
            </span>
          </section>
          <section class="tile" [class.alert]="d.overdue > 0">
            <span class="tile-label"><mat-icon aria-hidden="true">schedule</mat-icon> Vencidos</span>
            <span class="tile-value" data-testid="kpi-overdue">{{ d.overdue }}</span>
            <span class="tile-foot">Abiertos fuera de plazo</span>
          </section>
          <section class="tile">
            <span class="tile-label"><mat-icon aria-hidden="true">timer</mat-icon> Resolución promedio</span>
            <span class="tile-value">{{ duration(d.avg_resolution_hours) }}</span>
            <span class="tile-foot">Desde la creación hasta el cierre</span>
          </section>
          <section class="tile strip" aria-label="Tickets por resultado">
            <div class="stat">
              <span class="badge status-pendiente">Pendientes</span><span class="stat-value">{{ d.pending }}</span>
            </div>
            <div class="stat">
              <span class="badge status-cerrado">Cerrados</span><span class="stat-value">{{ d.closed }}</span>
            </div>
            <div class="stat">
              <span class="badge status-cancelado">Cancelados</span><span class="stat-value">{{ d.cancelled }}</span>
            </div>
            <div class="stat">
              <span class="badge status-rechazado">Rechazados</span><span class="stat-value">{{ d.rejected }}</span>
            </div>
          </section>

          <section class="card chart-wide">
            <h2>
              Creados y cerrados por día
              <span class="muted range-label"
                >{{ d.series_from | date: 'dd/MM' }} al {{ d.series_to | date: 'dd/MM/yyyy' }}</span
              >
            </h2>
            <app-chart
              type="line"
              [labels]="seriesLabels()"
              [series]="seriesData()"
              [height]="300"
              ariaLabel="Tickets creados y cerrados por día"
            />
          </section>
          <section class="card chart-side">
            <h2>Por estatus</h2>
            <app-chart
              type="doughnut"
              [labels]="labels(d.by_status)"
              [series]="[{ label: 'Tickets', data: counts(d.by_status) }]"
              [pointColors]="statusColors(d.by_status)"
              [height]="300"
              ariaLabel="Distribución por estatus"
            />
          </section>
          <section class="card third">
            <h2>Por prioridad</h2>
            <app-chart
              type="bar"
              [labels]="labels(d.by_priority)"
              [series]="[{ label: 'Tickets', data: counts(d.by_priority) }]"
              [pointColors]="priorityColors(d.by_priority)"
              [height]="240"
              ariaLabel="Distribución por prioridad"
            />
          </section>
          <section class="card third">
            <h2>Abiertos por responsable</h2>
            @if (d.open_by_assignee.length) {
              <ol class="rank">
                @for (r of d.open_by_assignee; track r.key) {
                  <li>
                    <span class="rank-label">{{ r.label }}</span>
                    <span class="rank-value">{{ r.count | number }}</span>
                    <span class="rank-bar" [style.width.%]="share(r.count, d.open_by_assignee)"></span>
                  </li>
                }
              </ol>
            } @else {
              <p class="muted">No hay tickets abiertos.</p>
            }
          </section>
          <section class="card third">
            <h2>Tickets por cliente</h2>
            @if (d.by_client.length) {
              <ol class="rank">
                @for (r of d.by_client; track r.key) {
                  <li>
                    <span class="rank-label">{{ r.label }}</span>
                    <span class="rank-value">{{ r.count | number }}</span>
                    <span class="rank-bar" [style.width.%]="share(r.count, d.by_client)"></span>
                  </li>
                }
              </ol>
            } @else {
              <p class="muted">No hay tickets.</p>
            }
          </section>
        </div>
      }
    }
  `,
  styles: `
    .range {
      flex: 0 1 340px;
    }
    .presets {
      align-self: center;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }
    .note {
      margin: 0 0 20px;
      font-size: 0.875rem;
      color: var(--muted);
      max-width: 72ch;
    }
    .note summary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      list-style: none;
      font-weight: 500;
    }
    .note summary::-webkit-details-marker {
      display: none;
    }
    .note summary mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .note p {
      margin: 8px 0 0;
    }
    /* Bento: el dato principal ocupa más; los resultados van juntos en una franja. */
    .bento {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 16px;
    }
    .tile {
      grid-column: span 3;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 20px;
      border-radius: var(--radius-surface);
      background: var(--surface);
      border: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
      animation: rise 420ms var(--ease-out) both;
    }
    .tile:nth-child(2) {
      animation-delay: 40ms;
    }
    .tile:nth-child(3) {
      animation-delay: 80ms;
    }
    .tile:nth-child(4) {
      animation-delay: 120ms;
    }
    .tile-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 0.8125rem;
      font-weight: 500;
    }
    .tile-label mat-icon {
      font-size: 17px;
      width: 17px;
      height: 17px;
    }
    .tile-value {
      font-size: 2.25rem;
      line-height: 1.05;
      font-weight: 650;
      letter-spacing: -0.035em;
      font-variant-numeric: tabular-nums;
    }
    .tile-foot {
      color: var(--muted);
      font-size: 0.8125rem;
      margin-top: auto;
    }
    .tile.hero {
      grid-column: span 6;
      /* Azul profundo en ambos temas: en oscuro el acento claro se vería lavado como superficie grande. */
      color: #fff;
      border-color: transparent;
      background:
        radial-gradient(120% 120% at 100% 0%, color-mix(in srgb, #ffffff 16%, transparent), transparent 55%),
        linear-gradient(150deg, light-dark(#1e5bbf, #2459b3), light-dark(#17489a, #173a7a));
      box-shadow: var(--shadow-md);
    }
    .tile.hero .tile-label,
    .tile.hero .tile-foot {
      color: rgb(255 255 255 / 0.82);
    }
    .tile.hero .tile-value {
      font-size: 3.25rem;
    }
    .tile.alert .tile-value {
      color: var(--danger);
    }
    .tile.strip {
      grid-column: span 12;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 0;
      padding: 6px;
    }
    .stat {
      flex: 1 1 160px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
    }
    .stat + .stat {
      border-left: 1px solid var(--border);
    }
    .stat-value {
      font-size: 1.375rem;
      font-weight: 650;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .chart-wide {
      grid-column: span 8;
    }
    .chart-side {
      grid-column: span 4;
    }
    .third {
      grid-column: span 4;
    }
    .range-label {
      margin-left: 6px;
      font-size: 0.8125rem;
      font-weight: 400;
    }
    /* Ranking con barra proporcional sin pista de fondo. */
    .rank {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 252px;
      overflow-y: auto;
    }
    .rank li {
      display: grid;
      grid-template-columns: 1fr auto;
      row-gap: 5px;
      font-size: 0.875rem;
    }
    .rank-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rank-value {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .rank-bar {
      grid-column: 1 / -1;
      height: 4px;
      border-radius: 999px;
      background: var(--accent);
      opacity: 0.75;
      min-width: 4px;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
    @media (max-width: 1100px) {
      .tile,
      .chart-side,
      .third {
        grid-column: span 6;
      }
      .tile.hero,
      .chart-wide {
        grid-column: span 12;
      }
    }
    @media (max-width: 700px) {
      .tile,
      .tile.hero,
      .chart-wide,
      .chart-side,
      .third {
        grid-column: span 12;
      }
      .stat + .stat {
        border-left: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .tile {
        animation: none;
      }
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

  readonly priorityOptions = PRIORITIES.map((p) => ({ id: p, name: PRIORITY_LABELS[p] }));
  /** Atajos de periodo; «Todo» deja las fechas vacías (indicadores de todo el histórico). */
  readonly presets: { id: string; label: string; range: () => [Date | null, Date | null] }[] = [
    { id: '7d', label: '7 días', range: () => [daysAgo(6), daysAgo(0)] },
    { id: '30d', label: '30 días', range: () => [daysAgo(29), daysAgo(0)] },
    { id: '90d', label: '90 días', range: () => [daysAgo(89), daysAgo(0)] },
    { id: 'month', label: 'Este mes', range: () => [startOfMonth(), daysAgo(0)] },
    { id: 'year', label: 'Este año', range: () => [startOfYear(), daysAgo(0)] },
    { id: 'all', label: 'Todo', range: () => [null, null] },
  ];
  readonly preset = signal<string | null>('30d');
  private readonly filterTick = signal(0);
  readonly clients = signal<LookupItem[]>([]);
  readonly assignees = signal<LookupItem[]>([]);
  readonly categories = signal<Meta['categories']>([]);
  readonly data = signal<Dashboard | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly exporting = signal(false);
  /** En móvil los filtros secundarios van plegados para que los indicadores queden a la vista. */
  readonly moreFilters = signal(false);

  readonly filters = this.fb.group({
    date_from: this.fb.control<Date | null>(daysAgo(29)),
    date_to: this.fb.control<Date | null>(daysAgo(0)),
    client_id: this.fb.nonNullable.control<number | ''>(''),
    assignee_id: this.fb.nonNullable.control<number | ''>(''),
    priority: this.fb.nonNullable.control(''),
    category_id: this.fb.nonNullable.control<number | ''>(''),
  });

  readonly seriesLabels = computed(() =>
    (this.data()?.series ?? []).map((p) => p.date.slice(5).split('-').reverse().join('/')),
  );
  readonly seriesData = computed(() => [
    { label: 'Creados', data: (this.data()?.series ?? []).map((p) => p.created), color: '--accent' },
    { label: 'Cerrados', data: (this.data()?.series ?? []).map((p) => p.closed), color: '--success' },
  ]);
  readonly hasSeries = computed(() => (this.data()?.series ?? []).some((p) => p.created || p.closed));

  constructor() {
    this.lookups.clients().subscribe({ next: (r) => this.clients.set(r), error: () => undefined });
    this.lookups.assignees().subscribe({ next: (r) => this.assignees.set(r), error: () => undefined });
    this.lookups.meta().subscribe({ next: (m) => this.categories.set(m.categories), error: () => undefined });
    this.load();
    this.filters.valueChanges.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.filterTick.update((n) => n + 1);
      this.load();
    });
    // Si el usuario cambia las fechas a mano, se desmarca el atajo (salvo que coincida con uno).
    this.filters.controls.date_from.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.preset.set(this.matchingPreset()));
    this.filters.controls.date_to.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.preset.set(this.matchingPreset()));
  }

  applyPreset(id: string): void {
    const p = this.presets.find((x) => x.id === id);
    if (!p) return;
    const [from, to] = p.range();
    this.filters.patchValue({ date_from: from, date_to: to });
    this.preset.set(id);
  }

  private matchingPreset(): string | null {
    const { date_from, date_to } = this.filters.getRawValue();
    const key = (a: Date | null, b: Date | null) => `${toIsoDate(a)}|${toIsoDate(b)}`;
    return this.presets.find((p) => key(...p.range()) === key(date_from, date_to))?.id ?? null;
  }

  /** Fecha escrita que no se entiende o rango al revés: no se consulta hasta que lo corrija. */
  readonly rangeError = computed(() => {
    this.filterTick();
    return rangeProblem(this.filters.controls.date_from, this.filters.controls.date_to);
  });

  /** Texto del periodo bajo el título. */
  readonly periodLabel = computed(() => {
    this.filterTick();
    if (this.rangeError()) return 'Revisa el periodo';
    const { date_from, date_to } = this.filters.getRawValue();
    const f = (d: Date) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
    if (!date_from && !date_to) return 'Todo el histórico';
    if (date_from && date_to) return `Del ${f(date_from)} al ${f(date_to)}`;
    return date_from ? `Desde el ${f(date_from)}` : `Hasta el ${f(date_to!)}`;
  });

  statusColors(items: { key: string }[]): string[] {
    return items.map((i) => `--st-${i.key}`);
  }
  priorityColors(items: { key: string }[]): string[] {
    return items.map((i) => `--pr-${i.key}`);
  }
  /** Ancho relativo al mayor valor de la lista (0-100). */
  share(count: number, items: { count: number }[]): number {
    const max = Math.max(...items.map((i) => i.count), 1);
    return (count / max) * 100;
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
    const v = this.filters.getRawValue();
    return { ...v, date_from: toIsoDate(v.date_from), date_to: toIsoDate(v.date_to) };
  }

  load(): void {
    if (rangeProblem(this.filters.controls.date_from, this.filters.controls.date_to)) return;
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
    const problem = rangeProblem(this.filters.controls.date_from, this.filters.controls.date_to);
    if (problem) {
      this.notify.error(problem);
      return;
    }
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
