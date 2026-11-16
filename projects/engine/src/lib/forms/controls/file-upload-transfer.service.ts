import { HttpClient, HttpErrorResponse, HttpEvent, HttpEventType } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, combineLatest, distinctUntilChanged, map, startWith, catchError, throwError } from 'rxjs';
import { DYNAMIC_CONFIG } from '../../config/dynamic-config.token';
import { FileUploadConfig } from '../../models/form-field-mapping.model';
import { resolveTrustedUrl } from './trusted-url';

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
   * si el origen no está permitido (ver `resolveTrustedUrl`).
   */
  public resolveUrl(url: string, extraOrigins: string[] = []): string {
    try {
      return resolveTrustedUrl(url, this.config, extraOrigins, 'subida');
    } catch (error) {
      throw new FileUploadError(error instanceof Error ? error.message : 'La URL de subida no es válida.');
    }
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
}

interface FileProgress {
  loaded: number;
  total: number;
  done: boolean;
  body?: string | null;
}
