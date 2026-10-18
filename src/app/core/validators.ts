import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Como `minLength`, pero sin contar los espacios de los extremos (el backend los recorta). */
export function minTrimmedLength(min: number): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = typeof c.value === 'string' ? c.value.trim() : '';
    return v.length < min ? { minlength: { requiredLength: min, actualLength: v.length } } : null;
  };
}

/** Obligatorio y con algo más que espacios. */
export const notBlank: ValidatorFn = minTrimmedLength(1);

/** Un id de la URL sólo es consultable si es un entero positivo que cabe en la base (int4). */
export function isValidId(id: string | undefined | null): boolean {
  return !!id && /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 2_147_483_647;
}

/** Mensaje para un id de ticket inventado o mal escrito en la URL (el mismo que da el backend). */
export const TICKET_NOT_FOUND = 'El ticket no existe.';
