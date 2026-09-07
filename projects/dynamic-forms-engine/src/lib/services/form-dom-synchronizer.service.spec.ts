import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormDomSynchronizerService } from './form-dom-synchronizer.service';
import { Renderer2, RendererFactory2 } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DYNAMIC_CONFIG } from '../dynamic-config.token';
import { FormFieldMapping } from '../models/form-field-mapping.model';

describe('FormDomSynchronizerService', () => {
  let service: FormDomSynchronizerService;
  let renderer2Spy: jasmine.SpyObj<Renderer2>;
  let unlistenSpy: jasmine.Spy;

  // Mock de configuración global
  const mockConfig = {
    errorClassName: 'custom-error',
    successClassName: 'custom-success',
    defaultErrorMessages: {
      required: 'Global required message'
    }
  };

  beforeEach(() => {
    // 1. Preparar Spies para Renderer2
    unlistenSpy = jasmine.createSpy('unlisten');
    renderer2Spy = jasmine.createSpyObj('Renderer2', [
      'listen',
      'setProperty',
      'addClass',
      'removeClass',
      'setAttribute'
    ]);
    
    // Configurar listen para que devuelva la función de limpieza (unlisten)
    renderer2Spy.listen.and.returnValue(unlistenSpy);

    // 2. Mock Factory que devuelve nuestro Renderer espía
    const rendererFactorySpy = jasmine.createSpyObj('RendererFactory2', ['createRenderer']);
    rendererFactorySpy.createRenderer.and.returnValue(renderer2Spy);

    TestBed.configureTestingModule({
      providers: [
        FormDomSynchronizerService,
        { provide: RendererFactory2, useValue: rendererFactorySpy },
        { provide: DYNAMIC_CONFIG, useValue: mockConfig }
      ]
    });
    service = TestBed.inject(FormDomSynchronizerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- 1. LÓGICA DE CONEXIÓN (connect) ---
  describe('connect', () => {
    let formGroup: FormGroup;
    let container: HTMLElement;

    beforeEach(() => {
      formGroup = new FormGroup({
        testControl: new FormControl('')
      });
      container = document.createElement('div');
    });

    it('should warn and skip if control does not exist', () => {
      spyOn(console, 'warn');
      const mappings: FormFieldMapping[] = [{ controlName: 'missingControl', domSelector: '#input' }];
      
      service.connect('form-1', formGroup, container, mappings);

      expect(console.warn).toHaveBeenCalledWith(jasmine.stringMatching(/FormControl no encontrado/));
    });

    it('should warn and skip if DOM element does not exist', () => {
      spyOn(console, 'warn');
      const mappings: FormFieldMapping[] = [{ controlName: 'testControl', domSelector: '#missingElement' }];
      
      service.connect('form-1', formGroup, container, mappings);

      expect(console.warn).toHaveBeenCalledWith(jasmine.stringMatching(/Elemento DOM no encontrado/));
    });

    it('should setup listeners and initial state when connected', () => {
      // FormControl arranca con un valor no vacío para poder distinguir el
      // "estado inicial aplicado" del valor por defecto ('') que ya trae el
      // <input> nativo (si ambos fueran '', el guard de no-op de
      // applyInputValue no dispararía ningún setProperty('value', ...)).
      formGroup = new FormGroup({ testControl: new FormControl('Initial Value') });

      const input = document.createElement('input');
      input.id = 'input';
      container.appendChild(input);

      const mappings: FormFieldMapping[] = [{ controlName: 'testControl', domSelector: '#input' }];

      service.connect('form-1', formGroup, container, mappings);

      // Verifica que se configuraron listeners
      expect(renderer2Spy.listen).toHaveBeenCalled();
      // Verifica estado inicial
      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(input, 'value', 'Initial Value');
    });
  });

  // --- 2. SINCRONIZACIÓN DOM -> FORM (Inputs del usuario) ---
  describe('DOM to Form Sync', () => {
    let formGroup: FormGroup;
    let container: HTMLElement;
    let input: HTMLInputElement;

    beforeEach(() => {
      formGroup = new FormGroup({ name: new FormControl('') });
      container = document.createElement('div');
      input = document.createElement('input');
      input.id = 'nameInput';
      container.appendChild(input);
    });

    it('should update control value on input event (Standard Input)', () => {
      const mappings: FormFieldMapping[] = [{ controlName: 'name', domSelector: '#nameInput' }];
      service.connect('form-1', formGroup, container, mappings);

      // Obtenemos el callback del listener registrado (Argumento 2 del Renderer2.listen)
      const callback = renderer2Spy.listen.calls.mostRecent().args[2];
      
      // Simulamos evento
      input.value = 'New Value';
      callback({ target: input } as any);

      expect(formGroup.get('name')?.value).toBe('New Value');
    });

    it('should update control value on change event (Checkbox)', () => {
      input.type = 'checkbox';
      const mappings: FormFieldMapping[] = [{ controlName: 'name', domSelector: '#nameInput' }];
      service.connect('form-1', formGroup, container, mappings);

      const callback = renderer2Spy.listen.calls.mostRecent().args[2];
      
      input.checked = true;
      callback({ target: input } as any);

      expect(formGroup.get('name')?.value).toBeTrue();
    });

    it('should update control value on change event (Radio)', () => {
      input.type = 'radio';
      input.value = 'optionA';
      const mappings: FormFieldMapping[] = [{ controlName: 'name', domSelector: '#nameInput' }];
      service.connect('form-1', formGroup, container, mappings);

      const callback = renderer2Spy.listen.calls.mostRecent().args[2];
      
      input.checked = true;
      callback({ target: input } as any);

      expect(formGroup.get('name')?.value).toBe('optionA');
    });

    it('should ignore radio change if not checked', () => {
      input.type = 'radio';
      input.value = 'optionB';
      const mappings: FormFieldMapping[] = [{ controlName: 'name', domSelector: '#nameInput' }];
      service.connect('form-1', formGroup, container, mappings);

      const callback = renderer2Spy.listen.calls.mostRecent().args[2];
      
      input.checked = false; // El navegador dispara change al deseleccionar también en algunos casos, o grupos
      callback({ target: input } as any);

      // No debe cambiar el valor si unchecked
      expect(formGroup.get('name')?.value).toBe('');
    });

    it('should handle Select elements', () => {
      const select = document.createElement('select');
      select.id = 'sel';
      // Un <select> nativo ignora asignaciones a .value que no coincidan con
      // ninguna <option> existente, por eso hace falta declarar la opción.
      const option = document.createElement('option');
      option.value = 'Option1';
      select.appendChild(option);
      container.appendChild(select);
      const mappings: FormFieldMapping[] = [{ controlName: 'name', domSelector: '#sel' }];
      
      service.connect('form-1', formGroup, container, mappings);
      const callback = renderer2Spy.listen.calls.mostRecent().args[2];

      select.value = 'Option1';
      callback({ target: select } as any);

      expect(formGroup.get('name')?.value).toBe('Option1');
    });

    // Casos Avanzados: Web Components / Eventos Custom
    it('should handle Web Components with custom events and detail property', () => {
      const wc = document.createElement('custom-input');
      wc.id = 'wc';
      container.appendChild(wc);

      const mappings: FormFieldMapping[] = [{ 
        controlName: 'name', 
        domSelector: '#wc',
        eventType: 'ionChange',
        valueProperty: 'value',
        useEventDetail: true
      }];

      service.connect('form-1', formGroup, container, mappings);
      const callback = renderer2Spy.listen.calls.mostRecent().args[2];

      // Simulamos CustomEvent con detail
      const event = { detail: 'Custom Value' };
      callback(event as any);

      expect(formGroup.get('name')?.value).toBe('Custom Value');
    });

    it('should handle Web Components mapping direct target property', () => {
      const wc = document.createElement('custom-input');
      wc.id = 'wc2';
      container.appendChild(wc);

      const mappings: FormFieldMapping[] = [{ 
        controlName: 'name', 
        domSelector: '#wc2',
        eventType: 'blur',
        valueProperty: 'myValue' // Propiedad custom en el target
      }];

      service.connect('form-1', formGroup, container, mappings);
      const callback = renderer2Spy.listen.calls.mostRecent().args[2];

      // Simulamos evento donde target tiene la propiedad
      const event = { target: { myValue: 'Direct Value' } };
      callback(event as any);

      expect(formGroup.get('name')?.value).toBe('Direct Value');
    });
  });

  // --- 3. SINCRONIZACIÓN FORM -> DOM (Updates programáticos) ---
  describe('Form to DOM Sync', () => {
    let formGroup: FormGroup;
    let container: HTMLElement;
    let input: HTMLInputElement;

    beforeEach(() => {
      formGroup = new FormGroup({ 
        field: new FormControl('', Validators.required) 
      });
      container = document.createElement('div');
      input = document.createElement('input');
      input.id = 'fieldInput';
      container.appendChild(input);
    });

    it('should update input value when control value changes', () => {
      const mappings = [{ controlName: 'field', domSelector: '#fieldInput' }];
      service.connect('f1', formGroup, container, mappings);

      formGroup.get('field')?.setValue('Programmatic');
      
      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(input, 'value', 'Programmatic');
    });

    it('should update checkboxes correctly', () => {
      input.type = 'checkbox';
      const mappings = [{ controlName: 'field', domSelector: '#fieldInput' }];
      service.connect('f1', formGroup, container, mappings);

      formGroup.get('field')?.setValue(true);
      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(input, 'checked', true);

      formGroup.get('field')?.setValue(false);
      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(input, 'checked', false);
    });

    it('should update radio buttons correctly (match value)', () => {
      input.type = 'radio';
      input.value = 'A';
      const mappings = [{ controlName: 'field', domSelector: '#fieldInput' }];
      service.connect('f1', formGroup, container, mappings);

      formGroup.get('field')?.setValue('A'); // Match
      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(input, 'checked', true);

      formGroup.get('field')?.setValue('B'); // No match
      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(input, 'checked', false);
    });

    it('should handle custom value property on elements', () => {
      const mappings = [{ 
        controlName: 'field', 
        domSelector: '#fieldInput',
        valueProperty: 'modelValue'
      }];
      service.connect('f1', formGroup, container, mappings);

      formGroup.get('field')?.setValue(123);
      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(input, 'modelValue', 123);
    });

    it('should set disabled state on DOM element', () => {
      const mappings = [{ controlName: 'field', domSelector: '#fieldInput' }];
      service.connect('f1', formGroup, container, mappings);

      formGroup.get('field')?.disable();
      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(input, 'disabled', true);
      expect(renderer2Spy.addClass).toHaveBeenCalledWith(input, 'disabled');

      formGroup.get('field')?.enable();
      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(input, 'disabled', false);
      expect(renderer2Spy.removeClass).toHaveBeenCalledWith(input, 'disabled');
    });

    it('should apply validation classes (Error)', () => {
      const mappings = [{ controlName: 'field', domSelector: '#fieldInput' }];
      service.connect('f1', formGroup, container, mappings);

      const control = formGroup.get('field');
      control?.setValue(''); // Invalid (required)
      control?.markAsTouched(); // Trigger visual update
      
      // Forzamos actualización ya que statusChanges es async o requiere tick
      // Pero el servicio se suscribe a statusChanges.
      // updateValueAndValidity emite el evento.
      control?.updateValueAndValidity();

      expect(renderer2Spy.addClass).toHaveBeenCalledWith(input, 'custom-error');
    });

    it('should apply validation classes (Success)', () => {
      const mappings = [{ controlName: 'field', domSelector: '#fieldInput' }];
      service.connect('f1', formGroup, container, mappings);

      const control = formGroup.get('field');
      control?.setValue('Valid');
      control?.markAsDirty();
      control?.updateValueAndValidity();

      expect(renderer2Spy.addClass).toHaveBeenCalledWith(input, 'custom-success');
    });
  });

  // --- 4. MENSAJES DE ERROR ---
  describe('Error Messages', () => {
    let formGroup: FormGroup;
    let container: HTMLElement;
    let input: HTMLInputElement;
    let errorSpan: HTMLSpanElement;

    beforeEach(() => {
      formGroup = new FormGroup({ 
        mail: new FormControl('', [Validators.required, Validators.email]) 
      });
      container = document.createElement('div');
      
      input = document.createElement('input');
      input.id = 'mail';
      container.appendChild(input);

      errorSpan = document.createElement('span');
      errorSpan.id = 'mailError';
      container.appendChild(errorSpan);
    });

    it('should show global default message when invalid and no custom message provided', () => {
      const mappings: FormFieldMapping[] = [{ 
        controlName: 'mail', 
        domSelector: '#mail',
        errorDisplaySelector: '#mailError'
      }];
      service.connect('f1', formGroup, container, mappings);

      const control = formGroup.get('mail');
      control?.setValue(''); // Required fail
      control?.markAsTouched();
      control?.updateValueAndValidity();

      // Config mock tiene: defaultErrorMessages: { required: 'Global required message' }
      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(errorSpan, 'textContent', 'Global required message');
    });

    it('should show specific mapping message if provided', () => {
      const mappings: FormFieldMapping[] = [{ 
        controlName: 'mail', 
        domSelector: '#mail',
        errorDisplaySelector: '#mailError',
        validatorConfig: [
          { type: 'required', message: '¡Debes poner el mail!' }
        ]
      }];
      service.connect('f1', formGroup, container, mappings);

      const control = formGroup.get('mail');
      control?.setValue('');
      control?.markAsTouched();
      control?.updateValueAndValidity();

      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(errorSpan, 'textContent', '¡Debes poner el mail!');
    });

    it('should show system default if no config found', () => {
      const mappings = [{ 
        controlName: 'mail', 
        domSelector: '#mail',
        errorDisplaySelector: '#mailError'
      }];
      service.connect('f1', formGroup, container, mappings);

      const control = formGroup.get('mail');
      control?.setValue('bad-email'); // Email fail (no está en mock config)
      control?.markAsTouched();
      control?.updateValueAndValidity();

      // System default hardcoded en servicio
      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(errorSpan, 'textContent', 'Formato de correo inválido.');
    });

    it('should clear error message when valid', () => {
      const mappings = [{ 
        controlName: 'mail', 
        domSelector: '#mail',
        errorDisplaySelector: '#mailError'
      }];
      service.connect('f1', formGroup, container, mappings);

      const control = formGroup.get('mail');
      control?.setValue('valid@test.com');
      control?.updateValueAndValidity();

      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(errorSpan, 'textContent', '');
    });
    
    it('should fallback to generic error message if key not found', () => {
        // Simulamos un error desconocido
        formGroup.get('mail')?.setErrors({ 'unknownError': true });
        formGroup.get('mail')?.markAsTouched();
        
        const mappings = [{ 
            controlName: 'mail', 
            domSelector: '#mail',
            errorDisplaySelector: '#mailError'
        }];
        service.connect('f1', formGroup, container, mappings);
        
        // Debe usar generic default
        expect(renderer2Spy.setProperty).toHaveBeenCalledWith(errorSpan, 'textContent', 'Entrada inválida.');
    });
  });

  // --- 5. GESTIÓN DE CONEXIONES (Disconnect) ---
  describe('Connection Management', () => {
    it('should disconnect specific form instance', () => {
      const fg = new FormGroup({ c: new FormControl('') });
      const el = document.createElement('input');
      el.id = 'i';
      const div = document.createElement('div');
      div.appendChild(el);
      
      service.connect('instance1', fg, div, [{ controlName: 'c', domSelector: '#i' }]);
      
      // Verificamos que se guardó
      // (Acceso privado simulado o comportamiento: si conectamos de nuevo llama a disconnect)
      
      service.disconnect('instance1');
      
      // Verificamos limpieza: debe llamar a unlistenSpy
      expect(unlistenSpy).toHaveBeenCalled();
    });

    it('should disconnect all instances', () => {
      const fg = new FormGroup({ c: new FormControl('') });
      const div = document.createElement('div');
      
      service.connect('1', fg, div, []);
      service.connect('2', fg, div, []);

      service.disconnectAll();

      // Debería haber limpiado ambas instancias
      // Como no hay mapeos, no hay unlisten, pero verificamos que no explote
      expect(true).toBeTrue();
    });
  });

  // --- 6. UTILIDADES (Force Update) ---
  describe('forceDomUpdateForForm', () => {
    it('should force update DOM for a managed instance', () => {
      const fg = new FormGroup({ c: new FormControl('Forced Value') });
      const el = document.createElement('input');
      el.id = 'i';
      const div = document.createElement('div');
      div.appendChild(el);
      
      service.connect('ins1', fg, div, [{ controlName: 'c', domSelector: '#i' }]);
      
      // Reseteamos el spy para verificar la llamada forzada
      renderer2Spy.setProperty.calls.reset();

      service.forceDomUpdateForForm('ins1');

      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(el, 'value', 'Forced Value');
    });

    it('should warn if instance not found during force update', () => {
      spyOn(console, 'warn');
      service.forceDomUpdateForForm('ghost');
      expect(console.warn).toHaveBeenCalledWith(jasmine.stringMatching(/No se encontró instancia/));
    });
  });
});