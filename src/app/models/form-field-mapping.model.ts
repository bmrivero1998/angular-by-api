import { FormGroup } from "@angular/forms";

export interface FormFieldMapping {
    controlName: string;       // Nombre del FormControl en tu FormGroup (ej. 'username')
    domSelector: string;       // Cómo encontrar el campo en el HTML de la API (ej. '#inputApiUsuario', 'input[name="usuario"]')
    eventType?: string;        // Evento del DOM a escuchar para cambios (ej. 'input', 'change'; por defecto podría ser 'input')
    errorDisplaySelector?: string; // Opcional: Selector para un elemento donde mostrar mensajes de error para este campo
    defaultValue?: any; // Valor por defecto para el campo, si es necesario
    validatorConfig?: Array<{
        type: string; // Tipo de validador (ej. 'required', 'pattern')
        value?: any;  // Valor adicional para el validador (ej. patrón regex)
        message: string; // Mensaje de error a mostrar si la validación falla
    }>;
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