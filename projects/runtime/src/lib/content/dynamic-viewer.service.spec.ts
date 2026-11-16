import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { of, Subject } from 'rxjs';
import { ApiDrivenContent } from '@ux-driven-viewer/engine';
import { ContentChange, DynamicViewerService } from './dynamic-viewer.service';
import { DynamicContentService } from './dynamic-content.service';

describe('DynamicViewerService', () => {
  let service: DynamicViewerService;
  let dcsSpy: jasmine.SpyObj<DynamicContentService>;
  let sanitizerSpy: jasmine.SpyObj<DomSanitizer>;

  const section = (id: string, renderType: 'static' | 'dynamic', html = `<p>${id}</p>`): ApiDrivenContent => ({
    id_DocumentHTMLCSS: id,
    htmlComponent: html,
    renderType,
  });

  const ids = () => service.getContentValue().map((s) => s.id_DocumentHTMLCSS);
  const keys = () => service.getContentValue().map((s, i) => service.trackSection(i, s));

  /** Cuántas veces emitió content$ desde que se llamó. */
  function countEmissions(): () => number {
    let count = -1; // la suscripción recibe el valor actual (BehaviorSubject)
    service.content$.subscribe(() => count++);
    return () => count;
  }

  beforeEach(() => {
    dcsSpy = jasmine.createSpyObj('DynamicContentService', ['getContent']);
    sanitizerSpy = jasmine.createSpyObj('DomSanitizer', ['bypassSecurityTrustHtml']);
    sanitizerSpy.bypassSecurityTrustHtml.and.callFake((val) => val);

    TestBed.configureTestingModule({
      providers: [
        DynamicViewerService,
        { provide: DynamicContentService, useValue: dcsSpy },
        { provide: DomSanitizer, useValue: sanitizerSpy },
      ],
    });
    service = TestBed.inject(DynamicViewerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('no es un singleton: cada widget puede tener su propia instancia', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DynamicViewerService,
        { provide: DynamicContentService, useValue: dcsSpy },
        { provide: DomSanitizer, useValue: sanitizerSpy },
      ],
    });
    const other = new (DynamicViewerService as any)(dcsSpy, sanitizerSpy) as DynamicViewerService;

    other.setLocalContent([section('solo-en-otra', 'static')]);

    expect(service.getContentValue()).toEqual([]);
  });

  // --- Entradas de contenido ---
  describe('loadInitialContent', () => {
    it('carga el contenido de la API y lo deja en el orden del JSON', (done) => {
      dcsSpy.getContent.and.returnValue(of([section('a', 'dynamic'), section('b', 'static'), section('c', 'dynamic')]));

      service.loadInitialContent('page-1').subscribe((change) => {
        expect(change.mode).toBe('initial');
        expect(ids()).toEqual(['a', 'b', 'c']);
        done();
      });

      expect(dcsSpy.getContent).toHaveBeenCalledWith('page-1');
    });

    it('acepta la respuesta envuelta en { content: "<texto JSON>" }', (done) => {
      dcsSpy.getContent.and.returnValue(of({ content: JSON.stringify([section('a', 'static')]) }));

      service.loadInitialContent('p').subscribe(() => {
        expect(ids()).toEqual(['a']);
        done();
      });
    });

    it('una respuesta ilegible NO vacía lo que ya está en pantalla y se informa', (done) => {
      service.setLocalContent([section('a', 'static')]);
      dcsSpy.getContent.and.returnValue(of({ content: '{ json roto ' }));

      service.loadInitialContent('p').subscribe((change) => {
        expect(change.mode).toBe('unchanged');
        expect(change.issues[0]).toContain('JSON válido');
        expect(ids()).toEqual(['a']);
        done();
      });
    });

    it('volver a cargar el mismo contenido no cambia nada', (done) => {
      dcsSpy.getContent.and.returnValue(of([section('a', 'dynamic')]));
      service.setLocalContent([section('a', 'dynamic')]);

      service.loadInitialContent('p').subscribe((change) => {
        expect(change.mode).toBe('unchanged');
        done();
      });
    });
  });

  describe('setLocalContent (formatos de entrada)', () => {
    it('acepta un texto JSON', () => {
      service.setLocalContent(JSON.stringify([section('a', 'static')]));
      expect(ids()).toEqual(['a']);
    });

    it('acepta un objeto con la propiedad content', () => {
      service.setLocalContent({ content: JSON.stringify([section('a', 'static')]) });
      expect(ids()).toEqual(['a']);
    });

    it('acepta un arreglo', () => {
      service.setLocalContent([section('a', 'static')]);
      expect(ids()).toEqual(['a']);
    });

    it('un JSON roto no vacía la pantalla y se informa', () => {
      service.setLocalContent([section('a', 'static')]);

      const change = service.setLocalContent('{ bad json }');

      expect(change.mode).toBe('unchanged');
      expect(change.issues.length).toBe(1);
      expect(ids()).toEqual(['a']);
    });

    it('algo que no es un arreglo de secciones se informa y no cambia nada', () => {
      service.setLocalContent([section('a', 'static')]);

      const change = service.setLocalContent({ foo: 'bar' });

      expect(change.mode).toBe('unchanged');
      expect(change.issues[0]).toContain('no es un arreglo');
      expect(ids()).toEqual(['a']);
    });

    it('un arreglo vacío es válido y vacía la pantalla', () => {
      service.setLocalContent([section('a', 'dynamic')]);

      const change = service.setLocalContent([]);

      expect(ids()).toEqual([]);
      expect(change.changedIds).toEqual(['a']);
    });
  });

  // --- Validación del contenido recibido ---
  describe('contenido incompleto: se informa en vez de descartarse en silencio', () => {
    it('una sección sin renderType se pinta como static y se informa', () => {
      const change = service.setLocalContent([{ id_DocumentHTMLCSS: 'a', htmlComponent: '<p>a</p>' }]);

      expect(ids()).toEqual(['a']);
      expect(service.getContentValue()[0].renderType).toBe('static');
      expect(change.issues[0]).toContain('"a"');
      expect(change.issues[0]).toContain('renderType');
    });

    it('un renderType con un typo se trata igual', () => {
      const change = service.setLocalContent([{ ...section('a', 'static'), renderType: 'dinamic' }]);

      expect(service.getContentValue()[0].renderType).toBe('static');
      expect(change.issues[0]).toContain('dinamic');
    });

    it('una sección sin id recibe section-<posición> y se informa', () => {
      const change = service.setLocalContent([section('a', 'static'), { htmlComponent: '<p>x</p>', renderType: 'static' }]);

      expect(ids()).toEqual(['a', 'section-2']);
      expect(change.issues[0]).toContain('section-2');
    });

    it('un id repetido conserva la primera sección y se informa', () => {
      const change = service.setLocalContent([section('a', 'static', '<p>primera</p>'), section('a', 'dynamic', '<p>segunda</p>')]);

      expect(ids()).toEqual(['a']);
      expect(service.getContentValue()[0].htmlComponent).toBe('<p>primera</p>');
      expect(change.issues[0]).toContain('repetido');
    });

    it('algo que no es un objeto se ignora y se informa', () => {
      const change = service.setLocalContent([section('a', 'static'), 'texto', null, 7]);

      expect(ids()).toEqual(['a']);
      expect(change.issues.length).toBe(3);
    });

    it('no modifica el objeto que recibió', () => {
      const original = { id_DocumentHTMLCSS: 'a', htmlComponent: '<p>a</p>' } as any;

      service.setLocalContent([original]);

      expect(original.renderType).toBeUndefined();
    });
  });

  // --- Orden ---
  describe('orden', () => {
    it('static y dynamic se pintan en el orden del JSON, no las estáticas primero', () => {
      service.setLocalContent([
        section('contenido', 'dynamic'),
        section('footer', 'static'),
        section('mas-contenido', 'dynamic'),
        section('nav', 'static'),
      ]);

      expect(ids()).toEqual(['contenido', 'footer', 'mas-contenido', 'nav']);
    });
  });

  // --- Reconciliación: qué se vuelve a pintar ---
  describe('reconciliación por id', () => {
    const initial = () => [
      section('nav', 'static'),
      section('form', 'dynamic', '<form>f</form>'),
      section('news', 'dynamic', '<p>viejo</p>'),
      section('footer', 'static'),
    ];

    beforeEach(() => service.setLocalContent(initial()));

    it('la primera vez es initial y lista todas las secciones como cambiadas', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          DynamicViewerService,
          { provide: DynamicContentService, useValue: dcsSpy },
          { provide: DomSanitizer, useValue: sanitizerSpy },
        ],
      });
      const fresh = TestBed.inject(DynamicViewerService);

      const change = fresh.setLocalContent(initial());

      expect(change.mode).toBe('initial');
      expect(change.changedIds).toEqual(['nav', 'form', 'news', 'footer']);
    });

    it('reenviar lo mismo no cambia nada: no emite y conserva todas las secciones', () => {
      const before = service.getContentValue();
      const emissions = countEmissions();
      const keysBefore = keys();

      const change = service.setLocalContent(initial());

      expect(change).toEqual({ mode: 'unchanged', changedIds: [], issues: [] });
      expect(emissions()).toBe(0);
      expect(service.getContentValue()).toBe(before);
      expect(keys()).toEqual(keysBefore);
    });

    it('un orden de claves distinto en el JSON no cuenta como cambio', () => {
      const reordered = initial().map((s) => Object.fromEntries(Object.entries(s).reverse())) as ApiDrivenContent[];

      expect(service.setLocalContent(reordered).mode).toBe('unchanged');
    });

    describe('cambia solo una sección dynamic', () => {
      const withNewsChanged = () => initial().map((s) => (s.id_DocumentHTMLCSS === 'news' ? { ...s, htmlComponent: '<p>nuevo</p>' } : s));

      it('es patched y solo se informa esa sección', () => {
        const change = service.setLocalContent(withNewsChanged());

        expect(change.mode).toBe('patched');
        expect(change.changedIds).toEqual(['news']);
        expect(service.getContentValue()[2].htmlComponent).toBe('<p>nuevo</p>');
      });

      it('las demás secciones conservan su identidad: se conserva su componente y su estado', () => {
        const before = service.getContentValue();
        const keysBefore = keys();

        service.setLocalContent(withNewsChanged());

        const after = service.getContentValue();
        expect(after[0]).toBe(before[0]); // nav
        expect(after[1]).toBe(before[1]); // form (con lo que el usuario haya escrito)
        expect(after[3]).toBe(before[3]); // footer
        expect(keys()[0]).toBe(keysBefore[0]);
        expect(keys()[1]).toBe(keysBefore[1]);
        expect(keys()[3]).toBe(keysBefore[3]);
      });

      it('la sección cambiada recibe una identidad nueva: Angular recrea solo esa', () => {
        const keysBefore = keys();

        service.setLocalContent(withNewsChanged());

        expect(keys()[2]).not.toBe(keysBefore[2]);
      });

      it('un cambio en un campo anidado (formMappings) también cuenta', () => {
        const mapped = (rule: string) =>
          initial().map((s) =>
            s.id_DocumentHTMLCSS === 'form'
              ? { ...s, formMappings: [{ controlName: 'x', domSelector: '#x', showIf: rule }] }
              : s,
          );
        service.setLocalContent(mapped('a === 1'));

        const change = service.setLocalContent(mapped('a === 2'));

        expect(change).toEqual(jasmine.objectContaining({ mode: 'patched', changedIds: ['form'] }));
      });

      it('se pueden actualizar varias dinámicas a la vez', () => {
        const change = service.setLocalContent(
          initial().map((s) => (s.renderType === 'dynamic' ? { ...s, htmlComponent: `<p>${s.id_DocumentHTMLCSS} v2</p>` } : s)),
        );

        expect(change.mode).toBe('patched');
        expect(change.changedIds).toEqual(['form', 'news']);
      });
    });

    describe('se agrega, quita o reordena una dynamic', () => {
      it('agregar una dynamic es patched y no recarga las demás', () => {
        const before = service.getContentValue();
        const added = initial();
        added.splice(3, 0, section('promo', 'dynamic'));

        const change = service.setLocalContent(added);

        expect(change).toEqual(jasmine.objectContaining({ mode: 'patched', changedIds: ['promo'] }));
        expect(ids()).toEqual(['nav', 'form', 'news', 'promo', 'footer']);
        expect(service.getContentValue()[0]).toBe(before[0]);
        expect(service.getContentValue()[1]).toBe(before[1]);
      });

      it('quitar una dynamic es patched y no recarga las demás', () => {
        const before = service.getContentValue();

        const change = service.setLocalContent(initial().filter((s) => s.id_DocumentHTMLCSS !== 'news'));

        expect(change).toEqual(jasmine.objectContaining({ mode: 'patched', changedIds: ['news'] }));
        expect(ids()).toEqual(['nav', 'form', 'footer']);
        expect(service.getContentValue()[1]).toBe(before[1]);
      });

      it('reordenar dynamics solo mueve las secciones, sin recrearlas', () => {
        const before = service.getContentValue();
        const keysBefore = keys();
        const swapped = initial();
        [swapped[1], swapped[2]] = [swapped[2], swapped[1]];

        const change = service.setLocalContent(swapped);

        expect(change).toEqual({ mode: 'patched', changedIds: [], issues: [] });
        expect(ids()).toEqual(['nav', 'news', 'form', 'footer']);
        expect(service.getContentValue()[2]).toBe(before[1]);
        expect(keys()).toEqual([keysBefore[0], keysBefore[2], keysBefore[1], keysBefore[3]]);
      });
    });

    describe('cambia una sección static: se recarga TODA la pantalla', () => {
      const withNavChanged = () => initial().map((s) => (s.id_DocumentHTMLCSS === 'nav' ? { ...s, htmlComponent: '<p>otro nav</p>' } : s));

      it('es reloaded', () => {
        const change = service.setLocalContent(withNavChanged());

        expect(change.mode).toBe('reloaded');
        expect(change.changedIds).toEqual(['nav']);
      });

      it('todas las secciones reciben una identidad nueva, también las dynamic sin cambios', () => {
        const keysBefore = keys();

        service.setLocalContent(withNavChanged());

        keys().forEach((key, i) => expect(key).not.toBe(keysBefore[i]));
      });

      it('agregar o quitar una static también recarga todo', () => {
        expect(service.setLocalContent([...initial(), section('banner', 'static')]).mode).toBe('reloaded');
        expect(service.setLocalContent(initial()).mode).toBe('reloaded');
      });

      it('cambiar el renderType de una sección recarga todo', () => {
        const change = service.setLocalContent(
          initial().map((s) => (s.id_DocumentHTMLCSS === 'news' ? { ...s, renderType: 'static' as const } : s)),
        );

        expect(change.mode).toBe('reloaded');
      });

      it('reordenar las static entre sí recarga todo', () => {
        const swapped = initial();
        [swapped[0], swapped[3]] = [swapped[3], swapped[0]];

        expect(service.setLocalContent(swapped).mode).toBe('reloaded');
      });

      it('si cambian a la vez una static y una dynamic, gana la recarga completa', () => {
        const change = service.setLocalContent(
          initial().map((s) => ({ ...s, htmlComponent: `<p>${s.id_DocumentHTMLCSS} v2</p>` })),
        );

        expect(change.mode).toBe('reloaded');
        expect(change.changedIds).toEqual(['nav', 'form', 'news', 'footer']);
      });
    });
  });

  // --- updateSections: mandar solo lo que cambia ---
  describe('updateSections', () => {
    beforeEach(() =>
      service.setLocalContent([section('nav', 'static'), section('form', 'dynamic'), section('news', 'dynamic', '<p>viejo</p>')]),
    );

    it('reemplaza por id solo la sección recibida y no toca las demás', () => {
      const before = service.getContentValue();

      const change = service.updateSections([section('news', 'dynamic', '<p>nuevo</p>')]);

      expect(change).toEqual({ mode: 'patched', changedIds: ['news'], issues: [] });
      expect(ids()).toEqual(['nav', 'form', 'news']);
      expect(service.getContentValue()[2].htmlComponent).toBe('<p>nuevo</p>');
      expect(service.getContentValue()[0]).toBe(before[0]);
      expect(service.getContentValue()[1]).toBe(before[1]);
    });

    it('una sección nueva se agrega al final', () => {
      const change = service.updateSections([section('promo', 'dynamic')]);

      expect(change.mode).toBe('patched');
      expect(ids()).toEqual(['nav', 'form', 'news', 'promo']);
    });

    it('si la sección es static, recarga toda la pantalla', () => {
      const keysBefore = keys();

      const change = service.updateSections([section('nav', 'static', '<p>nuevo nav</p>')]);

      expect(change.mode).toBe('reloaded');
      expect(keys().every((key, i) => key !== keysBefore[i])).toBeTrue();
    });

    it('mandar una sección idéntica no cambia nada', () => {
      expect(service.updateSections([section('form', 'dynamic')]).mode).toBe('unchanged');
    });

    it('mezcla varias secciones en una sola llamada', () => {
      const change = service.updateSections([section('news', 'dynamic', '<p>v2</p>'), section('promo', 'dynamic')]);

      expect(change.changedIds).toEqual(['news', 'promo']);
    });

    it('informa del contenido incompleto y sigue con lo demás', () => {
      const change = service.updateSections([{ id_DocumentHTMLCSS: 'news', htmlComponent: '<p>v2</p>' }]);

      // sin renderType pasa a ser static: es un cambio estructural
      expect(change.issues[0]).toContain('renderType');
      expect(change.mode).toBe('reloaded');
    });

    it('algo que no es un arreglo se informa y no cambia nada', () => {
      const change = service.updateSections('no es un arreglo');

      expect(change.mode).toBe('unchanged');
      expect(change.issues.length).toBe(1);
      expect(ids()).toEqual(['nav', 'form', 'news']);
    });

    it('lo recibido por updateSections queda en memoria: reenviar el JSON viejo lo revierte', () => {
      service.updateSections([section('news', 'dynamic', '<p>nuevo</p>')]);

      const change = service.setLocalContent([section('nav', 'static'), section('form', 'dynamic'), section('news', 'dynamic', '<p>viejo</p>')]);

      expect(change).toEqual(jasmine.objectContaining({ mode: 'patched', changedIds: ['news'] }));
    });
  });

  // --- Tablas ---
  describe('Table Operations', () => {
    const tableContent: ApiDrivenContent = {
      id_DocumentHTMLCSS: 'table-doc',
      htmlComponent: '<div id="myTable"></div>',
      renderType: 'dynamic',
      tableBindings: [
        {
          tableSelector: '#myTable',
          columns: [{ key: 'name', header: 'Name' }],
          data: [{ id: 1, name: 'John' }],
          actions: [{ label: 'Edit', action: 'edit' }],
        },
      ],
    };

    it('genera la estructura HTML de la tabla al procesar el contenido', () => {
      service.setLocalContent([tableContent]);
      const content = service.getContentValue()[0];

      expect(content.htmlComponent).toContain('<thead');
      // El <th> real incluye scope="col" (accesibilidad), por eso se matchea
      // por contenido en vez de una etiqueta exacta sin atributos.
      expect(content.htmlComponent).toMatch(/<th[^>]*>Name<\/th>/);
      expect(content.htmlComponent).toContain('John');
      expect(content.htmlComponent).toContain('button');
    });

    it('actualiza los datos de la tabla de una sección dynamic', () => {
      service.setLocalContent([tableContent]);

      service.updateTable('table-doc', '#myTable', { data: [{ id: 2, name: 'Jane' }] });

      const updated = service.getContentValue()[0];
      expect(updated.htmlComponent).toContain('Jane');
      expect(updated.htmlComponent).not.toContain('John');
    });

    it('actualiza los datos de la tabla de una sección static', () => {
      service.setLocalContent([{ ...tableContent, renderType: 'static' as const }]);

      service.updateTable('table-doc', '#myTable', { data: [{ id: 3, name: 'Bob' }] });

      expect(service.getContentValue()[0].htmlComponent).toContain('Bob');
    });

    it('actualizar una tabla solo renueva esa sección', () => {
      service.setLocalContent([section('otra', 'dynamic'), tableContent]);
      const before = service.getContentValue();
      const keysBefore = keys();

      service.updateTable('table-doc', '#myTable', { data: [{ id: 2, name: 'Jane' }] });

      expect(service.getContentValue()[0]).toBe(before[0]);
      expect(keys()[0]).toBe(keysBefore[0]);
      expect(keys()[1]).not.toBe(keysBefore[1]);
    });

    it('un cambio en caliente de la tabla no cuenta como cambio del JSON al reenviar el mismo contenido', () => {
      service.setLocalContent([tableContent]);
      service.updateTable('table-doc', '#myTable', { data: [{ id: 2, name: 'Jane' }] });

      expect(service.setLocalContent([tableContent]).mode).toBe('unchanged');
    });

    it('no hace nada para un id inexistente', () => {
      service.setLocalContent([section('form', 'dynamic', '<form>Form</form>')]);
      const emissions = countEmissions();

      service.updateTable('GHOST-ID', '#myTable', { data: [] });

      expect(service.getContentValue()[0].htmlComponent).toBe('<form>Form</form>');
      expect(emissions()).toBe(0);
    });

    it('no cambia el HTML si el selector de la tabla no existe en él', () => {
      service.setLocalContent([
        {
          id_DocumentHTMLCSS: 'broken-table',
          htmlComponent: '<div>No table here</div>',
          renderType: 'dynamic',
          tableBindings: [{ tableSelector: '#missingTable', columns: [], data: [] }],
        },
      ]);

      expect(service.getContentValue()[0].htmlComponent).toContain('No table here');
    });
  });

  // --- Data bindings ---
  describe('Data Binding Updates', () => {
    const bindingContent: ApiDrivenContent = {
      id_DocumentHTMLCSS: 'binding-doc',
      htmlComponent: '<span id="name"></span>',
      renderType: 'static',
      dataBindings: [{ selector: '#name', value: 'Old' }],
    };

    it('actualiza el valor de un binding en una sección static', () => {
      service.setLocalContent([bindingContent]);

      service.updateBindingValue('binding-doc', '#name', 'New Value');

      expect(service.getContentValue()[0].dataBindings?.[0].value).toBe('New Value');
    });

    it('actualiza el valor de un binding en una sección dynamic', () => {
      service.setLocalContent([{ ...bindingContent, renderType: 'dynamic' as const }]);

      service.updateBindingValue('binding-doc', '#name', 'Dynamic Val');

      expect(service.getContentValue()[0].dataBindings?.[0].value).toBe('Dynamic Val');
    });

    it('solo renueva la sección afectada', () => {
      service.setLocalContent([section('otra', 'dynamic'), bindingContent]);
      const before = service.getContentValue();

      service.updateBindingValue('binding-doc', '#name', 'X');

      expect(service.getContentValue()[0]).toBe(before[0]);
    });

    it('no hace nada para un id inexistente', () => {
      service.setLocalContent([section('form', 'dynamic')]);
      const emissions = countEmissions();

      service.updateBindingValue('GHOST-ID', '#sel', 'val');

      expect(service.getContentValue().length).toBe(1);
      expect(emissions()).toBe(0);
    });
  });

  // --- Utilidades ---
  describe('Utilities', () => {
    it('clearContent vacía la pantalla y la siguiente carga vuelve a ser initial', () => {
      service.setLocalContent([section('a', 'static'), section('b', 'dynamic')]);

      service.clearContent();

      expect(service.getContentValue()).toEqual([]);
      expect(service.setLocalContent([section('a', 'static')]).mode).toBe('initial');
    });

    it('content$ emite el contenido actual y cada cambio', () => {
      const seen: number[] = [];
      service.content$.subscribe((content) => seen.push(content.length));

      service.setLocalContent([section('a', 'static')]);
      service.setLocalContent([section('a', 'static'), section('b', 'dynamic')]);

      expect(seen).toEqual([0, 1, 2]);
    });

    it('processApiResponse sanitiza el HTML', () => {
      const raw = [{ htmlComponent: '<script>alert()</script>', id_DocumentHTMLCSS: '1', renderType: 'static' }];
      const processed = service.processApiResponse(raw);

      expect(processed.length).toBe(1);
      expect(sanitizerSpy.bypassSecurityTrustHtml).toHaveBeenCalled();
    });

    it('processApiResponse devuelve [] ante una entrada inválida', () => {
      spyOn(console, 'error');
      expect(service.processApiResponse(null)).toEqual([]);
    });

    it('un envío con funciones (disableWhen) se compara por referencia', () => {
      const fn = () => true;
      const withFn = () => [{ ...section('a', 'dynamic'), buttonConfigs: [{ selector: '#b', disableWhen: fn }] }];
      service.setLocalContent(withFn());

      expect(service.setLocalContent(withFn()).mode).toBe('unchanged');
      expect(
        service.setLocalContent([{ ...section('a', 'dynamic'), buttonConfigs: [{ selector: '#b', disableWhen: () => true }] }]).mode,
      ).toBe('patched');
    });
  });

  // --- Orden de llegada asíncrona ---
  it('lo que llega por HTTP se compara contra la memoria en el momento de llegar', () => {
    const response$ = new Subject<unknown>();
    dcsSpy.getContent.and.returnValue(response$);
    const results: ContentChange[] = [];
    service.loadInitialContent('p').subscribe((change) => results.push(change));

    service.setLocalContent([section('a', 'static')]); // llega otro contenido mientras tanto
    response$.next([section('a', 'static')]);

    expect(results[0].mode).toBe('unchanged');
  });
});
