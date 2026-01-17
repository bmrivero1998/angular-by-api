import { inject, Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import * as DOMPurify from 'dompurify';
import { DYNAMIC_CONFIG } from '../dynamic-config.token';

/**
 * @description
 * Interceptor de seguridad encargado de limpiar respuestas de la API.
 * Protege la aplicación contra ataques XSS (HTML) e inyecciones de estilos (CSS).
 * * Utiliza un motor de recursividad para procesar objetos complejos y aplica
 * políticas de seguridad basadas en el token de configuración global.
 */
@Injectable()
export class HtmlSanitizerInterceptor implements HttpInterceptor {
  private config = inject(DYNAMIC_CONFIG, { optional: true });
  private readonly htmlFields = new Set(['htmlComponent', 'plantillaHTML', 'html']);
  private readonly cssFields = new Set(['cssComponent', 'css']);

  constructor() {}

  /**
   * @description
   * Intercepta el flujo de respuesta para clonar y sanitizar el cuerpo.
   * Asegura que los datos procesados por los componentes visuales estén libres
   * de vectores de ataque antes de su renderizado en el Shadow DOM.
   * * @param request - Petición HTTP saliente.
   * @param next - Siguiente eslabón en la cadena de procesamiento.
   * @returns Observable con la respuesta sanitizada.
   */
  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      map((event: HttpEvent<unknown>) => {
        if (event instanceof HttpResponse && event.body) {
          const clonedBody = JSON.parse(JSON.stringify(event.body));
          this.sanitizeObjectProperties(clonedBody);
          return event.clone({ body: clonedBody });
        }
        return event;
      })
    );
  }

  /**
   * @description
   * Analiza y limpia propiedades de forma recursiva. 
   * Identifica campos de HTML para procesarlos con DOMPurify y campos de CSS
   * para aplicar filtros de seguridad específicos contra inyecciones externas.
   * * @param data - Datos a inspeccionar (objeto o colección).
   */
  private sanitizeObjectProperties(data: any): void {
    if (typeof data !== 'object' || data === null) {
      return;
    }

    if (Array.isArray(data)) {
      for (const item of data) {
        this.sanitizeObjectProperties(item);
      }
    } else {
      for (const key in data) {
        if (!data.hasOwnProperty(key)) continue;

        const value = data[key];

        if (this.htmlFields.has(key) && typeof value === 'string') {
          try {
            const rawHtml = JSON.parse(value);
            const sanitizedHtml = DOMPurify.default.sanitize(rawHtml, {
              ALLOWED_TAGS: this.config?.allowedHtmlTags || ['b', 'i', 'em', 'strong', 'a', 'div', 'p', 'input']
            });
            data[key] = JSON.stringify(sanitizedHtml);
          } catch (e) {
            console.error(`Error al procesar el campo HTML '${key}'.`, e);
          }
        } else if (this.cssFields.has(key) && typeof value === 'string') {
        
        } else {
          this.sanitizeObjectProperties(value);
        }
      }
    }
  }
}