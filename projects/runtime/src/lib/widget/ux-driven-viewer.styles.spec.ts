import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DYNAMIC_CONFIG, DynamicLibraryConfig } from '@ux-driven-viewer/engine';
import { STYLESHEET_MARK } from '../styles/stylesheet-loader';
import { UXDrivenViewerWidgetComponent } from './ux-driven-viewer.component';

/** Estilos externos: `stylesheets`, `cssLinks` de las secciones y `error-class` / `success-class`. */
describe('UXDrivenViewerWidgetComponent (estilos)', () => {
  let fixture: ComponentFixture<UXDrivenViewerWidgetComponent>;
  let config: DynamicLibraryConfig;

  const links = () => Array.from(document.querySelectorAll<HTMLLinkElement>(`link[${STYLESHEET_MARK}]`)).map((l) => l.href);
  const section = (cssLinks?: string[]) => [
    { id_DocumentHTMLCSS: 'a', renderType: 'static', htmlComponent: '<p>hola</p>', cssLinks },
  ];

  beforeEach(async () => {
    config = { errorClassName: 'is-invalid', successClassName: 'is-valid' };
    await TestBed.configureTestingModule({
      imports: [UXDrivenViewerWidgetComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: DYNAMIC_CONFIG, useValue: config }],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    document.querySelectorAll(`link[${STYLESHEET_MARK}]`).forEach((link) => link.remove());
  });

  function create(inputs: Record<string, unknown>): string[] {
    fixture = TestBed.createComponent(UXDrivenViewerWidgetComponent);
    Object.entries(inputs).forEach(([key, value]) => fixture.componentRef.setInput(key, value));
    const errors: string[] = [];
    fixture.componentInstance.errorOccurred.subscribe((e) => errors.push(e));
    fixture.detectChanges();
    return errors;
  }

  describe('stylesheets (lo declara el host)', () => {
    it('carga las hojas indicadas, sin pasar por la regla de orígenes', () => {
      create({ stylesheets: 'https://cdn.example.invalid/bootstrap.css, https://otro.example.invalid/marca.css' });
      expect(links()).toEqual(['https://cdn.example.invalid/bootstrap.css', 'https://otro.example.invalid/marca.css']);
    });

    it('acepta un arreglo asignado por JS', () => {
      create({ stylesheets: ['https://cdn.example.invalid/a.css'] });
      expect(links()).toEqual(['https://cdn.example.invalid/a.css']);
    });

    it('carga las que se añaden después', () => {
      create({ stylesheets: 'https://cdn.example.invalid/a.css' });
      fixture.componentRef.setInput('stylesheets', 'https://cdn.example.invalid/a.css https://cdn.example.invalid/b.css');
      fixture.detectChanges();
      expect(links()).toEqual(['https://cdn.example.invalid/a.css', 'https://cdn.example.invalid/b.css']);
    });

    it('sin stylesheets no toca el <head>', () => {
      create({ localSchema: section() });
      expect(links()).toEqual([]);
    });
  });

  describe('cssLinks (lo pide el JSON)', () => {
    it('carga una relativa', () => {
      create({ localSchema: section(['/css/marca.css']) });
      expect(links().length).toBe(1);
      expect(links()[0]).toContain('/css/marca.css');
    });

    it('carga una de un origen declarado en allowed-origins', () => {
      const errors = create({ allowedOrigins: 'https://cdn.example.invalid', localSchema: section(['https://cdn.example.invalid/tw.css']) });
      expect(links()).toEqual(['https://cdn.example.invalid/tw.css']);
      expect(errors).toEqual([]);
    });

    it('rechaza una de otro origen: no la carga y lo informa', () => {
      const errors = create({ localSchema: section(['https://malo.example.invalid/x.css']) });
      expect(links()).toEqual([]);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('malo.example.invalid');
      expect(errors[0]).toContain('"a"');
    });

    it('rechaza javascript: y data:', () => {
      const errors = create({ localSchema: section(['javascript:alert(1)', 'data:text/css,a{}']) });
      expect(links()).toEqual([]);
      expect(errors.length).toBe(2);
    });

    it('una hoja repetida en varias secciones se carga una vez', () => {
      create({
        localSchema: [
          { id_DocumentHTMLCSS: 'a', renderType: 'static', htmlComponent: '<p>a</p>', cssLinks: ['/css/x.css'] },
          { id_DocumentHTMLCSS: 'b', renderType: 'static', htmlComponent: '<p>b</p>', cssLinks: ['/css/x.css'] },
        ],
      });
      expect(links().length).toBe(1);
    });
  });

  describe('error-class / success-class', () => {
    it('cambian las clases de validación del motor', () => {
      create({ errorClass: 'border-red-500 bg-red-50', successClass: 'border-green-500' });
      expect(config.errorClassName).toBe('border-red-500 bg-red-50');
      expect(config.successClassName).toBe('border-green-500');
    });

    it('sin indicarlas, se conservan las de la configuración', () => {
      create({});
      expect(config.errorClassName).toBe('is-invalid');
      expect(config.successClassName).toBe('is-valid');
    });
  });
});
