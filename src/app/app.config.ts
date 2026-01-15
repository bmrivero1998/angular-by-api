import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';

import { routes } from './app.routes';
import { MockErrorHandlerInterceptor } from '../../projects/dynamic-forms-engine/src/lib/interceptors/mock-error-handler.interceptor';
import { DYNAMIC_CONFIG } from '../../projects/dynamic-forms-engine/src/lib/dynamic-config.token';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: DYNAMIC_CONFIG,
      useValue: {
        errorClassName: 'is-invalid',
        successClassName: 'is-valid'
      }
    }
  ],
};