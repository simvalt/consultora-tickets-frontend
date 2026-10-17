import { TestBed } from '@angular/core/testing';
import { DateAdapter } from '@angular/material/core';
import { provideSpanishDates } from '../core/date-adapter';
import { combineDateTime } from '../core/datetime';
import { TableColumns } from './column-picker';
import { OptionFilterPipe, normalize } from './select-search';

const DEFS = [
  { key: 'a', label: 'A' },
  { key: 'b', label: 'B' },
  { key: 'c', label: 'C', visible: false },
];

describe('TableColumns', () => {
  beforeEach(() => localStorage.clear());

  it('respeta las columnas ocultas por defecto y el orden', () => {
    const cols = new TableColumns('t1', DEFS);
    expect(cols.visible()).toEqual(['a', 'b']);
    cols.toggle('c');
    cols.move(2, 0);
    expect(cols.visible()).toEqual(['c', 'a', 'b']);
  });

  it('nunca deja la tabla sin columnas', () => {
    const cols = new TableColumns('t2', DEFS);
    cols.toggle('a');
    cols.toggle('b'); // sería la última visible: se ignora
    expect(cols.visible()).toEqual(['b']);
  });

  it('recuerda la preferencia, ignora claves obsoletas y añade columnas nuevas', () => {
    localStorage.setItem('t3', JSON.stringify({ order: ['b', 'vieja', 'a'], hidden: ['a', 'vieja'] }));
    const cols = new TableColumns('t3', DEFS);
    expect(cols.order()).toEqual(['b', 'a', 'c']);
    expect(cols.visible()).toEqual(['b', 'c']); // «c» es nueva para esta preferencia: visible
    cols.toggle('a');
    expect(JSON.parse(localStorage.getItem('t3')!).hidden).toEqual([]);
  });

  it('«Restablecer» vuelve al estado por defecto y tolera almacenamiento corrupto', () => {
    localStorage.setItem('t4', '{no es json');
    const cols = new TableColumns('t4', DEFS);
    expect(cols.visible()).toEqual(['a', 'b']);
    cols.move(0, 1);
    cols.reset();
    expect(cols.order()).toEqual(['a', 'b', 'c']);
  });
});

describe('OptionFilterPipe', () => {
  const pipe = new OptionFilterPipe();
  const items = [
    { id: 1, name: 'Logística Rápida' },
    { id: 2, name: 'Acme Industrial' },
    { id: 3, name: 'Clínica San Rafael' },
  ];

  it('filtra sin distinguir mayúsculas ni acentos', () => {
    expect(pipe.transform(items, 'LOGISTICA').map((i) => i.id)).toEqual([1]);
    expect(pipe.transform(items, 'clin').map((i) => i.id)).toEqual([3]);
    expect(pipe.transform(items, '').length).toBe(3);
    expect(pipe.transform(items, '   ').length).toBe(3);
    expect(pipe.transform(null, 'x')).toEqual([]);
  });

  it('conserva siempre las opciones seleccionadas (simple y múltiple)', () => {
    expect(pipe.transform(items, 'acme', 3).map((i) => i.id)).toEqual([2, 3]);
    expect(pipe.transform(items, 'zzz', [1, 3]).map((i) => i.id)).toEqual([1, 3]);
  });

  it('normalize', () => {
    expect(normalize('  Ñandú Árbol ')).toBe('nandu arbol');
  });
});

describe('EsDateAdapter', () => {
  let adapter: DateAdapter<Date>;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideSpanishDates()] });
    adapter = TestBed.inject(DateAdapter);
  });

  it('interpreta dd/mm/aaaa (no mm/dd)', () => {
    const d = adapter.parse('05/10/2026', null)!;
    expect([d.getDate(), d.getMonth(), d.getFullYear()]).toEqual([5, 9, 2026]);
    const e = adapter.parse('1-2-2027', null)!;
    expect([e.getDate(), e.getMonth()]).toEqual([1, 1]);
  });

  it('rechaza fechas imposibles y acepta vacío', () => {
    expect(adapter.isValid(adapter.parse('31/02/2026', null)!)).toBe(false);
    expect(adapter.parse('', null)).toBeNull();
  });

  it('muestra dd/mm/aaaa con ceros y la semana empieza en lunes', () => {
    expect(adapter.format(new Date(2026, 8, 5), { year: 'numeric', month: '2-digit', day: '2-digit' })).toBe(
      '05/09/2026',
    );
    expect(adapter.getFirstDayOfWeek()).toBe(1);
  });
});

describe('combineDateTime', () => {
  it('une fecha y hora de controles distintos', () => {
    const r = combineDateTime(new Date(2030, 11, 15), new Date(2000, 0, 1, 14, 30))!;
    expect([r.getFullYear(), r.getMonth(), r.getDate(), r.getHours(), r.getMinutes()]).toEqual([2030, 11, 15, 14, 30]);
  });

  it('sin hora vence al final del día; sin fecha no hay vencimiento', () => {
    const r = combineDateTime(new Date(2030, 0, 1), null)!;
    expect([r.getHours(), r.getMinutes()]).toEqual([23, 59]);
    expect(combineDateTime(null, new Date())).toBeNull();
  });
});
