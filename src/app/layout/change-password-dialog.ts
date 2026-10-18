import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { errorMessage } from '../core/api';
import { AuthService } from '../core/auth.service';

function matching(group: AbstractControl): ValidationErrors | null {
  const { new_password, confirm } = group.value as { new_password: string; confirm: string };
  return new_password && confirm && new_password !== confirm ? { mismatch: true } : null;
}

/** Cambio de la propia contraseña: exige la actual; el servidor cierra las demás sesiones. */
@Component({
  selector: 'app-change-password-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Cambiar contraseña</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        @if (error()) {
          <p class="banner error" role="alert" data-testid="cp-error">{{ error() }}</p>
        }
        <mat-form-field appearance="outline" class="full">
          <mat-label>Contraseña actual</mat-label>
          <input
            matInput
            type="password"
            formControlName="current_password"
            autocomplete="current-password"
            data-testid="cp-current"
          />
          @if (form.controls.current_password.touched && form.controls.current_password.invalid) {
            <mat-error>Ingresa tu contraseña actual</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Nueva contraseña</mat-label>
          <input
            matInput
            type="password"
            formControlName="new_password"
            autocomplete="new-password"
            data-testid="cp-new"
          />
          <mat-hint>Mínimo 10 caracteres</mat-hint>
          @if (form.controls.new_password.touched && form.controls.new_password.invalid) {
            <mat-error>Mínimo 10 caracteres</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Confirmar nueva contraseña</mat-label>
          <input
            matInput
            type="password"
            formControlName="confirm"
            autocomplete="new-password"
            data-testid="cp-confirm"
          />
        </mat-form-field>
        @if (form.touched && form.hasError('mismatch')) {
          <p class="banner error" role="alert">Las contraseñas no coinciden.</p>
        }
        <p class="muted small">Al cambiarla se cerrarán tus sesiones abiertas en otros dispositivos.</p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="saving()" data-testid="cp-save">Cambiar</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .small {
      font-size: 0.85rem;
    }
  `,
})
export class ChangePasswordDialog {
  private readonly auth = inject(AuthService);
  private readonly ref = inject(MatDialogRef<ChangePasswordDialog>);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group(
    {
      current_password: ['', Validators.required],
      new_password: ['', [Validators.required, Validators.minLength(10)]],
      confirm: ['', Validators.required],
    },
    { validators: matching },
  );

  save(): void {
    if (this.saving()) return; // doble clic: ya hay un envío en curso
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    const { current_password, new_password } = this.form.getRawValue();
    this.auth.changePassword(current_password, new_password).subscribe({
      next: () => this.ref.close(true),
      error: (e) => {
        this.saving.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
