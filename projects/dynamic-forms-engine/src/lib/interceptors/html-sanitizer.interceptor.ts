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
import DOMPurify from 'dompurify';
import { DYNAMIC_CONFIG } from '../dynamic-config.token';

const DEFAULT_ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'a', 'div', 'p', 'input'];
const STRICT_ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'p'];

// Patrones de CSS conocidos como vectores de ataque (inyección de JS vía
// expression()/behavior, o carga de recursos externos vía @import/url()).
const CSS_DANGEROUS_PATTERNS = [
  /expression\s*\(/gi,
  /@import/gi,
  /javascript\s*:/gi,
  /behavior\s*:/gi,
  /-moz-binding/gi,
  /<\s*\/?\s*script/gi,
];
const CSS_EXTERNAL_URL_PATTERN = /url\(\s*['"]?\s*(?:https?:)?\/\/[^)]*\)/gi;

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
          data[key] = this.sanitizeHtmlField(key, value);
        } else if (this.cssFields.has(key) && typeof value === 'string') {
          data[key] = this.sanitizeCssField(key, value);
        } else {
          this.sanitizeObjectProperties(value);
        }
      }
    }
  }

  /**
   * Sanitiza un campo HTML. Ante cualquier fallo de parseo o sanitización
   * se descarta el contenido (fail-closed) en vez de dejar pasar el valor
   * crudo sin verificar.
   */
  private sanitizeHtmlField(key: string, value: string): string {
    if (this.config?.sanitizationLevel === 'none') {
      return value;
    }

    try {
      const rawHtml = JSON.parse(value);
      const allowedTags =
        this.config?.sanitizationLevel === 'strict'
          ? STRICT_ALLOWED_TAGS
          : this.config?.allowedHtmlTags || DEFAULT_ALLOWED_TAGS;

      const sanitizedHtml = DOMPurify.sanitize(rawHtml, { ALLOWED_TAGS: allowedTags });
      return JSON.stringify(sanitizedHtml);
    } catch (e) {
      console.error(`Error al procesar el campo HTML '${key}'. Se descarta el contenido.`, e);
      return JSON.stringify('');
    }
  }

  /**
   * Sanitiza un campo CSS eliminando construcciones conocidas como vectores
   * de ataque (expression(), @import, javascript:, behavior:, -moz-binding)
   * y, opcionalmente, cualquier url() que apunte a un recurso externo.
   * Ante un fallo inesperado se descarta el contenido (fail-closed).
   */
  private sanitizeCssField(key: string, value: string): string {
    if (this.config?.sanitizationLevel === 'none') {
      return value;
    }

    try {
      let sanitizedCss = value;
      for (const pattern of CSS_DANGEROUS_PATTERNS) {
        sanitizedCss = sanitizedCss.replace(pattern, '');
      }

      if (this.config?.disallowExternalCssResources) {
        sanitizedCss = sanitizedCss.replace(CSS_EXTERNAL_URL_PATTERN, "url('about:blank')");
      }

      return sanitizedCss;
    } catch (e) {
      console.error(`Error al procesar el campo CSS '${key}'. Se descarta el contenido.`, e);
      return '';
    }
  }
}