import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {
  // Aplica el tema guardado (o el del sistema) desde la primera pantalla, incluido el login.
  protected readonly theme = inject(ThemeService);
}
