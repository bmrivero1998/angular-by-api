import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { ApplicationConfig } from '@angular/core';
import { appConfig } from './app/app.config';
import { UXDrivenViewerWidgetComponent } from './app/components/ux-driven-viewer/ux-driven-viewer.component';

// Función para inicializar como Web Component
(async () => {
  const app = await createApplication(appConfig);
  
  // Convertimos el componente Angular a un Web Component nativo (HTML Tag)
  const element = createCustomElement(UXDrivenViewerWidgetComponent, {
    injector: app.injector
  });

  // Definimos la etiqueta HTML personalizada
  customElements.define('ux-driven-viewer', element);
})();