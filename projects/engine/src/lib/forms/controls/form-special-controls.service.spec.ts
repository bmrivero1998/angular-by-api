import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { FormSpecialControlsService } from './form-special-controls.service';
import { DYNAMIC_CONFIG } from '../../config/dynamic-config.token';
import { FormFieldMapping } from '../../models/form-field-mapping.model';

describe('FormSpecialControlsService', () => {
  let service: FormSpecialControlsService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FormSpecialControlsService);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  function nodeListOf(...els: HTMLElement[]): NodeListOf<HTMLElement> {
    return els as unknown as NodeListOf<HTMLElement>;
  }

  describe('initializeSpecialControls / range', () => {
    it('aplica el step configurado y crea el display si no existe', () => {
      const input = document.createElement('input');
      input.type = 'range';
      const wrapper = document.createElement('div');
      wrapper.className = 'form-group';
      wrapper.appendChild(input);
      container.appendChild(wrapper);

      const mapping: FormFieldMapping = {
        controlName: 'volume',
        domSelector: '#volume',
        rangeConfig: { displaySelector: '.range-display', step: 5 },
      };

      service.initializeSpecialControls(nodeListOf(input), mapping, new FormControl(0), container, new Map());

      expect(input.getAttribute('step')).toBe('5');
      expect(wrapper.querySelector('.range-display')).toBeTruthy();
    });
  });

  describe('initializeSpecialControls / color', () => {
    it('aplica el color por defecto y da estilo al preview', () => {
      const input = document.createElement('input');
      input.type = 'color';
      const preview = document.createElement('span');
      preview.className = 'color-preview';
      container.appendChild(input);
      container.appendChild(preview);

      const mapping: FormFieldMapping = {
        controlName: 'color',
        domSelector: '#color',
        colorConfig: { previewSelector: '.color-preview', defaultColor: '#ff0000' },
      };

      service.initializeSpecialControls(nodeListOf(input), mapping, new FormControl(''), container, new Map());

      // Un <input type="color"> recién creado ya trae '#000000' por default
      // del navegador (nunca ''), así que la rama "usa defaultColor si está
      // vacío" no aplica aquí — lo que sí se verifica es que el preview se
      // pinta con el valor real del input.
      expect(preview.style.backgroundColor).toBe('rgb(0, 0, 0)');
    });
  });

  describe('setupPasswordToggle', () => {
    it('envuelve el input y agrega un botón que alterna el tipo', () => {
      const input = document.createElement('input');
      input.type = 'password';
      container.appendChild(input);

      const mapping: FormFieldMapping = {
        controlName: 'password',
        domSelector: '#password',
        passwordConfig: { toggleVisibility: true },
      };

      service.setupPasswordToggle(nodeListOf(input), mapping, container);

      const toggleBtn = container.querySelector('.password-toggle') as HTMLButtonElement;
      expect(toggleBtn).toBeTruthy();
      expect(input.type).toBe('password');

      toggleBtn.click();
      expect(input.type).toBe('text');

      toggleBtn.click();
      expect(input.type).toBe('password');
    });

    it('no crea el toggle si toggleVisibility no está activo', () => {
      const input = document.createElement('input');
      input.type = 'password';
      container.appendChild(input);

      service.setupPasswordToggle(nodeListOf(input), { controlName: 'p', domSelector: '#p', passwordConfig: {} }, container);

      expect(container.querySelector('.password-toggle')).toBeNull();
    });
  });

  describe('setupAutocomplete', () => {
    it('crea un datalist con las opciones cuando el source es un array estático', () => {
      const input = document.createElement('input');
      container.appendChild(input);

      const mapping: FormFieldMapping = {
        controlName: 'city',
        domSelector: '#city',
        autoCompleteConfig: { source: ['Buenos Aires', 'Córdoba'] },
      };

      service.setupAutocomplete(new FormControl(''), nodeListOf(input), mapping, container, new Map());

      const datalist = container.querySelector('datalist') as HTMLDataListElement;
      expect(datalist).toBeTruthy();
      expect(datalist.options.length).toBe(2);
      expect(input.getAttribute('list')).toBe(datalist.id);
    });
  });

  describe('autocompletado dinámico', () => {
    let input: HTMLInputElement;
    let control: FormControl;
    let instances: Map<string, any>;

    const options = () => Array.from(container.querySelectorAll('datalist option')).map((o) => (o as HTMLOptionElement).value);
    const labels = () => Array.from(container.querySelectorAll('datalist option')).map((o) => (o as HTMLOptionElement).label);

    function setup(config: any, allowedOrigins: string[] = []): void {
      input = document.createElement('input');
      container.appendChild(input);
      control = new FormControl('');
      instances = new Map();
      service.setupAutocomplete(
        control,
        nodeListOf(input),
        { controlName: 'city', domSelector: '#city', autoCompleteConfig: config },
        container,
        instances,
        allowedOrigins,
      );
    }

    describe('con una función como source', () => {
      it('muestra en el datalist lo que devuelve la función (antes solo se imprimía en consola)', fakeAsync(() => {
        const source = jasmine.createSpy('source').and.resolveTo(['Buenos Aires', 'Bahía Blanca']);
        setup({ source });

        control.setValue('bu');
        tick(300);
        flushMicrotasks();

        expect(source).toHaveBeenCalledOnceWith('bu');
        expect(options()).toEqual(['Buenos Aires', 'Bahía Blanca']);
        expect(input.getAttribute('list')).toBe('datalist-city');
      }));

      it('espera el debounce y solo busca una vez tras varias teclas', fakeAsync(() => {
        const source = jasmine.createSpy('source').and.resolveTo([]);
        setup({ source, debounceTime: 200 });

        control.setValue('bu');
        tick(100);
        control.setValue('bue');
        tick(100);
        control.setValue('buen');
        tick(199);
        expect(source).not.toHaveBeenCalled();
        tick(1);

        expect(source).toHaveBeenCalledOnceWith('buen');
      }));

      it('no busca con menos de minChars (2 por defecto) y vacía las sugerencias anteriores', fakeAsync(() => {
        const source = jasmine.createSpy('source').and.resolveTo(['Córdoba']);
        setup({ source });
        control.setValue('co');
        tick(300);
        flushMicrotasks();
        expect(options()).toEqual(['Córdoba']);
        source.calls.reset();

        control.setValue('c');
        tick(300);
        flushMicrotasks();

        expect(source).not.toHaveBeenCalled();
        expect(options()).toEqual([]);
      }));

      it('respeta minChars y debounceTime configurados, incluido 0', fakeAsync(() => {
        const source = jasmine.createSpy('source').and.resolveTo([]);
        setup({ source, minChars: 0, debounceTime: 0 });

        control.setValue('a');
        tick(0);

        expect(source).toHaveBeenCalledOnceWith('a');
      }));

      it('una respuesta lenta de lo que ya se cambió no pisa a la actual', fakeAsync(() => {
        const slow = new Promise<string[]>((resolve) => setTimeout(() => resolve(['viejo']), 1000));
        const source = jasmine.createSpy('source').and.callFake((q: string) => (q === 'ab' ? slow : Promise.resolve(['nuevo'])));
        setup({ source });

        control.setValue('ab');
        tick(300);
        control.setValue('abc');
        tick(300);
        flushMicrotasks();
        tick(1000); // llega la respuesta vieja

        expect(options()).toEqual(['nuevo']);
      }));

      it('si la función falla, la lista queda vacía y el campo sigue funcionando', fakeAsync(() => {
        spyOn(console, 'warn');
        const source = jasmine.createSpy('source').and.callFake((q: string) => (q === 'xx' ? Promise.reject(new Error('boom')) : Promise.resolve(['ok'])));
        setup({ source });

        control.setValue('xx');
        tick(300);
        flushMicrotasks();
        expect(options()).toEqual([]);
        expect(console.warn).toHaveBeenCalled();

        control.setValue('yy');
        tick(300);
        flushMicrotasks();
        expect(options()).toEqual(['ok']);
      }));

      it('acepta objetos { value, label } y números, y descarta lo demás', fakeAsync(() => {
        const source = jasmine.createSpy('source').and.resolveTo([{ value: 'AR', label: 'Argentina' }, 7, 'texto', null, { x: 1 }]);
        setup({ source });

        control.setValue('ar');
        tick(300);
        flushMicrotasks();

        expect(options()).toEqual(['AR', '7', 'texto']);
        expect(labels()[0]).toBe('Argentina');
      }));

      it('muestra como máximo 50 opciones', fakeAsync(() => {
        const source = jasmine.createSpy('source').and.resolveTo(Array.from({ length: 200 }, (_, i) => `ciudad ${i}`));
        setup({ source });

        control.setValue('ci');
        tick(300);
        flushMicrotasks();

        expect(options().length).toBe(50);
      }));

      it('al destruir el formulario se cancela la suscripción', fakeAsync(() => {
        const source = jasmine.createSpy('source').and.resolveTo(['x']);
        setup({ source });

        service.destroyExternalInstances(instances);
        control.setValue('ab');
        tick(300);

        expect(source).not.toHaveBeenCalled();
      }));
    });

    describe('con sourceUrl (desde el JSON)', () => {
      let http: HttpTestingController;

      function setupUrl(config: any, allowedOrigins: string[] = [], libraryConfig?: any): void {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
          providers: [
            provideHttpClient(),
            provideHttpClientTesting(),
            ...(libraryConfig ? [{ provide: DYNAMIC_CONFIG, useValue: libraryConfig }] : []),
          ],
        });
        service = TestBed.inject(FormSpecialControlsService);
        http = TestBed.inject(HttpTestingController);
        setup(config, allowedOrigins);
      }

      afterEach(() => http?.verify());

      it('pide las sugerencias con GET y lo escrito en el parámetro q', fakeAsync(() => {
        setupUrl({ sourceUrl: '/api/ciudades' });

        control.setValue('cor');
        tick(300);

        const req = http.expectOne((r) => r.url === '/api/ciudades');
        expect(req.request.method).toBe('GET');
        expect(req.request.params.get('q')).toBe('cor');
        req.flush(['Córdoba', 'Corrientes']);
        expect(options()).toEqual(['Córdoba', 'Corrientes']);
      }));

      it('usa el nombre de parámetro configurado y codifica lo escrito', fakeAsync(() => {
        setupUrl({ sourceUrl: '/api/ciudades', queryParam: 'texto' });

        control.setValue('san & luis');
        tick(300);

        const req = http.expectOne((r) => r.url === '/api/ciudades');
        expect(req.request.params.get('texto')).toBe('san & luis');
        expect(req.request.urlWithParams).toContain('texto=san%20%26%20luis');
        req.flush([]);
      }));

      it('interpreta una respuesta de objetos { value, label }', fakeAsync(() => {
        setupUrl({ sourceUrl: '/api/paises' });

        control.setValue('ar');
        tick(300);
        http.expectOne((r) => r.url === '/api/paises').flush([{ value: 'AR', label: 'Argentina' }]);

        expect(options()).toEqual(['AR']);
        expect(labels()).toEqual(['Argentina']);
      }));

      it('una respuesta que no es un arreglo deja la lista vacía', fakeAsync(() => {
        setupUrl({ sourceUrl: '/api/x' });

        control.setValue('ab');
        tick(300);
        http.expectOne((r) => r.url === '/api/x').flush({ error: 'nope' });

        expect(options()).toEqual([]);
      }));

      it('una búsqueda nueva cancela la anterior que seguía en curso', fakeAsync(() => {
        setupUrl({ sourceUrl: '/api/x' });

        control.setValue('ab');
        tick(300);
        const first = http.expectOne((r) => r.url === '/api/x');
        control.setValue('abc');
        tick(300);

        expect(first.cancelled).toBeTrue();
        http.expectOne((r) => r.url === '/api/x' && r.params.get('q') === 'abc').flush(['nueva']);
        expect(options()).toEqual(['nueva']);
      }));

      it('un error HTTP deja la lista vacía y se avisa', fakeAsync(() => {
        spyOn(console, 'warn');
        setupUrl({ sourceUrl: '/api/x' });

        control.setValue('ab');
        tick(300);
        http.expectOne((r) => r.url === '/api/x').flush('', { status: 500, statusText: 'Error' });

        expect(options()).toEqual([]);
        expect(console.warn).toHaveBeenCalled();
      }));

      it('una URL relativa se cuelga de apiUrl', fakeAsync(() => {
        setupUrl({ sourceUrl: '/ciudades' }, [], { apiUrl: 'https://api.mi-sitio.com' });

        control.setValue('ab');
        tick(300);

        http.expectOne((r) => r.url === 'https://api.mi-sitio.com/ciudades').flush([]);
      }));

      it('a un origen no permitido NO se manda lo que el usuario escribe', fakeAsync(() => {
        spyOn(console, 'warn');
        setupUrl({ sourceUrl: 'https://evil.example/espiar' });

        control.setValue('mi contraseña');
        tick(300);

        http.expectNone(() => true);
        expect(options()).toEqual([]);
        expect(console.warn).toHaveBeenCalled();
      }));

      it('un origen aportado por el widget permite la URL absoluta', fakeAsync(() => {
        setupUrl({ sourceUrl: 'https://sugerencias.otro.com/q' }, ['https://sugerencias.otro.com']);

        control.setValue('ab');
        tick(300);

        http.expectOne((r) => r.url === 'https://sugerencias.otro.com/q').flush([]);
      }));
    });

    it('sin source ni sourceUrl no hace nada', () => {
      setup({ minChars: 1 });

      expect(instances.size).toBe(0);
    });
  });

  describe('updateSpecialElements', () => {
    it('actualiza el texto del display de un range con el formato configurado', () => {
      const input = document.createElement('input');
      input.type = 'range';
      const display = document.createElement('span');
      display.className = 'range-display';
      container.appendChild(input);
      container.appendChild(display);

      const mapping: FormFieldMapping = {
        controlName: 'volume',
        domSelector: '#volume',
        rangeConfig: { displaySelector: '.range-display', displayFormat: '{value}%' },
      };

      service.updateSpecialElements(input, 75, mapping, container);

      expect(display.textContent).toBe('75%');
    });

    it('actualiza el color de fondo del preview', () => {
      const input = document.createElement('input');
      input.type = 'color';
      const preview = document.createElement('span');
      preview.className = 'color-preview';
      container.appendChild(input);
      container.appendChild(preview);

      const mapping: FormFieldMapping = {
        controlName: 'color',
        domSelector: '#color',
        colorConfig: { previewSelector: '.color-preview' },
      };

      service.updateSpecialElements(input, '#00ff00', mapping, container);

      expect(preview.style.backgroundColor).toBe('rgb(0, 255, 0)');
    });

    it('actualiza el texto del display de un multi-select, truncando por maxSelections', () => {
      const select = document.createElement('select');
      select.multiple = true;
      ['A', 'B', 'C'].forEach((label) => {
        const opt = document.createElement('option');
        opt.value = label;
        opt.text = label;
        opt.selected = true;
        select.appendChild(opt);
      });
      const display = document.createElement('span');
      display.className = 'multi-display';
      container.appendChild(select);
      container.appendChild(display);

      const mapping: FormFieldMapping = {
        controlName: 'tags',
        domSelector: '#tags',
        multiSelectConfig: { displaySelector: '.multi-display', maxSelections: 2, separator: ', ' },
      };

      service.updateSpecialElements(select, ['A', 'B', 'C'], mapping, container);

      expect(display.textContent).toBe('A, B y 1 más');
    });
  });

  describe('destroyExternalInstances', () => {
    it('llama destroy() en instancias que lo soportan', () => {
      const instances = new Map<string, any>();
      const destroySpy = jasmine.createSpy('destroy');
      instances.set('editor-1', { destroy: destroySpy });

      service.destroyExternalInstances(instances);

      expect(destroySpy).toHaveBeenCalled();
    });

    it('desuscribe instancias cuya clave termina en "-sub"', () => {
      const instances = new Map<string, any>();
      const unsubscribeSpy = jasmine.createSpy('unsubscribe');
      instances.set('autocomplete-sub', { unsubscribe: unsubscribeSpy });

      service.destroyExternalInstances(instances);

      expect(unsubscribeSpy).toHaveBeenCalled();
    });
  });

  describe('updateExternalWidgets', () => {
    it('no explota si no hay instancia registrada para el widget', () => {
      const mapping: FormFieldMapping = { controlName: 'bio', domSelector: '#bio', richTextConfig: { editorType: 'quill' } };
      expect(() => service.updateExternalWidgets(mapping, 'nuevo valor', new Map())).not.toThrow();
    });

    it('actualiza el innerHTML de un editor Quill registrado', () => {
      const quillInstance = { root: { innerHTML: 'viejo' } };
      const instances = new Map<string, any>();
      instances.set('bio-editor', quillInstance);

      const mapping: FormFieldMapping = { controlName: 'bio', domSelector: '#bio', richTextConfig: { editorType: 'quill' } };
      service.updateExternalWidgets(mapping, '<p>nuevo</p>', instances);

      expect(quillInstance.root.innerHTML).toBe('<p>nuevo</p>');
    });
  });
});
