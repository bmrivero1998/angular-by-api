import { FormControl, FormGroup } from '@angular/forms';
import { resolveValidator } from './validators.helper';

describe('resolveValidator', () => {
  function errorsOf(type: string, value: unknown, controlValue: unknown) {
    const validator = resolveValidator(type, value)!;
    return validator(new FormControl(controlValue));
  }

  it('no distingue mayúsculas en el tipo', () => {
    expect(resolveValidator('minLength', 3)).not.toBeNull();
    expect(resolveValidator('MINLENGTH', 3)).not.toBeNull();
    expect(resolveValidator('requiredTrue', undefined)).not.toBeNull();
  });

  it('avisa de un tipo desconocido y no devuelve validador', () => {
    const onUnknown = jasmine.createSpy('onUnknown');

    expect(resolveValidator('noExiste', undefined, onUnknown)).toBeNull();
    expect(onUnknown).toHaveBeenCalledOnceWith('noExiste');
  });

  describe('required', () => {
    it('rechaza vacío, null y un checkbox sin marcar (false)', () => {
      expect(errorsOf('required', undefined, '')).toEqual({ required: true });
      expect(errorsOf('required', undefined, null)).toEqual({ required: true });
      expect(errorsOf('required', undefined, false)).toEqual({ required: true });
    });

    it('acepta texto, true y el número 0', () => {
      expect(errorsOf('required', undefined, 'Ana')).toBeNull();
      expect(errorsOf('required', undefined, true)).toBeNull();
      expect(errorsOf('required', undefined, 0)).toBeNull();
    });
  });

  it('requiredTrue reporta el error con la clave "required"', () => {
    expect(errorsOf('requiredTrue', undefined, false)).toEqual({ required: true });
    expect(errorsOf('requiredTrue', undefined, true)).toBeNull();
  });

  it('email, minLength, maxLength, pattern, min y max delegan en los validadores de Angular', () => {
    expect(errorsOf('email', undefined, 'no-es-correo')).toEqual({ email: true });
    expect(errorsOf('email', undefined, 'a@b.co')).toBeNull();

    expect(errorsOf('minLength', 3, 'ab')?.['minlength']).toBeDefined();
    expect(errorsOf('maxLength', 3, 'abcd')?.['maxlength']).toBeDefined();
    expect(errorsOf('pattern', '^[A-Z]+$', 'abc')?.['pattern']).toBeDefined();
    expect(errorsOf('min', 18, 17)?.['min']).toBeDefined();
    expect(errorsOf('max', 99, 100)?.['max']).toBeDefined();
  });

  it('matchValue compara contra un valor literal', () => {
    expect(errorsOf('matchValue', 'ACEPTO', 'ACEPTO')).toBeNull();
    expect(errorsOf('matchValue', 'ACEPTO', 'acepto')?.['matchValue']).toBeDefined();
  });

  describe('matchControl', () => {
    function passwordForm(password: string, confirm: string) {
      const form = new FormGroup({
        password: new FormControl(password),
        confirm: new FormControl(confirm, resolveValidator('matchControl', 'password')!),
      });
      form.get('confirm')!.updateValueAndValidity();
      return form;
    }

    it('es válido cuando ambos controles valen lo mismo', () => {
      expect(passwordForm('secreto', 'secreto').get('confirm')!.errors).toBeNull();
    });

    it('reporta matchControl cuando difieren', () => {
      expect(passwordForm('secreto', 'otro').get('confirm')!.errors).toEqual({
        matchControl: { other: 'password' },
      });
    });

    it('no reporta error si el otro control no existe o el control no tiene padre', () => {
      expect(errorsOf('matchControl', 'password', 'x')).toBeNull();

      const form = new FormGroup({ confirm: new FormControl('x', resolveValidator('matchControl', 'noExiste')!) });
      expect(form.get('confirm')!.errors).toBeNull();
    });
  });
});
