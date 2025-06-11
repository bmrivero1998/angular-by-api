import { Injectable } from '@angular/core';
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

/**
 * Interceptor de HTTP que sanitiza automáticamente los campos de HTML y CSS
 * provenientes de las respuestas de la API para prevenir ataques de XSS y de
 * inyección de CSS.
 */
@Injectable()
export class HtmlSanitizerInterceptor implements HttpInterceptor {

  private readonly htmlFields = new Set(['htmlComponent', 'plantillaHTML', 'html']);
  private readonly cssFields = new Set(['cssComponent', 'css']);

  constructor() {}

  /**
   * Intercepta las respuestas HTTP, clona el cuerpo de la respuesta y llama
   * al método de sanitización antes de pasar la respuesta al resto de la aplicación.
   * @param request La petición HTTP saliente.
   * @param next El siguiente manejador en la cadena de interceptores.
   * @returns Un Observable del evento HTTP, con el cuerpo de la respuesta sanitizado.
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
   * Recorre recursivamente un objeto o array y sanitiza las propiedades
   * que coinciden con las listas `htmlFields` y `cssFields`.
   * @param data El objeto o array a procesar.
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
            const sanitizedHtml = DOMPurify.default.sanitize(rawHtml);
            data[key] = JSON.stringify(sanitizedHtml);
          } catch (e) {
            console.error(`Error al procesar el campo HTML '${key}'.`, e);
          }
        
        } else if (this.cssFields.has(key) && typeof value === 'string') {
          // TODO: Sanitizar CSS si es necesario
          
        } else {
          this.sanitizeObjectProperties(value);
        }
      }
    }
  }
}