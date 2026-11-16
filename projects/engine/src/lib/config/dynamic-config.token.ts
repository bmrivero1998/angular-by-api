import { InjectionToken } from '@angular/core';

// Interfaz para definir qué puede configurar el usuario
export interface DynamicLibraryConfig {
  apiUrl?: string;
  // --- MEJORA PARA CSS FRAMEWORKS ---
  errorClassName?: string;   // Ej: 'is-invalid' (Bootstrap) o 'border-red-500' (Tailwind)
  successClassName?: string; // Ej: 'is-valid' (Bootstrap) o 'border-green-500' (Tailwind)
  defaultErrorMessages?:DefaultErrorMessages

  visibilityAnimation?: boolean;    // Habilitar animaciones
  visibilityAnimationDuration?: number; // Duración en ms

    // CONDICIONALES
  conditionalDebounceTime?: number; // Tiempo de debounce para cambios (default: 50ms)
  clearHiddenFields?: boolean;      // Limpiar valores de campos ocultos
  emitVisibilityEvents?: boolean;   // Emitir eventos personalizados

  // PETICIONES QUE PIDE EL JSON (subida de archivos, sugerencias de autocompletado)
  /**
   * Orígenes (ej. `https://files.miempresa.com`) a los que el contenido puede
   * enviar datos del usuario, además de la página, de `apiUrl` y del `api-url`
   * del widget. Una URL absoluta hacia otro origen se rechaza.
   */
  allowedOrigins?: string[];

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