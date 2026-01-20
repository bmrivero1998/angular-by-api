import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DynamicValidationService } from './dynamic-validation.service';
import { DYNAMIC_CONFIG } from '../dynamic-config.token';
import { FormControl } from '@angular/forms';
import { AsyncValidatorConfig } from '../models/form-field-mapping.model';
import { Observable } from 'rxjs';

describe('DynamicValidationService', () => {
  let service: DynamicValidationService;
  let httpMock: HttpTestingController;

  // Mock de la configuración global
  const mockConfig = { apiUrl: 'https://api.example.com' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        DynamicValidationService,
        // Inyectamos la configuración para probar que construye bien las URLs
        { provide: DYNAMIC_CONFIG, useValue: mockConfig }
      ]
    });
    service = TestBed.inject(DynamicValidationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Verificar que no queden peticiones pendientes
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('createAsyncValidator', () => {
    
    // --- ESCENARIO 1: Control Vacío ---
    it('should return null (valid) immediately if control value is empty', (done) => {
      const config = { endpoint: '/test', method: 'GET', errorKey: 'err' } as AsyncValidatorConfig;
      const validator = service.createAsyncValidator(config);
      const control = new FormControl(''); // Valor vacío

      (validator(control) as Observable<any>).subscribe(result => {
        expect(result).toBeNull();
        done();
      });

      // No debe haber llamado a HTTP
      httpMock.expectNone('https://api.example.com/test');
    });

    // --- ESCENARIO 2: Validación GET Exitosa (Disponible) ---
    it('should perform GET request and return null when value is available', fakeAsync(() => {
      const config: AsyncValidatorConfig = {
        endpoint: '/users/check',
        method: 'GET',
        errorKey: 'usernameTaken',
        debounceTime: 300, // Tiempo personalizado
        message: 'Username is already taken'
      };
      const validator = service.createAsyncValidator(config);
      const control = new FormControl('newUser');

      // Ejecutamos el validador
      (validator(control) as Observable<any>).subscribe(result => {
        expect(result).toBeNull(); // isAvailable: true => null (válido)
      });

      // Avanzamos el tiempo para superar el debounce
      tick(300);

      // Verificamos la petición GET con parámetros
      const req = httpMock.expectOne('https://api.example.com/users/check?value=newUser');
      expect(req.request.method).toBe('GET');
      
      // Simulamos respuesta positiva
      req.flush({ isAvailable: true });
    }));

    // --- ESCENARIO 3: Validación GET Fallida (No Disponible) ---
    it('should return error object when value is NOT available', fakeAsync(() => {
      const config: AsyncValidatorConfig = {
        endpoint: '/users/check',
        method: 'GET',
        errorKey: 'usernameTaken',
        debounceTime: 300,
        message: 'Username is already taken'
      };
      const validator = service.createAsyncValidator(config);
      const control = new FormControl('takenUser');

      (validator(control) as Observable<any>).subscribe(result => {
        // isAvailable: false => objeto de error
        expect(result).toEqual({ usernameTaken: true });
      });

      tick(300);

      const req = httpMock.expectOne('https://api.example.com/users/check?value=takenUser');
      req.flush({ isAvailable: false });
    }));

    // --- ESCENARIO 4: Validación POST ---
    it('should perform POST request with body when configured', fakeAsync(() => {
      const config: AsyncValidatorConfig = {
        endpoint: '/auth/check-email',
        method: 'POST',
        errorKey: 'emailTaken'
      } as AsyncValidatorConfig;
      
      const validator = service.createAsyncValidator(config);
      const control = new FormControl('test@mail.com');

      (validator(control) as Observable<any>).subscribe();

      // Debounce por defecto es 500ms
      tick(500);

      const req = httpMock.expectOne('https://api.example.com/auth/check-email');
      expect(req.request.method).toBe('POST');
      // Verificamos que el body sea correcto
      expect(req.request.body).toEqual({ value: 'test@mail.com' });
      
      req.flush({ isAvailable: true });
    }));

    // --- ESCENARIO 5: Manejo de Errores HTTP ---
    it('should treat HTTP errors as valid (graceful degradation)', fakeAsync(() => {
      // Si la API falla (500, 404), no queremos bloquear al usuario, así que retornamos null
      const config = { endpoint: '/check', method: 'GET', errorKey: 'err' } as AsyncValidatorConfig;
      const validator = service.createAsyncValidator(config);
      const control = new FormControl('val');

      (validator(control) as Observable<any>).subscribe(result => {
        expect(result).toBeNull(); // Debe ser válido aunque falle la API
      });

      tick(500);

      const req = httpMock.expectOne('https://api.example.com/check?value=val');
      req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
    }));

    // --- ESCENARIO 6: Debounce por Defecto ---
    it('should use default debounce of 500ms if not provided', fakeAsync(() => {
      const config = { endpoint: '/check', method: 'GET', errorKey: 'err' } as AsyncValidatorConfig;
      // Sin debounceTime
      const validator = service.createAsyncValidator(config);
      const control = new FormControl('val');

      (validator(control) as Observable<any>).subscribe();

      // Avanzamos 499ms - No debe haber petición aún
      tick(499);
      httpMock.expectNone('https://api.example.com/check?value=val');

      // Avanzamos 1ms más (Total 500ms) - Ahora sí
      tick(1);
      const req = httpMock.expectOne('https://api.example.com/check?value=val');
      req.flush({ isAvailable: true });
    }));
  });
});