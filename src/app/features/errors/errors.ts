import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../shared/states';

@Component({
  selector: 'app-forbidden',
  imports: [EmptyState, MatButtonModule, RouterLink],
  template: `
    <app-empty-state
      icon="lock"
      title="Acceso denegado"
      hint="No tienes permiso para ver esta sección. Si crees que es un error, contacta a un administrador."
    >
      <a mat-flat-button routerLink="/">Ir al inicio</a>
    </app-empty-state>
  `,
})
export class Forbidden {}

@Component({
  selector: 'app-not-found',
  imports: [EmptyState, MatButtonModule, RouterLink],
  template: `
    <app-empty-state
      icon="search_off"
      title="Página no encontrada"
      hint="La dirección no existe o el recurso fue eliminado."
    >
      <a mat-flat-button routerLink="/">Ir al inicio</a>
    </app-empty-state>
  `,
})
export class NotFound {}
