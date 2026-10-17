import { Injectable, Provider } from '@angular/core';
import {
  MatDatepicker,
  MatDatepickerIntl,
  MatDatepickerInput,
  MatDatepickerToggle,
  MatDateRangeInput,
  MatDateRangePicker,
  MatEndDate,
  MatStartDate,
} from '@angular/material/datepicker';

@Injectable()
export class EsDatepickerIntl extends MatDatepickerIntl {
  override calendarLabel = 'Calendario';
  override openCalendarLabel = 'Abrir calendario';
  override closeCalendarLabel = 'Cerrar calendario';
  override prevMonthLabel = 'Mes anterior';
  override nextMonthLabel = 'Mes siguiente';
  override prevYearLabel = 'Año anterior';
  override nextYearLabel = 'Año siguiente';
  override prevMultiYearLabel = '24 años anteriores';
  override nextMultiYearLabel = '24 años siguientes';
  override switchToMonthViewLabel = 'Elegir fecha';
  override switchToMultiYearViewLabel = 'Elegir mes y año';
  override startDateLabel = 'Fecha inicial';
  override endDateLabel = 'Fecha final';
}

/**
 * Se registra en los componentes que usan calendario (no en la configuración global) para que el código del
 * datepicker no entre en el bundle inicial.
 */
export const DATEPICKER_PROVIDERS: Provider[] = [{ provide: MatDatepickerIntl, useClass: EsDatepickerIntl }];

/**
 * Directivas del datepicker importadas una a una. NO usar MatDatepickerModule: declara su propio
 * MatDatepickerIntl y taparía la traducción al español de DATEPICKER_PROVIDERS.
 */
export const DATEPICKER = [
  MatDatepicker,
  MatDatepickerInput,
  MatDatepickerToggle,
  MatDateRangeInput,
  MatDateRangePicker,
  MatStartDate,
  MatEndDate,
] as const;
