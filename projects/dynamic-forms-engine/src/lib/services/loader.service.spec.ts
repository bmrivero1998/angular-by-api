import { TestBed } from '@angular/core/testing';
import { LoaderService } from './loader.service';
import { skip } from 'rxjs/operators';

describe('LoaderService', () => {
  let service: LoaderService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LoaderService]
    });
    service = TestBed.inject(LoaderService);
  });
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial isLoading value as false', (done) => {
    service.isLoading.subscribe((value) => {
      expect(value).toBeFalse();
      done();
    });
  });

  describe('show()', () => {
    it('should set isLoading to true when called', (done) => {
      service.show();
      service.isLoading.subscribe((value) => {
        expect(value).toBeTrue();
        done();
      });
    });

    it('should increment requestCount internally (tested via state transitions)', (done) => {
      service.show(); // count = 1
      service.show(); // count = 2
      
      service.hide(); // count = 1, should still be loading
      
      service.isLoading.subscribe((value) => {
        expect(value).toBeTrue();
        done();
      });
    });
  });

  describe('hide()', () => {
    it('should set isLoading to false when requestCount reaches zero', (done) => {
      service.show();
      service.hide();

      service.isLoading.subscribe((value) => {
        expect(value).toBeFalse();
        done();
      });
    });

    it('should remain loading if there are still pending requests', () => {
      service.show(); // 1
      service.show(); // 2
      service.hide(); // 1

      expect(service.isLoading.getValue()).toBeTrue();
    });

    it('should set isLoading to false only after the last hide() call', () => {
      service.show(); // 1
      service.show(); // 2
      
      service.hide(); // 1
      expect(service.isLoading.getValue()).toBeTrue();
      
      service.hide(); // 0
      expect(service.isLoading.getValue()).toBeFalse();
    });

    it('should handle negative requestCount by resetting to zero and setting loading to false', () => {
      // Calling hide without show
      service.hide();
      
      expect(service.isLoading.getValue()).toBeFalse();
      
      // Internal count should be 0. If we call show now, it should go to 1.
      service.show();
      expect(service.isLoading.getValue()).toBeTrue();
    });
  });

  describe('Reactive behavior', () => {
    it('should emit true then false in sequence', (done) => {
      const emissions: boolean[] = [];
      
      // Use skip(1) to ignore the initial BehaviorSubject value (false)
      service.isLoading.pipe(skip(1)).subscribe(val => {
        emissions.push(val);
        if (emissions.length === 2) {
          expect(emissions).toEqual([true, false]);
          done();
        }
      });

      service.show();
      service.hide();
    });
  });
});