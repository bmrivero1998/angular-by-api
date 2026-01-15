import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { provideHttpClient } from '@angular/common/http';
import { UXDrivenViewerWidgetComponent } from './app/components/ux-driven-viewer/ux-driven-viewer.component';


(async () => {
  
  // 1. Creamos la aplicación fusionando tu config existente con el HttpClient
  const app = await createApplication({
    providers: [
      ...appConfig.providers, // Traemos los providers que ya tenías en app.config
      provideHttpClient()     // Agregamos el cliente HTTP aquí
    ]
  });

  // 2. Convertimos el componente
  const dynamicElement = createCustomElement(UXDrivenViewerWidgetComponent, {
    injector: app.injector,
  });

  // 3. Registramos la etiqueta (Corregí el typo 'viwer' -> 'viewer')
  customElements.define('ux-driven-viewer', dynamicElement);

})();