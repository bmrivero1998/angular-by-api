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
import { HtmlSanitizerInterceptor } from './html-sanitizer.interceptor';
import { DYNAMIC_CONFIG, DynamicLibraryConfig } from '../dynamic-config.token';

describe('HtmlSanitizerInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;

  function configure(config?: DynamicLibraryConfig): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: DYNAMIC_CONFIG, useValue: config ?? null },
        {
          provide: HTTP_INTERCEPTORS,
          useClass: HtmlSanitizerInterceptor,
          multi: true,
        },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('elimina etiquetas <script> del htmlComponent', () => {
    configure();
    let body: any;
    httpClient.get('/api/content').subscribe((res) => (body = res));

    const req = httpMock.expectOne('/api/content');
    req.flush({
      htmlComponent: JSON.stringify('<div>hola</div><script>alert(1)</script>'),
    });

    const sanitized = JSON.parse(body.htmlComponent);
    expect(sanitized).not.toContain('script');
    expect(sanitized).toContain('hola');
  });

  it('descarta el contenido si el campo HTML no es un JSON válido (fail-closed)', () => {
    configure();
    let body: any;
    httpClient.get('/api/content').subscribe((res) => (body = res));

    const req = httpMock.expectOne('/api/content');
    req.flush({ htmlComponent: '<div>no es json valido' });

    expect(JSON.parse(body.htmlComponent)).toBe('');
  });

  it('elimina construcciones peligrosas de cssComponent', () => {
    configure();
    let body: any;
    httpClient.get('/api/content').subscribe((res) => (body = res));

    const req = httpMock.expectOne('/api/content');
    req.flush({
      cssComponent: 'body { background: url(javascript:alert(1)); } @import "evil.css";',
    });

    expect(body.cssComponent).not.toMatch(/javascript\s*:/i);
    expect(body.cssComponent).not.toMatch(/@import/i);
  });

  it('neutraliza urls externas en CSS cuando disallowExternalCssResources está activo', () => {
    configure({ disallowExternalCssResources: true });
    let body: any;
    httpClient.get('/api/content').subscribe((res) => (body = res));

    const req = httpMock.expectOne('/api/content');
    req.flush({ cssComponent: "body { background: url('https://evil.com/x.png'); }" });

    expect(body.cssComponent).not.toContain('evil.com');
  });

  it('no modifica el contenido cuando sanitizationLevel es "none"', () => {
    configure({ sanitizationLevel: 'none' });
    let body: any;
    httpClient.get('/api/content').subscribe((res) => (body = res));

    const req = httpMock.expectOne('/api/content');
    const rawCss = 'body { background: url(javascript:alert(1)); }';
    req.flush({ cssComponent: rawCss });

    expect(body.cssComponent).toBe(rawCss);
  });

  it('restringe las etiquetas permitidas en modo sanitizationLevel "strict"', () => {
    configure({ sanitizationLevel: 'strict' });
    let body: any;
    httpClient.get('/api/content').subscribe((res) => (body = res));

    const req = httpMock.expectOne('/api/content');
    req.flush({ htmlComponent: JSON.stringify('<p>texto</p><a href="#">link</a><input>') });

    const sanitized = JSON.parse(body.htmlComponent);
    expect(sanitized).toContain('texto');
    expect(sanitized).not.toContain('<a');
    expect(sanitized).not.toContain('<input');
  });
});
