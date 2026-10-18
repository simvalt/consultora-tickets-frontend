import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'theme';

/**
 * Tema claro/oscuro. Por defecto sigue al sistema; el usuario puede fijarlo desde su menú.
 * Funciona fijando `color-scheme` en <html>: todos los tokens usan light-dark(), incluidos los de Material.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly media = this.doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media?.matches ?? false);

  readonly preference = signal<ThemePreference>(this.load());
  /** Tema efectivo (para lo que no entiende light-dark(), como las gráficas en canvas). */
  readonly isDark = computed(() => (this.preference() === 'system' ? this.systemDark() : this.preference() === 'dark'));

  constructor() {
    this.media?.addEventListener?.('change', (e) => this.systemDark.set(e.matches));
    effect(() => {
      const pref = this.preference();
      this.doc.documentElement.style.colorScheme = pref === 'system' ? 'light dark' : pref;
      try {
        localStorage.setItem(KEY, pref);
      } catch {
        /* sin almacenamiento: la elección dura sólo esta visita */
      }
    });
  }

  set(pref: ThemePreference): void {
    this.preference.set(pref);
  }

  private load(): ThemePreference {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  }
}
