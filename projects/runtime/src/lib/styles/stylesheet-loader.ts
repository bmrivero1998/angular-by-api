/**
 * Carga hojas de estilo externas (Bootstrap, Tailwind ya compilado, la de tu
 * marca...) en la página, una sola vez cada una.
 *
 * El widget no usa Shadow DOM, así que una hoja cargada aquí aplica a toda la
 * página: es lo mismo que poner un `<link>` en el `<head>` del host.
 */

/** Marca de los `<link>` que pone el widget, para reconocerlos. */
export const STYLESHEET_MARK = 'data-ux-driven-style';

/** Lo máximo que se espera a una hoja antes de seguir sin ella. */
export const STYLESHEET_TIMEOUT_MS = 8000;

/** `"a.css b.css"`, `"a.css, b.css"` o un arreglo → lista limpia, sin repetidos. */
export function toUrlList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,]+/) : [];
  return Array.from(new Set(list.map((url) => String(url).trim()).filter(Boolean)));
}

/** Solo http(s) o relativas: nada de `javascript:`, `data:`, `file:`... */
export function isLoadableStylesheetUrl(url: string, base: string): boolean {
  try {
    const parsed = new URL(url, base);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Añade un `<link rel="stylesheet">` al `<head>` si la página no lo tiene ya.
 * Se resuelve cuando la hoja carga, falla o pasa el tiempo máximo: una hoja
 * caída nunca bloquea la pantalla.
 */
export function loadStylesheet(url: string, doc: Document = document, timeoutMs = STYLESHEET_TIMEOUT_MS): Promise<void> {
  if (!isLoadableStylesheetUrl(url, doc.baseURI)) return Promise.resolve();

  const href = new URL(url, doc.baseURI).href;
  const existing = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')).find(
    (link) => link.href === href,
  );
  if (existing) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(STYLESHEET_MARK, '');
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', () => {
      console.warn(`ux-driven-viewer: no se pudo cargar la hoja de estilos ${href}`);
      done();
    }, { once: true });
    doc.head.appendChild(link);
  });
}

export function loadStylesheets(urls: string[], doc: Document = document): Promise<void> {
  return Promise.all(urls.map((url) => loadStylesheet(url, doc))).then(() => undefined);
}
