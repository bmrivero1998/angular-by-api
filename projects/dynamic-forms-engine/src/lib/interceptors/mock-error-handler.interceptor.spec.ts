import { TestBed } from '@angular/core/testing';
import {
  HTTP_INTERCEPTORS,
  HttpClient,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { MockErrorHandlerInterceptor } from './mock-error-handler.interceptor';
import { DynamicApiResponse } from '../interfaces/DynamicContent.interface';

describe('MockErrorHandlerInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        {
          provide: HTTP_INTERCEPTORS,
          useClass: MockErrorHandlerInterceptor,
          multi: true,
        },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function expectMockPage(status: number, expectedPageId: string): void {
    let response: DynamicApiResponse | undefined;
    httpClient.get<DynamicApiResponse>('/api/content').subscribe((res) => (response = res));

    const req = httpMock.expectOne('/api/content');
    req.flush('boom', { status, statusText: 'Error' });

    expect(response?.ok).toBeTrue();
    expect(response?.doc[0].id_DocumentHTMLCSS).toBe(expectedPageId);
  }

  it('devuelve la página de 404 cuando el backend responde 404', () => {
    expectMockPage(404, '404-page');
  });

  it('devuelve la página de acceso denegado en un 401', () => {
    expectMockPage(401, 'access-denied-page');
  });

  it('devuelve la página de acceso denegado en un 403', () => {
    expectMockPage(403, 'access-denied-page');
  });

  it('devuelve la página de mantenimiento en un 500', () => {
    expectMockPage(500, 'maintenance-page');
  });

  it('devuelve la página de mantenimiento cuando la red falla (status 0)', () => {
    expectMockPage(0, 'maintenance-page');
  });

  it('devuelve la página de error genérica por defecto para códigos sin mock específico (400)', () => {
    expectMockPage(400, 'generic-error-page');
  });

  it('devuelve la página de error genérica por defecto para códigos sin mock específico (422)', () => {
    expectMockPage(422, 'generic-error-page');
  });
});
