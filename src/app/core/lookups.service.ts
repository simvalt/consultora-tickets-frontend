import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Api } from './api';
import { LookupItem, Meta, Permissions } from './models';

export interface RoleLookup extends LookupItem {
  permissions: Permissions;
}

/** Listas ligeras para filtros y formularios. */
@Injectable({ providedIn: 'root' })
export class Lookups {
  private readonly api = inject(Api);

  clients(): Observable<LookupItem[]> {
    return this.api.get<LookupItem[]>('/lookups/clients');
  }
  roles(): Observable<RoleLookup[]> {
    return this.api.get<RoleLookup[]>('/lookups/roles');
  }
  assignees(): Observable<LookupItem[]> {
    return this.api.get<LookupItem[]>('/lookups/assignees');
  }
  meta(): Observable<Meta> {
    return this.api.get<Meta>('/meta');
  }
}
