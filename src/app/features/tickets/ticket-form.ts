import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { Observable, of } from 'rxjs';
import { DATEPICKER, DATEPICKER_PROVIDERS } from '../../shared/datepicker';
import { Api, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { combineDateTime, fromIso, toIso } from '../../core/datetime';
import { Lookups } from '../../core/lookups.service';
import { LookupItem, Meta, PRIORITIES, PRIORITY_LABELS, TicketDetail } from '../../core/models';
import { Notify } from '../../core/notify.service';
import { SELECT_SEARCH } from '../../shared/select-search';
import { confirm } from '../../shared/confirm-dialog';
import { ErrorState, LoadingBar } from '../../shared/states';
import { TICKET_NOT_FOUND, isValidId, minTrimmedLength } from '../../core/validators';

@Component({
  selector: 'app-ticket-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    DATEPICKER,
    MatTimepickerModule,
    SELECT_SEARCH,
    ErrorState,
    LoadingBar,
  ],
  providers: [DATEPICKER_PROVIDERS],
  host: { '(window:beforeunload)': 'warnOnUnload($event)' },
  template: `
    <div class="page-header">
      <h1>{{ id() ? 'Editar ticket' : 'Nuevo ticket' }}</h1>
    </div>
    <app-loading-bar [active]="loading()" />
    @if (loadError()) {
      <app-error-state [message]="loadError()!"
        ><a mat-stroked-button routerLink="/tickets">Volver al listado</a></app-error-state
      >
    } @else if (!loading()) {
      <form class="card" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (error()) {
          <p class="banner error" role="alert">{{ error() }}</p>
        }
        <div class="form-grid">
          <mat-form-field appearance="outline" class="span2">
            <mat-label>Título</mat-label>
            <input matInput formControlName="title" maxlength="200" data-testid="title" />
            @if (form.controls.title.touched && form.controls.title.invalid) {
              <mat-error>El título es obligatorio (mínimo 3 caracteres)</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" class="span2">
            <mat-label>Descripción</mat-label>
            <textarea
              matInput
              rows="5"
              formControlName="description"
              maxlength="5000"
              data-testid="description"
            ></textarea>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Cliente</mat-label>
            <mat-select formControlName="client_id" data-testid="client">
              <app-select-search #sc />
              @for (c of clients() | optionFilter: sc.term() : form.value.client_id; track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              } @empty {
                <mat-option disabled>Sin coincidencias</mat-option>
              }
            </mat-select>
            @if (form.controls.client_id.touched && form.controls.client_id.invalid) {
              <mat-error>Selecciona un cliente</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Categoría</mat-label>
            <mat-select formControlName="category_id" data-testid="category">
              <app-select-search #sk />
              @for (c of categories() | optionFilter: sk.term() : form.value.category_id; track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              } @empty {
                <mat-option disabled>Sin coincidencias</mat-option>
              }
            </mat-select>
            @if (form.controls.category_id.touched && form.controls.category_id.invalid) {
              <mat-error>Selecciona una categoría</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Prioridad</mat-label>
            <mat-select formControlName="priority" data-testid="priority">
              <app-select-search #sp />
              @for (p of priorityOptions | optionFilter: sp.term() : form.value.priority; track p.id) {
                <mat-option [value]="p.id">{{ p.name }}</mat-option>
              } @empty {
                <mat-option disabled>Sin coincidencias</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <div class="due span2">
            <mat-form-field appearance="outline">
              <mat-label>Vencimiento (opcional)</mat-label>
              <input
                matInput
                [matDatepicker]="duePicker"
                formControlName="due_date"
                placeholder="dd/mm/aaaa"
                data-testid="due-date"
              />
              <mat-datepicker-toggle matIconSuffix [for]="duePicker" data-testid="due-picker" />
              <mat-datepicker #duePicker />
              @if (form.controls.due_date.hasError('matDatepickerParse')) {
                <mat-error>Fecha no válida (dd/mm/aaaa)</mat-error>
              }
              @if (form.hasError('timeWithoutDate') && form.controls.due_time.touched) {
                <mat-hint class="hint-error" role="alert">Indica también la fecha</mat-hint>
              } @else if (form.hasError('duePast') && (form.controls.due_date.touched || submitted())) {
                <mat-hint class="hint-error" role="alert">El vencimiento ya pasó: elige una fecha futura</mat-hint>
              } @else {
                <mat-hint>Sin hora: vence a las 23:59</mat-hint>
              }
            </mat-form-field>
            <mat-form-field appearance="outline" class="time">
              <mat-label>Hora</mat-label>
              <input
                matInput
                [matTimepicker]="dueTime"
                formControlName="due_time"
                placeholder="hh:mm"
                data-testid="due-time"
              />
              <mat-timepicker-toggle matIconSuffix [for]="dueTime" aria-label="Elegir hora" />
              <mat-timepicker #dueTime interval="30m" />
            </mat-form-field>
            @if (form.value.due_date || form.value.due_time) {
              <button
                mat-icon-button
                type="button"
                (click)="form.patchValue({ due_date: null, due_time: null })"
                aria-label="Quitar vencimiento"
              >
                <mat-icon>close</mat-icon>
              </button>
            }
          </div>
          @if (!id() && canAssign()) {
            <mat-form-field appearance="outline" class="span2">
              <mat-label>Responsable (opcional)</mat-label>
              <mat-select formControlName="assignee_id" data-testid="assignee">
                <app-select-search #sa />
                <mat-option [value]="null">Sin responsable</mat-option>
                @for (a of assignees() | optionFilter: sa.term() : form.value.assignee_id; track a.id) {
                  <mat-option [value]="a.id">{{ a.name }}</mat-option>
                } @empty {
                  <mat-option disabled>Sin coincidencias</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
        </div>
        <div class="actions end">
          <a mat-button routerLink="/tickets">Cancelar</a>
          <button mat-flat-button type="submit" [disabled]="saving()" data-testid="save-ticket">
            <mat-icon>save</mat-icon> Guardar
          </button>
        </div>
      </form>
    }
  `,
  styles: `
    .actions.end {
      justify-content: flex-end;
      margin-top: 8px;
    }
    form.card {
      max-width: 860px;
    }
    .due {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    .due mat-form-field {
      flex: 0 1 240px;
    }
    .due .time {
      flex: 0 1 160px;
    }
    .hint-error {
      color: var(--danger);
    }
    .due button {
      margin-top: 8px;
    }
  `,
})
export class TicketForm implements OnInit {
  /** Parámetro de ruta `:id` (withComponentInputBinding). */
  readonly id = input<string>();

  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly notify = inject(Notify);
  private readonly lookups = inject(Lookups);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  readonly canAssign = () => this.auth.can('tickets', 3);

  readonly priorityOptions = PRIORITIES.map((p) => ({ id: p, name: PRIORITY_LABELS[p] }));
  readonly clients = signal<LookupItem[]>([]);
  readonly assignees = signal<LookupItem[]>([]);
  readonly categories = signal<Meta['categories']>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly submitted = signal(false);
  /** Vencimiento guardado (ISO): conservarlo aunque ya haya pasado no es un error, cambiarlo a una fecha pasada sí. */
  private originalDue: string | null = null;
  private saved = false;

  readonly form = this.fb.group(
    {
      title: this.fb.nonNullable.control('', [minTrimmedLength(3), Validators.maxLength(200)]),
      description: this.fb.nonNullable.control(''),
      client_id: this.fb.control<number | null>(null, [Validators.required]),
      category_id: this.fb.control<number | null>(null, [Validators.required]),
      priority: this.fb.nonNullable.control('media'),
      // Fecha y hora en controles separados: dos inputs sobre un mismo FormControl no se sincronizan entre sí
      // (Angular Forms no notifica al otro input) y la hora acabaría aplicándose sobre la fecha de hoy.
      due_date: this.fb.control<Date | null>(null),
      due_time: this.fb.control<Date | null>(null),
      assignee_id: this.fb.control<number | null>(null),
    },
    {
      validators: [
        (g) => (g.value.due_time && !g.value.due_date ? { timeWithoutDate: true } : null),
        (g) => {
          const due = combineDateTime(g.value.due_date, g.value.due_time);
          if (!due || toIso(due) === this.originalDue) return null;
          return due.getTime() < Date.now() ? { duePast: true } : null;
        },
      ],
    },
  );

  constructor() {
    this.lookups.clients().subscribe((r) => this.clients.set(r));
    this.lookups.meta().subscribe((m) => this.categories.set(m.categories));
    if (this.canAssign()) this.lookups.assignees().subscribe((r) => this.assignees.set(r));
  }

  ngOnInit(): void {
    const id = this.id();
    if (!id) return;
    if (!isValidId(id)) {
      this.loadError.set(TICKET_NOT_FOUND);
      return;
    }
    this.loading.set(true);
    this.api.get<TicketDetail>(`/tickets/${id}`).subscribe({
      next: (t) => {
        this.form.patchValue({
          title: t.title,
          description: t.description,
          client_id: t.client_id,
          category_id: t.category_id,
          priority: t.priority,
          due_date: fromIso(t.due_at),
          due_time: fromIso(t.due_at),
        });
        const v = this.form.getRawValue();
        this.originalDue = toIso(combineDateTime(v.due_date, v.due_time));
        this.form.updateValueAndValidity();
        this.form.markAsPristine();
        // El cliente actual puede estar inactivo: se conserva visible en la lista.
        if (!this.clients().some((c) => c.id === t.client_id)) {
          this.clients.update((l) => [...l, { id: t.client_id, name: t.client_name }]);
        }
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.loadError.set(errorMessage(e, 'No se pudo cargar el ticket.'));
      },
    });
  }

  save(): void {
    if (this.saving()) return; // doble clic: ya hay un envío en curso
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const body: Record<string, unknown> = {
      title: v.title.trim(),
      description: v.description.trim(),
      client_id: v.client_id,
      category_id: v.category_id,
      priority: v.priority,
      due_at: toIso(combineDateTime(v.due_date, v.due_time)),
    };
    const id = this.id();
    if (!id && this.canAssign() && v.assignee_id !== null) body['assignee_id'] = v.assignee_id;
    const req = id
      ? this.api.patch<TicketDetail>(`/tickets/${id}`, body)
      : this.api.post<TicketDetail>('/tickets', body);
    req.subscribe({
      next: (t) => {
        this.saved = true;
        this.notify.success(id ? 'Ticket actualizado' : `Ticket ${t.folio} creado`);
        void this.router.navigate(['/tickets', t.id]);
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }

  /** Recargar o cerrar la pestaña con cambios: el navegador muestra su propio aviso. */
  warnOnUnload(e: BeforeUnloadEvent): void {
    if (!this.saved && this.form.dirty) e.preventDefault();
  }

  /** Guardia de salida: si hay cambios sin guardar, se pregunta antes de perderlos. */
  canLeave(): Observable<boolean> {
    if (this.saved || !this.form.dirty) return of(true);
    return confirm(this.dialog, {
      title: 'Descartar cambios',
      message: 'Tienes cambios sin guardar en este ticket. Si sales, se perderán.',
      confirmLabel: 'Descartar',
      cancelLabel: 'Seguir editando',
      danger: true,
    });
  }
}
