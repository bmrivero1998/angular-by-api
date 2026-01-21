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
  toggleConfig?: ToggleConfig;
  rangeConfig?: RangeConfig;
  colorConfig?: ColorConfig;
  dateTimeConfig?: DateTimeConfig;
  multiSelectConfig?: MultiSelectConfig;
  captchaConfig?: CaptchaConfig;
  passwordConfig?: PasswordConfig;
  sliderInputConfig?: SliderInputConfig;
  richTextConfig?: RichTextConfig;
  autoCompleteConfig?: AutoCompleteConfig;
  fileUploadConfig?: FileUploadConfig;
  sliderConfig?: SliderConfig;
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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'; // Método HTTP a usar
  debounceTime?: number; // Tiempo de espera en ms (default: 500)
  errorKey: string;      // Clave del error (ej: 'userTaken')
  message: string;       // Mensaje a mostrar si falla
}

export interface FilePayload {
  controlName: string;
  file: File | File[];
  formId: string;
  isMultiple?: boolean;
}

 export interface ToggleConfig {
    checkedClass?: string;
    uncheckedClass?: string;
    trueValue?: any;  // Valor cuando está activado (default: true)
    falseValue?: any; // Valor cuando está desactivado (default: false)
  };
  
  // Para range inputs
   export interface RangeConfig {
    displaySelector?: string; // Selector para mostrar el valor actual
    displayFormat?: string;   // Formato para mostrar (ej: "{value}%")
    step?: number;           // Incremento del range (default: 1)
  };
  
  // Para color inputs
   export interface ColorConfig {
    previewSelector?: string; // Selector para mostrar preview del color
    defaultColor?: string;    // Color por defecto (default: "#000000")
  };
  
  // Para date/time inputs
   export interface DateTimeConfig {
    format?: string;          // Formato para display (ej: "DD/MM/YYYY")
    pickerType?: 'native' | 'flatpickr' | 'bootstrap'; // Tipo de picker
    showTime?: boolean;       // Mostrar selector de tiempo
    minDate?: string | Date;  // Fecha mínima
    maxDate?: string | Date;  // Fecha máxima
  };
  
  // Para multi-select
   export interface MultiSelectConfig {
    separator?: string;       // Separador para valores múltiples
    maxSelections?: number;   // Máximo número de selecciones
    displaySelector?: string; // Donde mostrar selecciones actuales
  };
  
  // Para rich text editors
   export interface RichTextConfig {
    editorType?: 'quill' | 'tinymce' | 'ckeditor'; // Tipo de editor
    toolbar?: any;            // Configuración de toolbar
    height?: number;         // Altura del editor
  };
  
  // Para autocomplete/combobox
   export interface AutoCompleteConfig {
    source?: string[] | ((query: string) => Promise<string[]>); // Fuente de datos
    minChars?: number;        // Mínimo de caracteres para buscar
    debounceTime?: number;    // Debounce para búsquedas
  };
  
  // Para upload de archivos
   export interface FileUploadConfig {
    accept?: string;          // Tipos de archivo aceptados (ej: ".pdf,.docx")
    maxSize?: number;         // Tamaño máximo en bytes
    multiple?: boolean;       // Permitir múltiples archivos
  };

  // Para sliders/carousels
    export interface SliderConfig {
    min?: number;             // Valor mínimo
    max?: number;             // Valor máximo
    step?: number;            // Incremento
    orientation?: 'horizontal' | 'vertical'; // Orientación
  }
  // Para captchas
    export interface CaptchaConfig {
    siteKey: string;          // Clave del sitio
    theme?: 'light' | 'dark'; // Tema del captcha
    size?: 'normal' | 'compact'; // Tamaño del captcha
  } 
  // Para inputs de tipo password
    export interface PasswordConfig {
    strengthMeter?: boolean;  // Mostrar medidor de fuerza
    toggleVisibility?: boolean; // Permitir mostrar/ocultar contraseña
  }
  // Para inputs de tipo slider
    export interface SliderInputConfig {
    min?: number;             // Valor mínimo
    max?: number;             // Valor máximo
    step?: number;            // Incremento
    showValue?: boolean;      // Mostrar valor actual
  }
