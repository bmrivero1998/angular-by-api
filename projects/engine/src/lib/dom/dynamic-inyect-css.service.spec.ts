import { TestBed } from '@angular/core/testing';
import { DynamicInyectCssService } from './dynamic-inyect-css.service';
import { Renderer2, RendererFactory2 } from '@angular/core';
import { DOCUMENT } from '@angular/common';

describe('DynamicInyectCssService', () => {
  let service: DynamicInyectCssService;
  let renderer2Spy: jasmine.SpyObj<Renderer2>;
  let mockDocument: any;

  beforeEach(() => {
    // 1. Mock de Renderer2
    renderer2Spy = jasmine.createSpyObj('Renderer2', [
      'createElement',
      'setAttribute',
      'createText',
      'appendChild',
      'insertBefore',
      'removeChild'
    ]);

    // Configurar retornos básicos para que el flujo no se rompa
    renderer2Spy.createElement.and.callFake((name: string) => ({ tagName: name }));
    renderer2Spy.createText.and.callFake((text: string) => ({ textContent: text }));

    // 2. Mock de RendererFactory2
    const rendererFactorySpy = jasmine.createSpyObj('RendererFactory2', ['createRenderer']);
    rendererFactorySpy.createRenderer.and.returnValue(renderer2Spy);

    // 3. Mock del Document
    mockDocument = {
      head: { tagName: 'HEAD' },
      getElementById: jasmine.createSpy('getElementById'),
      // querySelector no es necesario mockearlo en document global para este servicio,
      // pero sí se usa getElementById.
    };

    TestBed.configureTestingModule({
      providers: [
        DynamicInyectCssService,
        { provide: RendererFactory2, useValue: rendererFactorySpy },
        { provide: DOCUMENT, useValue: mockDocument }
      ]
    });

    service = TestBed.inject(DynamicInyectCssService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- 1. Generación de IDs ---
  it('should generate a correct style ID', () => {
    const result = service.generateStyleId('my-comp');
    expect(result).toBe('dynamic-style-my-comp');
  });

  // --- 2. Inyección Global (HEAD) ---
  describe('injectCss (Global / HEAD)', () => {
    it('should inject style into document HEAD when no targetElement is provided', () => {
      const css = '.test { color: red; }';
      const id = 'style-1';

      service.injectCss(css, id);

      // Verificaciones
      expect(renderer2Spy.createElement).toHaveBeenCalledWith('style');
      expect(renderer2Spy.setAttribute).toHaveBeenCalledWith(jasmine.any(Object), 'id', id);
      expect(renderer2Spy.createText).toHaveBeenCalledWith(css);
      
      // Debe añadir al HEAD
      expect(renderer2Spy.appendChild).toHaveBeenCalledWith(mockDocument.head, jasmine.any(Object));
    });

    it('should try to remove existing style before injecting new one', () => {
      spyOn(service, 'removeCss'); // Espiamos el método interno
      service.injectCss('css', 'style-1');
      expect(service.removeCss).toHaveBeenCalledWith('style-1', undefined);
    });
  });

  // --- 3. Inyección Local (Target Element) ---
  describe('injectCss (Target Element)', () => {
    it('should prepend style (insertBefore) if target has children', () => {
      // Mock de un elemento destino con hijos
      const mockTarget = {
        firstChild: { tagName: 'DIV' }, // Simula tener un hijo
        tagName: 'HOST-ELEMENT',
        querySelector: jasmine.createSpy('querySelector').and.returnValue(null),
      } as any;

      service.injectCss('css', 'style-1', mockTarget);

      // Debe usar insertBefore en lugar de appendChild para el contenedor
      expect(renderer2Spy.insertBefore).toHaveBeenCalledWith(
        mockTarget, 
        jasmine.any(Object), // El elemento style
        mockTarget.firstChild // El punto de referencia
      );
    });

    it('should append style if target is empty', () => {
      // Mock de un elemento vacío
      const mockTarget = {
        firstChild: null,
        tagName: 'HOST-ELEMENT',
        querySelector: jasmine.createSpy('querySelector').and.returnValue(null),
      } as any;

      service.injectCss('css', 'style-1', mockTarget);

      // Debe usar appendChild sobre el target
      expect(renderer2Spy.appendChild).toHaveBeenCalledWith(mockTarget, jasmine.any(Object));
    });
  });

  // --- 4. Eliminación (removeCss) ---
  describe('removeCss', () => {
    
    // CASO A: Global (HEAD)
    it('should remove style from document HEAD if found globally', () => {
      const mockStyleEl = { tagName: 'STYLE' };
      mockDocument.getElementById.and.returnValue(mockStyleEl);

      service.removeCss('style-1');

      expect(mockDocument.getElementById).toHaveBeenCalledWith('style-1');
      expect(renderer2Spy.removeChild).toHaveBeenCalledWith(mockDocument.head, mockStyleEl);
    });

    it('should do nothing if style not found globally', () => {
      mockDocument.getElementById.and.returnValue(null);

      service.removeCss('style-1');

      expect(renderer2Spy.removeChild).not.toHaveBeenCalled();
    });

    // CASO B: Local (Target Element)
    it('should remove style from target element if found locally', () => {
      const mockStyleEl = { tagName: 'STYLE' };
      // Mock del target con método querySelector
      const mockTarget = {
        querySelector: jasmine.createSpy('querySelector').and.returnValue(mockStyleEl),
        tagName: 'HOST'
      } as any;

      service.removeCss('style-1', mockTarget);

      expect(mockTarget.querySelector).toHaveBeenCalledWith('style[id="style-1"]');
      expect(renderer2Spy.removeChild).toHaveBeenCalledWith(mockTarget, mockStyleEl);
    });

    it('should do nothing if style not found locally', () => {
      const mockTarget = {
        querySelector: jasmine.createSpy('querySelector').and.returnValue(null)
      } as any;

      service.removeCss('style-1', mockTarget);

      expect(renderer2Spy.removeChild).not.toHaveBeenCalled();
    });
  });
});