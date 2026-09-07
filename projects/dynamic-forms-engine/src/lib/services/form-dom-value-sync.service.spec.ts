import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FormDomValueSyncService } from './form-dom-value-sync.service';
import { DYNAMIC_CONFIG } from '../dynamic-config.token';
import { FormFieldMapping } from '../models/form-field-mapping.model';

describe('FormDomValueSyncService', () => {
  let service: FormDomValueSyncService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: DYNAMIC_CONFIG, useValue: { errorClassName: 'is-invalid', successClassName: 'is-valid' } }],
    });
    service = TestBed.inject(FormDomValueSyncService);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => container.remove());

  function nodeListOf(...els: HTMLElement[]): NodeListOf<HTMLElement> {
    return els as unknown as NodeListOf<HTMLElement>;
  }

  describe('setupNativeValidationAttributes', () => {
    it('traduce validatorConfig a atributos HTML5', () => {
      const input = document.createElement('input');
      container.appendChild(input);
      const mapping: FormFieldMapping = {
        controlName: 'age',
        domSelector: '#age',
        validatorConfig: [
          { type: 'required', value: null, message: '' },
          { type: 'min', value: 18, message: '' },
          { type: 'maxLength', value: 3, message: '' },
        ],
      };

      service.setupNativeValidationAttributes(nodeListOf(input), mapping);

      expect(input.hasAttribute('required')).toBeTrue();
      expect(input.getAttribute('min')).toBe('18');
      expect(input.getAttribute('maxlength')).toBe('3');
    });

    it('fuerza type="email" en un input de texto genérico con validador email', () => {
      const input = document.createElement('input');
      input.type = 'text';
      container.appendChild(input);
      const mapping: FormFieldMapping = {
        controlName: 'mail',
        domSelector: '#mail',
        validatorConfig: [{ type: 'email', value: null, message: '' }],
      };

      service.setupNativeValidationAttributes(nodeListOf(input), mapping);

      expect(input.type).toBe('email');
    });
  });

  describe('setupDomToFormSync', () => {
    it('sincroniza el valor de un input estándar en el evento "input"', () => {
      const control = new FormControl('');
      const input = document.createElement('input');
      container.appendChild(input);

      service.setupDomToFormSync(control, nodeListOf(input), { controlName: 'name', domSelector: '#name' });

      input.value = 'Ana';
      input.dispatchEvent(new Event('input'));

      expect(control.value).toBe('Ana');
    });

    it('ignora el evento de un radio que quedó sin marcar (no pisa el valor del grupo)', () => {
      const control = new FormControl('optionA');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.value = 'optionB';
      radio.checked = false;
      container.appendChild(radio);

      service.setupDomToFormSync(control, nodeListOf(radio), { controlName: 'choice', domSelector: '#choice' });

      radio.dispatchEvent(new Event('change'));

      expect(control.value).toBe('optionA');
    });

    it('toma el valor del radio que sí quedó marcado', () => {
      const control = new FormControl('');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.value = 'optionB';
      radio.checked = true;
      container.appendChild(radio);

      service.setupDomToFormSync(control, nodeListOf(radio), { controlName: 'choice', domSelector: '#choice' });

      radio.dispatchEvent(new Event('change'));

      expect(control.value).toBe('optionB');
    });

    it('lee el valor desde una propiedad custom para web components (valueProperty)', () => {
      const control = new FormControl('');
      const wc = document.createElement('custom-input');
      container.appendChild(wc);

      service.setupDomToFormSync(control, nodeListOf(wc), {
        controlName: 'x',
        domSelector: '#wc',
        eventType: 'ionChange',
        valueProperty: 'value',
        useEventDetail: true,
      });

      wc.dispatchEvent(new CustomEvent('ionChange', { detail: 'valor-custom' }));

      expect(control.value).toBe('valor-custom');
    });
  });

  describe('updateSingleControlDomState', () => {
    it('aplica valor, disabled y clases de validación', () => {
      const control = new FormControl('', Validators.required);
      const input = document.createElement('input');
      container.appendChild(input);
      const mapping: FormFieldMapping = { controlName: 'name', domSelector: '#name' };

      control.setValue('Ana');
      service.updateSingleControlDomState(control, nodeListOf(input), mapping, container, new Map());
      expect(input.value).toBe('Ana');
      expect(input.disabled).toBeFalse();

      control.markAsDirty();
      control.setValue('');
      service.updateSingleControlDomState(control, nodeListOf(input), mapping, container, new Map());
      expect(input.classList.contains('is-invalid')).toBeTrue();

      control.setValue('Ana');
      service.updateSingleControlDomState(control, nodeListOf(input), mapping, container, new Map());
      expect(input.classList.contains('is-valid')).toBeTrue();
      expect(input.classList.contains('is-invalid')).toBeFalse();
    });

    it('marca disabled=true y limpia las clases de validación cuando el control está deshabilitado', () => {
      const control = new FormControl('');
      const input = document.createElement('input');
      container.appendChild(input);
      control.disable();

      service.updateSingleControlDomState(control, nodeListOf(input), { controlName: 'x', domSelector: '#x' }, container, new Map());

      expect(input.disabled).toBeTrue();
      expect(input.classList.contains('disabled')).toBeTrue();
    });

    it('no hace nada si no hay elementos', () => {
      const control = new FormControl('x');
      expect(() =>
        service.updateSingleControlDomState(control, nodeListOf(), { controlName: 'x', domSelector: '#x' }, container, new Map())
      ).not.toThrow();
    });
  });

  describe('mensajes de error (updateErrorMessages vía updateSingleControlDomState)', () => {
    let control: FormControl;
    let errorEl: HTMLElement;
    let mapping: FormFieldMapping;

    beforeEach(() => {
      control = new FormControl('', [Validators.required, Validators.email]);
      const input = document.createElement('input');
      errorEl = document.createElement('span');
      container.appendChild(input);
      container.appendChild(errorEl);
      mapping = { controlName: 'mail', domSelector: '#mail', errorDisplaySelector: 'span' };

      service.updateSingleControlDomState(control, nodeListOf(input), mapping, container, new Map());
    });

    function trigger(control2: FormControl, mapping2: FormFieldMapping, input: HTMLElement) {
      service.updateSingleControlDomState(control2, nodeListOf(input), mapping2, container, new Map());
    }

    it('usa el mensaje específico del mapping si está configurado', () => {
      mapping.validatorConfig = [{ type: 'required', value: null, message: 'Correo obligatorio' }];
      control.markAsTouched();
      trigger(control, mapping, container.querySelector('input')!);

      expect(errorEl.textContent).toBe('Correo obligatorio');
    });

    it('usa el mensaje global de config si no hay uno específico', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: DYNAMIC_CONFIG, useValue: { defaultErrorMessages: { required: 'Mensaje global' } } }],
      });
      service = TestBed.inject(FormDomValueSyncService);

      control.markAsTouched();
      trigger(control, mapping, container.querySelector('input')!);

      expect(errorEl.textContent).toBe('Mensaje global');
    });

    it('cae al mensaje default del sistema si no hay config específica ni global', () => {
      control.setValue('bad-email');
      control.markAsTouched();
      trigger(control, mapping, container.querySelector('input')!);

      expect(errorEl.textContent).toBe('Formato de correo inválido.');
    });

    it('cae al mensaje genérico si el error no tiene default conocido', () => {
      control.setErrors({ unknownError: true });
      control.markAsTouched();
      trigger(control, mapping, container.querySelector('input')!);

      expect(errorEl.textContent).toBe('Entrada inválida.');
    });

    it('limpia el mensaje cuando el control vuelve a ser válido', () => {
      control.setValue('valid@test.com');
      trigger(control, mapping, container.querySelector('input')!);

      expect(errorEl.textContent).toBe('');
    });
  });
});
