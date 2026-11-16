/**
 * Constantes centralizadas del DynamicViewer.
 * Antes vivían hardcodeadas dentro de varios métodos privados del componente.
 */

export const ALLOWED_NAV_KEYS: string[] = [
  'Backspace',
  'Tab',
  'Enter',
  'Escape',
  'Delete',
  'Home',
  'End',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
];

/**
 * Expresiones regulares predefinidas para `keyFilter`.
 * 'decimal' se maneja aparte porque necesita lógica adicional (no repetir el punto).
 */
export const KEY_FILTER_REGEX_MAP: Record<string, RegExp> = {
  int: /^[0-9]$/,
  number: /^[0-9]$/,
  alpha: /^[a-zA-Z\s]$/,
  alphanum: /^[a-zA-Z0-9]$/,
  hex: /^[0-9a-fA-F]$/,
};

export const DEFAULT_ERROR_CLASS = 'is-invalid';
export const DEFAULT_SUCCESS_CLASS = 'is-valid';

/**
 * Condiciones "planas" (sin ':') soportadas por disableWhen.
 * Las que llevan ':' (ej. controlIsInvalid:campo) se resuelven aparte
 * en ButtonStateService._evaluateControlCondition.
 */
export type FlatButtonCondition =
  | 'formIsInvalid'
  | 'formIsValid'
  | 'formIsPristine'
  | 'formIsDirty'
  | 'formIsTouched'
  | 'formIsUntouched'
  | 'formIsPending'
  | 'alwaysDisable'
  | 'neverDisable'
  | 'formIsInvalidOrPristine'
  | 'formIsEmpty'
  | 'formIsNotEmpty';

export type ControlButtonCondition =
  | 'controlIsInvalid'
  | 'controlIsValid'
  | 'controlIsEmpty'
  | 'controlIsNotEmpty'
  | 'controlsDoNotMatch';

export const EXTERNAL_CSS_DEPENDENCIES = {
  quill: 'https://cdn.quilljs.com/1.3.6/quill.snow.css',
  flatpickr: 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
} as const;