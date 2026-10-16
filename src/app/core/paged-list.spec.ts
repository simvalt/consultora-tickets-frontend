import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { Page } from './models';
import { PagedList } from './paged-list';

const page = (items: number[], total = items.length): Page<number> => ({
  items,
  total,
  page: 1,
  page_size: 20,
  pages: 1,
});

describe('PagedList', () => {
  it('envía filtros, orden y paginación; la exportación reutiliza filtros y orden sin paginar', () => {
    const calls: Record<string, unknown>[] = [];
    const list = new PagedList<number>(
      (p) => {
        calls.push(p);
        return of(page([1, 2], 45));
      },
      'created_at',
      'desc',
    );
    list.setFilters({ q: 'abc', status: ['cerrado'] });
    list.setSort('title', 'asc');
    list.setPage(2, 50);
    expect(calls.at(-1)).toEqual({
      q: 'abc',
      status: ['cerrado'],
      sort: 'title',
      order: 'asc',
      page: 3,
      page_size: 50,
    });
    expect(list.queryParams()).toEqual({ q: 'abc', status: ['cerrado'], sort: 'title', order: 'asc' });
    expect(list.total()).toBe(45);
    expect(list.items()).toEqual([1, 2]);
  });

  it('cambiar filtros u orden regresa a la primera página', () => {
    const list = new PagedList<number>(() => of(page([])), 'a');
    list.setPage(4, 20);
    list.setFilters({ q: 'x' });
    expect(list.page()).toBe(1);
    list.setPage(3, 20);
    list.setSort('b', 'desc');
    expect(list.page()).toBe(1);
  });

  it('distingue cargando, vacío y error', () => {
    const list = new PagedList<number>(() => of(page([])), 'a');
    expect(list.loaded()).toBe(false);
    list.load();
    expect(list.loaded()).toBe(true);
    expect(list.total()).toBe(0);
    const failing = new PagedList<number>(() => throwError(() => new HttpErrorResponse({ status: 500 })), 'a');
    failing.load();
    expect(failing.error()).toBeTruthy();
    expect(failing.loading()).toBe(false);
  });
});
