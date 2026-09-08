import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { DynamicContentService } from './dynamic-content.service';
import { 
  ComponentFactoryResolver, 
  Injector, 
  ApplicationRef, 
  ComponentRef, 
  EventEmitter 
} from '@angular/core';
import { Subject, of } from 'rxjs';
import { ModalFrameComponent } from '../../../../../src/app/components/modal-frame/modal-frame.component';
import { ModalService } from './modal-service.service';

describe('ModalService', () => {
  let service: ModalService;
  let dcsSpy: jasmine.SpyObj<DynamicContentService>;
  let appRefSpy: jasmine.SpyObj<ApplicationRef>;
  let resolverSpy: jasmine.SpyObj<ComponentFactoryResolver>;
  
  // Mocks para el ciclo de vida del componente dinámico
  let componentRefMock: jasmine.SpyObj<ComponentRef<ModalFrameComponent>>;
  let componentInstanceMock: any;

  beforeEach(() => {
    dcsSpy = jasmine.createSpyObj('DynamicContentService', ['getContent']);
    // Angular 19 construye ChangeDetectionSchedulerImpl (dependencia interna
    // de ApplicationRef) al resolver ComponentFactoryResolver en el injector
    // de test; ese scheduler hace `appRef.afterTick.subscribe(...)` en su
    // constructor, así que el mock necesita exponer `afterTick` como un
    // Observable real o falla con "Cannot read properties of undefined
    // (reading 'subscribe')" antes de que corra cualquier test.
    appRefSpy = jasmine.createSpyObj(
      'ApplicationRef',
      ['attachView', 'detachView'],
      { afterTick: new Subject<void>().asObservable() }
    );
    
    // Mock de la instancia del componente
    componentInstanceMock = {
      contentConfig: null,
      close: new EventEmitter<any>(),
      triggerAction: new EventEmitter<any>()
    };

    // Mock de la referencia del componente
    componentRefMock = jasmine.createSpyObj('ComponentRef', ['destroy'], {
      instance: componentInstanceMock,
      hostView: { rootNodes: [document.createElement('div')] }
    });

    // Mock del factory y el resolver
    const factoryMock = jasmine.createSpyObj('ComponentFactory', ['create']);
    factoryMock.create.and.returnValue(componentRefMock);

    resolverSpy = jasmine.createSpyObj('ComponentFactoryResolver', ['resolveComponentFactory']);
    resolverSpy.resolveComponentFactory.and.returnValue(factoryMock);

    TestBed.configureTestingModule({
      providers: [
        ModalService,
        { provide: DynamicContentService, useValue: dcsSpy },
        { provide: ApplicationRef, useValue: appRefSpy },
        { provide: ComponentFactoryResolver, useValue: resolverSpy },
        { provide: Injector, useValue: {} }
      ]
    });

    service = TestBed.inject(ModalService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('open()', () => {
    
    it('should load content from API when contentSource is a string', () => {
      const mockResponse = { content: JSON.stringify([{ id_DocumentHTMLCSS: 'test' }]) };
      dcsSpy.getContent.and.returnValue(of(mockResponse));
      
      service.open('uuid-123');

      expect(dcsSpy.getContent).toHaveBeenCalledWith('uuid-123');
      expect(resolverSpy.resolveComponentFactory).toHaveBeenCalledWith(ModalFrameComponent);
    });

    it('should render directly when contentSource is an Array', () => {
      const mockConfig = [{ id_DocumentHTMLCSS: 'local-test' }];
      
      service.open(mockConfig);

      expect(dcsSpy.getContent).not.toHaveBeenCalled();
      expect(componentInstanceMock.contentConfig).toEqual(mockConfig[0]);
    });

    it('should wrap single object into array and render', () => {
      const mockObj = { id_DocumentHTMLCSS: 'single-obj' };
      
      service.open(mockObj);

      expect(componentInstanceMock.contentConfig).toEqual(mockObj);
    });

    it('should close existing modal before opening a new one', () => {
      spyOn(service, 'close').and.callThrough();
      
      // Primera apertura
      service.open([{ id: '1' }]);
      // Segunda apertura
      service.open([{ id: '2' }]);

      expect(service.close).toHaveBeenCalled();
    });

    it('should handle invalid JSON string from API response', () => {
      spyOn(console, 'error');
      dcsSpy.getContent.and.returnValue(of({ content: '{ invalid ' }));
      
      service.open('bad-json');

      expect(console.error).toHaveBeenCalled();
    });

    it('should warn if config is empty', () => {
      spyOn(console, 'warn');
      service.open([]);
      expect(console.warn).toHaveBeenCalledWith(jasmine.stringMatching(/Configuración vacía/));
    });
  });

  describe('Modal Lifecycle & Events', () => {
    
    it('should attach view to AppRef and body', () => {
      service.open([{ id: '1' }]);
      
      expect(appRefSpy.attachView).toHaveBeenCalled();
      // Verificamos si el nodo está en el body (aunque sea un mock div)
      const nodes = (componentRefMock.hostView as any).rootNodes;
      expect(document.body.contains(nodes[0])).toBeTrue();
    });

    it('should call close() when component instance emits close', () => {
      spyOn(service, 'close').and.callThrough();
      service.open([{ id: '1' }]);

      componentInstanceMock.close.emit('result-data');

      expect(service.close).toHaveBeenCalledWith('result-data');
    });

    it('should emit to modalResult$ when component instance emits triggerAction', (done) => {
      service.open([{ id: '1' }]).subscribe(result => {
        expect(result).toEqual({ action: 'save' });
        done();
      });

      componentInstanceMock.triggerAction.emit({ action: 'save' });
    });
  });

  describe('close()', () => {
    
    it('should emit result, detach view and destroy component', () => {
      service.open([{ id: '1' }]);
      
      service.close('final-result');

      expect(appRefSpy.detachView).toHaveBeenCalled();
      expect(componentRefMock.destroy).toHaveBeenCalled();
      // Verificamos que la referencia se limpie (internamente activeComponentRef = null)
    });

    it('should reset modalResult subject after closing', (done) => {
      // Abrimos y cerramos
      service.open([{ id: '1' }]);
      service.close('first');

      // Si nos suscribimos de nuevo, no debería recibir el 'first' anterior
      service.open([{ id: '2' }]).subscribe(res => {
        expect(res).toBe('second');
        done();
      });

      componentInstanceMock.triggerAction.emit('second');
    });
  });
});