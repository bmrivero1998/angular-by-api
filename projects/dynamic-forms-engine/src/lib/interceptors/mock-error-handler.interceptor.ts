import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse,
  HttpResponse,
} from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DynamicApiResponse } from '../interfaces/DynamicContent.interface';

@Injectable()
export class MockErrorHandlerInterceptor implements HttpInterceptor {
  constructor() {}

  // --- Mocks JSON (los que te di antes) ---
  private readonly notFoundMockResponse: DynamicApiResponse = {
    ok: true, // true porque el mock se "entrega" correctamente
    doc: [
      {
        renderType: 'dynamic',
        id_DocumentHTMLCSS: '404-page',
        htmlComponent: `
          <div class="container d-flex flex-column align-items-center justify-content-center min-vh-100">
            <div class="error-page-card">
              <i class="bi bi-exclamation-triangle-fill text-warning"></i>
              <h1 class="display-1 fw-bold">404</h1>
              <h2 class="display-5 mb-4">¡Página No Encontrada!</h2>
              <p class="lead mb-4">Lo sentimos, la página que estás buscando no existe o se ha movido.</p>
              <a href="/" class="btn btn-primary btn-lg"><i class="bi bi-house-door-fill me-2"></i>Ir a la página de Inicio</a>
            </div>
          </div>`,
        cssComponent: `/* ... CSS para 404 ... */
body { background-color: #f8f9fa; }
.error-page-card { max-width: 600px; margin: 2rem auto; text-align: center; background-color: #ffffff; border-radius: 0.75rem; box-shadow: 0 0.75rem 1.5rem rgba(0, 0, 0, 0.1); padding: 3rem; }
.error-page-card .bi { font-size: 8rem; margin-bottom: 1.5rem; }
.error-page-card h1, .error-page-card h2 { color: #dc3545; }
.error-page-card p.lead { color: #6c757d; font-size: 1.25rem; }
.min-vh-100 { min-height: 100vh; }
.d-flex.flex-column.align-items-center.justify-content-center { display: flex; flex-direction: column; align-items: center; justify-content: center; }
`,
        formId: 'null',
        formMappings: [],
        buttonConfigs: [],
      },
    ],
  };

  private readonly maintenanceMockResponse: DynamicApiResponse = {
    ok: true, // true porque el mock se "entrega" correctamente
    doc: [
      {
        renderType: 'dynamic',
        id_DocumentHTMLCSS: 'maintenance-page',
        htmlComponent: `
          <div class="container d-flex flex-column align-items-center justify-content-center min-vh-100">
            <div class="maintenance-page-card">
              <i class="bi bi-tools text-info"></i>
              <h1 class="display-3 fw-bold">¡Estamos en Mantenimiento!</h1>
              <h2 class="display-6 mb-4">Mejorando tu experiencia.</h2>
              <p class="lead mb-4">Disculpa las molestias. Estamos realizando actualizaciones importantes y volveremos en breve.</p>
              <button type="button" onclick="location.reload();" class="btn btn-success btn-lg"><i class="bi bi-arrow-clockwise me-2"></i>Recargar Página</button>
            </div>
          </div>`,
        cssComponent: `/* ... CSS para Mantenimiento ... */
body { background-color: #f8f9fa; }
.maintenance-page-card { max-width: 600px; margin: 2rem auto; text-align: center; background-color: #ffffff; border-radius: 0.75rem; box-shadow: 0 0.75rem 1.5rem rgba(0, 0, 0, 0.1); padding: 3rem; }
.maintenance-page-card .bi { font-size: 8rem; margin-bottom: 1.5rem; }
.maintenance-page-card h1, .maintenance-page-card h2 { color: #0d6efd; }
.maintenance-page-card p.lead { color: #6c757d; font-size: 1.25rem; }
.min-vh-100 { min-height: 100vh; }
.d-flex.flex-column.align-items-center.justify-content-center { display: flex; flex-direction: column; align-items: center; justify-content: center; }
`,
        formId: '',
        formMappings: [],
        buttonConfigs: [],
      },
    ],
  };

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<DynamicApiResponse>> {
    // El tipo de retorno es correcto
    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 404) {
          console.warn(
            'Interceptor: Se detectó un error 404. Devolviendo mock de Página No Encontrada.'
          );
          return of(
            new HttpResponse<DynamicApiResponse>({
              body: this.notFoundMockResponse,
              status: 200,
              statusText: 'OK',
              url: request.url,
              headers: request.headers,
            })
          );
        } else if (
          error.status >= 500 ||
          error.status === 0 ||
          error.status === 400 ||
          error.status === 403
        ) {
          console.error(
            'Interceptor: Se detectó un error de servidor/red. Devolviendo mock de Mantenimiento.',
            error
          );
          return of(
            new HttpResponse<DynamicApiResponse>({
              body: this.maintenanceMockResponse,
              status: 200,
              statusText: 'OK',
              url: request.url,
              headers: request.headers,
            })
          );
        }

        return throwError(() => error);
      })
    );
  }
}
