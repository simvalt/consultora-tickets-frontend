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

/** Esqueleto con la forma de una tabla mientras llega la primera página (sin spinners). */
@Component({
  selector: 'app-table-skeleton',
  template: `
    <div class="table-wrap sk" role="status" aria-label="Cargando">
      <div class="sk-head"><span class="skeleton" style="width: 40%"></span></div>
      @for (r of rows; track r) {
        <div class="sk-row">
          <span class="skeleton" style="width: 12%"></span>
          <span class="skeleton" [style.width.%]="30 + ((r * 7) % 20)"></span>
          <span class="skeleton" style="width: 14%"></span>
          <span class="skeleton" style="width: 10%"></span>
        </div>
      }
    </div>
  `,
  styles: `
    .sk-head,
    .sk-row {
      display: flex;
      gap: 24px;
      align-items: center;
      padding: 0 16px;
    }
    .sk-head {
      height: 44px;
      background: var(--surface-2);
      border-bottom: 1px solid var(--border);
    }
    .sk-row {
      height: 52px;
      border-bottom: 1px solid var(--border);
    }
    .sk-row:last-child {
      border-bottom: 0;
    }
    .skeleton {
      height: 12px;
    }
  `,
})
export class TableSkeleton {
  readonly rows = [1, 2, 3, 4, 5, 6, 7, 8];
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
