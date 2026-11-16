import { HttpClient, HttpErrorResponse, HttpEvent, HttpEventType } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, combineLatest, distinctUntilChanged, map, startWith, catchError, throwError } from 'rxjs';
import { DYNAMIC_CONFIG } from '../../config/dynamic-config.token';
import { FileUploadConfig } from '../../models/form-field-mapping.model';

/** Estado de una subida en curso. */
export interface UploadState {
  status: 'uploading' | 'done';
  /** Avance de 0 a 100, sumando todos los archivos. */
  progress: number;
  /** Solo con `done`: la respuesta del servidor (JSON ya interpretado, o texto). Un arreglo si hay varios archivos. */
  result?: unknown;
}

/** La subida no se pudo hacer. `message` está listo para mostrarse al usuario. */
export class FileUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileUploadError';
  }
}

/**
 * Sube archivos a la `uploadUrl` configurada en un campo, con avance.
 *
 * Una petición por archivo, en paralelo, multipart/form-data. Cancelar la
 * suscripción aborta las peticiones. No fija cabeceras: para autenticar usa
 * un interceptor de `HttpClient` en tu aplicación.
 */
@Injectable({ providedIn: 'root' })
export class FileUploadTransferService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(DYNAMIC_CONFIG, { optional: true });

  /**
   * Convierte la `uploadUrl` del JSON en la URL real, o lanza `FileUploadError`
   * si el origen no está permitido. La URL llega en el JSON, así que no se
   * confía en ella para mandar los archivos del usuario a cualquier lugar.
   */
  public resolveUrl(url: string, extraOrigins: string[] = []): string {
    const trimmed = (url ?? '').trim();
    if (!trimmed) throw new FileUploadError('El campo no tiene una URL de subida configurada.');

    // Con esquema (https:, javascript:, data:...) o protocolo-relativa (//host).
    if (/^[a-z][a-z0-9+.\-]*:/i.test(trimmed) || trimmed.startsWith('//')) {
      const origin = this.originOf(trimmed);
      if (!origin || !/^https?:/i.test(origin) || !this.allowedOrigins(extraOrigins).has(origin)) {
        throw new FileUploadError('La URL de subida apunta a un origen no permitido.');
      }
      return trimmed;
    }

    // Relativa: se cuelga de apiUrl; sin apiUrl se deja como está (relativa a la página).
    const base = (this.config?.apiUrl ?? '').replace(/\/+$/, '');
    return base ? `${base}/${trimmed.replace(/^\/+/, '')}` : trimmed;
  }

  /**
   * Sube los archivos. Emite el avance y, al terminar, un último estado
   * `done` con la respuesta. Falla con `FileUploadError`.
   */
  public upload(files: File[], config: FileUploadConfig, extraOrigins: string[] = []): Observable<UploadState> {
    let url: string;
    try {
      url = this.resolveUrl(config.uploadUrl ?? '', extraOrigins);
    } catch (error) {
      return throwError(() => error);
    }

    const method = config.method === 'PUT' ? 'PUT' : 'POST';
    const fieldName = config.fieldName || 'file';

    const transfers = files.map((file) => {
      const body = new FormData();
      body.append(fieldName, file, file.name);

      return this.http
        .request(method, url, { body, observe: 'events', reportProgress: true, responseType: 'text' })
        .pipe(
          map((event) => this.toProgress(event, file)),
          startWith<FileProgress>({ loaded: 0, total: file.size, done: false }),
          catchError((error) => throwError(() => this.toUploadError(error, file))),
        );
    });

    return combineLatest(transfers).pipe(
      map((states): UploadState => {
        const done = states.every((state) => state.done);
        const total = states.reduce((sum, state) => sum + state.total, 0);
        const loaded = states.reduce((sum, state) => sum + state.loaded, 0);
        const progress = done ? 100 : total > 0 ? Math.min(99, Math.floor((loaded / total) * 100)) : 0;

        if (!done) return { status: 'uploading', progress };

        const results = states.map((state) => this.parseBody(state.body));
        return { status: 'done', progress: 100, result: files.length > 1 || config.multiple ? results : results[0] };
      }),
      distinctUntilChanged((a, b) => a.status === b.status && a.progress === b.progress),
    );
  }

  private toProgress(event: HttpEvent<string>, file: File): FileProgress {
    if (event.type === HttpEventType.UploadProgress) {
      return { loaded: event.loaded, total: event.total ?? file.size, done: false };
    }
    if (event.type === HttpEventType.Response) {
      return { loaded: file.size, total: file.size, done: true, body: event.body };
    }
    return { loaded: 0, total: file.size, done: false };
  }

  private toUploadError(error: unknown, file: File): FileUploadError {
    if (error instanceof FileUploadError) return error;

    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return new FileUploadError(`No se pudo subir "${file.name}": sin conexión con el servidor.`);
      if (error.status === 413) return new FileUploadError(`El servidor rechazó "${file.name}": el archivo es demasiado grande.`);
      if (error.status === 415) return new FileUploadError(`El servidor rechazó "${file.name}": tipo de archivo no admitido.`);
      if (error.status === 401 || error.status === 403) return new FileUploadError(`No tienes permiso para subir "${file.name}".`);
      return new FileUploadError(`No se pudo subir "${file.name}" (HTTP ${error.status}).`);
    }
    return new FileUploadError(`No se pudo subir "${file.name}".`);
  }

  /** JSON si lo es, texto si no, `null` si la respuesta viene vacía. */
  private parseBody(body: string | null | undefined): unknown {
    if (body === null || body === undefined || body === '') return null;
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }

  private allowedOrigins(extra: string[]): Set<string> {
    const origins = new Set<string>();
    const add = (value: string | undefined) => {
      const origin = value ? this.originOf(value) : null;
      if (origin) origins.add(origin);
    };

    if (typeof location !== 'undefined') add(location.origin);
    add(this.config?.apiUrl);
    this.config?.allowedUploadOrigins?.forEach(add);
    extra.forEach(add);
    return origins;
  }

  private originOf(value: string): string | null {
    try {
      const base = typeof location !== 'undefined' ? location.href : undefined;
      const origin = new URL(value, base).origin;
      return origin === 'null' ? null : origin;
    } catch {
      return null;
    }
  }
}

interface FileProgress {
  loaded: number;
  total: number;
  done: boolean;
  body?: string | null;
}
