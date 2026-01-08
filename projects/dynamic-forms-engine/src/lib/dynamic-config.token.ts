import { InjectionToken } from '@angular/core';

// Interfaz para definir qué puede configurar el usuario
export interface DynamicLibraryConfig {
  apiUrl?: string;            // URL base para las peticiones
  sanitizationLevel?: 'strict' | 'flexible' | 'none'; // Nivel de seguridad
  allowedHtmlTags?: string[]; // Tags permitidos en DOMPurify
}

// Creación del Token único
export const DYNAMIC_CONFIG = new InjectionToken<DynamicLibraryConfig>('DYNAMIC_CONFIG');