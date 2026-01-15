import { FormGroup } from '@angular/forms';

export interface FormFieldMapping {
  controlName: string; // Nombre del FormControl en tu FormGroup (ej. 'username')
  domSelector: string; // Cómo encontrar el campo en el HTML de la API (ej. '#inputApiUsuario', 'input[name="usuario"]')
  eventType?: string; // Evento del DOM a escuchar para cambios (ej. 'input', 'change'; por defecto podría ser 'input')
  errorDisplaySelector?: string | null; // Opcional: Selector para un elemento donde mostrar mensajes de error para este campo
  defaultValue?: any; // Valor por defecto para el campo, si es necesario
  validatorConfig?: Array<{
    type: string; // Tipo de validador (ej. 'required', 'pattern')
    value?: any; // Valor adicional para el validador (ej. patrón regex)
    message: string; // Mensaje de error a mostrar si la validación falla
  }>;
  keyFilter?: string; // Filtro de clave para el campo, si es necesario
  inputMask?: string; // Máscara de entrada para el campo, si es necesario
  hideIf?: string; // Ejemplo: "form.tipoPersona === 'FISICA'"
  showIf?: string; // Ejemplo: "form.edad >= 18"
  // --- MEJORAS PARA WEB COMPONENTS ---
  valueProperty?: string; // Propiedad del elemento a sincronizar. Por defecto 'value'
  useEventDetail?: boolean; // Si es true, busca el valor en event.detail en lugar de event.target.value
  asyncValidator?: AsyncValidatorConfig; // Nueva propiedad PRO
}

export interface ButtonConfig {
  /**
   * El selector CSS para encontrar el botón dentro del HTML inyectado.
   * Ejemplo: '#miBotonSubmit', 'button[data-action="guardarBorrador"]'
   */
  selector: string;

  /**
   * Define la condición bajo la cual el botón DEBERÍA ESTAR DESHABILITADO.
   * - Si es una CADENA, se pueden interpretar condiciones predefinidas.
   * - Si es una FUNCIÓN, esta función se evaluará pasándole el FormGroup.
   * Deberá devolver `true` si el botón debe deshabilitarse, `false` si debe habilitarse.
   * Ejemplos de strings: 'formIsInvalid', 'formIsPristine', 'formIsInvalidOrPristine'
   */
  disableWhen?: string | ((form: FormGroup) => boolean);
}


export interface AsyncValidatorConfig {
  endpoint: string;      // Ruta relativa a la apiUrl (ej: '/validate-user')
  method: 'GET' | 'POST';
  debounceTime?: number; // Tiempo de espera en ms (default: 500)
  errorKey: string;      // Clave del error (ej: 'userTaken')
  message: string;       // Mensaje a mostrar si falla
}