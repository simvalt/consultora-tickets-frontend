import { HttpErrorResponse } from '@angular/common/http';
import { errorCode, errorMessage, toHttpParams } from './api';
import { formatDuration, isoToLocalInput, localInputToIso } from './datetime';

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
  it('convierte de ida y vuelta entre ISO UTC y datetime-local', () => {
    const iso = '2030-05-17T15:30:00.000Z';
    expect(localInputToIso(isoToLocalInput(iso))).toBe(iso);
    expect(localInputToIso('')).toBeNull();
    expect(isoToLocalInput(null)).toBe('');
  });
  it('formatea duraciones', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0.5)).toBe('30 min');
    expect(formatDuration(20)).toBe('20.0 h');
    expect(formatDuration(72)).toBe('3.0 días');
  });
});
