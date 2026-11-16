import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { runtimeConfig } from './runtime.config';
import { UXDrivenViewerWidgetComponent } from './lib/widget/ux-driven-viewer.component';

/**
 * Punto de entrada del runtime: crea la aplicación Angular (sin componente
 * raíz) y registra `<ux-driven-viewer>` como custom element.
 */
(async () => {
  const app = await createApplication({
    providers: [...runtimeConfig.providers, provideHttpClient()],
  });

  const dynamicElement = createCustomElement(UXDrivenViewerWidgetComponent, {
    injector: app.injector,
  });

  customElements.define('ux-driven-viewer', dynamicElement);
})();
