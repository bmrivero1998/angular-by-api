import { isLoadableStylesheetUrl, loadStylesheet, loadStylesheets, STYLESHEET_MARK, toUrlList } from './stylesheet-loader';

describe('stylesheet-loader', () => {
  afterEach(() => {
    document.querySelectorAll(`link[${STYLESHEET_MARK}]`).forEach((link) => link.remove());
  });

  const links = () => Array.from(document.querySelectorAll<HTMLLinkElement>(`link[${STYLESHEET_MARK}]`));

  describe('toUrlList', () => {
    it('separa por espacios y comas, sin vacíos ni repetidos', () => {
      expect(toUrlList('a.css, b.css  a.css\n c.css')).toEqual(['a.css', 'b.css', 'c.css']);
    });
    it('acepta un arreglo y descarta lo que no sea texto útil', () => {
      expect(toUrlList([' a.css ', '', 'a.css'])).toEqual(['a.css']);
    });
    it('devuelve vacío con null, undefined u otros tipos', () => {
      expect(toUrlList(null)).toEqual([]);
      expect(toUrlList(undefined)).toEqual([]);
      expect(toUrlList(42)).toEqual([]);
    });
  });

  describe('isLoadableStylesheetUrl', () => {
    it('acepta http(s) y relativas', () => {
      expect(isLoadableStylesheetUrl('https://cdn.x.com/a.css', 'https://host/')).toBeTrue();
      expect(isLoadableStylesheetUrl('/css/a.css', 'https://host/')).toBeTrue();
    });
    it('rechaza javascript:, data:, file: y ftp:', () => {
      for (const url of ['javascript:alert(1)', 'data:text/css,a{}', 'file:///a.css', 'ftp://x/a.css']) {
        expect(isLoadableStylesheetUrl(url, 'https://host/')).withContext(url).toBeFalse();
      }
    });
  });

  describe('loadStylesheet', () => {
    it('añade un <link> marcado al <head>', () => {
      void loadStylesheet('https://example.invalid/a.css');
      expect(links().length).toBe(1);
      expect(links()[0].rel).toBe('stylesheet');
      expect(links()[0].href).toBe('https://example.invalid/a.css');
    });

    it('no repite una hoja ya cargada', () => {
      void loadStylesheet('https://example.invalid/a.css');
      void loadStylesheet('https://example.invalid/a.css');
      expect(links().length).toBe(1);
    });

    it('no duplica una hoja que el host ya puso en su <head>', () => {
      const hostLink = document.createElement('link');
      hostLink.rel = 'stylesheet';
      hostLink.href = 'https://example.invalid/host.css';
      document.head.appendChild(hostLink);
      void loadStylesheet('https://example.invalid/host.css');
      expect(links().length).toBe(0);
      hostLink.remove();
    });

    it('ignora URLs que no son http(s)', async () => {
      await loadStylesheet('javascript:alert(1)');
      expect(links().length).toBe(0);
    });

    it('se resuelve cuando la hoja carga', async () => {
      const promise = loadStylesheet('https://example.invalid/a.css');
      links()[0].dispatchEvent(new Event('load'));
      await expectAsync(promise).toBeResolved();
    });

    it('se resuelve (y avisa) cuando la hoja falla: nunca bloquea', async () => {
      const warn = spyOn(console, 'warn');
      const promise = loadStylesheet('https://example.invalid/a.css');
      links()[0].dispatchEvent(new Event('error'));
      await expectAsync(promise).toBeResolved();
      expect(warn).toHaveBeenCalled();
    });

    it('se resuelve al pasar el tiempo máximo', async () => {
      await expectAsync(loadStylesheet('https://example.invalid/slow.css', document, 20)).toBeResolved();
    });
  });

  it('loadStylesheets carga todas', () => {
    void loadStylesheets(['https://example.invalid/a.css', 'https://example.invalid/b.css']);
    expect(links().map((l) => l.href)).toEqual(['https://example.invalid/a.css', 'https://example.invalid/b.css']);
  });
});
