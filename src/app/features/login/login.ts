import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { errorCode, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="login-wrap">
      <form class="login-card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="login-brand"><mat-icon aria-hidden="true">support_agent</mat-icon></div>
        <h1>Consultora Tickets</h1>
        <p class="muted">Inicia sesión para continuar</p>

        @if (expired()) {
          <p class="banner info" role="status">Tu sesión expiró. Inicia sesión de nuevo.</p>
        }
        @if (error()) {
          <p class="banner error" role="alert" data-testid="login-error">{{ error() }}</p>
        }

        <mat-form-field appearance="outline">
          <mat-label>Correo electrónico</mat-label>
          <input matInput type="email" formControlName="email" autocomplete="username" data-testid="email" />
          @if (form.controls.email.touched && form.controls.email.invalid) {
            <mat-error>Ingresa un correo válido</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Contraseña</mat-label>
          <input
            matInput
            [type]="show() ? 'text' : 'password'"
            formControlName="password"
            autocomplete="current-password"
            data-testid="password"
          />
          <button
            mat-icon-button
            matSuffix
            type="button"
            (click)="show.set(!show())"
            [attr.aria-label]="show() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
          >
            <mat-icon>{{ show() ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
          @if (form.controls.password.touched && form.controls.password.invalid) {
            <mat-error>La contraseña es obligatoria</mat-error>
          }
        </mat-form-field>

        <button mat-flat-button type="submit" class="full" [disabled]="loading()" data-testid="submit">
          @if (loading()) {
            <mat-progress-spinner diameter="20" mode="indeterminate" />
          } @else {
            Iniciar sesión
          }
        </button>
      </form>
    </div>
  `,
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  readonly loading = signal(false);
  readonly show = signal(false);
  readonly error = signal<string | null>(null);
  readonly expired = signal(this.route.snapshot.queryParamMap.has('expired'));

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email.trim(), password).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(returnUrl && returnUrl.startsWith('/') ? returnUrl : '/');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          errorCode(err) === 'invalid_credentials' ||
            errorCode(err) === 'user_inactive' ||
            errorCode(err) === 'too_many_attempts'
            ? errorMessage(err)
            : errorMessage(err, 'No se pudo iniciar sesión.'),
        );
      },
    });
  }
}
