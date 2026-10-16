import { signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { errorMessage, Params } from './api';
import { Page } from './models';

/**
 * Estado reutilizable de un listado paginado/ordenable/filtrado en servidor.
 * `params()` devuelve exactamente lo que se envía al listado; la exportación CSV usa los mismos
 * filtros y orden (sin paginación) para que ambos coincidan.
 */
export class PagedList<T> {
  readonly items = signal<T[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly sort = signal<string>('');
  readonly order = signal<'asc' | 'desc'>('asc');
  /** Verdadero cuando ya se cargó al menos una vez (para distinguir «cargando» de «sin resultados»). */
  readonly loaded = signal(false);
  filters: Params = {};
  private sub?: Subscription;

  constructor(
    private readonly fetcher: (params: Params) => Observable<Page<T>>,
    private readonly defaultSort: string,
    private readonly defaultOrder: 'asc' | 'desc' = 'asc',
  ) {
    this.sort.set(defaultSort);
    this.order.set(defaultOrder);
  }

  /** Filtros + orden, sin paginación (se reutiliza en la exportación CSV). */
  queryParams(): Params {
    return { ...this.filters, sort: this.sort(), order: this.order() };
  }

  setFilters(filters: Params): void {
    this.filters = filters;
    this.page.set(1);
    this.load();
  }

  setSort(sort: string, order: 'asc' | 'desc' | ''): void {
    // Sin dirección (tercer clic en la cabecera) se vuelve al orden por defecto del listado.
    this.sort.set(order ? sort : this.defaultSort);
    this.order.set(order || this.defaultOrder);
    this.page.set(1);
    this.load();
  }

  setPage(pageIndex: number, pageSize: number): void {
    this.page.set(pageIndex + 1);
    this.pageSize.set(pageSize);
    this.load();
  }

  load(): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.sub = this.fetcher({ ...this.queryParams(), page: this.page(), page_size: this.pageSize() }).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: (err) => {
        this.error.set(errorMessage(err, 'No se pudo cargar el listado.'));
        this.loading.set(false);
        this.loaded.set(true);
      },
    });
  }

  destroy(): void {
    this.sub?.unsubscribe();
  }
}
