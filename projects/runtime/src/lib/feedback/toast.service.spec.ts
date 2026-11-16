import { TestBed } from '@angular/core/testing';
import { ToastService, Toast } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ToastService]
    });
    service = TestBed.inject(ToastService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should emit a toast when show() is called', (done) => {
    const mockToast: Toast = { 
      message: 'Operación exitosa', 
      classname: 'bg-success', 
      delay: 3000 
    };

    service.toast$.subscribe((toast) => {
      expect(toast).toEqual(mockToast);
      done();
    });

    service.show('Operación exitosa', { classname: 'bg-success', delay: 3000 });
  });

  it('should use default empty options if none are provided', (done) => {
    service.toast$.subscribe((toast) => {
      expect(toast.message).toBe('Mensaje simple');
      expect(toast.classname).toBeUndefined();
      expect(toast.delay).toBeUndefined();
      done();
    });

    service.show('Mensaje simple');
  });

  it('should handle partial options correctly', (done) => {
    service.toast$.subscribe((toast) => {
      expect(toast.message).toBe('Parcial');
      expect(toast.classname).toBe('warning');
      expect(toast.delay).toBeUndefined();
      done();
    });

    service.show('Parcial', { classname: 'warning' });
  });
});