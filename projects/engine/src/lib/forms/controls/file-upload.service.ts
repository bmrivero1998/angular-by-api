import { Injectable } from '@angular/core';

export interface FileUploadConfig {
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  maxCount?: number;
}

/**
 * Toda la lógica de validación de archivos (tamaño, tipo, cantidad) vivía
 * como métodos privados sueltos dentro del componente. Aquí queda aislada,
 * pura y testeable con objetos File simulados.
 */
@Injectable({ providedIn: 'root' })
export class FileUploadService {
  validateFiles(files: File[], config: FileUploadConfig = {}): string[] {
    const errors: string[] = [];

    files.forEach((file) => {
      if (config.maxSize && file.size > config.maxSize) {
        errors.push(
          `El archivo ${file.name} excede el tamaño máximo de ${this.formatBytes(config.maxSize)}`
        );
      }
      if (config.accept && !this.checkFileType(file, config.accept)) {
        errors.push(`El archivo ${file.name} no es de un tipo aceptado: ${config.accept}`);
      }
    });

    if (config.maxCount && files.length > config.maxCount) {
      errors.push(`Máximo ${config.maxCount} archivos permitidos`);
    }

    return errors;
  }

  checkFileType(file: File, accept: string): boolean {
    const types = accept.split(',').map((t) => t.trim().toLowerCase());
    return types.some((type) => {
      if (type.startsWith('.')) return file.name.toLowerCase().endsWith(type);
      if (type.endsWith('/*')) return file.type.startsWith(type.replace('/*', ''));
      return file.type === type;
    });
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}