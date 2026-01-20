import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ToastContainerComponent } from './toast-container.component';
import { ToastService, Toast } from '../../../../projects/dynamic-forms-engine/src/lib/services/toast.service';
import { Subject } from 'rxjs';

describe('ToastContainerComponent', () => {
  let component: ToastContainerComponent;
  let fixture: ComponentFixture<ToastContainerComponent>;
  
  let toastServiceMock: { toast$: Subject<Toast> };
  let bsToastInstanceSpy: { show: jasmine.Spy; dispose: jasmine.Spy };

  beforeEach(async () => {
    const toastSubject = new Subject<Toast>();
    toastServiceMock = { toast$: toastSubject };

    bsToastInstanceSpy = {
      show: jasmine.createSpy('show'),
      dispose: jasmine.createSpy('dispose')
    };

    // Mock global de Bootstrap
    (window as any).bootstrap = {
      Toast: jasmine.createSpy('Toast').and.returnValue(bsToastInstanceSpy)
    };

    await TestBed.configureTestingModule({
      imports: [ToastContainerComponent],
      providers: [
        { provide: ToastService, useValue: toastServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ToastContainerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    delete (window as any).bootstrap;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ESCENARIO 1: Recepción de Toasts ---
  it('should add toast to array and show it via Bootstrap when service emits', fakeAsync(() => {
    const mockDomElement = document.createElement('div');
    spyOn(document, 'querySelectorAll').and.returnValue([mockDomElement] as any);

    // CORRECCIÓN: Usamos 'message' en lugar de 'title/body'
    const newToast: Toast = { message: 'Test Message', delay: 1000, classname: 'bg-success' };
    
    toastServiceMock.toast$.next(newToast);

    expect(component.toasts.length).toBe(1);
    expect(component.toasts[0]).toEqual(newToast);

    tick();

    expect((window as any).bootstrap.Toast).toHaveBeenCalledWith(mockDomElement);
    expect(bsToastInstanceSpy.show).toHaveBeenCalled();
  }));

  // --- ESCENARIO 2: Limpieza Automática ---
  it('should remove toast from array when "hidden.bs.toast" event fires', fakeAsync(() => {
    const mockDomElement = document.createElement('div');
    spyOn(document, 'querySelectorAll').and.returnValue([mockDomElement] as any);
    spyOn(mockDomElement, 'addEventListener');

    // CORRECCIÓN: Estructura válida
    toastServiceMock.toast$.next({ message: 'Auto Remove' });
    tick();

    expect(component.toasts.length).toBe(1);

    // Ejecutar callback manualmente
    const addEventCalls = (mockDomElement.addEventListener as jasmine.Spy).calls.mostRecent();
    const callback = addEventCalls.args[1];
    callback();

    expect(component.toasts.length).toBe(0);
  }));

  // --- ESCENARIO 3: Robustez ---
  it('should not crash if no toast elements are found in DOM', fakeAsync(() => {
    spyOn(document, 'querySelectorAll').and.returnValue([] as any);

    toastServiceMock.toast$.next({ message: 'Ghost Toast' });
    tick();

    expect((window as any).bootstrap.Toast).not.toHaveBeenCalled();
    expect(component.toasts.length).toBe(1);
  }));

  // --- ESCENARIO 4: Eliminación Manual ---
  it('should remove toast manually via remove() method', () => {
    // CORRECCIÓN: Datos iniciales válidos
    component.toasts = [
      { message: 'Message A' },
      { message: 'Message B' }, // Index 1
      { message: 'Message C' }
    ];

    component.remove(1);

    expect(component.toasts.length).toBe(2);
    expect(component.toasts[0].message).toBe('Message A');
    expect(component.toasts[1].message).toBe('Message C');
  });

  // --- ESCENARIO 5: Limpieza de Memoria ---
  it('should unsubscribe on destroy', () => {
    component.ngOnInit();
    const subscriptionSpy = spyOn((component as any).toastSubscription, 'unsubscribe');
    component.ngOnDestroy();
    expect(subscriptionSpy).toHaveBeenCalled();
  });
});