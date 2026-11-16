import { AbstractControl, ValidatorFn, Validators } from '@angular/forms';

/**
 * Traduce un tipo de validador (string, viene del backend) a un ValidatorFn real.
 * Función pura: sin dependencias de Angular DI, fácil de testear con Jest/Jasmine
 * sin necesidad de TestBed.
 *
 * @param type Tipo de validador en minúsculas (ej. 'required', 'minlength')
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
      return Validators.required;
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
    default:
      onUnknownType?.(type);
      return null;
  }
}