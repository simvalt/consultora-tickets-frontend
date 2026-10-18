import { Component, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { AuthService } from '../core/auth.service';
import { LEVEL_HINTS, LEVEL_LABELS, MODULES, ModuleKey } from '../core/models';
import { PermMap, parsePermissionsJson, permissionsToJson } from '../core/permissions-json';

/**
 * Editor de permisos con dos vistas sincronizadas: matriz (botones) y JSON.
 * - modo «role»: todos los módulos tienen nivel.
 * - modo «user»: cada módulo puede «Heredar» del rol (ausente) o sobrescribirlo (override).
 */
@Component({
  selector: 'app-permissions-editor',
  imports: [MatButtonToggleModule],
  template: `
    <div class="pe-head">
      <mat-button-toggle-group [value]="view()" (change)="view.set($event.value)" aria-label="Vista de permisos">
        <mat-button-toggle value="matrix">Matriz</mat-button-toggle>
        <mat-button-toggle value="json" data-testid="perm-json-tab">JSON</mat-button-toggle>
      </mat-button-toggle-group>
      <small class="muted">Niveles acumulativos. Sólo puedes otorgar niveles que tú mismo tienes.</small>
    </div>

    @if (view() === 'matrix') {
      <div role="group" aria-label="Matriz de permisos">
        @for (m of modules; track m.key) {
          <div class="pe-row">
            <div class="pe-module">
              <strong>{{ m.label }}</strong>
              <small class="muted">{{ hint(m.key) }}</small>
            </div>
            <mat-button-toggle-group
              [value]="value()[m.key] ?? null"
              (change)="setLevel(m.key, $event.value)"
              [attr.aria-label]="'Nivel de ' + m.label"
              [attr.data-testid]="'perm-' + m.key"
            >
              @if (mode() === 'user') {
                <mat-button-toggle [value]="null">Heredar</mat-button-toggle>
              }
              @for (l of levels; track l) {
                <mat-button-toggle [value]="l" [disabled]="l > maxLevel(m.key)">{{ labels[l] }}</mat-button-toggle>
              }
            </mat-button-toggle-group>
          </div>
        }
      </div>
    } @else {
      <textarea
        class="pe-json"
        rows="9"
        spellcheck="false"
        [value]="jsonText()"
        (input)="onJson($any($event.target).value)"
        aria-label="Permisos en formato JSON"
        data-testid="perm-json"
      ></textarea>
      @if (jsonError()) {
        <p class="banner error" role="alert" data-testid="perm-json-error">{{ jsonError() }}</p>
      } @else {
        <small class="muted"
          >Ejemplo: {{ example() }}. Niveles: nada, leer (ver), insertar (crear), editar, eliminar.
          @if (mode() === 'user') {
            Los módulos que no incluyas se heredan del rol.
          }
        </small>
      }
    }
  `,
  styles: `
    .pe-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .pe-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 0;
      border-top: 1px solid var(--border);
    }
    .pe-module {
      display: flex;
      flex-direction: column;
      min-width: 190px;
    }
    mat-button-toggle-group {
      flex-wrap: wrap;
    }
    .pe-json {
      width: 100%;
      font-family: ui-monospace, Consolas, monospace;
      font-size: 0.9rem;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      resize: vertical;
    }
  `,
})
export class PermissionsEditor {
  /** Valores actuales (en modo usuario sólo los overrides). */
  readonly value = model.required<PermMap>();
  readonly mode = input<'role' | 'user'>('role');
  /** Permisos del rol seleccionado (modo usuario) para mostrar qué se hereda. */
  readonly inherited = input<PermMap>({});

  private readonly auth = inject(AuthService);
  readonly modules = MODULES;
  readonly levels = [0, 1, 2, 3, 4];
  readonly labels = LEVEL_LABELS;
  readonly view = signal<'matrix' | 'json'>('matrix');
  readonly jsonText = signal('{}');
  readonly jsonError = signal<string | null>(null);
  /** JSON a medio escribir o con errores: el diálogo no debe guardar el último valor válido a escondidas. */
  readonly invalid = computed(() => this.view() === 'json' && this.jsonError() !== null);
  readonly example = computed(() => '{"tickets": "crear", "dashboard": "leer"}');

  constructor() {
    // Mantiene el JSON sincronizado con la matriz, sin reescribir el texto mientras se está editando
    // (si el texto actual ya representa el mismo valor, no se toca).
    effect(() => {
      const v = this.value();
      // untracked: si leyera jsonText como dependencia, cada tecla que deja el JSON incompleto
      // volvería a ejecutar este efecto y borraría lo que el usuario está escribiendo.
      const current = parsePermissionsJson(untracked(this.jsonText));
      if (current.ok && permissionsToJson(this.fill(current.value)) === permissionsToJson(v)) return;
      this.jsonText.set(permissionsToJson(v));
      this.jsonError.set(null);
    });
  }

  /** En modo rol los módulos omitidos equivalen a «Nada». */
  private fill(map: PermMap): PermMap {
    return this.mode() === 'role' ? { tickets: 0, users: 0, roles: 0, clients: 0, dashboard: 0, ...map } : map;
  }

  maxLevel(module: ModuleKey): number {
    return this.auth.user()?.permissions[module] ?? 0;
  }

  hint(module: ModuleKey): string {
    const own = this.value()[module];
    if (own !== undefined) return LEVEL_HINTS[own];
    return this.mode() === 'user' ? `Hereda del rol: ${LEVEL_HINTS[this.inherited()[module] ?? 0]}` : LEVEL_HINTS[0];
  }

  setLevel(module: ModuleKey, level: number | null): void {
    const next = { ...this.value() };
    if (level === null) delete next[module];
    else next[module] = level;
    this.value.set(next);
  }

  onJson(text: string): void {
    this.jsonText.set(text);
    const res = parsePermissionsJson(text);
    if (!res.ok) {
      this.jsonError.set(res.error);
      return;
    }
    const tooHigh = Object.entries(res.value).find(([m, l]) => (l as number) > this.maxLevel(m as ModuleKey));
    if (tooHigh) {
      this.jsonError.set(
        `No puedes otorgar «${levelLabel(tooHigh[1] as number)}» en ${tooHigh[0]}: supera tus permisos.`,
      );
      return;
    }
    this.jsonError.set(null);
    this.value.set(this.fill(res.value));
  }
}

const levelLabel = (l: number): string => LEVEL_LABELS[l];
