import { HttpErrorResponse } from '@angular/common/http';
import { ERROR_PAGE_ID, buildErrorPage, classifyLoadError } from './error-pages';

describe('error-pages', () => {
  const http = (status: number) => new HttpErrorResponse({ status });

  describe('classifyLoadError', () => {
    it('404 es not-found', () => {
      expect(classifyLoadError(http(404))).toEqual({ kind: 'not-found', status: 404 });
    });

    it('401 y 403 son forbidden', () => {
      expect(classifyLoadError(http(401)).kind).toBe('forbidden');
      expect(classifyLoadError(http(403)).kind).toBe('forbidden');
    });

    it('sin respuesta (status 0), 408, 429 y 5xx son unavailable', () => {
      expect(classifyLoadError(http(0))).toEqual({ kind: 'unavailable', status: null });
      [408, 429, 500, 502, 503, 504].forEach((status) =>
        expect(classifyLoadError(http(status))).toEqual({ kind: 'unavailable', status }),
      );
    });

    it('cualquier otro código HTTP es un error genérico', () => {
      expect(classifyLoadError(http(400))).toEqual({ kind: 'error', status: 400 });
      expect(classifyLoadError(http(422)).kind).toBe('error');
    });

    it('un error que no es HTTP es un error genérico sin código', () => {
      expect(classifyLoadError(new Error('boom'))).toEqual({ kind: 'error', status: null });
      expect(classifyLoadError('texto')).toEqual({ kind: 'error', status: null });
      expect(classifyLoadError(undefined)).toEqual({ kind: 'error', status: null });
    });
  });

  describe('buildErrorPage', () => {
    it('es una sección static con un id propio, para que un contenido real la reemplace', () => {
      const page = buildErrorPage('not-found', 404);

      expect(page.id_DocumentHTMLCSS).toBe(ERROR_PAGE_ID);
      expect(page.renderType).toBe('static');
      expect(page.htmlComponent).toContain('role="alert"');
      expect(page.cssComponent).toContain('.ux-error');
    });

    it('muestra el código HTTP cuando lo hay y lo omite cuando no', () => {
      expect(buildErrorPage('not-found', 404).htmlComponent).toContain('>404<');
      expect(buildErrorPage('unavailable', null).htmlComponent).not.toContain('ux-error__code');
    });

    it('ofrece "Reintentar" solo cuando reintentar puede servir', () => {
      expect(buildErrorPage('unavailable', 503).htmlComponent).toContain('data-dynamic-action="retry_load"');
      expect(buildErrorPage('error', 400).htmlComponent).toContain('data-dynamic-action="retry_load"');
      expect(buildErrorPage('not-found', 404).htmlComponent).not.toContain('retry_load');
      expect(buildErrorPage('forbidden', 403).htmlComponent).not.toContain('retry_load');
    });

    it('cada tipo tiene su propio mensaje', () => {
      const titles = (['not-found', 'forbidden', 'unavailable', 'error'] as const).map(
        (kind) => buildErrorPage(kind, null).htmlComponent,
      );

      expect(new Set(titles).size).toBe(4);
    });

    it('no depende de Bootstrap ni de fuentes de iconos del host', () => {
      const html = buildErrorPage('unavailable', 500).htmlComponent!;

      expect(html).not.toMatch(/class="[^"]*\b(btn|container|d-flex|bi)\b/);
      expect(html).not.toContain('bi-');
    });
  });
});
