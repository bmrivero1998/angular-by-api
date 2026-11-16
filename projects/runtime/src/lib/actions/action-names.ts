/**
 * Reconocimiento de las acciones integradas (`data-dynamic-action="..."`).
 *
 * Antes se buscaba un texto suelto dentro del nombre (`name.includes('modal')`),
 * así que `open_modal` se confundía con "cerrar el modal" y `reset_password` con
 * "vaciar el formulario". Ahora el nombre se separa en PALABRAS y se comparan
 * palabras completas.
 */

/**
 * Separa un nombre de acción en palabras en minúscula. Reconoce `_`, `-`, `.`,
 * `:`, espacios y camelCase:
 *
 *   close_modal, close-modal, closeModal  ->  ['close', 'modal']
 */
export function actionWords(action: string | null | undefined): string[] {
  return (action ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

/** `submit`, `submit_form`, `submit-order`, `submitForm`: valida y envía los formularios. */
export function isSubmitAction(action: string | null | undefined): boolean {
  return actionWords(action).includes('submit');
}

/**
 * `reset`, `reset_form`, `resetForms`, `form_reset`: vacía los formularios.
 * Solo si TODAS las palabras son de este vocabulario: `reset_password` es otra
 * cosa (un flujo de recuperación de contraseña) y no debe borrar lo escrito.
 */
export function isResetAction(action: string | null | undefined): boolean {
  const words = actionWords(action);
  return words.includes('reset') && words.every((word) => ['reset', 'form', 'forms'].includes(word));
}

/** `close`, `close_modal`, `cancel`, `modal_cancel`, `dismiss`: cierra el modal abierto. */
export function isCloseAction(action: string | null | undefined): boolean {
  const words = actionWords(action);
  return ['close', 'cancel', 'dismiss'].some((word) => words.includes(word));
}

/** `save`, `save_changes`: como `submit`, exige un formulario válido (dentro del modal). */
export function isSaveAction(action: string | null | undefined): boolean {
  return actionWords(action).includes('save');
}

/** Acción de los botones "Reintentar" de las páginas de error. Es un nombre exacto, no una palabra. */
export const RETRY_LOAD_ACTION = 'retry_load';
