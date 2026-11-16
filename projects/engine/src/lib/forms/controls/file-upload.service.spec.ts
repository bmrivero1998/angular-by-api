import { FileUploadService } from './file-upload.service';

function makeFile(name: string, size: number, type = ''): File {
  const file = new File([new Uint8Array(size)], name, { type });
  return file;
}

describe('FileUploadService', () => {
  let service: FileUploadService;

  beforeEach(() => {
    service = new FileUploadService();
  });

  describe('validateFiles', () => {
    it('no reporta errores si no hay config', () => {
      const errors = service.validateFiles([makeFile('a.txt', 10)]);
      expect(errors).toEqual([]);
    });

    it('reporta error si un archivo excede maxSize', () => {
      const errors = service.validateFiles([makeFile('big.txt', 2000)], { maxSize: 1024 });
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('big.txt');
      expect(errors[0]).toContain('KB');
    });

    it('reporta error si el tipo no está aceptado', () => {
      const errors = service.validateFiles([makeFile('photo.png', 10, 'image/png')], { accept: '.pdf' });
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('photo.png');
    });

    it('reporta error si se excede maxCount', () => {
      const files = [makeFile('a.txt', 1), makeFile('b.txt', 1), makeFile('c.txt', 1)];
      const errors = service.validateFiles(files, { maxCount: 2 });
      expect(errors).toEqual(['Máximo 2 archivos permitidos']);
    });

    it('acumula varios errores a la vez', () => {
      const errors = service.validateFiles([makeFile('big.png', 500, 'image/png')], {
        maxSize: 100,
        accept: '.pdf',
      });
      expect(errors.length).toBe(2);
    });
  });

  describe('checkFileType', () => {
    it('acepta por extensión', () => {
      expect(service.checkFileType(makeFile('doc.pdf', 1), '.pdf')).toBeTrue();
      expect(service.checkFileType(makeFile('doc.PDF', 1), '.pdf')).toBeTrue();
      expect(service.checkFileType(makeFile('doc.txt', 1), '.pdf')).toBeFalse();
    });

    it('acepta por wildcard de mime type (image/*)', () => {
      expect(service.checkFileType(makeFile('a.png', 1, 'image/png'), 'image/*')).toBeTrue();
      expect(service.checkFileType(makeFile('a.pdf', 1, 'application/pdf'), 'image/*')).toBeFalse();
    });

    it('acepta por mime type exacto', () => {
      expect(service.checkFileType(makeFile('a.pdf', 1, 'application/pdf'), 'application/pdf')).toBeTrue();
    });

    it('acepta cualquiera de varios tipos separados por coma', () => {
      expect(service.checkFileType(makeFile('a.png', 1, 'image/png'), '.pdf, image/*')).toBeTrue();
    });
  });

  describe('formatBytes', () => {
    it('formatea 0 bytes', () => {
      expect(service.formatBytes(0)).toBe('0 Bytes');
    });

    it('formatea bytes, KB, MB', () => {
      expect(service.formatBytes(500)).toBe('500 Bytes');
      expect(service.formatBytes(1024)).toBe('1 KB');
      expect(service.formatBytes(1024 * 1024)).toBe('1 MB');
    });
  });
});
