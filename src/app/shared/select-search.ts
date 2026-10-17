import { Component, ElementRef, Pipe, PipeTransform, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatSelect } from '@angular/material/select';

/** Normaliza para comparar sin distinguir mayúsculas ni acentos («Logística» ≈ «logistica»). */
export const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/**
 * Campo de búsqueda dentro del panel de un `mat-select`:
 *
 * ```html
 * <mat-select formControlName="client_id">
 *   <app-select-search #s />
 *   @for (c of clients() | optionFilter: s.term() : form.value.client_id; track c.id) { … }
 *   @empty { <mat-option disabled>Sin coincidencias</mat-option> }
 * </mat-select>
 * ```
 * Recibe el foco al abrir el panel y se vacía al cerrarlo. Flechas, Re Pág/Av Pág, Enter y Escape navegan el
 * listado; el resto de teclas (incluido el espacio) escriben en el campo.
 */
@Component({
  selector: 'app-select-search',
  imports: [MatIconModule],
  template: `
    <div class="select-search">
      <mat-icon aria-hidden="true">search</mat-icon>
      <input
        #input
        type="text"
        [value]="term()"
        (input)="search(input.value)"
        (keydown)="onKeydown($event)"
        placeholder="Buscar…"
        aria-label="Buscar en las opciones"
        autocomplete="off"
        data-testid="select-search"
      />
      @if (term()) {
        <button type="button" class="clear" (click)="clear()" aria-label="Limpiar búsqueda">
          <mat-icon>close</mat-icon>
        </button>
      }
    </div>
  `,
  styles: `
    .select-search {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--mat-sys-surface-container, #fff);
      border-bottom: 1px solid var(--border);
    }
    input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      font: inherit;
      padding: 6px 0;
    }
    mat-icon {
      color: var(--muted);
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .clear {
      border: 0;
      background: transparent;
      cursor: pointer;
      padding: 0;
      display: grid;
    }
  `,
})
export class SelectSearch {
  readonly term = signal('');
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  private readonly select = inject(MatSelect);

  constructor() {
    this.select.openedChange.pipe(takeUntilDestroyed()).subscribe((open) => {
      if (open) setTimeout(() => this.input().nativeElement.focus());
      else this.term.set('');
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') return; // deja que el foco salga y el panel se cierre
    // Todas las teclas se quedan aquí: escribir (espacio, letras) no debe activar la búsqueda rápida de
    // mat-select y la navegación se delega explícitamente. Si se dejara burbujear el Enter, con el panel
    // dentro del propio mat-select (popover) la selección cerraría el panel y el mismo evento lo reabriría.
    event.stopPropagation();
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'PageDown', 'PageUp'].includes(event.key)) {
      this.select._handleKeydown(event);
    }
  }

  /** Filtra y resalta la primera opción que coincide: escribir + Enter selecciona la mejor coincidencia. */
  search(value: string): void {
    this.term.set(value);
    const needle = normalize(value);
    setTimeout(() => {
      // Tras renderizar el filtrado; se omiten las opciones fijas que no coinciden («Todos», «Sin responsable»).
      const match = this.select.options.find((o) => !o.disabled && normalize(o.viewValue).includes(needle));
      if (needle && match) this.select._keyManager.setActiveItem(match);
    });
  }

  clear(): void {
    this.term.set('');
    this.input().nativeElement.focus();
  }
}

/**
 * Filtra opciones por texto. Las opciones seleccionadas (`keep`) se conservan siempre: si desaparecieran,
 * mat-select dejaría de mostrar su etiqueta en el campo.
 */
@Pipe({ name: 'optionFilter' })
export class OptionFilterPipe implements PipeTransform {
  transform<T extends object>(
    items: readonly T[] | null | undefined,
    term: string,
    keep?: unknown,
    labelKey: keyof T = 'name' as keyof T,
    valueKey: keyof T = 'id' as keyof T,
  ): T[] {
    const list = [...(items ?? [])];
    const needle = normalize(term ?? '');
    if (!needle) return list;
    const kept = new Set(Array.isArray(keep) ? keep : [keep]);
    return list.filter((item) => kept.has(item[valueKey]) || normalize(String(item[labelKey])).includes(needle));
  }
}

export const SELECT_SEARCH = [SelectSearch, OptionFilterPipe] as const;
