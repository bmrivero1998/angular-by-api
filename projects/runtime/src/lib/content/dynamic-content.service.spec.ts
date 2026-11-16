import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DynamicContentService } from './dynamic-content.service';

describe('DynamicContentService', () => {
  let service: DynamicContentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      // Importamos el módulo de testing de HTTP
      imports: [HttpClientTestingModule], 
      providers: [DynamicContentService]
    });

    // Inyectamos el servicio y el controlador de mocks
    service = TestBed.inject(DynamicContentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  // VERIFICACIÓN FINAL: Asegura que no queden peticiones pendientes después de cada test
  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- ESCENARIO 1: Petición Exitosa (GET) ---
  it('should perform a GET request to the specified URL and return data', () => {
    const mockUrl = 'https://api.test.com/v1/content';
    const mockResponse = [
      { id: 'page1', htmlComponent: '<div>Test</div>' }
    ];

    // 1. Nos suscribimos al método del servicio
    service.getContent(mockUrl).subscribe((data) => {
      expect(data).toEqual(mockResponse);
    });

    // 2. Interceptamos la petición que Angular intentó hacer
    const req = httpMock.expectOne(mockUrl);

    // 3. Verificamos que el método HTTP sea correcto
    expect(req.request.method).toBe('GET');

    // 4. Simulamos la respuesta del servidor (flush)
    req.flush(mockResponse);
  });

  // --- ESCENARIO 2: Manejo de Errores (404/500) ---
  it('should handle HTTP errors gracefully', () => {
    const mockUrl = 'https://api.test.com/error';
    const errorMessage = '404 Not Found';

    service.getContent(mockUrl).subscribe({
      next: () => fail('The request should have failed'),
      error: (error) => {
        // Verificamos que el error recibido coincida con el simulado
        expect(error.status).toBe(404);
        expect(error.statusText).toBe('Not Found');
      }
    });

    const req = httpMock.expectOne(mockUrl);

    // Simulamos una respuesta de error del servidor
    req.flush(errorMessage, { status: 404, statusText: 'Not Found' });
  });

  // --- ESCENARIO 3: URLs Dinámicas ---
  it('should support different URLs dynamically', () => {
    const urlA = 'api/content/A';
    const urlB = 'api/content/B';

    // Llamada A
    service.getContent(urlA).subscribe();
    const reqA = httpMock.expectOne(urlA);
    reqA.flush([]);

    // Llamada B
    service.getContent(urlB).subscribe();
    const reqB = httpMock.expectOne(urlB);
    reqB.flush([]);

    expect(reqA.request.url).not.toBe(reqB.request.url);
  });
});