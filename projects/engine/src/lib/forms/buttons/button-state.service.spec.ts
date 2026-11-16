import { TestBed } from '@angular/core/testing';
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { ButtonStateService } from './button-state.service';

describe('ButtonStateService', () => {
  let service: ButtonStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ButtonStateService);
  });

  const disabled = (form: FormGroup, disableWhen: string) =>
    service.evaluate(form, { selector: '#b', disableWhen });

  /** Un formulario con un validador asíncrono que no termina: queda `pending`. */
  function pendingForm(): FormGroup {
    const never = new Subject<null>();
    const form = new FormGroup({
      nombre: new FormControl('Ana', { asyncValidators: [(_c: AbstractControl) => never] }),
    });
    form.updateValueAndValidity();
    return form;
  }

  describe('formulario pendiente (subida de archivo, validador asíncrono)', () => {
    it('formIsInvalid deshabilita el botón: todavía no se puede enviar', () => {
      const form = pendingForm();

      expect(form.pending).toBeTrue();
      expect(form.invalid).toBeFalse();
      expect(disabled(form, 'formIsInvalid')).toBeTrue();
    });

    it('formIsInvalidOrPristine también, aunque el formulario ya no esté intacto', () => {
      const form = pendingForm();
      form.markAsDirty();

      expect(disabled(form, 'formIsInvalidOrPristine')).toBeTrue();
    });

    it('formIsValid sigue siendo falso mientras está pendiente', () => {
      expect(disabled(pendingForm(), 'formIsValid')).toBeFalse(); // "deshabilitar si es válido": no lo es
    });

    it('formIsPending lo detecta directamente', () => {
      expect(disabled(pendingForm(), 'formIsPending')).toBeTrue();
    });

    it('un formulario válido y sin pendientes habilita el botón', () => {
      const form = new FormGroup({ nombre: new FormControl('Ana', Validators.required) });
      form.markAsDirty();

      expect(disabled(form, 'formIsInvalid')).toBeFalse();
      expect(disabled(form, 'formIsInvalidOrPristine')).toBeFalse();
    });
  });

  describe('condiciones planas', () => {
    const form = () => new FormGroup({ a: new FormControl(''), b: new FormControl('x') });

    it('formIsInvalid / formIsValid', () => {
      const invalid = new FormGroup({ a: new FormControl('', Validators.required) });

      expect(disabled(invalid, 'formIsInvalid')).toBeTrue();
      expect(disabled(invalid, 'formIsValid')).toBeFalse();
      expect(disabled(form(), 'formIsInvalid')).toBeFalse();
    });

    it('pristine / dirty / touched / untouched', () => {
      const f = form();

      expect(disabled(f, 'formIsPristine')).toBeTrue();
      expect(disabled(f, 'formIsDirty')).toBeFalse();
      expect(disabled(f, 'formIsUntouched')).toBeTrue();
      f.markAsDirty();
      f.markAsTouched();
      expect(disabled(f, 'formIsDirty')).toBeTrue();
      expect(disabled(f, 'formIsTouched')).toBeTrue();
    });

    it('formIsEmpty / formIsNotEmpty usan el valor crudo', () => {
      const empty = new FormGroup({ a: new FormControl(''), b: new FormControl(null) });

      expect(disabled(empty, 'formIsEmpty')).toBeTrue();
      expect(disabled(empty, 'formIsNotEmpty')).toBeFalse();
      expect(disabled(form(), 'formIsNotEmpty')).toBeTrue();
    });

    it('alwaysDisable y neverDisable', () => {
      expect(disabled(form(), 'alwaysDisable')).toBeTrue();
      expect(disabled(form(), 'neverDisable')).toBeFalse();
    });

    it('una función recibe el formulario', () => {
      const f = form();

      expect(service.evaluate(f, { selector: '#b', disableWhen: (g) => g === f })).toBeTrue();
    });

    it('sin disableWhen no se deshabilita, y una condición desconocida se informa', () => {
      const unknown = jasmine.createSpy('unknown');

      expect(service.evaluate(form(), { selector: '#b' })).toBeFalse();
      expect(service.evaluate(form(), { selector: '#b', disableWhen: 'inventada' }, unknown)).toBeFalse();
      expect(unknown).toHaveBeenCalledWith(jasmine.stringMatching(/inventada/));
    });
  });

  describe('condiciones por control', () => {
    const form = () =>
      new FormGroup({
        email: new FormControl('', Validators.required),
        pass: new FormControl('abc'),
        pass2: new FormControl('abc'),
      });

    it('controlIsInvalid / controlIsValid', () => {
      expect(disabled(form(), 'controlIsInvalid:email')).toBeTrue();
      expect(disabled(form(), 'controlIsValid:pass')).toBeTrue();
      expect(disabled(form(), 'controlIsValid:email')).toBeFalse();
    });

    it('controlIsEmpty / controlIsNotEmpty', () => {
      expect(disabled(form(), 'controlIsEmpty:email')).toBeTrue();
      expect(disabled(form(), 'controlIsNotEmpty:pass')).toBeTrue();
    });

    it('controlsDoNotMatch solo cuenta cuando ambos campos ya se tocaron', () => {
      const f = form();
      f.get('pass2')!.setValue('otra');
      expect(disabled(f, 'controlsDoNotMatch:pass,pass2')).toBeFalse();

      f.get('pass')!.markAsTouched();
      f.get('pass2')!.markAsTouched();
      expect(disabled(f, 'controlsDoNotMatch:pass,pass2')).toBeTrue();
    });

    it('un control inexistente deshabilita por seguridad y se informa', () => {
      const unknown = jasmine.createSpy('unknown');

      expect(service.evaluate(form(), { selector: '#b', disableWhen: 'controlIsInvalid:noExiste' }, unknown)).toBeTrue();
      expect(unknown).toHaveBeenCalledWith(jasmine.stringMatching(/noExiste/));
    });

    it('sin nombre de control o con un solo control en controlsDoNotMatch, deshabilita e informa', () => {
      const unknown = jasmine.createSpy('unknown');

      expect(service.evaluate(form(), { selector: '#b', disableWhen: 'controlIsInvalid:' }, unknown)).toBeTrue();
      expect(service.evaluate(form(), { selector: '#b', disableWhen: 'controlsDoNotMatch:pass' }, unknown)).toBeTrue();
      expect(unknown).toHaveBeenCalledTimes(2);
    });
  });
});
