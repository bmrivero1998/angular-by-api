import { DynamicLibraryConfig } from '../../config/dynamic-config.token';

/** La URL no es aceptable: está vacía o apunta a un origen no permitido. `message` se puede mostrar al usuario. */
export class UntrustedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UntrustedUrlError';
  }
}

/**
 * Convierte una URL que viene en el JSON (subida de archivos, sugerencias de
 * autocompletado...) en la URL real, o lanza `UntrustedUrlError`.
 *
 * Esas URLs reciben datos del usuario (sus archivos, lo que escribe), así que
 * no se confía en ellas para mandarlos a cualquier sitio:
 *
 * - Una URL **relativa** se cuelga de `config.apiUrl` (o de la página si no hay).
 * - Una URL **absoluta** solo se acepta si su origen es el de la página, el de
 *   `config.apiUrl`, uno de `config.allowedOrigins` o uno de `extraOrigins`
 *   (el widget aporta aquí el de su `api-url` y su atributo `allowed-origins`).
 * - Cualquier otra (`https://otro.com`, `//otro.com`, `javascript:`, `data:`,
 *   `ftp:`...) se rechaza.
 *
 * @param what lo que pide la URL, para el mensaje: "subida", "sugerencias".
 */
export function resolveTrustedUrl(
  url: string,
  config: DynamicLibraryConfig | null | undefined,
  extraOrigins: string[],
  what: string,
): string {
  const trimmed = (url ?? '').trim();
  if (!trimmed) throw new UntrustedUrlError(`El campo no tiene una URL de ${what} configurada.`);

  // Con esquema (https:, javascript:, data:...) o protocolo-relativa (//host).
  if (/^[a-z][a-z0-9+.\-]*:/i.test(trimmed) || trimmed.startsWith('//')) {
    const origin = originOf(trimmed);
    if (!origin || !/^https?:/i.test(origin) || !allowedOrigins(config, extraOrigins).has(origin)) {
      throw new UntrustedUrlError(`La URL de ${what} apunta a un origen no permitido.`);
    }
    return trimmed;
  }

  // Relativa: se cuelga de apiUrl; sin apiUrl se deja como está (relativa a la página).
  const base = (config?.apiUrl ?? '').replace(/\/+$/, '');
  return base ? `${base}/${trimmed.replace(/^\/+/, '')}` : trimmed;
}

function allowedOrigins(config: DynamicLibraryConfig | null | undefined, extra: string[]): Set<string> {
  const origins = new Set<string>();
  const add = (value: string | undefined) => {
    const origin = value ? originOf(value) : null;
    if (origin) origins.add(origin);
  };

  if (typeof location !== 'undefined') add(location.origin);
  add(config?.apiUrl);
  config?.allowedOrigins?.forEach(add);
  extra.forEach(add);
  return origins;
}

function originOf(value: string): string | null {
  try {
    const base = typeof location !== 'undefined' ? location.href : undefined;
    const origin = new URL(value, base).origin;
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}
