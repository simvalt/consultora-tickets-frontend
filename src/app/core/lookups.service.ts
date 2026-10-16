import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Api } from './api';
import { LookupItem, Meta } from './models';

/** Listas ligeras para filtros y formularios. */
@Injectable({ providedIn: 'root' })
export class Lookups {
  private readonly api = inject(Api);

  clients(): Observable<LookupItem[]> {
    return this.api.get<LookupItem[]>('/lookups/clients');
  }
  roles(): Observable<LookupItem[]> {
    return this.api.get<LookupItem[]>('/lookups/roles');
  }
  assignees(): Observable<LookupItem[]> {
    return this.api.get<LookupItem[]>('/lookups/assignees');
  }
  meta(): Observable<Meta> {
    return this.api.get<Meta>('/meta');
  }
}
