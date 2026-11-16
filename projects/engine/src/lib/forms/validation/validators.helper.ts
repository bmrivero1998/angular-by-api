import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

/**
 * Traduce un tipo de validador (string, viene del backend) a un ValidatorFn real.
 * Función pura: sin dependencias de Angular DI, fácil de testear con Jest/Jasmine
 * sin necesidad de TestBed.
 *
 * @param type Tipo de validador; no distingue mayúsculas (ej. 'required', 'minLength')
 * @param value Valor adicional que algunos validadores necesitan (minLength, pattern, etc.)
 * @param onUnknownType callback opcional para reportar tipos no reconocidos
 *        (antes esto emitía un `componentError`; ahora se lo dejamos al llamador)
 */
export function resolveValidator(
  type: string,
  value: any,
  onUnknownType?: (type: string) => void
): ValidatorFn | null {
  switch (type.toLowerCase()) {
    case 'required':
      return requiredValidator;
    case 'email':
      return Validators.email;
    case 'minlength':
      return Validators.minLength(value);
    case 'maxlength':
      return Validators.maxLength(value);
    case 'pattern':
      return Validators.pattern(value);
    case 'min':
      return Validators.min(value);
    case 'max':
      return Validators.max(value);
    case 'requiredtrue':
      return Validators.requiredTrue;
    case 'matchvalue':
      return (control: AbstractControl) =>
        control.value === value ? null : { matchValue: { valid: false, value } };
    case 'matchcontrol':
      return matchControlValidator(String(value));
    default:
      onUnknownType?.(type);
      return null;
  }
}

/**
 * `required` del motor. Igual que `Validators.required`, pero además trata
 * `false` como "sin valor": un checkbox obligatorio sin marcar es inválido,
 * que es lo que significa `required` en un checkbox de HTML.
 */
export function requiredValidator(control: AbstractControl): ValidationErrors | null {
  return control.value === false ? { required: true } : Validators.required(control);
}

/**
 * Válido solo si el control vale lo mismo que otro control del mismo
 * formulario (p. ej. "confirmar contraseña"). Si el otro control no existe,
 * no reporta error: el problema de configuración lo avisa el componente.
 */
export function matchControlValidator(otherControlName: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const other = control.parent?.get(otherControlName);
    if (!other || other.value === control.value) return null;
    return { matchControl: { other: otherControlName } };
  };
}
