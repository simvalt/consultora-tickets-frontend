import { Injectable, Provider } from '@angular/core';
import {
  DateAdapter,
  MAT_DATE_LOCALE,
  MAT_NATIVE_DATE_FORMATS,
  MatDateFormats,
  NativeDateAdapter,
  provideNativeDateAdapter,
} from '@angular/material/core';

/**
 * Adaptador de fechas nativo que entiende el formato español al escribir a mano (dd/mm/aaaa).
 * El de Angular delega en Date.parse, que interpreta «05/10/2026» como 10 de mayo.
 */
@Injectable()
export class EsDateAdapter extends NativeDateAdapter {
  override parse(value: unknown, parseFormat?: unknown): Date | null {
    if (typeof value === 'string') {
      const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(value);
      if (m) {
        const [day, month, year] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
        const date = new Date(year, month, day);
        // Rechaza fechas imposibles (31/02/2026) en vez de desbordarlas al mes siguiente.
        return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
          ? date
          : this.invalid();
      }
      if (value.trim() === '') return null;
    }
    return super.parse(value, parseFormat);
  }

  override getFirstDayOfWeek(): number {
    return 1; // lunes
  }
}

/** dd/mm/aaaa y hh:mm con ceros a la izquierda (el formato por defecto muestra «5/9/2026»). */
export const ES_DATE_FORMATS: MatDateFormats = {
  ...MAT_NATIVE_DATE_FORMATS,
  display: {
    ...MAT_NATIVE_DATE_FORMATS.display,
    dateInput: { year: 'numeric', month: '2-digit', day: '2-digit' },
    timeInput: { hour: '2-digit', minute: '2-digit', hour12: false },
    timeOptionLabel: { hour: '2-digit', minute: '2-digit', hour12: false },
  },
};

/** Adaptador y formatos de fecha en español. Las etiquetas del calendario están en shared/datepicker.ts. */
export function provideSpanishDates(): Provider[] {
  return [
    provideNativeDateAdapter(ES_DATE_FORMATS),
    { provide: MAT_DATE_LOCALE, useValue: 'es-MX' },
    { provide: DateAdapter, useClass: EsDateAdapter },
  ];
}
