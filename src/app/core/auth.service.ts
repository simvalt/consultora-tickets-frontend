import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { apiUrl } from './config';
import { Me, ModuleKey, TokenResponse } from './models';

/**
 * Sesión: el access token (corto) vive sólo en memoria; el refresh token es una cookie HttpOnly
 * gestionada por el servidor. Al recargar la página se intenta renovar la sesión con esa cookie.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = apiUrl();

  private readonly tokenSig = signal<string | null>(null);
  readonly user = signal<Me | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  private inflightRefresh$: Observable<TokenResponse> | null = null;

  token(): string | null {
    return this.tokenSig();
  }

  can(module: ModuleKey, level: number): boolean {
    return (this.user()?.permissions?.[module] ?? 0) >= level;
  }

  login(email: string, password: string): Observable<Me> {
    return this.http
      .post<TokenResponse>(`${this.base}/auth/login`, { email, password })
      .pipe(map((r) => this.applySession(r)));
  }

  /** Renueva el access token; varias solicitudes simultáneas comparten una sola renovación. */
  refresh(): Observable<TokenResponse> {
    if (!this.inflightRefresh$) {
      this.inflightRefresh$ = this.http.post<TokenResponse>(`${this.base}/auth/refresh`, {}).pipe(
        tap((r) => this.applySession(r)),
        finalize(() => (this.inflightRefresh$ = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.inflightRefresh$;
  }

  /** Se ejecuta al arrancar la aplicación: restaura la sesión si la cookie de refresco sigue vigente. */
  restore(): Observable<boolean> {
    return this.refresh().pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }

  /** Cambia la propia contraseña; el servidor devuelve una sesión nueva y cierra las demás. */
  changePassword(currentPassword: string, newPassword: string): Observable<Me> {
    return this.http
      .post<TokenResponse>(`${this.base}/auth/change-password`, {
        current_password: currentPassword,
        new_password: newPassword,
      })
      .pipe(map((r) => this.applySession(r)));
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/logout`, {}).pipe(
      catchError(() => of(undefined)),
      finalize(() => this.clearSession()),
    );
  }

  clearSession(): void {
    this.tokenSig.set(null);
    this.user.set(null);
  }

  private applySession(r: TokenResponse): Me {
    this.tokenSig.set(r.access_token);
    this.user.set(r.user);
    return r.user;
  }
}
