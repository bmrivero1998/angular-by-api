import { HttpEventType } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DYNAMIC_CONFIG, DynamicLibraryConfig } from '../../config/dynamic-config.token';
import { FileUploadError, FileUploadTransferService, UploadState } from './file-upload-transfer.service';

describe('FileUploadTransferService', () => {
  let service: FileUploadTransferService;
  let http: HttpTestingController;

  function setup(config?: DynamicLibraryConfig): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...(config ? [{ provide: DYNAMIC_CONFIG, useValue: config }] : []),
      ],
    });
    service = TestBed.inject(FileUploadTransferService);
    http = TestBed.inject(HttpTestingController);
  }

  const file = (name = 'a.pdf', size = 1000) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

  /** Recoge lo que emite una subida. */
  function run(files: File[], config: Parameters<FileUploadTransferService['upload']>[1], extra: string[] = []) {
    const states: UploadState[] = [];
    let error: unknown = null;
    const subscription = service.upload(files, config, extra).subscribe({
      next: (state) => states.push(state),
      error: (e) => (error = e),
    });
    return { states, subscription, getError: () => error };
  }

  beforeEach(() => setup());
  afterEach(() => http.verify());

  describe('resolveUrl', () => {
    it('una URL relativa sin apiUrl se deja como está', () => {
      expect(service.resolveUrl('/api/archivos')).toBe('/api/archivos');
    });

    it('una URL relativa se cuelga de apiUrl, con una sola barra de unión', () => {
      setup({ apiUrl: 'https://api.mi-sitio.com/' });

      expect(service.resolveUrl('/archivos')).toBe('https://api.mi-sitio.com/archivos');
      expect(service.resolveUrl('archivos')).toBe('https://api.mi-sitio.com/archivos');
    });

    it('acepta una URL absoluta del mismo origen que la página', () => {
      const url = `${location.origin}/api/archivos`;

      expect(service.resolveUrl(url)).toBe(url);
    });

    it('acepta una URL absoluta del origen de apiUrl', () => {
      setup({ apiUrl: 'https://api.mi-sitio.com' });

      expect(service.resolveUrl('https://api.mi-sitio.com/otra/ruta')).toBe('https://api.mi-sitio.com/otra/ruta');
    });

    it('acepta orígenes declarados en allowedOrigins y los que aporta el widget', () => {
      setup({ allowedOrigins: ['https://files.mi-sitio.com'] });

      expect(service.resolveUrl('https://files.mi-sitio.com/up')).toBe('https://files.mi-sitio.com/up');
      expect(service.resolveUrl('https://otro.com/up', ['https://otro.com'])).toBe('https://otro.com/up');
    });

    it('un origen no permitido se rechaza: la URL llega en el JSON y no puede mandar los archivos a cualquier sitio', () => {
      expect(() => service.resolveUrl('https://evil.example/robar')).toThrowError(FileUploadError, /origen no permitido/);
    });

    it('rechaza URLs protocolo-relativas y con esquemas distintos de http(s)', () => {
      ['//evil.example/x', 'javascript:alert(1)', 'data:text/plain,hola', 'ftp://evil.example/x', 'blob:https://x/y'].forEach(
        (url) => expect(() => service.resolveUrl(url)).toThrowError(FileUploadError),
      );
    });

    it('un origen parecido pero distinto no se acepta', () => {
      setup({ apiUrl: 'https://api.mi-sitio.com' });

      expect(() => service.resolveUrl('https://api.mi-sitio.com.evil.example/x')).toThrowError(FileUploadError);
      expect(() => service.resolveUrl('http://api.mi-sitio.com/x')).toThrowError(FileUploadError); // otro esquema
    });

    it('sin URL lanza un error claro', () => {
      expect(() => service.resolveUrl('  ')).toThrowError(FileUploadError, /URL de subida/);
    });
  });

  describe('upload', () => {
    it('sube cada archivo como multipart con el nombre de campo "file" y POST por defecto', () => {
      const f = file('contrato.pdf');
      run([f], { uploadUrl: '/api/archivos' });

      const req = http.expectOne('/api/archivos');

      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBeTrue();
      expect((req.request.body as FormData).get('file')).toEqual(f);
      expect(req.request.reportProgress).toBeTrue();
      req.flush('{}');
    });

    it('respeta method y fieldName configurados', () => {
      run([file()], { uploadUrl: '/api/archivos', method: 'PUT', fieldName: 'documento' });

      const req = http.expectOne('/api/archivos');

      expect(req.request.method).toBe('PUT');
      expect((req.request.body as FormData).has('documento')).toBeTrue();
      req.flush('{}');
    });

    it('un método que no es POST ni PUT cae a POST', () => {
      run([file()], { uploadUrl: '/api/archivos', method: 'DELETE' as any });

      expect(http.expectOne('/api/archivos').request.method).toBe('POST');
      http.match(() => true).forEach((r) => r.flush(''));
    });

    it('emite el avance en porcentaje y termina con la respuesta interpretada como JSON', () => {
      const { states } = run([file('a.pdf', 1000)], { uploadUrl: '/up' });
      const req = http.expectOne('/up');

      req.event({ type: HttpEventType.UploadProgress, loaded: 250, total: 1000 });
      req.event({ type: HttpEventType.UploadProgress, loaded: 500, total: 1000 });
      req.flush('{"id":7,"url":"/f/7"}');

      expect(states).toEqual([
        { status: 'uploading', progress: 0 },
        { status: 'uploading', progress: 25 },
        { status: 'uploading', progress: 50 },
        { status: 'done', progress: 100, result: { id: 7, url: '/f/7' } },
      ]);
    });

    it('no emite dos veces el mismo porcentaje', () => {
      const { states } = run([file('a.pdf', 1000)], { uploadUrl: '/up' });
      const req = http.expectOne('/up');

      req.event({ type: HttpEventType.UploadProgress, loaded: 300, total: 1000 });
      req.event({ type: HttpEventType.UploadProgress, loaded: 305, total: 1000 }); // sigue en 30 %
      req.flush('{}');

      expect(states.filter((s) => s.progress === 30).length).toBe(1);
    });

    it('el avance no llega a 100 hasta que el servidor responde', () => {
      const { states } = run([file('a.pdf', 1000)], { uploadUrl: '/up' });
      const req = http.expectOne('/up');

      req.event({ type: HttpEventType.UploadProgress, loaded: 1000, total: 1000 });

      expect(states[states.length - 1]).toEqual({ status: 'uploading', progress: 99 });
      req.flush('{}');
      expect(states[states.length - 1].status).toBe('done');
    });

    it('una respuesta que no es JSON se devuelve como texto, y una vacía como null', () => {
      const text = run([file()], { uploadUrl: '/a' });
      http.expectOne('/a').flush('subido correctamente');
      const empty = run([file()], { uploadUrl: '/b' });
      http.expectOne('/b').flush('');

      expect(text.states[text.states.length - 1].result).toBe('subido correctamente');
      expect(empty.states[empty.states.length - 1].result).toBeNull();
    });

    describe('varios archivos', () => {
      it('hace una petición por archivo y el resultado es un arreglo en el mismo orden', () => {
        const { states } = run([file('uno.pdf'), file('dos.pdf')], { uploadUrl: '/up', multiple: true });
        const reqs = http.match('/up');

        expect(reqs.length).toBe(2);
        reqs[1].flush('{"n":2}'); // responde primero el segundo
        reqs[0].flush('{"n":1}');

        expect(states[states.length - 1]).toEqual({ status: 'done', progress: 100, result: [{ n: 1 }, { n: 2 }] });
      });

      it('suma el avance de todos los archivos', () => {
        const { states } = run([file('a.pdf', 1000), file('b.pdf', 3000)], { uploadUrl: '/up', multiple: true });
        const [a, b] = http.match('/up');

        a.event({ type: HttpEventType.UploadProgress, loaded: 1000, total: 1000 });
        b.event({ type: HttpEventType.UploadProgress, loaded: 1000, total: 3000 });

        // (1000 + 1000) de (1000 + 3000) = 50 %
        expect(states[states.length - 1]).toEqual({ status: 'uploading', progress: 50 });
        a.flush('{}');
        b.flush('{}');
      });

      it('con multiple, un solo archivo también devuelve un arreglo', () => {
        const { states } = run([file()], { uploadUrl: '/up', multiple: true });
        http.expectOne('/up').flush('{"n":1}');

        expect(states[states.length - 1].result).toEqual([{ n: 1 }]);
      });

      it('si un archivo falla, falla toda la subida y se cancelan las demás peticiones', () => {
        const { getError } = run([file('a.pdf'), file('b.pdf')], { uploadUrl: '/up', multiple: true });
        const [a, b] = http.match('/up');

        a.flush('', { status: 500, statusText: 'Server Error' });

        expect(getError()).toEqual(jasmine.any(FileUploadError));
        expect(b.cancelled).toBeTrue();
      });
    });

    describe('errores', () => {
      const failWith = (status: number) => {
        const { getError } = run([file('contrato.pdf')], { uploadUrl: '/up' });
        http.expectOne('/up').flush('', { status, statusText: 'X' });
        return (getError() as FileUploadError).message;
      };

      it('un error de red dice que no hay conexión y nombra el archivo', () => {
        const { getError } = run([file('contrato.pdf')], { uploadUrl: '/up' });
        http.expectOne('/up').error(new ProgressEvent('error'));

        expect((getError() as FileUploadError).message).toContain('sin conexión');
        expect((getError() as FileUploadError).message).toContain('contrato.pdf');
      });

      it('413, 415 y 401/403 tienen su propio mensaje', () => {
        expect(failWith(413)).toContain('demasiado grande');
        expect(failWith(415)).toContain('tipo de archivo no admitido');
        expect(failWith(403)).toContain('permiso');
        expect(failWith(401)).toContain('permiso');
      });

      it('cualquier otro código se informa con el código', () => {
        expect(failWith(500)).toContain('HTTP 500');
        expect(failWith(422)).toContain('HTTP 422');
      });

      it('una URL no permitida falla sin hacer ninguna petición', () => {
        const { getError } = run([file()], { uploadUrl: 'https://evil.example/x' });

        expect(getError()).toEqual(jasmine.any(FileUploadError));
        http.expectNone(() => true);
      });

      it('sin uploadUrl falla con un mensaje claro', () => {
        const { getError } = run([file()], {});

        expect((getError() as FileUploadError).message).toContain('URL de subida');
      });
    });

    it('cancelar la suscripción aborta la petición', () => {
      const { subscription } = run([file()], { uploadUrl: '/up' });
      const req = http.expectOne('/up');

      subscription.unsubscribe();

      expect(req.cancelled).toBeTrue();
    });

    it('un origen aportado por el widget permite una URL absoluta', () => {
      run([file()], { uploadUrl: 'https://files.otro.com/up' }, ['https://files.otro.com']);

      http.expectOne('https://files.otro.com/up').flush('{}');
    });
  });
});
