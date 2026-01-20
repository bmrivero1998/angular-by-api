import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { DynamicViewerService } from '../../../../projects/dynamic-forms-engine/src/lib/services/dynamic-viewer.service';
import { ModalService } from '../../../../projects/dynamic-forms-engine/src/lib/services/modal-service.service';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { SimpleChange, SimpleChanges } from '@angular/core';
import { UXDrivenViewerWidgetComponent } from './ux-driven-viewer.component';

describe('UXDrivenViewerWidgetComponent (100% Coverage)', () => {
  let component: UXDrivenViewerWidgetComponent;
  let fixture: ComponentFixture<UXDrivenViewerWidgetComponent>;
  let dwsSpy: jasmine.SpyObj<DynamicViewerService>;
  let modalServiceSpy: jasmine.SpyObj<ModalService>;

  beforeEach(async () => {
    // Mockeamos todas las dependencias
    dwsSpy = jasmine.createSpyObj('DynamicViewerService', ['loadInitialContent', 'setLocalContent'], {
      staticContent$: of([]),
      dynamicContent$: of([])
    });

    modalServiceSpy = jasmine.createSpyObj('ModalService', ['open', 'close']);

    await TestBed.configureTestingModule({
      // Importamos el componente standalone directamente
      imports: [UXDrivenViewerWidgetComponent, ReactiveFormsModule],
      providers: [
        { provide: DynamicViewerService, useValue: dwsSpy },
        { provide: ModalService, useValue: modalServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(UXDrivenViewerWidgetComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- 1. ESTRATEGIA DE INICIALIZACIÓN (ngOnInit & initContentStrategy) ---
  describe('Initialization Strategy', () => {
    it('should set external form if provided in ngOnInit', () => {
      const externalForm = new FormGroup({ test: new FormControl('') });
      component.externalForm = externalForm;
      component.ngOnInit(); // Llamamos manualmente para probar lógica interna
      expect(component.formGroup).toBe(externalForm);
    });

    it('should initialize content with local JSON if provided', fakeAsync(() => {
      const mockJson = [{ id: 'local' }];
      component.UxDrivenJson = mockJson;
      
      component.ngOnInit(); // Llama a initContentStrategy
      tick(); // Procesa el setLocalContent

      expect(dwsSpy.setLocalContent).toHaveBeenCalledWith(mockJson);
      expect(component.isLoading).toBeFalse();
    }));

    it('should initialize content from API if URL provided and no local JSON', () => {
      component.apiURL = 'init-api';
      dwsSpy.loadInitialContent.and.returnValue(of([]));
      
      component.ngOnInit(); 
      
      expect(dwsSpy.loadInitialContent).toHaveBeenCalledWith('init-api');
    });
  });

  // --- 2. CAMBIOS EN INPUTS (ngOnChanges) ---
  describe('ngOnChanges', () => {
    // Caso: Cambio de JSON Local
    it('should process new local JSON when UxDrivenJson input changes', fakeAsync(() => {
      const changes: SimpleChanges = {
        UxDrivenJson: new SimpleChange(null, [{ id: 'new' }], false)
      };
      component.UxDrivenJson = [{ id: 'new' }];
      
      component.ngOnChanges(changes);
      expect(component.isLoading).toBeTrue();
      
      tick(0); // Resolvemos el setTimeout(0)
      
      expect(dwsSpy.setLocalContent).toHaveBeenCalled();
      expect(component.isLoading).toBeFalse();
    }));

    // Caso: Cambio de API URL
    it('should reload from API when apiURL changes', () => {
      component.apiURL = 'updated-url';
      dwsSpy.loadInitialContent.and.returnValue(of([]));
      const changes: SimpleChanges = {
        apiURL: new SimpleChange('old', 'updated-url', false)
      };

      component.ngOnChanges(changes);
      expect(dwsSpy.loadInitialContent).toHaveBeenCalledWith('updated-url');
    });

    // Caso: Cambio de Formulario Externo
    it('should replace formGroup when externalForm changes', () => {
      const newForm = new FormGroup({});
      component.externalForm = newForm;
      const changes: SimpleChanges = {
        externalForm: new SimpleChange(null, newForm, false)
      };

      component.ngOnChanges(changes);
      expect(component.formGroup).toBe(newForm);
    });

    // Caso: Parcheo de Datos (Data Patching)
    it('should patch data when "data" input changes', fakeAsync(() => {
      spyOn(component, 'setFormValues');
      component.data = { some: 'value' };
      const changes: SimpleChanges = {
        data: new SimpleChange(null, component.data, false)
      };

      component.ngOnChanges(changes);
      tick(50); // Resolvemos el delay técnico
      expect(component.setFormValues).toHaveBeenCalledWith(component.data);
    }));

    // Caso: Modales (Apertura)
    it('should open modal when modal parameters change', () => {
      component.modalApiUrl = 'modal-api';
      component.modalData = { id: 1 };
      modalServiceSpy.open.and.returnValue(of({}));
      
      const changes: SimpleChanges = {
        modalApiUrl: new SimpleChange(null, 'modal-api', false)
      };

      component.ngOnChanges(changes);
      expect(modalServiceSpy.open).toHaveBeenCalledWith('modal-api', undefined, { id: 1 });
    });

    // Caso: Modales (Cierre)
    it('should close modal if triggered but no source provided', () => {
      // Simulamos que cambió el parametro pero están vacíos
      component.modalJson = null;
      component.modalApiUrl = undefined;
      const changes: SimpleChanges = {
        modalJson: new SimpleChange('old', null, false)
      };

      component.ngOnChanges(changes);
      expect(modalServiceSpy.close).toHaveBeenCalled();
    });
  });

  // --- 3. MÉTODOS PÚBLICOS Y UTILITARIOS (Refresh & Errors) ---
  describe('Public Methods & Error Handling', () => {
    it('should call loadData on refresh()', () => {
      component.apiURL = 'refresh-url';
      dwsSpy.loadInitialContent.and.returnValue(of([]));
      
      component.refresh();
      expect(dwsSpy.loadInitialContent).toHaveBeenCalled();
    });

    it('should emit componentError when loadData fails (API Error)', () => {
      spyOn(component.componentError, 'emit');
      component.apiURL = 'error-url';
      // Simulamos error del servicio
      dwsSpy.loadInitialContent.and.returnValue(throwError(() => new Error('API Fail')));
      
      // Llamamos al método privado indirectamente o via refresh/init
      component.refresh();
      
      expect(component.isLoading).toBeFalse(); // Finalize se ejecuta
      expect(component.componentError.emit).toHaveBeenCalledWith(jasmine.stringMatching(/Error/));
    });
    
    // Testeamos el método onFormSubmitted directamente
    it('should emit data when onFormSubmitted is called', () => {
      spyOn(component.formSubmitted, 'emit');
      const eventPayload = { formId: 'test', data: { foo: 'bar' } };
      
      component.onFormSubmitted(eventPayload);
      
      expect(component.formSubmitted.emit).toHaveBeenCalledWith({ foo: 'bar' });
    });
  });

  // --- 4. ACCIONES DEL VIEWER (handleViewerActionClick) ---
  describe('Action Handling', () => {
    beforeEach(() => {
      component.formGroup = new FormGroup({
        name: new FormControl('Test', Validators.required)
      });
    });

    it('should close modal on "close" or "modal" action', () => {
      component.handleViewerActionClick({ action: 'close', sourceId: '1' });
      expect(modalServiceSpy.close).toHaveBeenCalled();

      modalServiceSpy.close.calls.reset();
      component.handleViewerActionClick({ action: 'modal-cancel', sourceId: '1' });
      expect(modalServiceSpy.close).toHaveBeenCalled();
    });

    it('should reset form on "reset" action', () => {
      spyOn(component.formGroup, 'reset');
      component.handleViewerActionClick({ action: 'reset-form', sourceId: '1' });
      expect(component.formGroup.reset).toHaveBeenCalled();
    });

    it('should submit form if valid on "submit" action', () => {
      spyOn(component.formSubmitted, 'emit');
      component.handleViewerActionClick({ action: 'submit-btn', sourceId: '1' });
      expect(component.formSubmitted.emit).toHaveBeenCalledWith({ name: 'Test' });
    });

    it('should emit error if form invalid on "submit" action', () => {
      spyOn(component.componentError, 'emit');
      component.formGroup.get('name')?.setValue(''); // Invalidamos
      
      component.handleViewerActionClick({ action: 'submit-btn', sourceId: '1' });
      
      expect(component.formGroup.touched).toBeTrue();
      expect(component.componentError.emit).toHaveBeenCalled();
    });

    it('should emit actionClicked for generic actions', () => {
      spyOn(component.actionClicked, 'emit');
      component.handleViewerActionClick({ action: 'custom', sourceId: '1' });
      
      expect(component.actionClicked.emit).toHaveBeenCalledWith(jasmine.objectContaining({
        action: 'custom',
        context: jasmine.any(Object)
      }));
    });
  });

  // --- 5. PARCHEO PROFUNDO (Deep Patching & Recursion) ---
  describe('Recursive Data Patching', () => {
    it('should patch nested form groups correctly (Deep Search)', () => {
      // Estructura compleja
      component.formGroup = new FormGroup({
        personal: new FormGroup({
          address: new FormGroup({
            city: new FormControl('') // Nivel 3 de profundidad
          })
        })
      });

      // El parcheo recibe { city: 'Mexico' } y debe encontrarlo en el fondo
      component.setFormValues({ city: 'Mexico' });
      
      expect(component.formGroup.get('personal.address.city')?.value).toBe('Mexico');
    });

    it('should ignore keys that do not exist in the form', () => {
      component.formGroup = new FormGroup({ name: new FormControl('') });
      // "age" no existe, no debería explotar
      expect(() => component.setFormValues({ age: 99 })).not.toThrow();
    });
  });

  // --- 6. INTERACCIÓN MODAL (Result Handling) ---
  describe('Modal Results', () => {
    it('should emit modal result when closed', () => {
      spyOn(component.modalEmitted, 'emit');
      const mockResult = { genericForm: { success: true } };
      
      // Simulamos que el observable del modal devuelve un valor
      modalServiceSpy.open.and.returnValue(of(mockResult));

      // Trigger via cambio de input
      component.modalApiUrl = 'test';
      component.ngOnChanges({
        modalApiUrl: new SimpleChange(null, 'test', false)
      });

      expect(component.modalEmitted.emit).toHaveBeenCalledWith({ success: true });
    });
  });
});