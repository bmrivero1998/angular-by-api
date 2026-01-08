import { InjectionToken } from '@angular/core';

// Interfaz para definir qué puede configurar el usuario
export interface DynamicLibraryConfig {
  apiUrl?: string;
  sanitizationLevel?: 'strict' | 'flexible' | 'none';
  allowedHtmlTags?: string[];
  // --- MEJORA PARA CSS FRAMEWORKS ---
  errorClassName?: string;   // Ej: 'is-invalid' (Bootstrap) o 'border-red-500' (Tailwind)
  successClassName?: string; // Ej: 'is-valid' (Bootstrap) o 'border-green-500' (Tailwind)
  defaultErrorMessages?:DefaultErrorMessages
  disallowExternalCssResources?: boolean;
}

export interface DefaultErrorMessages {
    required?: string;
    email?: string;
    minlength?: string;
    maxlength?: string;
    pattern?: string;
    generic?: string;
    [key: string]: string | undefined;
  }; 


// Creación del Token único
export const DYNAMIC_CONFIG = new InjectionToken<DynamicLibraryConfig>('DYNAMIC_CONFIG');