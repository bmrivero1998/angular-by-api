import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DomInteractionsService, DomInteractionsContext } from './dom-interactions.service';

describe('DomInteractionsService', () => {
  let service: DomInteractionsService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DomInteractionsService);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => container.remove());

  function ctx(overrides: Partial<DomInteractionsContext> = {}): DomInteractionsContext {
    return {
      container,
      dynamicForm: new FormGroup({}),
      formMappings: [],
      isForm: false,
      formId: 'form-1',
      contentId: 'content-1',
      ...overrides,
    };
  }

  describe('setupFormSubmitPrevention', () => {
    it('previene el submit nativo y delega en el callback', () => {
      const form = document.createElement('form');
      container.appendChild(form);
      const onSubmit = jasmine.createSpy('onSubmit');

      service.setupFormSubmitPrevention(ctx(), onSubmit);

      const event = new Event('submit', { cancelable: true });
      form.dispatchEvent(event);

      expect(event.defaultPrevented).toBeTrue();
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  describe('setupActionClickListeners', () => {
    it('emite la acción cuando se hace click en un botón con data-dynamic-action', () => {
      const button = document.createElement('button');
      button.setAttribute('data-dynamic-action', 'delete-item');
      container.appendChild(button);
      const onAction = jasmine.createSpy('onAction');

      service.setupActionClickListeners(ctx({ formId: 'f1' }), onAction);
      button.click();

      expect(onAction).toHaveBeenCalledWith(jasmine.objectContaining({ action: 'delete-item', formId: 'f1' }));
    });

    it('ignora clicks fuera de un botón con data-dynamic-action', () => {
      const div = document.createElement('div');
      container.appendChild(div);
      const onAction = jasmine.createSpy('onAction');

      service.setupActionClickListeners(ctx(), onAction);
      div.click();

      expect(onAction).not.toHaveBeenCalled();
    });
  });

  describe('setupKeyFiltering', () => {
    it('bloquea teclas no numéricas para keyFilter: int', () => {
      const input = document.createElement('input');
      input.name = 'phone';
      container.appendChild(input);

      service.setupKeyFiltering(ctx({ formMappings: [{ controlName: 'phone', domSelector: '#phone', keyFilter: 'int' }] }));

      // El listener está delegado en el container, así que el evento debe
      // poder burbujear (bubbles:true) para que lo capture — a diferencia de
      // .click(), un KeyboardEvent construido a mano no burbujea por default.
      const badEvent = new KeyboardEvent('keydown', { key: 'A', cancelable: true, bubbles: true });
      input.dispatchEvent(badEvent);
      expect(badEvent.defaultPrevented).toBeTrue();

      const goodEvent = new KeyboardEvent('keydown', { key: '5', cancelable: true, bubbles: true });
      input.dispatchEvent(goodEvent);
      expect(goodEvent.defaultPrevented).toBeFalse();
    });

    it('bloquea un segundo punto decimal', () => {
      const input = document.createElement('input');
      input.name = 'price';
      input.value = '10.5';
      container.appendChild(input);

      service.setupKeyFiltering(ctx({ formMappings: [{ controlName: 'price', domSelector: '#price', keyFilter: 'decimal' }] }));

      const event = new KeyboardEvent('keydown', { key: '.', cancelable: true, bubbles: true });
      input.dispatchEvent(event);

      expect(event.defaultPrevented).toBeTrue();
    });
  });

  describe('setupAutoFormatting', () => {
    it('aplica la máscara configurada y sincroniza el control con el valor limpio', fakeAsync(() => {
      const dynamicForm = new FormGroup({ card: new FormControl('') });
      const input = document.createElement('input');
      input.name = 'card';
      container.appendChild(input);

      service.setupAutoFormatting(
        ctx({ dynamicForm, formMappings: [{ controlName: 'card', domSelector: '#card', inputMask: '9999-9999' }] }),
        (fn, ms) => setTimeout(fn, ms)
      );

      input.value = '12345678';
      Object.defineProperty(input, 'selectionStart', { value: 8, configurable: true });
      // El listener está delegado en el container: el evento nativo 'input'
      // sí burbujea en el navegador real, pero uno construido a mano no,
      // salvo que se indique bubbles:true explícitamente.
      input.dispatchEvent(new Event('input', { bubbles: true }));
      tick();

      expect(input.value).toBe('1234-5678');
      expect(dynamicForm.get('card')?.value).toBe('12345678');
    }));
  });

  describe('setupNavigationLinks', () => {
    it('hace scroll al top con href="#" sin llamar a onError', () => {
      const link = document.createElement('a');
      link.href = '#';
      container.appendChild(link);
      spyOn(window, 'scrollTo');
      const onAction = jasmine.createSpy('onAction');
      const onError = jasmine.createSpy('onError');

      service.setupNavigationLinks(ctx(), 0, onAction, onError);
      link.click();

      expect(window.scrollTo as jasmine.Spy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
      expect(onError).not.toHaveBeenCalled();
      expect(onAction).toHaveBeenCalledWith(jasmine.objectContaining({ action: 'navigate', payload: { route: '#', scrolled: true } }));
    });

    it('reporta error si la sección ancla no existe', () => {
      const link = document.createElement('a');
      link.href = '#no-existe-1234';
      container.appendChild(link);
      const onAction = jasmine.createSpy('onAction');
      const onError = jasmine.createSpy('onError');

      service.setupNavigationLinks(ctx(), 0, onAction, onError);
      link.click();

      expect(onError).toHaveBeenCalledWith(jasmine.stringMatching(/no-existe-1234/));
    });

    it('delega rutas normales al callback de acción sin tocar el scroll', () => {
      const link = document.createElement('a');
      link.href = '/some/route';
      container.appendChild(link);
      spyOn(window, 'scrollTo');
      const onAction = jasmine.createSpy('onAction');

      service.setupNavigationLinks(ctx(), 0, onAction, jasmine.createSpy());
      link.click();

      expect(window.scrollTo as jasmine.Spy).not.toHaveBeenCalled();
      expect(onAction).toHaveBeenCalledWith(jasmine.objectContaining({ payload: { route: '/some/route', scrolled: false } }));
    });
  });

  describe('setupFileInputs', () => {
    it('emite onFileSelected cuando el archivo pasa la validación', () => {
      const dynamicForm = new FormGroup({ avatar: new FormControl<File | null>(null) });
      const input = document.createElement('input');
      input.type = 'file';
      input.id = 'avatar';
      container.appendChild(input);
      const onFileSelected = jasmine.createSpy('onFileSelected');
      const onControlError = jasmine.createSpy('onControlError');

      service.setupFileInputs(
        ctx({ dynamicForm, formMappings: [{ controlName: 'avatar', domSelector: '#avatar', fileUploadConfig: { maxSize: 1000 } }] }),
        onFileSelected,
        onControlError
      );

      const file = new File(['x'], 'a.png');
      Object.defineProperty(input, 'files', { value: [file] });
      input.dispatchEvent(new Event('change'));

      expect(dynamicForm.get('avatar')?.value).toBe(file);
      expect(onFileSelected).toHaveBeenCalled();
      expect(onControlError).not.toHaveBeenCalled();
    });

    it('reporta error de control y no actualiza el form si el archivo excede maxSize', () => {
      const dynamicForm = new FormGroup({ avatar: new FormControl<File | null>(null) });
      const input = document.createElement('input');
      input.type = 'file';
      input.id = 'avatar';
      container.appendChild(input);
      const onFileSelected = jasmine.createSpy('onFileSelected');
      const onControlError = jasmine.createSpy('onControlError');

      service.setupFileInputs(
        ctx({ dynamicForm, formMappings: [{ controlName: 'avatar', domSelector: '#avatar', fileUploadConfig: { maxSize: 1 } }] }),
        onFileSelected,
        onControlError
      );

      const largeFile = new File(['a'.repeat(200)], 'big.png');
      Object.defineProperty(input, 'files', { value: [largeFile] });
      input.dispatchEvent(new Event('change'));

      expect(dynamicForm.get('avatar')?.value).toBeNull();
      expect(onControlError).toHaveBeenCalled();
      expect(onFileSelected).not.toHaveBeenCalled();
    });
  });

  describe('setupErrorVisualsOnInputs', () => {
    it('agrega/quita clases de error y éxito según el estado del control', () => {
      const control = new FormControl('', Validators.required);
      const input = document.createElement('input');
      input.id = 'name';
      container.appendChild(input);
      const dynamicForm = new FormGroup({ name: control });

      service.setupErrorVisualsOnInputs(
        ctx({ dynamicForm, formMappings: [{ controlName: 'name', domSelector: '#name' }] }),
        ['is-invalid'],
        ['is-valid']
      );

      control.markAsTouched();
      control.updateValueAndValidity();
      expect(input.classList.contains('is-invalid')).toBeTrue();

      control.setValue('Ana');
      control.updateValueAndValidity();
      expect(input.classList.contains('is-valid')).toBeTrue();
      expect(input.classList.contains('is-invalid')).toBeFalse();
    });
  });

  describe('syncDomAttributes', () => {
    it('agrega el atributo name si falta y autocomplete=off si hay máscara', () => {
      const input = document.createElement('input');
      container.appendChild(input);

      service.syncDomAttributes(ctx({ formMappings: [{ controlName: 'card', domSelector: 'input', inputMask: '9999' }] }));

      expect(input.getAttribute('name')).toBe('card');
      expect(input.getAttribute('autocomplete')).toBe('off');
    });

    it('no sobrescribe un name ya existente', () => {
      const input = document.createElement('input');
      input.setAttribute('name', 'original');
      container.appendChild(input);

      service.syncDomAttributes(ctx({ formMappings: [{ controlName: 'card', domSelector: 'input' }] }));

      expect(input.getAttribute('name')).toBe('original');
    });
  });

  describe('processIdDomBindings', () => {
    it('actualiza el textContent del elemento indicado', () => {
      const span = document.createElement('span');
      span.id = 'target';
      container.appendChild(span);

      service.processIdDomBindings(container, [{ selector: '#target', value: 'Hola' }], jasmine.createSpy());

      expect(span.textContent).toBe('Hola');
    });

    it('reporta error si el selector no existe', () => {
      const onError = jasmine.createSpy('onError');
      service.processIdDomBindings(container, [{ selector: '#no-existe', value: 'x' }], onError);
      expect(onError).toHaveBeenCalledWith(jasmine.stringMatching(/no-existe/));
    });

    it('no hace nada si no hay container o dataBindings', () => {
      expect(() => service.processIdDomBindings(undefined, undefined, jasmine.createSpy())).not.toThrow();
    });
  });
});
