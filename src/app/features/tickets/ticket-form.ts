import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { isoToLocalInput, localInputToIso } from '../../core/datetime';
import { Lookups } from '../../core/lookups.service';
import { LookupItem, Meta, PRIORITIES, PRIORITY_LABELS, TicketDetail } from '../../core/models';
import { Notify } from '../../core/notify.service';
import { ErrorState, LoadingBar } from '../../shared/states';

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
    ErrorState,
    LoadingBar,
  ],
  template: `
    <div class="page-header">
      <h1>{{ id() ? 'Editar ticket' : 'Nuevo ticket' }}</h1>
    </div>
    <app-loading-bar [active]="loading()" />
    @if (loadError()) {
      <app-error-state [message]="loadError()!"
        ><a mat-stroked-button routerLink="/tickets">Volver al listado</a></app-error-state
      >
    } @else {
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
              @for (c of clients(); track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              }
            </mat-select>
            @if (form.controls.client_id.touched && form.controls.client_id.invalid) {
              <mat-error>Selecciona un cliente</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Categoría</mat-label>
            <mat-select formControlName="category_id" data-testid="category">
              @for (c of categories(); track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              }
            </mat-select>
            @if (form.controls.category_id.touched && form.controls.category_id.invalid) {
              <mat-error>Selecciona una categoría</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Prioridad</mat-label>
            <mat-select formControlName="priority" data-testid="priority">
              @for (p of priorities; track p) {
                <mat-option [value]="p">{{ priorityLabels[p] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Vencimiento (opcional)</mat-label>
            <input matInput type="datetime-local" formControlName="due_at" data-testid="due" />
          </mat-form-field>
          @if (!id() && canAssign()) {
            <mat-form-field appearance="outline" class="span2">
              <mat-label>Responsable (opcional)</mat-label>
              <mat-select formControlName="assignee_id" data-testid="assignee">
                <mat-option [value]="null">Sin responsable</mat-option>
                @for (a of assignees(); track a.id) {
                  <mat-option [value]="a.id">{{ a.name }}</mat-option>
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
  readonly canAssign = () => this.auth.can('tickets', 3);
  private readonly auth = inject(AuthService);

  readonly priorities = PRIORITIES;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly clients = signal<LookupItem[]>([]);
  readonly assignees = signal<LookupItem[]>([]);
  readonly categories = signal<Meta['categories']>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);

  readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]),
    description: this.fb.nonNullable.control(''),
    client_id: this.fb.control<number | null>(null, [Validators.required]),
    category_id: this.fb.control<number | null>(null, [Validators.required]),
    priority: this.fb.nonNullable.control('media'),
    due_at: this.fb.nonNullable.control(''),
    assignee_id: this.fb.control<number | null>(null),
  });

  constructor() {
    this.lookups.clients().subscribe((r) => this.clients.set(r));
    this.lookups.meta().subscribe((m) => this.categories.set(m.categories));
    if (this.canAssign()) this.lookups.assignees().subscribe((r) => this.assignees.set(r));
  }

  ngOnInit(): void {
    const id = this.id();
    if (!id) return;
    this.loading.set(true);
    this.api.get<TicketDetail>(`/tickets/${id}`).subscribe({
      next: (t) => {
        this.form.patchValue({
          title: t.title,
          description: t.description,
          client_id: t.client_id,
          category_id: t.category_id,
          priority: t.priority,
          due_at: isoToLocalInput(t.due_at),
        });
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
      due_at: localInputToIso(v.due_at),
    };
    const id = this.id();
    if (!id && this.canAssign() && v.assignee_id !== null) body['assignee_id'] = v.assignee_id;
    const req = id
      ? this.api.patch<TicketDetail>(`/tickets/${id}`, body)
      : this.api.post<TicketDetail>('/tickets', body);
    req.subscribe({
      next: (t) => {
        this.notify.success(id ? 'Ticket actualizado' : `Ticket ${t.folio} creado`);
        void this.router.navigate(['/tickets', t.id]);
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
