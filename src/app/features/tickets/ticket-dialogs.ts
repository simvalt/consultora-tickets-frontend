import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Api, errorMessage } from '../../core/api';
import { SELECT_SEARCH } from '../../shared/select-search';
import { Lookups } from '../../core/lookups.service';
import { LookupItem, REASON_REQUIRED, STATUS_LABELS, TicketDetail, TicketStatus } from '../../core/models';

export interface TicketDialogData {
  ticket: TicketDetail;
}

/** Cambio de estatus: sólo ofrece transiciones válidas y pide motivo/resolución/responsable según el caso. */
@Component({
  selector: 'app-status-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    SELECT_SEARCH,
  ],
  template: `
    <h2 mat-dialog-title>Cambiar estatus</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        @if (error()) {
          <p class="banner error" role="alert">{{ error() }}</p>
        }
        <mat-form-field appearance="outline" class="full">
          <mat-label>Nuevo estatus</mat-label>
          <mat-select formControlName="status" data-testid="new-status">
            <app-select-search #st />
            @for (o of transitionOptions | optionFilter: st.term() : form.value.status; track o.id) {
              <mat-option [value]="o.id">{{ o.name }}</mat-option>
            } @empty {
              <mat-option disabled>Sin coincidencias</mat-option>
            }
          </mat-select>
        </mat-form-field>

        @if (needsAssignee()) {
          <mat-form-field appearance="outline" class="full">
            <mat-label>Responsable</mat-label>
            <mat-select formControlName="assignee_id" data-testid="status-assignee">
              <app-select-search #sa />
              @for (a of assignees() | optionFilter: sa.term() : form.value.assignee_id; track a.id) {
                <mat-option [value]="a.id">{{ a.name }}</mat-option>
              } @empty {
                <mat-option disabled>Sin coincidencias</mat-option>
              }
            </mat-select>
            <mat-hint>Este estatus requiere un responsable</mat-hint>
            <mat-error>Selecciona un responsable</mat-error>
          </mat-form-field>
        }
        @if (needsReason()) {
          <mat-form-field appearance="outline" class="full">
            <mat-label>Motivo</mat-label>
            <textarea
              matInput
              rows="3"
              formControlName="reason"
              maxlength="2000"
              data-testid="status-reason"
            ></textarea>
            <mat-error>El motivo es obligatorio</mat-error>
          </mat-form-field>
        }
        @if (needsResolution()) {
          <mat-form-field appearance="outline" class="full">
            <mat-label>Resumen de la resolución</mat-label>
            <textarea
              matInput
              rows="3"
              formControlName="resolution"
              maxlength="2000"
              data-testid="status-resolution"
            ></textarea>
            <mat-error>El resumen de la resolución es obligatorio</mat-error>
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="saving() || !status()" data-testid="status-save">
          Aplicar
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class StatusDialog {
  readonly data = inject<TicketDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<StatusDialog>);
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  readonly labels = STATUS_LABELS;
  readonly transitionOptions = this.data.ticket.allowed_transitions.map((s) => ({
    id: s,
    name: STATUS_LABELS[s] + (this.data.ticket.status === 'cerrado' && s === 'en_proceso' ? ' (reapertura)' : ''),
  }));
  readonly assignees = signal<LookupItem[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    status: ['' as TicketStatus | ''],
    reason: [''],
    resolution: [''],
    assignee_id: [this.data.ticket.assignee_id as number | null],
  });
  readonly status = signal<TicketStatus | ''>('');
  readonly needsReason = computed(() => {
    const s = this.status();
    return s !== '' && (REASON_REQUIRED.includes(s) || this.isReopen(s));
  });
  readonly needsResolution = computed(() => this.status() === 'cerrado');
  readonly needsAssignee = computed(() => this.status() === 'iniciado' && !this.data.ticket.assignee_id);

  constructor() {
    inject(Lookups)
      .assignees()
      .subscribe((a) => this.assignees.set(a));
    this.form.controls.status.valueChanges.subscribe((s) => {
      this.status.set(s);
      this.applyValidators();
    });
  }

  /** Los campos obligatorios dependen del estatus elegido. */
  private applyValidators(): void {
    const c = this.form.controls;
    const required = [Validators.required, Validators.pattern(/\S/)];
    c.reason.setValidators(this.needsReason() ? required : []);
    c.resolution.setValidators(this.needsResolution() ? required : []);
    c.assignee_id.setValidators(this.needsAssignee() ? [Validators.required] : []);
    Object.values(c).forEach((ctrl) => ctrl.updateValueAndValidity({ emitEvent: false }));
  }

  isReopen(s: TicketStatus): boolean {
    return this.data.ticket.status === 'cerrado' && s === 'en_proceso';
  }

  save(): void {
    const v = this.form.getRawValue();
    if (!v.status) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    const body: Record<string, unknown> = { status: v.status };
    if (this.needsReason()) body['reason'] = v.reason.trim();
    if (this.needsResolution()) body['resolution'] = v.resolution.trim();
    if (this.needsAssignee()) body['assignee_id'] = v.assignee_id;
    this.api.post<TicketDetail>(`/tickets/${this.data.ticket.id}/status`, body).subscribe({
      next: (t) => this.ref.close(t),
      error: (e) => {
        this.saving.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}

@Component({
  selector: 'app-assign-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatSelectModule, MatButtonModule, SELECT_SEARCH],
  template: `
    <h2 mat-dialog-title>{{ data.ticket.assignee_id ? 'Cambiar responsable' : 'Asignar responsable' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        @if (error()) {
          <p class="banner error" role="alert">{{ error() }}</p>
        }
        <mat-form-field appearance="outline" class="full">
          <mat-label>Responsable</mat-label>
          <mat-select formControlName="assignee_id" data-testid="assign-select">
            <app-select-search #sa />
            @if (data.ticket.status === 'sin_inicio') {
              <mat-option [value]="null">Sin responsable</mat-option>
            }
            @for (a of assignees() | optionFilter: sa.term() : form.value.assignee_id; track a.id) {
              <mat-option [value]="a.id">{{ a.name }}</mat-option>
            } @empty {
              <mat-option disabled>Sin coincidencias</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="saving()" data-testid="assign-save">Guardar</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class AssignDialog {
  readonly data = inject<TicketDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AssignDialog>);
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  readonly assignees = signal<LookupItem[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = this.fb.group({ assignee_id: this.fb.control<number | null>(this.data.ticket.assignee_id) });

  constructor() {
    inject(Lookups)
      .assignees()
      .subscribe((a) => this.assignees.set(a));
  }

  save(): void {
    this.saving.set(true);
    this.error.set(null);
    this.api
      .post<TicketDetail>(`/tickets/${this.data.ticket.id}/assign`, {
        assignee_id: this.form.getRawValue().assignee_id,
      })
      .subscribe({
        next: (t) => this.ref.close(t),
        error: (e) => {
          this.saving.set(false);
          this.error.set(errorMessage(e));
        },
      });
  }
}
