import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { DynamicViewerComponent } from '../projects/dynamic-forms-engine/src/lib/dynamic-viewer.component';

(async () => {
  // 1. Iniciamos el entorno de Angular sin cargar una aplicación completa
  const app = await createApplication(appConfig);

  // 2. Convertimos el componente en un Elemento Personalizado
  const dynamicViewerElement = createCustomElement(DynamicViewerComponent, {
    injector: app.injector,
  });

  // 3. Lo registramos en el navegador con un nombre de etiqueta único
  // Esto permitirá usar <dynamic-viewer-element></dynamic-viewer-element> en cualquier sitio
  customElements.define('dynamic-viewer-element', dynamicViewerElement);
})();