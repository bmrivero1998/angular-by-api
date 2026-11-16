import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DomInteractionsContext, DomInteractionsService } from './dom-interactions.service';
import { FileUploadChange, FormFieldMapping } from '../models/form-field-mapping.model';

/**
 * Subida de archivos desde el campo `<input type="file">`: lo que ve el
 * usuario y lo que queda en el formulario mientras sube, al terminar y si falla.
 */
describe('DomInteractionsService: subida de archivos', () => {
  let service: DomInteractionsService;
  let http: HttpTestingController;
  let container: HTMLElement;
  let input: HTMLInputElement;
  let form: FormGroup;
  let changes: FileUploadChange[];
  let selected: unknown[];
  let controlErrors: Array<[string, any]>;
  let unlisten: Array<() => void>;

  const MAPPING: FormFieldMapping = {
    controlName: 'adjunto',
    domSelector: '#f',
    fileUploadConfig: {
      uploadUrl: '/api/archivos',
      progressSelector: '#avance',
      fileListSelector: '#lista',
    },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(DomInteractionsService);
    http = TestBed.inject(HttpTestingController);

    container = document.createElement('div');
    container.innerHTML = '<input id="f" type="file"><progress id="avance"></progress><ul id="lista"></ul>';
    document.body.appendChild(container);
    input = container.querySelector('#f') as HTMLInputElement;
    form = new FormGroup({ adjunto: new FormControl(null, Validators.required) });
    changes = [];
    selected = [];
    controlErrors = [];
  });

  afterEach(() => {
    unlisten?.forEach((fn) => fn());
    container.remove();
  });

  const file = (name = 'a.pdf', size = 2048) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

  function setup(mapping: FormFieldMapping = MAPPING, allowedOrigins: string[] = []): void {
    const ctx: DomInteractionsContext = {
      container,
      dynamicForm: form,
      formMappings: [mapping],
      isForm: true,
      formId: 'f1',
      contentId: 'c1',
      allowedOrigins,
    };
    unlisten = service.setupFileInputs(
      ctx,
      (payload) => selected.push(payload),
      (name, error) => {
        controlErrors.push([name, error]);
        form.get(name)?.setErrors(error);
      },
      (change) => changes.push(change),
    );
  }

  function choose(...files: File[]): void {
    const transfer = new DataTransfer();
    files.forEach((f) => transfer.items.add(f));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const control = () => form.get('adjunto')!;
  const progress = () => container.querySelector('#avance') as HTMLProgressElement;
  const listItems = () => Array.from(container.querySelectorAll('#lista li')).map((li) => li.textContent);

  it('sin uploadUrl no sube nada: solo valida y avisa con fileSelected (comportamiento de siempre)', () => {
    setup({ controlName: 'adjunto', domSelector: '#f', fileUploadConfig: { maxSize: 10_000 } });

    choose(file());

    http.expectNone(() => true);
    expect(selected.length).toBe(1);
    expect(control().value instanceof File).toBeTrue();
    expect(changes).toEqual([]);
  });

  describe('al elegir un archivo válido', () => {
    it('empieza a subir: el control queda pendiente y se reinicia el avance', () => {
      setup();

      choose(file());

      http.expectOne('/api/archivos');
      expect(control().pending).toBeTrue();
      expect(form.pending).toBeTrue();
      expect(progress().value).toBe(0);
      expect(progress().max).toBe(100);
      expect(changes).toEqual([{ controlName: 'adjunto', formId: 'f1', status: 'uploading', progress: 0 }]);
    });

    it('sigue avisando con fileSelected', () => {
      setup();

      choose(file('contrato.pdf'));

      expect(selected).toEqual([jasmine.objectContaining({ controlName: 'adjunto', formId: 'f1' })]);
      http.expectOne('/api/archivos');
    });

    it('lista los archivos con su tamaño en el elemento de fileListSelector', () => {
      setup();

      choose(file('contrato.pdf', 2048));

      expect(listItems()).toEqual(['contrato.pdf (2 KB)']);
      http.expectOne('/api/archivos');
    });

    it('un elemento que no es lista recibe los nombres separados por comas', () => {
      container.querySelector('#lista')!.replaceWith(Object.assign(document.createElement('span'), { id: 'lista' }));
      setup({ ...MAPPING, fileUploadConfig: { ...MAPPING.fileUploadConfig!, multiple: true } });

      choose(file('a.pdf', 1024), file('b.pdf', 2048));

      expect(container.querySelector('#lista')!.textContent).toBe('a.pdf (1 KB), b.pdf (2 KB)');
      http.match('/api/archivos').forEach((r) => r.flush('{}'));
    });
  });

  describe('mientras sube', () => {
    it('refleja el avance en el <progress> y lo informa', () => {
      setup();
      choose(file('a.pdf', 1000));

      http.expectOne('/api/archivos').event({ type: HttpEventType.UploadProgress, loaded: 400, total: 1000 });

      expect(progress().value).toBe(40);
      expect(changes[changes.length - 1]).toEqual({ controlName: 'adjunto', formId: 'f1', status: 'uploading', progress: 40 });
    });

    it('un elemento que no es <progress> recibe el texto "40%"', () => {
      container.querySelector('#avance')!.replaceWith(Object.assign(document.createElement('span'), { id: 'avance' }));
      setup();
      choose(file('a.pdf', 1000));

      http.expectOne('/api/archivos').event({ type: HttpEventType.UploadProgress, loaded: 400, total: 1000 });

      expect(container.querySelector('#avance')!.textContent).toBe('40%');
    });

    it('elegir otros archivos cancela la subida anterior y empieza la nueva', () => {
      setup();
      choose(file('primero.pdf'));
      const first = http.expectOne('/api/archivos');

      choose(file('segundo.pdf'));

      expect(first.cancelled).toBeTrue();
      const second = http.expectOne('/api/archivos');
      expect((second.request.body as FormData).get('file')).toEqual(jasmine.objectContaining({ name: 'segundo.pdf' }));
      second.flush('{}');
    });

    it('vaciar el input cancela la subida y limpia lista y avance', () => {
      setup();
      choose(file());
      const req = http.expectOne('/api/archivos');

      input.files = new DataTransfer().files;
      input.dispatchEvent(new Event('change', { bubbles: true }));

      expect(req.cancelled).toBeTrue();
      expect(listItems()).toEqual([]);
      expect(control().value).toBeNull();
    });

    it('destruir el formulario (unlisten) cancela la subida', () => {
      setup();
      choose(file());
      const req = http.expectOne('/api/archivos');

      unlisten.forEach((fn) => fn());

      expect(req.cancelled).toBeTrue();
    });
  });

  describe('al terminar bien', () => {
    it('el valor del campo pasa a ser la respuesta del servidor y el formulario vuelve a ser válido', () => {
      setup();
      choose(file());

      http.expectOne('/api/archivos').flush('{"id":42,"url":"/f/42"}');

      expect(control().value).toEqual({ id: 42, url: '/f/42' });
      expect(control().pending).toBeFalse();
      expect(control().valid).toBeTrue();
      expect(control().dirty).toBeTrue();
      expect(progress().value).toBe(100);
      expect(changes[changes.length - 1]).toEqual({
        controlName: 'adjunto',
        formId: 'f1',
        status: 'done',
        progress: 100,
        result: { id: 42, url: '/f/42' },
      });
    });

    it('con varios archivos el valor es un arreglo de respuestas', () => {
      setup({ ...MAPPING, fileUploadConfig: { ...MAPPING.fileUploadConfig!, multiple: true } });
      choose(file('a.pdf'), file('b.pdf'));
      const [a, b] = http.match('/api/archivos');

      a.flush('{"n":1}');
      b.flush('{"n":2}');

      expect(control().value).toEqual([{ n: 1 }, { n: 2 }]);
    });

    it('si el servidor responde vacío, el campo no queda vacío: queda el nombre del archivo', () => {
      setup();
      choose(file('contrato.pdf'));

      http.expectOne('/api/archivos').flush('');

      expect(control().value).toBe('contrato.pdf');
      expect(control().valid).toBeTrue();
    });

    it('con varios archivos y respuesta vacía quedan los nombres', () => {
      setup({ ...MAPPING, fileUploadConfig: { ...MAPPING.fileUploadConfig!, multiple: true } });
      choose(file('a.pdf'), file('b.pdf'));

      http.match('/api/archivos').forEach((r) => r.flush(''));

      expect(control().value).toEqual(['a.pdf', 'b.pdf']);
    });
  });

  describe('si falla', () => {
    it('el campo queda con el error "upload", sin valor, y el input se vacía para poder reintentar', () => {
      setup();
      choose(file('contrato.pdf'));

      http.expectOne('/api/archivos').flush('', { status: 500, statusText: 'Error' });

      expect(controlErrors).toEqual([['adjunto', { upload: jasmine.stringMatching(/contrato\.pdf.*HTTP 500/) }]]);
      expect(control().value).toBeNull();
      expect(control().pending).toBeFalse();
      expect(input.value).toBe('');
      expect(listItems()).toEqual([]);
      expect(changes[changes.length - 1]).toEqual(
        jasmine.objectContaining({ status: 'error', progress: 0, error: jasmine.stringMatching(/HTTP 500/) }),
      );
    });

    it('tras un fallo, volver a elegir el archivo lo intenta de nuevo', () => {
      setup();
      choose(file());
      http.expectOne('/api/archivos').flush('', { status: 500, statusText: 'Error' });

      choose(file());

      http.expectOne('/api/archivos').flush('{"id":1}');
      expect(control().value).toEqual({ id: 1 });
    });

    it('una URL a un origen no permitido falla sin hacer ninguna petición', () => {
      setup({ ...MAPPING, fileUploadConfig: { uploadUrl: 'https://evil.example/robar' } });

      choose(file());

      http.expectNone(() => true);
      expect(controlErrors[0][1].upload).toContain('origen no permitido');
      expect(control().pending).toBeFalse();
    });

    it('un origen que declara el widget permite la URL absoluta', () => {
      setup({ ...MAPPING, fileUploadConfig: { uploadUrl: 'https://files.otro.com/up' } }, ['https://files.otro.com']);

      choose(file());

      http.expectOne('https://files.otro.com/up').flush('{}');
      expect(controlErrors).toEqual([]);
    });
  });

  it('un archivo rechazado por la validación no se sube', () => {
    setup({ ...MAPPING, fileUploadConfig: { ...MAPPING.fileUploadConfig!, maxSize: 100 } });

    choose(file('grande.pdf', 5000));

    http.expectNone(() => true);
    expect(controlErrors[0][1].fileValidation[0]).toContain('grande.pdf');
    expect(changes).toEqual([]);
  });
});
