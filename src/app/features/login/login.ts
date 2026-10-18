import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { errorMessage } from '../../core/api';
import { safeReturnUrl } from '../../core/safe-url';
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
    <div class="login">
      <aside class="login-aside" aria-hidden="true">
        <div class="aside-copy">
          <p class="aside-title">Cada ticket, del registro al cierre.</p>
          <p class="aside-sub">
            Registra, asigna y resuelve solicitudes de clientes con historial completo y métricas al día.
          </p>
          <div class="flow">
            <span class="badge status-sin_inicio">Sin inicio</span>
            <mat-icon>arrow_forward</mat-icon>
            <span class="badge status-en_proceso">En proceso</span>
            <mat-icon>arrow_forward</mat-icon>
            <span class="badge status-cerrado">Cerrado</span>
          </div>
        </div>
      </aside>

      <main class="login-main">
        <form class="login-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="login-brand">
            <img src="favicon.svg" alt="" width="40" height="40" />
            <span>Consultora <strong>Tickets</strong></span>
          </div>
          <h1>Inicia sesión</h1>
          <p class="muted lead">Usa tu cuenta de la consultora.</p>

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

          <button mat-flat-button type="submit" class="submit" [disabled]="loading()" data-testid="submit">
            @if (loading()) {
              <mat-progress-spinner diameter="18" mode="indeterminate" aria-label="Iniciando sesión" />
            } @else {
              Iniciar sesión
            }
          </button>
        </form>
      </main>
    </div>
  `,
  styles: `
    .login {
      min-height: 100dvh;
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
      background: var(--bg);
    }
    /* Panel de marca: degradado en el azul del logotipo (sin morados ni neones). */
    .login-aside {
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: flex-end;
      padding: 56px;
      color: #f4f7ff;
      background:
        radial-gradient(120% 80% at 0% 0%, #2f6fd6 0%, transparent 55%),
        radial-gradient(90% 70% at 100% 100%, #0f2f6b 0%, transparent 60%),
        linear-gradient(160deg, #1e5bbf 0%, #153f86 100%);
    }
    .login-aside::after {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(60% 50% at 70% 30%, rgb(255 255 255 / 12%), transparent 70%);
      pointer-events: none;
    }
    .aside-copy {
      position: relative;
      z-index: 1;
      max-width: 30rem;
    }
    .aside-title {
      margin: 0 0 12px;
      font-size: clamp(2rem, 3.4vw, 2.75rem);
      line-height: 1.08;
      font-weight: 650;
      letter-spacing: -0.03em;
      text-wrap: balance;
    }
    .aside-sub {
      margin: 0 0 28px;
      font-size: 1.0625rem;
      line-height: 1.55;
      color: rgb(244 247 255 / 82%);
      max-width: 34ch;
    }
    .flow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgb(255 255 255 / 12%);
      border: 1px solid rgb(255 255 255 / 22%);
      box-shadow: inset 0 1px 0 rgb(255 255 255 / 20%);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }
    .flow .badge {
      --tone: #ffffff;
      background: rgb(255 255 255 / 16%);
    }
    .flow mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      opacity: 0.7;
    }
    .login-main {
      display: grid;
      place-items: center;
      padding: 32px 24px;
    }
    .login-form {
      width: 100%;
      max-width: 380px;
      display: flex;
      flex-direction: column;
    }
    .login-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 40px;
      font-size: 1rem;
      letter-spacing: -0.01em;
    }
    .login-brand img {
      border-radius: 10px;
      box-shadow: var(--shadow-md);
    }
    .login-brand strong {
      font-weight: 650;
    }
    h1 {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 650;
      letter-spacing: -0.025em;
    }
    .lead {
      margin: 6px 0 24px;
    }
    .submit {
      height: 44px;
      margin-top: 4px;
    }
    @media (max-width: 899px) {
      .login {
        grid-template-columns: 1fr;
      }
      .login-aside {
        display: none;
      }
    }
    @media (prefers-reduced-transparency: reduce) {
      .flow {
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        background: rgb(20 50 110 / 60%);
      }
    }
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
        void this.router.navigateByUrl(safeReturnUrl(returnUrl));
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(errorMessage(err, 'No se pudo iniciar sesión.'));
      },
    });
  }
}
