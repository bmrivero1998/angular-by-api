import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { DynamicViewerComponent } from './dynamic-viewer.component';
import { ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DynamicInyectCssService } from './services/dynamic-inyect-css.service';
import { FormDomSynchronizerService } from './services/form-dom-synchronizer.service';
import { DynamicValidationService } from './services/dynamic-validation.service';
import { ExternalLibsCleanupService } from './services/external-libs-cleanup.service';
import { DomInteractionsService } from './services/dom-interactions.service';
import { DYNAMIC_CONFIG } from './dynamic-config.token';

/**
 * Nota de arquitectura: DynamicViewerComponent es un orquestador que delega
 * en servicios especializados (FormDomSynchronizerService para el binding
 * DOM<->FormGroup, DomInteractionsService para el cableado de listeners
 * sobre el HTML inyectado). Este spec verifica lo que el COMPONENTE es
 * responsable de hacer: construir el form, su ciclo de vida y que delega
 * correctamente en esos servicios — no la lógica interna de cada servicio
 * (eso vive en el spec de cada uno).
 *
 * No se sobreescribe RendererFactory2/Renderer2: usar un Renderer2 falso a
 * nivel de TestBed rompe la creación del propio fixture (Angular necesita
 * `renderer.selectRootElement` para montar el componente bajo prueba), así
 * que se deja el renderer real y se asertan efectos reales sobre el DOM.
 */
describe('DynamicViewerComponent', () => {
  let component: DynamicViewerComponent;
  let fixture: ComponentFixture<DynamicViewerComponent>;

  let cssInjectorSpy: jasmine.SpyObj<DynamicInyectCssService>;
  let synchronizerSpy: jasmine.SpyObj<FormDomSynchronizerService>;
  let validationServiceSpy: jasmine.SpyObj<DynamicValidationService>;
  let externalLibsCleanupSpy: jasmine.SpyObj<ExternalLibsCleanupService>;
  let domInteractionsSpy: jasmine.SpyObj<DomInteractionsService>;

  /**
   * Pasa por el pipeline REAL de sanitización (DOMPurify + DomSanitizer real,
   * sin mockear) para que el HTML resultante llegue marcado como "trusted" y
   * el binding `[innerHTML]` del template no lo recorte con el sanitizador
   * por defecto de Angular (que sí descarta contenido no confiable, p. ej.
   * <form>). `setInput` dispara ngOnChanges igual que un binding real.
   */
  function setInjectedHtml(html: string): void {
    fixture.componentRef.setInput('htmlContentString', html);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    cssInjectorSpy = jasmine.createSpyObj('DynamicInyectCssService', ['injectCss', 'removeCss', 'generateStyleId']);
    cssInjectorSpy.generateStyleId.and.returnValue('dynamic-style-test');

    synchronizerSpy = jasmine.createSpyObj('FormDomSynchronizerService', ['connect', 'disconnect']);
    validationServiceSpy = jasmine.createSpyObj('DynamicValidationService', ['createAsyncValidator']);
    externalLibsCleanupSpy = jasmine.createSpyObj('ExternalLibsCleanupService', ['cleanupAll']);

    domInteractionsSpy = jasmine.createSpyObj('DomInteractionsService', [
      'setupFormSubmitPrevention',
      'setupActionClickListeners',
      'setupKeyFiltering',
      'setupAutoFormatting',
      'setupNavigationLinks',
      'setupFileInputs',
      'setupErrorVisualsOnInputs',
      'syncDomAttributes',
      'processIdDomBindings',
    ]);
    domInteractionsSpy.setupFormSubmitPrevention.and.returnValue([]);
    domInteractionsSpy.setupActionClickListeners.and.returnValue([]);
    domInteractionsSpy.setupKeyFiltering.and.returnValue([]);
    domInteractionsSpy.setupAutoFormatting.and.returnValue([]);
    domInteractionsSpy.setupNavigationLinks.and.returnValue([]);
    domInteractionsSpy.setupFileInputs.and.returnValue([]);
    domInteractionsSpy.setupErrorVisualsOnInputs.and.returnValue(new Subscription());

    await TestBed.configureTestingModule({
      imports: [DynamicViewerComponent, ReactiveFormsModule],
      providers: [
        { provide: DynamicInyectCssService, useValue: cssInjectorSpy },
        { provide: FormDomSynchronizerService, useValue: synchronizerSpy },
        { provide: DynamicValidationService, useValue: validationServiceSpy },
        { provide: ExternalLibsCleanupService, useValue: externalLibsCleanupSpy },
        { provide: DomInteractionsService, useValue: domInteractionsSpy },
        { provide: DYNAMIC_CONFIG, useValue: { errorClassName: 'is-invalid', successClassName: 'is-valid' } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DynamicViewerComponent);
    component = fixture.componentInstance;
    component.contentId = 'unit-test-viewer';
  });

  it('debería inicializarse correctamente', () => {
    expect(component).toBeTruthy();
  });

  describe('Gestión de Formularios y Validadores', () => {
    it('debería construir un FormGroup basado en mappings', () => {
      component.formMappings = [
        {
          controlName: 'email',
          domSelector: '#email',
          validatorConfig: [
            { type: 'email', value: null, message: 'Email inválido' },
            { type: 'required', value: null, message: 'Requerido' },
          ],
        },
        {
          controlName: 'age',
          domSelector: '#age',
          validatorConfig: [{ type: 'min', value: 18, message: 'Mínimo 18' }],
        },
      ];
      fixture.detectChanges();

      const form = component.dynamicForm;
      expect(form.contains('email')).toBeTrue();
      expect(form.contains('age')).toBeTrue();

      form.get('email')?.setValue('incorrecto');
      expect(form.get('email')?.invalid).toBeTrue();

      form.get('age')?.setValue(10);
      expect(form.get('age')?.invalid).toBeTrue();
    });

    it('debería emitir error ante un validador no reconocido', () => {
      spyOn(component.componentError, 'emit');
      component.formMappings = [
        { controlName: 'x', domSelector: '#x', validatorConfig: [{ type: 'unknown', value: 1, message: 'Error' }] },
      ];
      fixture.detectChanges();
      expect(component.componentError.emit).toHaveBeenCalledWith(jasmine.stringMatching(/Validador no reconocido/));
    });

    it('debería soportar validadores de coincidencia (matchValue)', () => {
      component.formMappings = [
        { controlName: 'pass', domSelector: '#p', validatorConfig: [{ type: 'matchValue', value: 'secret', message: 'No coincide' }] },
      ];
      fixture.detectChanges();
      const ctrl = component.dynamicForm.get('pass');
      ctrl?.setValue('wrong');
      expect(ctrl?.errors?.['matchValue']).toBeDefined();
      ctrl?.setValue('secret');
      expect(ctrl?.valid).toBeTrue();
    });

    it('debería usar createAsyncValidator del servicio cuando el mapping trae asyncValidator', () => {
      validationServiceSpy.createAsyncValidator.and.returnValue(() => Promise.resolve(null));
      component.formMappings = [
        {
          controlName: 'username',
          domSelector: '#u',
          asyncValidator: { endpoint: '/validate-user', method: 'GET', errorKey: 'userTaken', message: 'Ya existe' },
        },
      ];
      fixture.detectChanges();

      expect(validationServiceSpy.createAsyncValidator).toHaveBeenCalledWith(component.formMappings![0].asyncValidator!);
    });
  });

  describe('triggerSubmit', () => {
    it('emite formSubmitted cuando el formulario es válido', () => {
      component.formMappings = [{ controlName: 'name', domSelector: '#name' }];
      fixture.detectChanges();
      spyOn(component.formSubmitted, 'emit');
      component.formId = 'my-form';
      component.dynamicForm.get('name')?.setValue('Ana');

      component.triggerSubmit();

      expect(component.formSubmitted.emit).toHaveBeenCalledWith({ formId: 'my-form', data: { name: 'Ana' } });
    });

    it('emite componentError y no formSubmitted cuando el formulario es inválido', () => {
      component.formMappings = [{ controlName: 'req', domSelector: '#req', validatorConfig: [{ type: 'required', value: null, message: 'x' }] }];
      fixture.detectChanges();
      spyOn(component.formSubmitted, 'emit');
      spyOn(component.componentError, 'emit');

      component.triggerSubmit();

      expect(component.formSubmitted.emit).not.toHaveBeenCalled();
      expect(component.componentError.emit).toHaveBeenCalledWith(jasmine.stringMatching(/inválido/));
    });
  });

  describe('API pública de manipulación de formulario', () => {
    beforeEach(() => {
      component.formMappings = [
        { controlName: 'name', domSelector: '#name', defaultValue: 'default-name' },
        { controlName: 'age', domSelector: '#age' },
      ];
      fixture.detectChanges();
    });

    it('disableFormField / enableFormField', () => {
      component.disableFormField('name');
      expect(component.dynamicForm.get('name')?.disabled).toBeTrue();
      component.enableFormField('name');
      expect(component.dynamicForm.get('name')?.disabled).toBeFalse();
    });

    it('getFormValues y setFormValue', () => {
      component.setFormValue('name', 'Nuevo');
      expect(component.getFormValues()).toEqual(jasmine.objectContaining({ name: 'Nuevo' }));
    });

    it('resetForm sin argumentos vuelve a los defaultValue', () => {
      component.setFormValue('name', 'Otro');
      component.resetForm();
      expect(component.dynamicForm.get('name')?.value).toBe('default-name');
    });

    it('resetForm con argumentos usa esos valores', () => {
      component.resetForm({ name: 'Forzado' });
      expect(component.dynamicForm.get('name')?.value).toBe('Forzado');
    });

    it('getControlStatus refleja el estado real del control', () => {
      component.dynamicForm.get('name')?.setValue('X');
      const status = component.getControlStatus('name');
      expect(status.valid).toBeTrue();
    });

    it('getControlStatus de un control inexistente regresa un estado inválido seguro', () => {
      const status = component.getControlStatus('no-existe');
      expect(status).toEqual({ valid: false, invalid: true, touched: false, dirty: false, errors: null });
    });

    it('validateControl marca el control como touched', () => {
      component.validateControl('name');
      expect(component.dynamicForm.get('name')?.touched).toBeTrue();
    });
  });

  describe('Conexión con contenido inyectado', () => {
    beforeEach(() => {
      component.formMappings = [{ controlName: 'name', domSelector: '#test-input' }];
      setInjectedHtml('<form><input id="test-input" name="test"></form>');
    });

    it('conecta el synchronizer con el form, el container y los mappings', () => {
      expect(synchronizerSpy.connect).toHaveBeenCalledWith(
        component.formId,
        component.dynamicForm,
        component.htmlContainerRef.nativeElement,
        component.formMappings!
      );
    });

    it('cablea los listeners de interacción a través de DomInteractionsService', () => {
      expect(domInteractionsSpy.setupFormSubmitPrevention).toHaveBeenCalled();
      expect(domInteractionsSpy.setupErrorVisualsOnInputs).toHaveBeenCalled();
      expect(domInteractionsSpy.setupKeyFiltering).toHaveBeenCalled();
      expect(domInteractionsSpy.setupAutoFormatting).toHaveBeenCalled();
      expect(domInteractionsSpy.syncDomAttributes).toHaveBeenCalled();
      expect(domInteractionsSpy.setupFileInputs).toHaveBeenCalled();
      expect(domInteractionsSpy.setupNavigationLinks).toHaveBeenCalled();
      expect(domInteractionsSpy.setupActionClickListeners).toHaveBeenCalled();
    });

    it('delega el submit del formulario inyectado a triggerSubmit', () => {
      spyOn(component, 'triggerSubmit');
      const onSubmit = domInteractionsSpy.setupFormSubmitPrevention.calls.mostRecent().args[1];

      onSubmit();

      expect(component.triggerSubmit).toHaveBeenCalled();
    });

    it('reemite como actionClicked lo que reporta DomInteractionsService', () => {
      spyOn(component.actionClicked, 'emit');
      const onAction = domInteractionsSpy.setupActionClickListeners.calls.mostRecent().args[1];

      onAction({ action: 'delete-item' } as any);

      expect(component.actionClicked.emit).toHaveBeenCalledWith({ action: 'delete-item' } as any);
    });

    it('reemite como fileSelected lo que reporta DomInteractionsService', () => {
      spyOn(component.fileSelected, 'emit');
      const onFileSelected = domInteractionsSpy.setupFileInputs.calls.mostRecent().args[1];

      onFileSelected({ controlName: 'avatar', file: new File([''], 'a.png'), formId: 'unit-test-viewer' });

      expect(component.fileSelected.emit).toHaveBeenCalled();
    });

    it('procesa dataBindings a través de DomInteractionsService al cambiar el input', fakeAsync(() => {
      component.dataBindings = [{ selector: '#target-span', value: 'Hello World' }];
      component.ngOnChanges({ dataBindings: new SimpleChange(null, component.dataBindings, false) });

      tick();

      expect(domInteractionsSpy.processIdDomBindings).toHaveBeenCalledWith(
        component.htmlContainerRef.nativeElement,
        component.dataBindings,
        jasmine.any(Function)
      );
    }));
  });

  describe('Estados de Botones (disableWhen)', () => {
    // Se usa el ButtonStateService REAL (no mockeado): es lógica pura y
    // verificar el comportamiento real de punta a punta (form -> botón
    // deshabilitado en el DOM) vale más que verificar una llamada a un spy.
    function renderWithButton(buttonHtml: string): void {
      setInjectedHtml(`<form>${buttonHtml}</form>`);
    }

    it('deshabilita el botón cuando el formulario es inválido (formIsInvalid)', () => {
      component.buttonConfigs = [{ selector: '#submit-btn', disableWhen: 'formIsInvalid' }];
      component.formMappings = [{ controlName: 'req', domSelector: '#req', validatorConfig: [{ type: 'required', value: null, message: 'Requerido' }] }];
      // OJO: id="submit" dentro de un <form> es DOM clobbering (colisiona con
      // form.submit()) y DOMPurify lo descarta silenciosamente por seguridad
      // — por eso el selector usa "submit-btn", no "submit".
      renderWithButton('<button id="submit-btn"></button>');

      component.dynamicForm.get('req')?.setValue('');
      (component as any).updateButtonStates();

      const btn = component.htmlContainerRef.nativeElement.querySelector('#submit-btn') as HTMLButtonElement;
      expect(btn.disabled).toBeTrue();
    });

    it('evalúa condiciones de control específicas (controlIsInvalid:campo)', () => {
      component.buttonConfigs = [{ selector: '#btn', disableWhen: 'controlIsInvalid:email' }];
      component.formMappings = [{ controlName: 'email', domSelector: '#e', validatorConfig: [{ type: 'email', value: null, message: 'Inválido' }] }];
      renderWithButton('<button id="btn"></button>');

      component.dynamicForm.get('email')?.setValue('not-an-email');
      (component as any).updateButtonStates();

      const btn = component.htmlContainerRef.nativeElement.querySelector('#btn') as HTMLButtonElement;
      expect(btn.disabled).toBeTrue();
    });

    it('maneja la condición controlsDoNotMatch', () => {
      component.buttonConfigs = [{ selector: '#save', disableWhen: 'controlsDoNotMatch:p1,p2' }];
      component.formMappings = [
        { controlName: 'p1', domSelector: '#p1' },
        { controlName: 'p2', domSelector: '#p2' },
      ];
      renderWithButton('<button id="save"></button>');

      component.dynamicForm.get('p1')?.setValue('a');
      component.dynamicForm.get('p2')?.setValue('b');
      component.dynamicForm.get('p1')?.markAsTouched();
      component.dynamicForm.get('p2')?.markAsTouched();
      (component as any).updateButtonStates();

      const btn = component.htmlContainerRef.nativeElement.querySelector('#save') as HTMLButtonElement;
      expect(btn.disabled).toBeTrue();
    });

    it('emite componentError si el selector del botón no existe en el HTML inyectado', () => {
      spyOn(component.componentError, 'emit');
      component.buttonConfigs = [{ selector: '#no-existe' }];
      renderWithButton('<div></div>');

      expect(component.componentError.emit).toHaveBeenCalledWith(jasmine.stringMatching(/no encontrado/));
    });
  });

  describe('updateSelectOptions / updateAutocompleteSuggestions', () => {
    beforeEach(() => {
      component.formMappings = [{ controlName: 'country', domSelector: '#country' }];
      setInjectedHtml('<select id="country"></select>');
    });

    it('reemplaza las opciones del <select> y sincroniza el control', () => {
      component.updateSelectOptions('country', [
        { value: 'ar', label: 'Argentina' },
        { value: 'mx', label: 'México' },
      ]);

      const select = component.htmlContainerRef.nativeElement.querySelector('#country') as HTMLSelectElement;
      expect(select.options.length).toBe(2);
      expect(component.dynamicForm.get('country')?.value).toBe('ar');
    });

    it('conserva el valor actual si sigue existiendo entre las nuevas opciones', () => {
      component.updateSelectOptions('country', [{ value: 'ar', label: 'Argentina' }]);
      const select = component.htmlContainerRef.nativeElement.querySelector('#country') as HTMLSelectElement;
      select.value = 'ar';

      component.updateSelectOptions('country', [
        { value: 'mx', label: 'México' },
        { value: 'ar', label: 'Argentina' },
      ]);

      expect(select.value).toBe('ar');
    });
  });

  describe('Limpieza (ngOnDestroy)', () => {
    it('desconecta el synchronizer y remueve el CSS al destruir un formulario', () => {
      // `isForm` no se puede forzar a mano: ngOnInit lo recalcula a partir de
      // formMappings en cada detectChanges y pisaría la asignación manual.
      component.formMappings = [{ controlName: 'name', domSelector: '#name' }];
      component.formId = 'test-form';
      (component as any).styleId = 'some-style-id';
      fixture.detectChanges();

      component.ngOnDestroy();

      expect(synchronizerSpy.disconnect).toHaveBeenCalledWith('test-form');
      expect(cssInjectorSpy.removeCss).toHaveBeenCalled();
    });

    it('limpia las librerías externas del contenedor', () => {
      fixture.detectChanges();
      component.ngOnDestroy();
      expect(externalLibsCleanupSpy.cleanupAll).toHaveBeenCalled();
    });
  });
});
