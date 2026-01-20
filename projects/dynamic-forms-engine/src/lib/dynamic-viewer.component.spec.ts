import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { DynamicViewerComponent } from './dynamic-viewer.component';
import { FormBuilder, ReactiveFormsModule, FormControl, Validators, FormGroup } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Renderer2, RendererFactory2, SimpleChange } from '@angular/core';
import { DynamicInyectCssService } from './services/dynamic-inyect-css.service';
import { FormDomSynchronizerService } from './services/form-dom-synchronizer.service';
import { DynamicValidationService } from './services/dynamic-validation.service';
import { DYNAMIC_CONFIG } from './dynamic-config.token';

describe('DynamicViewerComponent', () => {
  let component: DynamicViewerComponent;
  let fixture: ComponentFixture<DynamicViewerComponent>;

  // Spies de servicios
  let sanitizerSpy: jasmine.SpyObj<DomSanitizer>;
  let cssInjectorSpy: jasmine.SpyObj<DynamicInyectCssService>;
  let synchronizerSpy: jasmine.SpyObj<FormDomSynchronizerService>;
  let validationServiceSpy: jasmine.SpyObj<DynamicValidationService>;
  let renderer2Spy: jasmine.SpyObj<Renderer2>;

  beforeEach(async () => {
    sanitizerSpy = jasmine.createSpyObj('DomSanitizer', ['bypassSecurityTrustHtml']);
    cssInjectorSpy = jasmine.createSpyObj('DynamicInyectCssService', ['injectCss', 'removeCss', 'generateStyleId']);
    synchronizerSpy = jasmine.createSpyObj('FormDomSynchronizerService', ['connect', 'disconnect']);
    validationServiceSpy = jasmine.createSpyObj('DynamicValidationService', ['createAsyncValidator']);

    renderer2Spy = jasmine.createSpyObj('Renderer2', [
      'listen', 'addClass', 'removeClass', 'setAttribute', 'setProperty', 'setStyle', 'createElement', 'appendChild', 'createText'
    ]);

    const rendererFactorySpy = jasmine.createSpyObj('RendererFactory2', ['createRenderer']);
    rendererFactorySpy.createRenderer.and.returnValue(renderer2Spy);

    sanitizerSpy.bypassSecurityTrustHtml.and.callFake((html) => html);
    cssInjectorSpy.generateStyleId.and.returnValue('dynamic-style-test');

    await TestBed.configureTestingModule({
      imports: [DynamicViewerComponent, ReactiveFormsModule],
      providers: [
        FormBuilder,
        { provide: DomSanitizer, useValue: sanitizerSpy },
        { provide: DynamicInyectCssService, useValue: cssInjectorSpy },
        { provide: FormDomSynchronizerService, useValue: synchronizerSpy },
        { provide: DynamicValidationService, useValue: validationServiceSpy },
        { provide: RendererFactory2, useValue: rendererFactorySpy },
        { provide: DYNAMIC_CONFIG, useValue: { errorClassName: 'is-invalid', successClassName: 'is-valid' } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DynamicViewerComponent);
    component = fixture.componentInstance;
    component.contentId = 'unit-test-viewer';
    component.htmlContentString = '<form><input name="test" id="test-input"></form>';
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
            { type: 'required', value: null, message: 'Requerido' }
          ] 
        },
        { 
          controlName: 'age', 
          domSelector: '#age', 
          validatorConfig: [{ type: 'min', value: 18, message: 'Mínimo 18' }] 
        }
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
      spyOn(component as any, 'emitError');
      component.formMappings = [{ 
        controlName: 'x', 
        domSelector: '#x', 
        validatorConfig: [{ type: 'unknown', value: 1, message: 'Error' }] 
      }];
      fixture.detectChanges();
      expect((component as any).emitError).toHaveBeenCalledWith(jasmine.stringMatching(/Validador no reconocido/));
    });

    it('debería soportar validadores de coincidencia (matchValue)', () => {
      component.formMappings = [{ 
        controlName: 'pass', 
        domSelector: '#p', 
        validatorConfig: [{ type: 'matchValue', value: 'secret', message: 'No coincide' }] 
      }];
      fixture.detectChanges();
      const ctrl = component.dynamicForm.get('pass');
      ctrl?.setValue('wrong');
      expect(ctrl?.errors?.['matchValue']).toBeDefined();
      ctrl?.setValue('secret');
      expect(ctrl?.valid).toBeTrue();
    });
  });

  describe('Interacciones con el DOM inyectado', () => {
    beforeEach(() => {
      fixture.detectChanges(); // AfterViewInit
    });

    it('debería prevenir el submit estándar de formularios inyectados', () => {
      const mockForm = document.createElement('form');
      const container = component.htmlContainerRef.nativeElement;
      container.appendChild(mockForm);
      
      spyOn(component, 'triggerSubmit');
      
      // Obtenemos el listener de submit
      const submitHandler = renderer2Spy.listen.calls.all()
        .find(c => c.args[0] instanceof HTMLFormElement && c.args[1] === 'submit')?.args[2];
      
      const mockEvent = jasmine.createSpyObj('Event', ['preventDefault']);
      if (submitHandler) submitHandler(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(component.triggerSubmit).toHaveBeenCalled();
    });

    it('debería manejar clics en botones con data-dynamic-action', () => {
      spyOn(component.actionClicked, 'emit');
      const mockBtn = document.createElement('button');
      mockBtn.setAttribute('data-dynamic-action', 'delete-item');
      
      const clickHandler = renderer2Spy.listen.calls.all().find(c => c.args[1] === 'click')?.args[2];
      const mockEvent = { target: mockBtn, closest: () => mockBtn } as any;

      if (clickHandler) clickHandler(mockEvent);

      expect(component.actionClicked.emit).toHaveBeenCalledWith(jasmine.objectContaining({
        action: 'delete-item'
      }));
    });

    it('debería procesar dataBindings hacia el DOM', fakeAsync(() => {
      const span = document.createElement('span');
      span.id = 'target-span';
      component.htmlContainerRef.nativeElement.appendChild(span);
      
      component.dataBindings = [{ selector: '#target-span', value: 'Hello World' }];
      component.ngOnChanges({ dataBindings: new SimpleChange(null, component.dataBindings, false) });
      
      tick(); // setTimeout(0)
      expect(span.textContent).toBe('Hello World');
    }));
  });

  describe('Filtrado de Teclado y Máscaras', () => {
    it('debería filtrar caracteres no numéricos en keyFilter: int', () => {
      component.formMappings = [{ controlName: 'phone', domSelector: '#p', keyFilter: 'int' }];
      (component as any).initializeInjectedContentInteractions();

      const keyHandler = renderer2Spy.listen.calls.all().find(c => c.args[1] === 'keydown')?.args[2];
      const preventSpy = jasmine.createSpy('preventDefault');
      
      // Intentar escribir 'A'
      if (keyHandler) {
        keyHandler({ key: 'A', target: { name: 'phone', tagName: 'INPUT' }, preventDefault: preventSpy });
        expect(preventSpy).toHaveBeenCalled();
        
        // Intentar escribir '5'
        preventSpy.calls.reset();
        keyHandler({ key: '5', target: { name: 'phone', tagName: 'INPUT' }, preventDefault: preventSpy });
        expect(preventSpy).not.toHaveBeenCalled();
      }
    });

    it('debería manejar keyFilter decimal permitiendo solo un punto', () => {
      component.formMappings = [{ controlName: 'price', domSelector: '#pr', keyFilter: 'decimal' }];
      (component as any).initializeInjectedContentInteractions();
      const keyHandler = renderer2Spy.listen.calls.all().find(c => c.args[1] === 'keydown')?.args[2];
      const preventSpy = jasmine.createSpy('preventDefault');

      // Segundo punto decimal
      if (keyHandler) {
        keyHandler({ key: '.', target: { name: 'price', tagName: 'INPUT', value: '10.5' }, preventDefault: preventSpy });
        expect(preventSpy).toHaveBeenCalled();
      }
    });

    it('debería aplicar máscaras de entrada (inputMask)', fakeAsync(() => {
      component.formMappings = [{ controlName: 'card', domSelector: '#c', inputMask: '9999-9999' }];
      (component as any).initializeInjectedContentInteractions();
      const inputHandler = renderer2Spy.listen.calls.all().find(c => c.args[1] === 'input')?.args[2];
      
      const mockInput = document.createElement('input');
      mockInput.name = 'card';
      mockInput.value = '12345678';
      mockInput.selectionStart = 8;

      if (inputHandler) inputHandler({ target: mockInput });
      tick();

      expect(mockInput.value).toBe('1234-5678');
      expect(component.dynamicForm.get('card')?.value).toBe('12345678');
    }));
  });

  describe('Lógica Condicional (Show/Hide)', () => {
    it('debería evaluar condiciones y ocultar/deshabilitar controles', () => {
      component.formMappings = [
        { controlName: 'extra', domSelector: '#extra', showIf: "status === 'active'" }
      ];
      component.dynamicForm = new FormGroup({
        status: new FormControl('inactive'),
        extra: new FormControl('')
      });

      (component as any).applyConditionalLogic();

      // Al ser 'inactive', showIf es false => debe ocultar
      expect(renderer2Spy.setStyle).toHaveBeenCalledWith(jasmine.any(Object), 'display', 'none');
      expect(component.dynamicForm.get('extra')?.disabled).toBeTrue();
    });

    it('debería manejar errores en condiciones mal formadas', () => {
      spyOn(console, 'warn');
      const result = (component as any).evaluateCondition("eval(invalid syntax)");
      expect(result).toBeFalse();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('Estados de Botones (disableWhen)', () => {
    it('debería evaluar condiciones de formulario predefinidas', () => {
      component.buttonConfigs = [{ selector: '#submit', disableWhen: 'formIsInvalid' }];
      component.formMappings = [{ 
        controlName: 'req', 
        domSelector: '#r', 
        validatorConfig: [{ type: 'required', value: null, message: 'Requerido' }] 
      }];
      fixture.detectChanges();
      
      const btn = document.createElement('button');
      (component as any).buttonElements.set('#submit', btn);

      component.dynamicForm.get('req')?.setValue(''); // Invalid
      (component as any).updateButtonStates();
      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(btn, 'disabled', true);
    });

    it('debería evaluar condiciones complejas (controlIsInvalid:name)', () => {
      component.buttonConfigs = [{ selector: '#btn', disableWhen: 'controlIsInvalid:email' }];
      component.formMappings = [{ 
        controlName: 'email', 
        domSelector: '#e', 
        validatorConfig: [{ type: 'email', value: null, message: 'Inválido' }] 
      }];
      fixture.detectChanges();
      
      const btn = document.createElement('button');
      (component as any).buttonElements.set('#btn', btn);

      component.dynamicForm.get('email')?.setValue('not-an-email');
      (component as any).updateButtonStates();
      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(btn, 'disabled', true);
    });

    it('debería manejar la condición controlsDoNotMatch', () => {
      component.buttonConfigs = [{ selector: '#save', disableWhen: 'controlsDoNotMatch:p1,p2' }];
      component.formMappings = [
        { controlName: 'p1', domSelector: '#p1' },
        { controlName: 'p2', domSelector: '#p2' }
      ];
      fixture.detectChanges();
      
      const btn = document.createElement('button');
      (component as any).buttonElements.set('#save', btn);

      component.dynamicForm.get('p1')?.setValue('a');
      component.dynamicForm.get('p2')?.setValue('b');
      component.dynamicForm.get('p1')?.markAsTouched();
      component.dynamicForm.get('p2')?.markAsTouched();

      (component as any).updateButtonStates();
      expect(renderer2Spy.setProperty).toHaveBeenCalledWith(btn, 'disabled', true);
    });
  });

  describe('Inputs de Archivo (Boss Final)', () => {
    let mockFileInput: HTMLInputElement;
    
    beforeEach(() => {
      mockFileInput = document.createElement('input');
      mockFileInput.type = 'file';
      mockFileInput.setAttribute('name', 'avatar');
    });

    it('debería validar maxSize correctamente', () => {
      component.formMappings = [{ 
        controlName: 'avatar', 
        domSelector: '#avatar', 
        validatorConfig: [{ type: 'maxSize', value: 100, message: 'Muy grande' }] 
      }];
      fixture.detectChanges();

      const container = component.htmlContainerRef.nativeElement;
      container.appendChild(mockFileInput);
      (component as any).setupFileInputs();

      const changeHandler = renderer2Spy.listen.calls.all().find(c => c.args[1] === 'change')?.args[2];
      
      // Archivo de 200 bytes
      const largeFile = new File(['a'.repeat(200)], 'test.txt');
      const mockEvent = { target: { files: [largeFile] } };

      if (changeHandler) changeHandler(mockEvent);

      expect(component.dynamicForm.get('avatar')?.value).toBeNull();
      expect(renderer2Spy.addClass).toHaveBeenCalledWith(jasmine.any(Object), 'is-invalid');
    });

    it('debería validar fileType por extensión', () => {
      component.formMappings = [{ 
        controlName: 'doc', 
        domSelector: '#doc', 
        validatorConfig: [{ type: 'fileType', value: '.pdf', message: 'Tipo inválido' }] 
      }];
      fixture.detectChanges();

      const changeHandler = renderer2Spy.listen.calls.all().find(c => c.args[1] === 'change')?.args[2];
      const imgFile = new File([''], 'photo.png', { type: 'image/png' });
      
      if (changeHandler) changeHandler({ target: { files: [imgFile] } });
      expect(component.dynamicForm.get('doc')?.value).toBeNull();
    });
  });

  describe('Limpieza', () => {
    it('debería limpiar suscripciones y observers al destruir', () => {
      component.isForm = true;
      component.formId = 'test-form';
      component.ngOnDestroy();
      
      expect(synchronizerSpy.disconnect).toHaveBeenCalledWith('test-form');
      expect(cssInjectorSpy.removeCss).toHaveBeenCalled();
    });
  });
});