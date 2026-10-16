import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule],
  template: `
    <div class="state" role="status">
      <mat-icon aria-hidden="true">{{ icon() }}</mat-icon>
      <p class="state-title">{{ title() }}</p>
      @if (hint()) {
        <p class="state-hint">{{ hint() }}</p>
      }
      <ng-content />
    </div>
  `,
})
export class EmptyState {
  readonly icon = input('inbox');
  readonly title = input('No hay resultados');
  readonly hint = input('');
}

@Component({
  selector: 'app-error-state',
  imports: [MatIconModule],
  template: `
    <div class="state error" role="alert">
      <mat-icon aria-hidden="true">error_outline</mat-icon>
      <p class="state-title">{{ message() }}</p>
      <ng-content />
    </div>
  `,
})
export class ErrorState {
  readonly message = input('No se pudo cargar la información.');
}

@Component({
  selector: 'app-loading-bar',
  imports: [MatProgressBarModule],
  template: `<div class="loading-slot">
    @if (active()) {
      <mat-progress-bar mode="indeterminate" aria-label="Cargando" />
    }
  </div>`,
})
export class LoadingBar {
  readonly active = input(false);
}
