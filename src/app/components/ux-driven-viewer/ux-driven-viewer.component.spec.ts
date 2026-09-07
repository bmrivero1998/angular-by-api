import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { DynamicViewerService } from '../../../../projects/dynamic-forms-engine/src/lib/services/dynamic-viewer.service';
import { ModalService } from '../../../../projects/dynamic-forms-engine/src/lib/services/modal-service.service';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { SimpleChange, SimpleChanges } from '@angular/core';
import { UXDrivenViewerWidgetComponent } from './ux-driven-viewer.component';

/**
 * Nota: este spec fue reescrito porque apuntaba a nombres de Inputs/Outputs
 * de una versión anterior del componente (UxDrivenJson, apiURL, data,
 * modalApiUrl/modalData/modalJson, componentError, formSubmitted,
 * actionClicked, modalEmitted) que ya no existen — la API actual es
 * localSchema/apiUrl/initialData/modalSchema/modalEndpoint/modalContext/
 * errorOccurred/formSubmit/actionTriggered/modalResult. El comportamiento
 * verificado es el mismo, solo se actualizaron los nombres y las señales
 * async (ngOnInit ya no difiere el setLocalContent, solo ngOnChanges lo hace).
 */
describe('UXDrivenViewerWidgetComponent', () => {
  let component: UXDrivenViewerWidgetComponent;
  let fixture: ComponentFixture<UXDrivenViewerWidgetComponent>;
  let dwsSpy: jasmine.SpyObj<DynamicViewerService>;
  let modalServiceSpy: jasmine.SpyObj<ModalService>;

  beforeEach(async () => {
    dwsSpy = jasmine.createSpyObj('DynamicViewerService', ['loadInitialContent', 'setLocalContent'], {
      staticContent$: of([]),
      dynamicContent$: of([]),
    });

    modalServiceSpy = jasmine.createSpyObj('ModalService', ['open', 'close']);

    await TestBed.configureTestingModule({
      imports: [UXDrivenViewerWidgetComponent, ReactiveFormsModule],
      providers: [
        { provide: DynamicViewerService, useValue: dwsSpy },
        { provide: ModalService, useValue: modalServiceSpy },
      ],
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
      component.ngOnInit();
      expect(component.formGroup).toBe(externalForm);
    });

    it('should initialize content with local schema if provided', () => {
      const mockSchema = [{ id: 'local' }];
      component.localSchema = mockSchema;

      component.ngOnInit();

      expect(dwsSpy.setLocalContent).toHaveBeenCalledWith(mockSchema);
      expect(component.isLoading).toBeFalse();
    });

    it('should initialize content from API if URL provided and no local schema', () => {
      component.apiUrl = 'init-api';
      dwsSpy.loadInitialContent.and.returnValue(of([]));

      component.ngOnInit();

      expect(dwsSpy.loadInitialContent).toHaveBeenCalledWith('init-api');
    });
  });

  // --- 2. CAMBIOS EN INPUTS (ngOnChanges) ---
  describe('ngOnChanges', () => {
    it('should process new local schema when localSchema input changes', fakeAsync(() => {
      component.localSchema = [{ id: 'new' }];
      const changes: SimpleChanges = {
        localSchema: new SimpleChange(null, component.localSchema, false),
      };

      component.ngOnChanges(changes);
      expect(component.isLoading).toBeTrue();

      tick(0); // Resuelve el setTimeout(0)

      expect(dwsSpy.setLocalContent).toHaveBeenCalled();
      expect(component.isLoading).toBeFalse();
    }));

    it('should reload from API when apiUrl changes', () => {
      component.apiUrl = 'updated-url';
      dwsSpy.loadInitialContent.and.returnValue(of([]));
      const changes: SimpleChanges = {
        apiUrl: new SimpleChange('old', 'updated-url', false),
      };

      component.ngOnChanges(changes);
      expect(dwsSpy.loadInitialContent).toHaveBeenCalledWith('updated-url');
    });

    it('should replace formGroup when externalForm changes', () => {
      const newForm = new FormGroup({});
      component.externalForm = newForm;
      const changes: SimpleChanges = {
        externalForm: new SimpleChange(null, newForm, false),
      };

      component.ngOnChanges(changes);
      expect(component.formGroup).toBe(newForm);
    });

    it('should patch data when "initialData" input changes', fakeAsync(() => {
      spyOn(component, 'setFormValues');
      component.initialData = { some: 'value' };
      const changes: SimpleChanges = {
        initialData: new SimpleChange(null, component.initialData, false),
      };

      component.ngOnChanges(changes);
      tick(50); // Resuelve el delay técnico de handleDataPatching

      expect(component.setFormValues).toHaveBeenCalledWith(component.initialData);
    }));

    it('should open modal when modal parameters change', () => {
      component.modalEndpoint = 'modal-api';
      component.modalContext = { id: 1 };
      modalServiceSpy.open.and.returnValue(of({}));

      const changes: SimpleChanges = {
        modalEndpoint: new SimpleChange(null, 'modal-api', false),
      };

      component.ngOnChanges(changes);
      expect(modalServiceSpy.open).toHaveBeenCalledWith('modal-api', undefined, { id: 1 });
    });

    it('should close modal if triggered but no source provided', () => {
      component.modalSchema = null;
      component.modalEndpoint = undefined;
      const changes: SimpleChanges = {
        modalSchema: new SimpleChange('old', null, false),
      };

      component.ngOnChanges(changes);
      expect(modalServiceSpy.close).toHaveBeenCalled();
    });

    it('should ignore modal params on their firstChange (no apertura espontánea al inicializar)', () => {
      component.modalEndpoint = 'modal-api';
      const changes: SimpleChanges = {
        modalEndpoint: new SimpleChange(undefined, 'modal-api', true),
      };

      component.ngOnChanges(changes);
      expect(modalServiceSpy.open).not.toHaveBeenCalled();
    });
  });

  // --- 3. MÉTODOS PÚBLICOS Y UTILITARIOS (Refresh & Errors) ---
  describe('Public Methods & Error Handling', () => {
    it('should call loadInitialContent on refresh()', () => {
      component.apiUrl = 'refresh-url';
      dwsSpy.loadInitialContent.and.returnValue(of([]));

      component.refresh();
      expect(dwsSpy.loadInitialContent).toHaveBeenCalled();
    });

    it('should emit errorOccurred when loadData fails (API Error)', () => {
      spyOn(component.errorOccurred, 'emit');
      component.apiUrl = 'error-url';
      dwsSpy.loadInitialContent.and.returnValue(throwError(() => new Error('API Fail')));

      component.refresh();

      expect(component.isLoading).toBeFalse(); // finalize se ejecuta igual
      expect(component.errorOccurred.emit).toHaveBeenCalledWith(jasmine.stringMatching(/Error/));
    });

    it('should emit formSubmit when onFormSubmitted is called', () => {
      spyOn(component.formSubmit, 'emit');
      const eventPayload = { formId: 'test', data: { foo: 'bar' } };

      component.onFormSubmitted(eventPayload);

      expect(component.formSubmit.emit).toHaveBeenCalledWith({ foo: 'bar' });
    });
  });

  // --- 4. ACCIONES DEL VIEWER (handleViewerActionClick) ---
  describe('Action Handling', () => {
    beforeEach(() => {
      component.formGroup = new FormGroup({
        name: new FormControl('Test', Validators.required),
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
      spyOn(component.formSubmit, 'emit');
      component.handleViewerActionClick({ action: 'submit-btn', sourceId: '1' });
      expect(component.formSubmit.emit).toHaveBeenCalledWith({ name: 'Test' });
    });

    it('should emit error if form invalid on "submit" action', () => {
      spyOn(component.errorOccurred, 'emit');
      component.formGroup.get('name')?.setValue(''); // Invalidamos

      component.handleViewerActionClick({ action: 'submit-btn', sourceId: '1' });

      expect(component.formGroup.touched).toBeTrue();
      expect(component.errorOccurred.emit).toHaveBeenCalled();
    });

    it('should emit actionTriggered for generic actions', () => {
      spyOn(component.actionTriggered, 'emit');
      component.handleViewerActionClick({ action: 'custom', sourceId: '1' });

      expect(component.actionTriggered.emit).toHaveBeenCalledWith(
        jasmine.objectContaining({
          action: 'custom',
          context: jasmine.any(Object),
        })
      );
    });
  });

  // --- 5. PARCHEO PROFUNDO (Deep Patching & Recursion) ---
  describe('Recursive Data Patching', () => {
    it('should patch nested form groups correctly (Deep Search)', () => {
      component.formGroup = new FormGroup({
        personal: new FormGroup({
          address: new FormGroup({
            city: new FormControl(''), // Nivel 3 de profundidad
          }),
        }),
      });

      component.setFormValues({ city: 'Mexico' });

      expect(component.formGroup.get('personal.address.city')?.value).toBe('Mexico');
    });

    it('should ignore keys that do not exist in the form', () => {
      component.formGroup = new FormGroup({ name: new FormControl('') });
      expect(() => component.setFormValues({ age: 99 })).not.toThrow();
    });
  });

  // --- 6. INTERACCIÓN MODAL (Result Handling) ---
  describe('Modal Results', () => {
    it('should emit modalResult when closed', () => {
      spyOn(component.modalResult, 'emit');
      const mockResult = { genericForm: { success: true } };

      modalServiceSpy.open.and.returnValue(of(mockResult));

      component.modalEndpoint = 'test';
      component.ngOnChanges({
        modalEndpoint: new SimpleChange(null, 'test', false),
      });

      expect(component.modalResult.emit).toHaveBeenCalledWith({ success: true });
    });
  });

  // --- 7. TELEMETRÍA (formStateChanged / controlChanged) ---
  describe('Telemetría centralizada', () => {
    it('emite formStateChanged con un snapshot del formGroup en cada valueChange', fakeAsync(() => {
      component.formStateDebounce = 0;
      component.formGroup = new FormGroup({ name: new FormControl('') });
      component.ngOnInit();

      let lastSnapshot: any;
      component.formStateChanged.subscribe((s) => (lastSnapshot = s));

      component.formGroup.get('name')?.setValue('Ana');
      tick();

      expect(lastSnapshot.value).toEqual({ name: 'Ana' });
      expect(lastSnapshot.valid).toBeTrue();
    }));

    it('reemite cada ControlChangeEvent recibido como controlChanged', () => {
      spyOn(component.controlChanged, 'emit');
      const event = {
        controlName: 'name',
        value: 'x',
        formId: 'f1',
        valid: true,
        invalid: false,
        dirty: true,
        touched: true,
        pending: false,
        errors: null,
      };

      component.handleControlValueChange(event);

      expect(component.controlChanged.emit).toHaveBeenCalledWith(event);
    });
  });
});
