import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ContentChange, DynamicViewerService } from '../content/dynamic-viewer.service';
import { ModalService } from '../modal/modal.service';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';
import { SimpleChange, SimpleChanges } from '@angular/core';
import { UXDrivenViewerWidgetComponent } from './ux-driven-viewer.component';

const UNCHANGED: ContentChange = { mode: 'unchanged', changedIds: [], issues: [] };
const change = (mode: ContentChange['mode'], changedIds: string[] = [], issues: string[] = []): ContentChange => ({
  mode,
  changedIds,
  issues,
});

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
    modalServiceSpy = jasmine.createSpyObj('ModalService', ['open', 'close']);

    await TestBed.configureTestingModule({
      imports: [UXDrivenViewerWidgetComponent, ReactiveFormsModule],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ModalService, useValue: modalServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(UXDrivenViewerWidgetComponent);
    component = fixture.componentInstance;

    // El servicio de contenido es del propio componente (uno por widget, no un
    // singleton): se toma de su injector y se espían los métodos que usa.
    const dws = fixture.debugElement.injector.get(DynamicViewerService);
    spyOn(dws, 'loadInitialContent');
    spyOn(dws, 'setLocalContent').and.returnValue(UNCHANGED);
    spyOn(dws, 'updateSections').and.returnValue(UNCHANGED);
    spyOn(dws, 'getContentValue').and.returnValue([]);
    spyOn(dws, 'hasContent').and.returnValue(false);
    spyOn(dws, 'isShowingErrorPage').and.returnValue(false);
    spyOn(dws, 'clearContent');
    spyOn(dws, 'showErrorPage').and.returnValue(change('initial', ['ux-error-page']));
    dwsSpy = dws as unknown as jasmine.SpyObj<DynamicViewerService>;
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
      dwsSpy.loadInitialContent.and.returnValue(of(UNCHANGED));

      component.ngOnInit();

      expect(dwsSpy.loadInitialContent).toHaveBeenCalledWith('init-api');
    });
  });

  // --- 2. CAMBIOS EN INPUTS (ngOnChanges) ---
  describe('ngOnChanges', () => {
    it('should process new local schema when localSchema input changes', () => {
      component.localSchema = [{ id: 'new' }];
      const changes: SimpleChanges = {
        localSchema: new SimpleChange(null, component.localSchema, false),
      };

      component.ngOnChanges(changes);

      // Sin spinner ni setTimeout: se compara contra lo que hay en memoria y se aplica al momento.
      expect(dwsSpy.setLocalContent).toHaveBeenCalledWith(component.localSchema);
      expect(component.isLoading).toBeFalse();
    });

    it('should reload from API when apiUrl changes', () => {
      component.apiUrl = 'updated-url';
      dwsSpy.loadInitialContent.and.returnValue(of(UNCHANGED));
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
      dwsSpy.loadInitialContent.and.returnValue(of(UNCHANGED));

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

    // El submit nativo de una sección y el botón con acción "submit" pasan
    // por el mismo camino: se validan TODOS los formularios y se emite el
    // valor completo, agrupado por formId.
    it('emite formSubmit con todos los formularios agrupados por formId en un submit nativo', () => {
      spyOn(component.formSubmit, 'emit');
      component.formGroup = new FormGroup({
        contacto: new FormGroup({ nombre: new FormControl('Ana') }),
        envio: new FormGroup({ ciudad: new FormControl('CDMX') }),
      });

      component.onFormSubmitted({ formId: 'contacto', data: { nombre: 'Ana' } });

      expect(component.formSubmit.emit).toHaveBeenCalledOnceWith({
        contacto: { nombre: 'Ana' },
        envio: { ciudad: 'CDMX' },
      });
    });

    it('no emite formSubmit en un submit nativo si otro formulario de la página es inválido', () => {
      spyOn(component.formSubmit, 'emit');
      spyOn(component.errorOccurred, 'emit');
      const ciudad = new FormControl('', Validators.required);
      component.formGroup = new FormGroup({
        contacto: new FormGroup({ nombre: new FormControl('Ana') }),
        envio: new FormGroup({ ciudad }),
      });

      component.onFormSubmitted({ formId: 'contacto', data: { nombre: 'Ana' } });

      expect(component.formSubmit.emit).not.toHaveBeenCalled();
      expect(component.errorOccurred.emit).toHaveBeenCalledWith('El formulario contiene errores.');
      expect(ciudad.touched).toBeTrue();
    });
  });

  // --- 4. ACCIONES DEL VIEWER (handleViewerActionClick) ---
  describe('Action Handling', () => {
    beforeEach(() => {
      component.formGroup = new FormGroup({
        name: new FormControl('Test', Validators.required),
      });
    });

    it('should close modal on "close" or "cancel" actions', () => {
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

  // --- CONTENIDO: eventos, spinner y llamadas al servicio ---
  describe('contenido: eventos y carga', () => {
    let updated: ContentChange[];
    let readyCount: number;
    let errors: string[];

    beforeEach(() => {
      updated = [];
      readyCount = 0;
      errors = [];
      component.contentUpdated.subscribe((c) => updated.push(c));
      component.ready.subscribe(() => readyCount++);
      component.errorOccurred.subscribe((e) => errors.push(e));
    });

    const load = (result: ContentChange) => {
      component.localSchema = [{ id: 'x' }];
      dwsSpy.setLocalContent.and.returnValue(result);
      component.ngOnChanges({ localSchema: new SimpleChange(null, component.localSchema, false) });
    };

    it('la primera carga (initial) emite contentUpdated y ready', () => {
      load(change('initial', ['a']));

      expect(updated).toEqual([change('initial', ['a'])]);
      expect(readyCount).toBe(1);
    });

    it('una recarga completa (reloaded) emite contentUpdated y ready', () => {
      load(change('reloaded', ['nav']));

      expect(updated.length).toBe(1);
      expect(readyCount).toBe(1);
    });

    it('una actualización parcial (patched) emite contentUpdated pero NO ready', () => {
      load(change('patched', ['news']));

      expect(updated).toEqual([change('patched', ['news'])]);
      expect(readyCount).toBe(0);
    });

    it('si el contenido no cambió no emite nada', () => {
      load(change('unchanged'));

      expect(updated).toEqual([]);
      expect(readyCount).toBe(0);
    });

    it('informa cada problema del contenido por errorOccurred, aunque no haya cambios', () => {
      load(change('unchanged', [], ['sin renderType', 'id repetido']));

      expect(errors).toEqual(['sin renderType', 'id repetido']);
    });

    it('con localSchema no aplica el contenido dos veces (ngOnChanges y ngOnInit)', () => {
      component.localSchema = [{ id: 'x' }];

      component.ngOnChanges({ localSchema: new SimpleChange(null, component.localSchema, true) });
      component.ngOnInit();

      expect(dwsSpy.setLocalContent).toHaveBeenCalledTimes(1);
    });

    it('con api-url no pide el contenido dos veces (ngOnChanges y ngOnInit)', () => {
      component.apiUrl = 'api';
      dwsSpy.loadInitialContent.and.returnValue(of(change('initial')));

      component.ngOnChanges({ apiUrl: new SimpleChange(null, 'api', true) });
      component.ngOnInit();

      expect(dwsSpy.loadInitialContent).toHaveBeenCalledTimes(1);
    });

    it('en la primera carga por API muestra el spinner hasta que llega la respuesta', () => {
      const response$ = new Subject<ContentChange>();
      dwsSpy.loadInitialContent.and.returnValue(response$);
      component.apiUrl = 'api';

      component.refresh();
      expect(component.isLoading).toBeTrue();

      response$.next(change('initial', ['a']));
      response$.complete();

      expect(component.isLoading).toBeFalse();
      expect(readyCount).toBe(1);
    });

    it('al volver a cargar con contenido en pantalla NO muestra el spinner', () => {
      dwsSpy.hasContent.and.returnValue(true);
      const response$ = new Subject<ContentChange>();
      dwsSpy.loadInitialContent.and.returnValue(response$);
      component.apiUrl = 'api';

      component.refresh();

      expect(component.isLoading).toBeFalse();
      response$.next(change('patched', ['a']));
      response$.complete();
      expect(updated.length).toBe(1);
      expect(readyCount).toBe(0);
    });

    it('si la primera carga falla emite errorOccurred y, por compatibilidad, ready', () => {
      spyOn(console, 'error');
      dwsSpy.loadInitialContent.and.returnValue(throwError(() => new Error('boom')));
      component.apiUrl = 'api';

      component.refresh();

      expect(errors.length).toBe(1);
      expect(readyCount).toBe(1);
    });

    it('si falla al volver a cargar no emite ready y deja el contenido como estaba', () => {
      spyOn(console, 'error');
      dwsSpy.hasContent.and.returnValue(true);
      dwsSpy.loadInitialContent.and.returnValue(throwError(() => new Error('boom')));
      component.apiUrl = 'api';

      component.refresh();

      expect(errors.length).toBe(1);
      expect(readyCount).toBe(0);
    });
  });

  // --- updateSections y API publicada en el elemento ---
  describe('updateSections y métodos del elemento', () => {
    it('updateSections delega en el servicio, emite contentUpdated y devuelve el resultado', () => {
      const result = change('patched', ['news']);
      dwsSpy.updateSections.and.returnValue(result);
      const emitted: ContentChange[] = [];
      component.contentUpdated.subscribe((c) => emitted.push(c));

      const returned = component.updateSections([{ id_DocumentHTMLCSS: 'news' }]);

      expect(dwsSpy.updateSections).toHaveBeenCalledWith([{ id_DocumentHTMLCSS: 'news' }]);
      expect(returned).toBe(result);
      expect(emitted).toEqual([result]);
    });

    it('publica updateSections y refresh en el propio elemento para que el host los llame', () => {
      const element = fixture.nativeElement as HTMLElement & { updateSections: (s: unknown) => ContentChange; refresh: () => void };
      dwsSpy.updateSections.and.returnValue(change('patched', ['a']));

      const result = element.updateSections([{ id_DocumentHTMLCSS: 'a' }]);

      expect(result.mode).toBe('patched');
      expect(dwsSpy.updateSections).toHaveBeenCalled();

      component.apiUrl = 'api';
      dwsSpy.loadInitialContent.and.returnValue(of(UNCHANGED));
      element.refresh();
      expect(dwsSpy.loadInitialContent).toHaveBeenCalledWith('api');
    });
  });

  // --- ERRORES DE CARGA: página de error y reintento ---
  describe('errores de carga', () => {
    let errors: string[];
    let updated: ContentChange[];
    let readyCount: number;

    beforeEach(() => {
      spyOn(console, 'error');
      errors = [];
      updated = [];
      readyCount = 0;
      component.errorOccurred.subscribe((e) => errors.push(e));
      component.contentUpdated.subscribe((c) => updated.push(c));
      component.ready.subscribe(() => readyCount++);
      component.apiUrl = 'api';
    });

    const http = (status: number) => new HttpErrorResponse({ status });

    it('si falla la primera carga pinta la página de error, informa el código y emite ready', () => {
      dwsSpy.loadInitialContent.and.returnValue(throwError(() => http(404)));

      component.refresh();

      expect(dwsSpy.showErrorPage).toHaveBeenCalledWith(jasmine.any(HttpErrorResponse));
      expect(errors).toEqual(['Error cargando configuración dinámica (HTTP 404)']);
      expect(updated).toEqual([change('initial', ['ux-error-page'])]);
      expect(readyCount).toBe(1);
      expect(component.isLoading).toBeFalse();
    });

    it('un error sin respuesta (sin red) se informa sin código', () => {
      dwsSpy.loadInitialContent.and.returnValue(throwError(() => http(0)));

      component.refresh();

      expect(errors).toEqual(['Error cargando configuración dinámica']);
    });

    it('con show-error-page desactivado solo se informa; ready se emite igual por compatibilidad', () => {
      component.showErrorPage = false;
      dwsSpy.loadInitialContent.and.returnValue(throwError(() => http(500)));

      component.refresh();

      expect(dwsSpy.showErrorPage).not.toHaveBeenCalled();
      expect(errors.length).toBe(1);
      expect(updated).toEqual([]);
      expect(readyCount).toBe(1);
    });

    it('si ya hay contenido, un fallo al volver a cargar NO pinta la página de error', () => {
      dwsSpy.hasContent.and.returnValue(true);
      dwsSpy.loadInitialContent.and.returnValue(throwError(() => http(503)));

      component.refresh();

      expect(dwsSpy.showErrorPage).not.toHaveBeenCalled();
      expect(errors.length).toBe(1);
      expect(readyCount).toBe(0);
    });

    it('al reintentar desde la página de error la quita y muestra el spinner', () => {
      dwsSpy.isShowingErrorPage.and.returnValue(true);
      const response$ = new Subject<ContentChange>();
      dwsSpy.loadInitialContent.and.returnValue(response$);

      component.refresh();

      expect(dwsSpy.clearContent).toHaveBeenCalled();
      expect(component.isLoading).toBeTrue();
    });

    it('la acción retry_load vuelve a pedir el contenido y no se reporta al host', () => {
      dwsSpy.loadInitialContent.and.returnValue(of(UNCHANGED));
      const actions: string[] = [];
      component.actionTriggered.subscribe((p) => actions.push(p.action));

      component.handleViewerActionClick({ action: 'retry_load', sourceId: 'ux-error-page' });

      expect(dwsSpy.loadInitialContent).toHaveBeenCalledWith('api');
      expect(actions).toEqual([]);
    });
  });

  // --- ACCIONES INTEGRADAS: se reconocen por palabras, no por texto suelto ---
  describe('acciones integradas', () => {
    let actions: string[];

    beforeEach(() => {
      actions = [];
      component.actionTriggered.subscribe((p) => actions.push(p.action));
      component.formGroup = new FormGroup({ name: new FormControl('Ana', Validators.required) });
    });

    const click = (action: string) => component.handleViewerActionClick({ action, sourceId: 's' });

    it('open_modal ya no cierra el modal y SÍ llega al host (antes se tragaba)', () => {
      click('open_modal');

      expect(modalServiceSpy.close).not.toHaveBeenCalled();
      expect(actions).toEqual(['open_modal']);
    });

    ['show_modal_help', 'modal_confirm', 'modal'].forEach((name) =>
      it(`"${name}" tampoco cierra nada y llega al host`, () => {
        click(name);

        expect(modalServiceSpy.close).not.toHaveBeenCalled();
        expect(actions).toEqual([name]);
      }),
    );

    ['close', 'close_modal', 'closeModal', 'modal-cancel', 'cancel', 'dismiss'].forEach((name) =>
      it(`"${name}" cierra el modal y además se reporta al host`, () => {
        click(name);

        expect(modalServiceSpy.close).toHaveBeenCalledTimes(1);
        expect(actions).toEqual([name]);
      }),
    );

    it('reset_password NO vacía el formulario y llega al host', () => {
      click('reset_password');

      expect(component.formGroup.value).toEqual({ name: 'Ana' });
      expect(actions).toEqual(['reset_password']);
    });

    ['reset', 'reset_form', 'resetForm'].forEach((name) =>
      it(`"${name}" vacía el formulario y se reporta al host`, () => {
        click(name);

        expect(component.formGroup.value).toEqual({ name: null });
        expect(actions).toEqual([name]);
      }),
    );

    it('submit_order envía el formulario y no se reporta como acción (llega formSubmit)', () => {
      const submitted: unknown[] = [];
      component.formSubmit.subscribe((v) => submitted.push(v));

      click('submit_order');

      expect(submitted).toEqual([{ name: 'Ana' }]);
      expect(actions).toEqual([]);
    });

    it('una palabra que solo contiene submit (resubmit) no envía nada', () => {
      const submitted: unknown[] = [];
      component.formSubmit.subscribe((v) => submitted.push(v));

      click('resubmit_later');

      expect(submitted).toEqual([]);
      expect(actions).toEqual(['resubmit_later']);
    });
  });

  // --- ATRIBUTOS HTML: llegan como texto ---
  describe('inputs que llegan como atributos HTML (texto)', () => {
    const set = (name: string, value: unknown) => {
      fixture.componentRef.setInput(name, value);
      return component as unknown as Record<string, unknown>;
    };

    it('show-back-to-top="false" desactiva el botón (antes el texto "false" contaba como verdadero)', () => {
      expect(set('showBackToTop', 'false')['showBackToTop']).toBeFalse();
    });

    it('un atributo booleano presente sin valor o con "true" es verdadero', () => {
      expect(set('showBackToTop', '')['showBackToTop']).toBeTrue();
      expect(set('debug', 'true')['debug']).toBeTrue();
      expect(set('debug', 'false')['debug']).toBeFalse();
    });

    it('show-error-page="false" desactiva la página de error', () => {
      expect(set('showErrorPage', 'false')['showErrorPage']).toBeFalse();
      expect(set('showErrorPage', 'true')['showErrorPage']).toBeTrue();
    });

    it('los atributos numéricos se convierten a número', () => {
      expect(set('scrollOffset', '72')['scrollOffset']).toBe(72);
      expect(set('gridGap', '16')['gridGap']).toBe(16);
      expect(set('backToTopThreshold', '800')['backToTopThreshold']).toBe(800);
      expect(set('formStateDebounce', '0')['formStateDebounce']).toBe(0);
    });

    it('un valor numérico inválido cae al valor por defecto de ese input', () => {
      expect(set('scrollOffset', 'abc')['scrollOffset']).toBe(0);
      expect(set('backToTopThreshold', 'abc')['backToTopThreshold']).toBe(400);
      expect(set('formStateDebounce', 'abc')['formStateDebounce']).toBe(150);
    });

    it('los números y booleanos asignados como propiedad JS siguen funcionando', () => {
      expect(set('scrollOffset', 56)['scrollOffset']).toBe(56);
      expect(set('showBackToTop', false)['showBackToTop']).toBeFalse();
    });
  });
});
