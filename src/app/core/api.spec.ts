import { HttpErrorResponse } from '@angular/common/http';
import { errorCode, errorMessage, toHttpParams } from './api';
import { daysAgo, formatDuration, fromIso, toIso, toIsoDate } from './datetime';

describe('toHttpParams', () => {
  it('omite vacíos y repite las claves de los arreglos', () => {
    const p = toHttpParams({ q: '', page: 2, status: ['a', 'b'], x: undefined, y: null, flag: false });
    expect(p.getAll('status')).toEqual(['a', 'b']);
    expect(p.get('page')).toBe('2');
    expect(p.get('flag')).toBe('false');
    expect(p.has('q')).toBe(false);
    expect(p.has('x')).toBe(false);
    expect(p.has('y')).toBe(false);
  });
});

describe('errorMessage', () => {
  it('usa el mensaje del backend y los detalles de validación', () => {
    const e = new HttpErrorResponse({
      status: 422,
      error: {
        error: {
          code: 'validation_error',
          message: 'Datos inválidos.',
          details: [{ field: 'title', message: 'muy corto' }],
        },
      },
    });
    expect(errorMessage(e)).toBe('Datos inválidos. muy corto');
    expect(errorCode(e)).toBe('validation_error');
  });
  it('maneja falta de conexión y errores desconocidos', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toContain('conectar');
    expect(errorMessage(new HttpErrorResponse({ status: 403 }))).toContain('permiso');
    expect(errorMessage('x', 'fallback')).toBe('fallback');
  });
});

describe('fechas', () => {
  it('convierte entre Date local, ISO UTC y yyyy-mm-dd', () => {
    const iso = '2030-05-17T15:30:00.000Z';
    expect(toIso(fromIso(iso))).toBe(iso);
    expect(toIso(null)).toBeNull();
    expect(fromIso(null)).toBeNull();
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toIsoDate(null)).toBe('');
    expect(toIsoDate(new Date('x'))).toBe('');
    const d = daysAgo(1);
    expect(d.getHours()).toBe(0);
    expect(Math.round((daysAgo(0).getTime() - d.getTime()) / 86_400_000)).toBe(1);
  });
  it('formatea duraciones', () => {
    expect(formatDuration(null)).toBe('Sin datos');
    expect(formatDuration(0.5)).toBe('30 min');
    expect(formatDuration(20)).toBe('20.0 h');
    expect(formatDuration(72)).toBe('3.0 días');
  });
});
