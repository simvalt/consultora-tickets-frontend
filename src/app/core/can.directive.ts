import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from './auth.service';
import { ModuleKey } from './models';

/** `*appCan="['tickets', 3]"` — renderiza el contenido sólo si el usuario tiene ese nivel (o más). */
@Directive({ selector: '[appCan]' })
export class CanDirective {
  private readonly auth = inject(AuthService);
  private readonly tpl = inject(TemplateRef<unknown>);
  private readonly vcr = inject(ViewContainerRef);
  readonly appCan = input.required<[ModuleKey, number]>();
  private shown = false;

  constructor() {
    effect(() => {
      const [module, level] = this.appCan();
      const allowed = this.auth.can(module, level);
      if (allowed && !this.shown) {
        this.vcr.createEmbeddedView(this.tpl);
        this.shown = true;
      } else if (!allowed && this.shown) {
        this.vcr.clear();
        this.shown = false;
      }
    });
  }
}
