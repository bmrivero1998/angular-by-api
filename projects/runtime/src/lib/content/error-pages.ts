import { HttpErrorResponse } from '@angular/common/http';
import { ApiDrivenContent } from '@ux-driven-viewer/engine';
import { RETRY_LOAD_ACTION } from '../actions/action-names';

/** `id_DocumentHTMLCSS` de la sección que se pinta cuando falla la primera carga. */
export const ERROR_PAGE_ID = 'ux-error-page';

export type ErrorPageKind = 'not-found' | 'forbidden' | 'unavailable' | 'error';

export interface ClassifiedError {
  kind: ErrorPageKind;
  /** Código HTTP, o `null` si no hubo respuesta (sin red) o el error no era HTTP. */
  status: number | null;
}

/**
 * Decide qué página de error corresponde a un fallo de carga:
 * - 404                         -> `not-found`
 * - 401, 403                    -> `forbidden`
 * - sin respuesta (0), 408, 429 y 5xx -> `unavailable` (puede reintentarse)
 * - cualquier otro              -> `error`
 */
export function classifyLoadError(error: unknown): ClassifiedError {
  if (!(error instanceof HttpErrorResponse)) return { kind: 'error', status: null };

  const status = error.status > 0 ? error.status : null;

  if (error.status === 404) return { kind: 'not-found', status };
  if (error.status === 401 || error.status === 403) return { kind: 'forbidden', status };
  if (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500) {
    return { kind: 'unavailable', status };
  }
  return { kind: 'error', status };
}

const PAGES: Record<ErrorPageKind, { title: string; text: string; retry: boolean }> = {
  'not-found': {
    title: 'No encontramos este contenido',
    text: 'El contenido que buscas no existe o cambió de lugar.',
    retry: false,
  },
  forbidden: {
    title: 'Acceso no autorizado',
    text: 'No tienes permisos para ver este contenido, o tu sesión expiró.',
    retry: false,
  },
  unavailable: {
    title: 'Servicio no disponible',
    text: 'No pudimos conectar con el servidor. Inténtalo de nuevo en unos minutos.',
    retry: true,
  },
  error: {
    title: 'Algo salió mal',
    text: 'No pudimos cargar el contenido. Inténtalo de nuevo.',
    retry: true,
  },
};

/**
 * Estilos propios y autocontenidos: no dependen de Bootstrap ni de una fuente
 * de iconos en la página host. El motor los aísla a la sección, así que no
 * necesitan prefijo.
 */
const ERROR_PAGE_CSS = `
.ux-error { max-width: 560px; margin: 48px auto; padding: 32px 24px; text-align: center; background: #fff; color: #212529; border-radius: 12px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08); }
.ux-error__code { margin: 0; font-size: 4rem; font-weight: 700; line-height: 1; color: #dc3545; }
.ux-error__title { margin: 12px 0 8px; font-size: 1.5rem; }
.ux-error__text { margin: 0 0 24px; color: #6c757d; }
.ux-error__retry { padding: 8px 20px; border: 0; border-radius: 6px; background: #0d6efd; color: #fff; font: inherit; cursor: pointer; }
.ux-error__retry:hover { background: #0b5ed7; }
`;

/**
 * Sección `static` con la página de error. Su botón "Reintentar" dispara la
 * acción `retry_load`, que el widget resuelve volviendo a pedir el contenido.
 */
export function buildErrorPage(kind: ErrorPageKind, status: number | null): ApiDrivenContent {
  const page = PAGES[kind];

  const code = status ? `<p class="ux-error__code">${status}</p>` : '';
  const retry = page.retry
    ? `<button type="button" class="ux-error__retry" data-dynamic-action="${RETRY_LOAD_ACTION}">Reintentar</button>`
    : '';

  return {
    id_DocumentHTMLCSS: ERROR_PAGE_ID,
    renderType: 'static',
    htmlComponent: `<div class="ux-error" role="alert">${code}<h2 class="ux-error__title">${page.title}</h2><p class="ux-error__text">${page.text}</p>${retry}</div>`,
    cssComponent: ERROR_PAGE_CSS,
  };
}
