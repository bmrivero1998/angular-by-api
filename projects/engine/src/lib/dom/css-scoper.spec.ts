import { scopeClassFor, scopeCss, splitSelectorList } from './css-scoper';

describe('css-scoper', () => {
  const SCOPE = 'dynamic-sec1';
  const W = ':where(.dynamic-sec1)';

  /** Reglas del CSS resultante, ya normalizadas por el parser del navegador. */
  function parse(css: string): CSSRule[] {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return Array.from(sheet.cssRules);
  }

  function selectors(css: string): string[] {
    return parse(scopeCss(css, SCOPE))
      .filter((r): r is CSSStyleRule => r instanceof CSSStyleRule)
      .map((r) => r.selectorText);
  }

  describe('scopeClassFor', () => {
    it('antepone dynamic- al id de contenido', () => {
      expect(scopeClassFor('compiled-123-abc')).toBe('dynamic-compiled-123-abc');
    });
  });

  describe('splitSelectorList', () => {
    it('divide por comas de nivel superior', () => {
      expect(splitSelectorList('.a, .b ,.c')).toEqual(['.a', '.b', '.c']);
    });

    it('respeta las comas dentro de paréntesis, corchetes y cadenas', () => {
      expect(splitSelectorList(':is(.a, .b) .c, .d')).toEqual([':is(.a, .b) .c', '.d']);
      expect(splitSelectorList('[data-x="a,b"] .c, .d')).toEqual(['[data-x="a,b"] .c', '.d']);
      expect(splitSelectorList(".a[title='x, y'], .b")).toEqual([".a[title='x, y']", '.b']);
    });

    it('respeta caracteres escapados', () => {
      expect(splitSelectorList('.a\\,b, .c')).toEqual(['.a\\,b', '.c']);
    });
  });

  describe('selectores', () => {
    it('prefija un selector simple con :where(.scope)', () => {
      expect(selectors('.card { color: red }')).toEqual([`${W} .card`]);
    });

    it('prefija cada selector de una lista', () => {
      expect(selectors('.a, .b > .c { color: red }')).toEqual([`${W} .a, ${W} .b > .c`]);
    });

    it('no parte :is() ni selectores con comas dentro de cadenas', () => {
      expect(selectors(':is(.a, .b) .c { color: red }')).toEqual([`${W} :is(.a, .b) .c`]);
      expect(selectors('[data-x="a,b"] { color: red }')).toEqual([`${W} [data-x="a,b"]`]);
    });

    it('conserva pseudoclases y pseudoelementos', () => {
      expect(selectors('.btn:hover::before { color: red }')).toEqual([`${W} .btn:hover::before`]);
    });

    it('el selector universal queda dentro de la sección', () => {
      expect(selectors('* { box-sizing: border-box }')).toEqual([`${W} *`]);
    });

    it('un selector de etiqueta (h1, p) queda dentro de la sección', () => {
      expect(selectors('h1, p { margin: 0 }')).toEqual([`${W} h1, ${W} p`]);
    });
  });

  describe('selectores ya aislados (formato histórico del backend)', () => {
    it('no vuelve a prefijar .dynamic-<id> .algo', () => {
      expect(selectors('.dynamic-sec1 .hero { color: red }')).toEqual(['.dynamic-sec1 .hero']);
    });

    it('no toca el selector de la propia raíz de la sección', () => {
      expect(selectors('.dynamic-sec1 { padding: 1px }')).toEqual(['.dynamic-sec1']);
      expect(selectors('.dynamic-sec1.activo { padding: 1px }')).toEqual(['.dynamic-sec1.activo']);
    });

    it('SÍ aísla un id que solo comparte el inicio (dynamic-sec10, dynamic-sec1-nav)', () => {
      expect(selectors('.dynamic-sec10 .x { color: red }')).toEqual([`${W} .dynamic-sec10 .x`]);
      expect(selectors('.dynamic-sec1-nav .x { color: red }')).toEqual([`${W} .dynamic-sec1-nav .x`]);
    });

    it('aísla las reglas dirigidas a OTRA sección', () => {
      expect(selectors('.dynamic-otra .x { color: red }')).toEqual([`${W} .dynamic-otra .x`]);
    });

    it('es idempotente', () => {
      const once = scopeCss('.card, h1 { color: red } @media (min-width: 1px) { .x { color: blue } }', SCOPE);

      expect(scopeCss(once, SCOPE)).toBe(once);
    });

    it('mezcla en una lista selectores aislados y sin aislar', () => {
      expect(selectors('.dynamic-sec1 .a, .b { color: red }')).toEqual([`.dynamic-sec1 .a, ${W} .b`]);
    });
  });

  describe('html, body y :root', () => {
    it('pasan a ser la raíz de la sección', () => {
      expect(selectors('body { background: red }')).toEqual([W]);
      expect(selectors('html { background: red }')).toEqual([W]);
      expect(selectors(':root { --brand: red }')).toEqual([W]);
    });

    it('conservan lo que sigue: descendientes, clases y pseudoclases', () => {
      expect(selectors('body .card { color: red }')).toEqual([`${W} .card`]);
      expect(selectors('body > .card { color: red }')).toEqual([`${W} > .card`]);
      expect(selectors('body.oscuro { color: red }')).toEqual([`${W}.oscuro`]);
      expect(selectors('body:hover { color: red }')).toEqual([`${W}:hover`]);
    });

    it('colapsan cadenas como html body y html > body', () => {
      expect(selectors('html body .x { color: red }')).toEqual([`${W} .x`]);
      expect(selectors('html > body .x { color: red }')).toEqual([`${W} .x`]);
    });

    it('no confunden con selectores que solo empiezan igual (.body, bodyguard, html5)', () => {
      expect(selectors('.body { color: red }')).toEqual([`${W} .body`]);
      expect(selectors('bodyguard { color: red }')).toEqual([`${W} bodyguard`]);
    });

    it('las variables CSS de :root quedan en la sección, no en el documento', () => {
      const css = scopeCss(':root { --brand: red }', SCOPE);

      expect(css).toContain('--brand');
      expect(css).toContain(W);
      expect(css).not.toMatch(/^:root/);
    });
  });

  describe('reglas contenedoras', () => {
    it('aísla reglas dentro de @media y @supports', () => {
      const css = scopeCss(
        '@media (min-width: 1px) { .a { color: red } } @supports (display: grid) { .b { color: red } }',
        SCOPE,
      );

      expect(css).toContain(`${W} .a`);
      expect(css).toContain(`${W} .b`);
    });

    it('aísla reglas dentro de @layer { }', () => {
      expect(scopeCss('@layer base { .a { color: red } }', SCOPE)).toContain(`${W} .a`);
    });

    it('aísla reglas dentro de @media anidadas', () => {
      const css = scopeCss('@media (min-width: 1px) { @media (max-width: 9999px) { .a { color: red } } }', SCOPE);

      expect(css).toContain(`${W} .a`);
    });

    it('aísla solo la regla de nivel superior con CSS anidado (nesting)', () => {
      const css = scopeCss('.a { color: red; .b { color: blue } &:hover { color: green } }', SCOPE);

      expect(css).toContain(`${W} .a`);
      expect(css).not.toContain(`${W} .b`);
      expect(css).not.toContain(`${W} &`);
    });
  });

  describe('reglas que no se deben cargar ni dejar globales', () => {
    it('elimina @import', () => {
      const css = scopeCss('@import url("https://evil.example/x.css"); .a { color: red }', SCOPE);

      expect(css).not.toContain('import');
      expect(css).not.toContain('evil.example');
      expect(css).toContain(`${W} .a`);
    });

    it('deja @font-face tal cual', () => {
      const css = scopeCss('@font-face { font-family: "Mia"; src: local("Arial") }', SCOPE);

      expect(css).toContain('@font-face');
      expect(css).not.toContain(W);
    });

    it('deja @layer a, b; (declaración sin bloque)', () => {
      expect(() => scopeCss('@layer a, b; .x { color: red }', SCOPE)).not.toThrow();
    });
  });

  describe('@keyframes', () => {
    it('renombra los keyframes y actualiza animation y animation-name', () => {
      const css = scopeCss(
        '@keyframes aparecer { from { opacity: 0 } to { opacity: 1 } } ' +
          '.a { animation: aparecer 1s ease-in } .b { animation-name: aparecer }',
        SCOPE,
      );

      expect(css).toContain('@keyframes dynamic-sec1__aparecer');
      // El navegador normaliza el shorthand: el nombre pasa al final.
      expect(css).toMatch(/animation:[^;]*running dynamic-sec1__aparecer;/);
      expect(css).toMatch(/animation-name:\s*dynamic-sec1__aparecer/);
      expect(css).not.toMatch(/@keyframes aparecer/);
    });

    it('dos secciones con el mismo @keyframes ya no se pisan', () => {
      const css = '@keyframes giro { to { transform: rotate(1turn) } } .x { animation: giro 1s }';

      expect(scopeCss(css, 'dynamic-a')).toContain('dynamic-a__giro');
      expect(scopeCss(css, 'dynamic-b')).toContain('dynamic-b__giro');
    });

    it('actualiza animation dentro de @media y conserva !important', () => {
      const css = scopeCss(
        '@keyframes k { to { opacity: 1 } } @media (min-width: 1px) { .a { animation: k 1s !important } }',
        SCOPE,
      );

      expect(css).toMatch(/animation:[^;]*dynamic-sec1__k\s*!important/);
    });

    it('no toca animaciones que no definen sus keyframes aquí (p. ej. los de Bootstrap)', () => {
      const css = scopeCss('.a { animation: spinner-border .75s linear infinite }', SCOPE);

      expect(css).toContain('spinner-border');
      expect(css).not.toContain('__spinner-border');
    });

    it('no renombra palabras que solo contienen el nombre (ease vs mi-ease)', () => {
      const css = scopeCss('@keyframes mi { to { opacity: 1 } } .a { animation: mi-ease 1s }', SCOPE);

      expect(css).toContain('mi-ease');
      expect(css).not.toContain('__mi-ease');
    });
  });

  describe('robustez', () => {
    it('devuelve cadena vacía con entrada vacía o en blanco', () => {
      expect(scopeCss('', SCOPE)).toBe('');
      expect(scopeCss('   \n ', SCOPE)).toBe('');
    });

    it('no lanza con CSS inválido y conserva las reglas válidas', () => {
      let css = '';
      expect(() => (css = scopeCss('.a { color: red } ¡¡¡ {{ .b { color: blue }', SCOPE))).not.toThrow();

      expect(css).toContain(`${W} .a`);
    });

    it('ignora los comentarios', () => {
      expect(selectors('/* .x { color: red } */ .a { color: blue }')).toEqual([`${W} .a`]);
    });

    it('escapa una clase de ámbito con caracteres especiales', () => {
      const css = scopeCss('.a { color: red }', 'dynamic-a.b');
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      const host = document.createElement('div');
      host.className = 'dynamic-a.b';
      host.innerHTML = '<span class="a"></span>';
      document.body.appendChild(host);

      expect(host.querySelector('.a')!.matches((sheet.cssRules[0] as CSSStyleRule).selectorText)).toBeTrue();
      host.remove();
    });
  });

  describe('efecto real en el DOM', () => {
    let outside: HTMLElement;
    let host: HTMLElement;
    let styleEl: HTMLStyleElement;

    beforeEach(() => {
      outside = document.createElement('div');
      outside.className = 'card';
      outside.textContent = 'fuera';
      host = document.createElement('div');
      host.className = SCOPE;
      host.innerHTML = '<div class="card">dentro</div>';
      document.body.append(outside, host);
    });

    afterEach(() => {
      outside.remove();
      host.remove();
      styleEl?.remove();
    });

    function apply(css: string): void {
      styleEl = document.createElement('style');
      styleEl.textContent = scopeCss(css, SCOPE);
      document.head.appendChild(styleEl);
    }

    const border = (el: Element) => getComputedStyle(el).borderTopWidth;

    it('la regla alcanza a la sección y NO al resto de la página', () => {
      apply('.card { border: 7px solid red }');

      expect(border(host.querySelector('.card')!)).toBe('7px');
      expect(border(outside)).toBe('0px');
    });

    it('una regla sobre body no pinta el body real', () => {
      const before = getComputedStyle(document.body).backgroundColor;
      apply('body { background: rgb(1, 2, 3) }');

      expect(getComputedStyle(document.body).backgroundColor).toBe(before);
      expect(getComputedStyle(host).backgroundColor).toBe('rgb(1, 2, 3)');
    });

    it('el formato histórico .dynamic-<id> .x sigue aplicando', () => {
      apply('.dynamic-sec1 .card { border: 5px solid red }');

      expect(border(host.querySelector('.card')!)).toBe('5px');
      expect(border(outside)).toBe('0px');
    });

    it('el prefijo no suma especificidad: una regla más específica de la página sigue ganando', () => {
      const pageRule = document.createElement('style');
      pageRule.textContent = 'div.card { border: 2px solid blue }'; // (0,1,1)
      document.head.appendChild(pageRule);
      apply('.card { border: 9px solid red }'); // (0,1,0): pierde, como sin aislar

      expect(border(host.querySelector('.card')!)).toBe('2px');
      pageRule.remove();
    });

    it('la animación renombrada sigue funcionando', () => {
      apply('@keyframes giro { to { opacity: 1 } } .card { animation: giro 1s }');

      expect(getComputedStyle(host.querySelector('.card')!).animationName).toBe('dynamic-sec1__giro');
    });
  });
});
