import {
  ExpressionError,
  ExpressionScope,
  evaluateExpression,
  parseExpression,
} from './expression-evaluator';

describe('expression-evaluator', () => {
  const scope = (
    variables: Record<string, unknown> = {},
    functions: ExpressionScope['functions'] = {},
  ): ExpressionScope => ({ variables, functions });

  const run = (source: string, variables: Record<string, unknown> = {}, functions = {}) =>
    evaluateExpression(source, scope(variables, functions));

  describe('literales', () => {
    it('evalúa números, textos, booleanos, null y undefined', () => {
      expect(run('42')).toBe(42);
      expect(run('3.5')).toBe(3.5);
      expect(run("'hola'")).toBe('hola');
      expect(run('"hola"')).toBe('hola');
      expect(run('true')).toBeTrue();
      expect(run('false')).toBeFalse();
      expect(run('null')).toBeNull();
      expect(run('undefined')).toBeUndefined();
    });

    it('interpreta secuencias de escape en textos', () => {
      expect(run("'a\\'b'")).toBe("a'b");
      expect(run('"línea\\nnueva"')).toBe('línea\nnueva');
    });

    it('evalúa listas', () => {
      expect(run("[1, 'a', true]")).toEqual([1, 'a', true]);
      expect(run('[]')).toEqual([]);
    });
  });

  describe('variables', () => {
    it('lee el valor de una variable', () => {
      expect(run('edad', { edad: 20 })).toBe(20);
    });

    it('una variable inexistente vale undefined en vez de fallar', () => {
      expect(run('noExiste')).toBeUndefined();
      expect(run('noExiste === undefined')).toBeTrue();
    });

    it('no lee propiedades heredadas del prototipo como si fueran variables', () => {
      expect(run('toString')).toBeUndefined();
      expect(run('hasOwnProperty')).toBeUndefined();
    });

    it('accede a propiedades con punto y con corchetes', () => {
      const vars = { form: { tipo: 'premium', 'con-guion': 1 }, lista: ['a', 'b'] };
      expect(run('form.tipo', vars)).toBe('premium');
      expect(run("form['con-guion']", vars)).toBe(1);
      expect(run('lista[1]', vars)).toBe('b');
    });

    it('acceder a una propiedad de algo ausente da undefined, sin lanzar', () => {
      expect(run('form.a.b.c', { form: {} })).toBeUndefined();
      expect(run('x.y')).toBeUndefined();
    });

    it('expone length de textos y listas', () => {
      expect(run('nombre.length', { nombre: 'Ana' })).toBe(3);
      expect(run('items.length', { items: [1, 2] })).toBe(2);
    });
  });

  describe('operadores', () => {
    it('igualdad estricta y laxa', () => {
      expect(run("tipo === 'premium'", { tipo: 'premium' })).toBeTrue();
      expect(run('a === b', { a: 1, b: '1' })).toBeFalse();
      expect(run('a == b', { a: 1, b: '1' })).toBeTrue();
      expect(run('a !== b', { a: 1, b: 2 })).toBeTrue();
      expect(run('a != b', { a: 1, b: 1 })).toBeFalse();
    });

    it('compara con booleanos y null (los literales que antes rompían)', () => {
      expect(run('acepta === true', { acepta: true })).toBeTrue();
      expect(run('acepta === false', { acepta: false })).toBeTrue();
      expect(run('valor === null', { valor: null })).toBeTrue();
    });

    it('relacionales y aritmética', () => {
      expect(run('edad >= 18', { edad: 18 })).toBeTrue();
      expect(run('edad < 18', { edad: 18 })).toBeFalse();
      expect(run('1 + 2 * 3')).toBe(7);
      expect(run('(1 + 2) * 3')).toBe(9);
      expect(run('10 % 4')).toBe(2);
      expect(run('-5 + 2')).toBe(-3);
    });

    it('lógicos con la precedencia correcta (&& antes que ||)', () => {
      expect(run('true || false && false')).toBeTrue();
      expect(run('(true || false) && false')).toBeFalse();
      expect(run('!activo', { activo: false })).toBeTrue();
      expect(run('!!valor', { valor: 'x' })).toBeTrue();
    });

    it('cortocircuita: el lado derecho no se evalúa si no hace falta', () => {
      const boom = jasmine.createSpy('boom').and.throwError('no debe llamarse');

      expect(run('false && boom()', {}, { boom })).toBeFalse();
      expect(run('true || boom()', {}, { boom })).toBeTrue();
      expect(boom).not.toHaveBeenCalled();
    });

    it('?? solo reemplaza null/undefined', () => {
      expect(run('a ?? 5', { a: null })).toBe(5);
      expect(run('a ?? 5', { a: 0 })).toBe(0);
    });

    it('ternario', () => {
      expect(run("edad >= 18 ? 'adulto' : 'menor'", { edad: 20 })).toBe('adulto');
      expect(run("edad >= 18 ? 'adulto' : 'menor'", { edad: 10 })).toBe('menor');
    });
  });

  describe('funciones', () => {
    it('llama a funciones del catálogo con sus argumentos', () => {
      const gt = jasmine.createSpy('gt').and.callFake((a: number, b: number) => a > b);

      expect(run('gt(edad, 18)', { edad: 20 }, { gt })).toBeTrue();
      expect(gt).toHaveBeenCalledOnceWith(20, 18);
    });

    it('una función que no está en el catálogo es un error', () => {
      expect(() => run('alert(1)')).toThrowError(ExpressionError, /"alert" no existe/);
    });

    it('no permite llegar a funciones heredadas del prototipo', () => {
      expect(() => run('toString()')).toThrowError(ExpressionError);
    });

    it('permite métodos de texto y listas de la lista blanca', () => {
      expect(run("correo.endsWith('@x.com')", { correo: 'a@x.com' })).toBeTrue();
      expect(run("nombre.toLowerCase() === 'ana'", { nombre: 'ANA' })).toBeTrue();
      expect(run("roles.includes('admin')", { roles: ['admin'] })).toBeTrue();
      expect(run("  nombre.trim() === 'a'", { nombre: ' a ' })).toBeTrue();
    });

    it('un método sobre un valor ausente no se cumple en vez de fallar', () => {
      expect(run("correo.endsWith('@x.com')", { correo: null })).toBeUndefined();
      expect(run("correo.endsWith('@x.com')")).toBeUndefined();
    });

    it('rechaza métodos fuera de la lista blanca', () => {
      expect(() => run("nombre.constructor('x')", { nombre: 'a' })).toThrowError(ExpressionError);
      expect(() => run('nombre.split(",")', { nombre: 'a' })).toThrowError(ExpressionError, /split/);
    });
  });

  describe('seguridad', () => {
    const dangerous = [
      'constructor',
      '__proto__',
      'a.constructor',
      "a['constructor']",
      "a['__proto__']",
      'a.__proto__.x',
      'a.prototype',
      "a.constructor.constructor('return 1')()",
    ];

    dangerous.forEach((source) => {
      it(`bloquea ${source}`, () => {
        expect(() => run(source, { a: {} })).toThrowError(ExpressionError);
      });
    });

    const notSupported = ['x = 1', 'x++', '() => 1', 'new Foo()', 'this', '`plantilla`', 'a; b', 'function(){}'];

    notSupported.forEach((source) => {
      it(`no soporta la sintaxis "${source}"`, () => {
        expect(() => parseExpression(source)).toThrowError(ExpressionError);
      });
    });
  });

  describe('errores de sintaxis', () => {
    ['', '   ', 'a ===', '(a', 'a b', "'sin cerrar", 'a ? b', 'a..b', '[1, 2', 'f(1,'].forEach((source) => {
      it(`rechaza "${source}"`, () => {
        expect(() => parseExpression(source)).toThrowError(ExpressionError);
      });
    });

    it('el mensaje indica dónde está el problema', () => {
      expect(() => parseExpression('a === ')).toThrowError(/final de la expresión/);
      expect(() => parseExpression('a # b')).toThrowError(/posición 2/);
    });
  });
});
