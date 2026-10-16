import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { apiUrl } from './config';
import { ApiErrorBody } from './models';

export type Params = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

/** Convierte un objeto en HttpParams omitiendo vacíos y repitiendo las claves de los arreglos. */
export function toHttpParams(params: Params): HttpParams {
  let p = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) p = p.append(key, String(v));
    } else {
      p = p.set(key, String(value));
    }
  }
  return p;
}

/** Mensaje legible para el usuario a partir de un error HTTP del backend. */
export function errorMessage(err: unknown, fallback = 'Ocurrió un error inesperado. Inténtalo de nuevo.'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'No se pudo conectar con el servidor.';
    const body = err.error as Partial<ApiErrorBody> | null;
    const e = body?.error;
    if (e?.details?.length) return `${e.message} ${e.details.map((d) => d.message).join('; ')}`;
    if (e?.message) return e.message;
    if (err.status === 403) return 'No tienes permiso para realizar esta acción.';
    if (err.status === 404) return 'El recurso no existe.';
  }
  return fallback;
}

export function errorCode(err: unknown): string | undefined {
  return err instanceof HttpErrorResponse ? (err.error as Partial<ApiErrorBody> | null)?.error?.code : undefined;
}

/** Cliente HTTP base con la URL de la API y la descarga de exportaciones CSV. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  readonly base = apiUrl();

  get<T>(path: string, params: Params = {}): Observable<T> {
    return this.http.get<T>(`${this.base}${path}`, { params: toHttpParams(params) });
  }
  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.post<T>(`${this.base}${path}`, body);
  }
  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(`${this.base}${path}`, body);
  }
  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.base}${path}`);
  }

  /** Descarga el CSV generado por el backend con los mismos filtros/orden del listado. */
  downloadCsv(path: string, params: Params, fallbackName: string): Observable<string> {
    return this.http
      .get(`${this.base}${path}`, { params: toHttpParams(params), observe: 'response', responseType: 'blob' })
      .pipe(
        map((res) => {
          const disposition = res.headers.get('Content-Disposition') ?? '';
          const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? `${fallbackName}.csv`;
          const url = URL.createObjectURL(res.body as Blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          return name;
        }),
      );
  }
}
