import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface ColumnDef {
  key: string;
  label: string;
  /** Visible al empezar (por defecto sí). */
  visible?: boolean;
}

interface Saved {
  order: string[];
  hidden: string[];
}

/**
 * Columnas visibles y su orden para una tabla. Se recuerda por navegador (localStorage, si está disponible).
 * `visible()` se usa tanto para pintar la tabla como para pedir el CSV: la exportación sale con las mismas
 * columnas y en el mismo orden que ve el usuario.
 */
export class TableColumns {
  private readonly defaults: Saved;
  readonly order = signal<string[]>([]);
  readonly hidden = signal<ReadonlySet<string>>(new Set());
  readonly visible = computed(() => this.order().filter((k) => !this.hidden().has(k)));

  constructor(
    private readonly storageKey: string,
    readonly defs: readonly ColumnDef[],
  ) {
    this.defaults = {
      order: defs.map((d) => d.key),
      hidden: defs.filter((d) => d.visible === false).map((d) => d.key),
    };
    this.apply(this.load() ?? this.defaults);
  }

  label(key: string): string {
    return this.defs.find((d) => d.key === key)?.label ?? key;
  }

  isVisible(key: string): boolean {
    return !this.hidden().has(key);
  }

  toggle(key: string): void {
    const hidden = new Set(this.hidden());
    if (hidden.has(key)) hidden.delete(key);
    else if (this.visible().length > 1) hidden.add(key); // siempre queda al menos una columna
    this.hidden.set(hidden);
    this.save();
  }

  move(from: number, to: number): void {
    const order = [...this.order()];
    moveItemInArray(order, from, to);
    this.order.set(order);
    this.save();
  }

  reset(): void {
    this.apply(this.defaults);
    this.save();
  }

  private apply(saved: Saved): void {
    const known = new Set(this.defs.map((d) => d.key));
    // Conserva el orden guardado, descarta claves que ya no existen y añade al final las columnas nuevas.
    const order = saved.order.filter((k) => known.has(k));
    for (const d of this.defs) if (!order.includes(d.key)) order.push(d.key);
    let hidden = new Set(saved.hidden.filter((k) => known.has(k)));
    if (order.every((k) => hidden.has(k))) hidden = new Set(this.defaults.hidden);
    this.order.set(order);
    this.hidden.set(hidden);
  }

  private load(): Saved | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const parsed = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
      return parsed && Array.isArray(parsed.order) && Array.isArray(parsed.hidden) ? (parsed as Saved) : null;
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({ order: this.order(), hidden: [...this.hidden()] }));
    } catch {
      /* almacenamiento no disponible: la preferencia dura sólo esta visita */
    }
  }
}

/** Botón «Columnas»: mostrar/ocultar y reordenar (arrastrando) las columnas de una tabla. */
@Component({
  selector: 'app-column-picker',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCheckboxModule,
    MatTooltipModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
  ],
  template: `
    <button
      mat-stroked-button
      [matMenuTriggerFor]="menu"
      matTooltip="Elige qué columnas ver y su orden; el CSV se exporta igual"
      data-testid="columns"
    >
      <mat-icon>view_column</mat-icon> Columnas
    </button>
    <mat-menu #menu="matMenu" class="column-menu" xPosition="before">
      <div class="cp" (click)="$event.stopPropagation()" (keydown)="onKeydown($event)" role="presentation">
        <p class="cp-title">Columnas <small>(arrastra para ordenar)</small></p>
        <div cdkDropList (cdkDropListDropped)="drop($event)" class="cp-list">
          @for (key of columns().order(); track key; let i = $index) {
            <div class="cp-item" cdkDrag cdkDragLockAxis="y" [attr.data-testid]="'col-' + key">
              <mat-icon class="handle" cdkDragHandle aria-label="Arrastrar para reordenar">drag_indicator</mat-icon>
              <mat-checkbox
                [checked]="columns().isVisible(key)"
                [disabled]="columns().isVisible(key) && columns().visible().length === 1"
                (change)="columns().toggle(key)"
                >{{ columns().label(key) }}</mat-checkbox
              >
              <span class="arrows">
                <button
                  type="button"
                  mat-icon-button
                  [disabled]="i === 0"
                  (click)="columns().move(i, i - 1)"
                  [attr.aria-label]="'Subir ' + columns().label(key)"
                >
                  <mat-icon>arrow_upward</mat-icon>
                </button>
                <button
                  type="button"
                  mat-icon-button
                  [disabled]="i === last()"
                  (click)="columns().move(i, i + 1)"
                  [attr.aria-label]="'Bajar ' + columns().label(key)"
                >
                  <mat-icon>arrow_downward</mat-icon>
                </button>
              </span>
            </div>
          }
        </div>
        <button mat-button type="button" (click)="columns().reset()" data-testid="columns-reset">
          <mat-icon>restart_alt</mat-icon> Restablecer
        </button>
      </div>
    </mat-menu>
  `,
  styles: `
    .cp {
      padding: 4px 8px 8px;
      min-width: 280px;
    }
    .cp-title {
      margin: 4px 8px 8px;
      font-weight: 600;
    }
    .cp-title small {
      font-weight: 400;
      color: var(--muted);
    }
    .cp-item {
      display: flex;
      align-items: center;
      gap: 4px;
      background: var(--mat-sys-surface-container, #fff);
      border-radius: 6px;
    }
    .cp-item mat-checkbox {
      flex: 1;
    }
    .handle {
      cursor: grab;
      color: var(--muted);
    }
    .arrows {
      display: flex;
      --mat-icon-button-state-layer-size: 32px;
    }
    .arrows button {
      width: 32px;
      height: 32px;
      padding: 4px;
    }
    .arrows mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .cdk-drag-preview {
      box-shadow: 0 4px 12px rgb(0 0 0 / 20%);
    }
    .cdk-drag-placeholder {
      opacity: 0.3;
    }
  `,
})
export class ColumnPicker {
  readonly columns = input.required<TableColumns>();
  readonly last = computed(() => this.columns().order().length - 1);

  /** Escape y Tab siguen cerrando el menú; el resto de teclas no activan la navegación propia de mat-menu. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
  }

  drop(event: CdkDragDrop<unknown>): void {
    this.columns().move(event.previousIndex, event.currentIndex);
  }
}
