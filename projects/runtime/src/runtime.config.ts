import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { DYNAMIC_CONFIG } from '@ux-driven-viewer/engine';

/**
 * Providers con los que arranca el runtime del custom element
 * `<ux-driven-viewer>`. Es el único lugar donde se configura el motor
 * (clases de validación, HTTP, interceptores).
 */
export const runtimeConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: DYNAMIC_CONFIG,
      useValue: {
        errorClassName: 'is-invalid',
        successClassName: 'is-valid',
      },
    },
  ],
};
