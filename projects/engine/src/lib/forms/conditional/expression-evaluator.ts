/**
 * Evaluador seguro de las expresiones `showIf` / `hideIf`.
 *
 * Las expresiones vienen del JSON, es decir, de fuera. Por eso NO se ejecutan
 * como JavaScript (`eval` / `new Function`): se analizan con un parser propio
 * y se evalúan recorriendo el árbol, con un lenguaje deliberadamente pequeño.
 * Así tampoco exigen `unsafe-eval` en la Content Security Policy del host.
 *
 * Gramática (de menor a mayor precedencia):
 *
 *   ternario      a ? b : c
 *   nullish       a ?? b
 *   o lógico      a || b
 *   y lógico      a && b
 *   igualdad      ===  !==  ==  !=
 *   relacional    <  <=  >  >=
 *   aditivo       +  -
 *   multiplicat.  *  /  %
 *   unario        !  -  +
 *   postfijo      a.b   a[0]   fn(x, y)   obj.metodo(x)
 *   primario      número, 'texto', "texto", true, false, null, undefined,
 *                 identificador, [a, b], (expr)
 *
 * Lo que NO existe a propósito: asignaciones, funciones flecha, plantillas,
 * `new`, `this`, operadores de incremento y cualquier acceso a `constructor`,
 * `prototype` o `__proto__`.
 */

/** Error de sintaxis o de uso (función desconocida, acceso prohibido...). */
export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionError';
  }
}

export type ExpressionFunction = (...args: any[]) => unknown;

/** Datos con los que se evalúa: variables (por nombre) y funciones permitidas. */
export interface ExpressionScope {
  variables: Record<string, unknown>;
  functions: Record<string, ExpressionFunction>;
}

// ---------------------------------------------------------------------------
// Tokenizador
// ---------------------------------------------------------------------------

type TokenType = 'number' | 'string' | 'identifier' | 'punctuator' | 'end';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

/** Más largos primero, para que `===` gane sobre `==` y `=`. */
const PUNCTUATORS = [
  '===', '!==', '==', '!=', '<=', '>=', '&&', '||', '??',
  '<', '>', '+', '-', '*', '/', '%', '!', '?', ':', '(', ')', '[', ']', ',', '.',
];

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const match = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i))!;
      tokens.push({ type: 'number', value: match[0], position: i });
      i += match[0].length;
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(i))!;
      tokens.push({ type: 'identifier', value: match[0], position: i });
      i += match[0].length;
      continue;
    }

    if (char === "'" || char === '"') {
      let text = '';
      let j = i + 1;
      let closed = false;
      while (j < source.length) {
        const c = source[j];
        if (c === '\\') {
          const next = source[j + 1];
          if (next === undefined) break;
          text += ESCAPES[next] ?? next;
          j += 2;
        } else if (c === char) {
          closed = true;
          j++;
          break;
        } else {
          text += c;
          j++;
        }
      }
      if (!closed) throw new ExpressionError(`Texto sin cerrar en la posición ${i}`);
      tokens.push({ type: 'string', value: text, position: i });
      i = j;
      continue;
    }

    const punctuator = PUNCTUATORS.find((p) => source.startsWith(p, i));
    if (!punctuator) {
      throw new ExpressionError(`Carácter no permitido "${char}" en la posición ${i}`);
    }
    tokens.push({ type: 'punctuator', value: punctuator, position: i });
    i += punctuator.length;
  }

  tokens.push({ type: 'end', value: '', position: source.length });
  return tokens;
}

// ---------------------------------------------------------------------------
// Árbol de sintaxis
// ---------------------------------------------------------------------------

export type ExpressionNode =
  | { kind: 'literal'; value: unknown }
  | { kind: 'identifier'; name: string }
  | { kind: 'array'; items: ExpressionNode[] }
  | { kind: 'unary'; operator: string; operand: ExpressionNode }
  | { kind: 'binary'; operator: string; left: ExpressionNode; right: ExpressionNode }
  | { kind: 'conditional'; test: ExpressionNode; consequent: ExpressionNode; alternate: ExpressionNode }
  | { kind: 'member'; object: ExpressionNode; property: ExpressionNode | string }
  | { kind: 'call'; callee: ExpressionNode; args: ExpressionNode[] };

/** Map, no objeto: `'constructor' in {}` es verdadero por herencia del prototipo. */
const KEYWORD_LITERALS = new Map<string, unknown>([
  ['true', true],
  ['false', false],
  ['null', null],
  ['undefined', undefined],
]);

/** Palabras de JavaScript que este lenguaje no soporta: se rechazan con un error claro. */
const RESERVED_WORDS = new Set([
  'this', 'new', 'function', 'class', 'typeof', 'instanceof', 'in', 'of', 'delete', 'void',
  'var', 'let', 'const', 'return', 'throw', 'import', 'await', 'async', 'yield', 'super',
]);

/** Nombres que nunca se pueden usar para llegar a un prototipo. */
const FORBIDDEN_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype']);

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly source: string,
  ) {}

  parse(): ExpressionNode {
    if (this.peek().type === 'end') throw new ExpressionError('La expresión está vacía');
    const node = this.parseConditional();
    const rest = this.peek();
    if (rest.type !== 'end') {
      throw new ExpressionError(`Sobra "${rest.value}" en la posición ${rest.position}`);
    }
    return node;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    return this.tokens[this.index++];
  }

  private isPunctuator(value: string): boolean {
    const token = this.peek();
    return token.type === 'punctuator' && token.value === value;
  }

  private accept(value: string): boolean {
    if (!this.isPunctuator(value)) return false;
    this.index++;
    return true;
  }

  private expect(value: string): void {
    if (this.accept(value)) return;
    const token = this.peek();
    const found = token.type === 'end' ? 'el final de la expresión' : `"${token.value}"`;
    throw new ExpressionError(`Se esperaba "${value}" y se encontró ${found} (posición ${token.position})`);
  }

  private parseConditional(): ExpressionNode {
    const test = this.parseBinary(0);
    if (!this.accept('?')) return test;
    const consequent = this.parseConditional();
    this.expect(':');
    const alternate = this.parseConditional();
    return { kind: 'conditional', test, consequent, alternate };
  }

  /** Niveles de operadores binarios, de menor a mayor precedencia. */
  private static readonly LEVELS: string[][] = [
    ['??'],
    ['||'],
    ['&&'],
    ['===', '!==', '==', '!='],
    ['<', '<=', '>', '>='],
    ['+', '-'],
    ['*', '/', '%'],
  ];

  private parseBinary(level: number): ExpressionNode {
    if (level >= Parser.LEVELS.length) return this.parseUnary();

    let left = this.parseBinary(level + 1);
    for (;;) {
      const token = this.peek();
      if (token.type !== 'punctuator' || !Parser.LEVELS[level].includes(token.value)) return left;
      this.index++;
      const right = this.parseBinary(level + 1);
      left = { kind: 'binary', operator: token.value, left, right };
    }
  }

  private parseUnary(): ExpressionNode {
    const token = this.peek();
    if (token.type === 'punctuator' && ['!', '-', '+'].includes(token.value)) {
      this.index++;
      return { kind: 'unary', operator: token.value, operand: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): ExpressionNode {
    let node = this.parsePrimary();

    for (;;) {
      if (this.accept('.')) {
        const name = this.next();
        if (name.type !== 'identifier') {
          throw new ExpressionError(`Se esperaba un nombre tras "." (posición ${name.position})`);
        }
        this.assertAllowedProperty(name.value);
        node = { kind: 'member', object: node, property: name.value };
      } else if (this.accept('[')) {
        const property = this.parseConditional();
        this.expect(']');
        node = { kind: 'member', object: node, property };
      } else if (this.accept('(')) {
        const args: ExpressionNode[] = [];
        if (!this.isPunctuator(')')) {
          do {
            args.push(this.parseConditional());
          } while (this.accept(','));
        }
        this.expect(')');
        node = { kind: 'call', callee: node, args };
      } else {
        return node;
      }
    }
  }

  private parsePrimary(): ExpressionNode {
    const token = this.next();

    switch (token.type) {
      case 'number':
        return { kind: 'literal', value: Number(token.value) };
      case 'string':
        return { kind: 'literal', value: token.value };
      case 'identifier':
        if (KEYWORD_LITERALS.has(token.value)) return { kind: 'literal', value: KEYWORD_LITERALS.get(token.value) };
        if (RESERVED_WORDS.has(token.value)) {
          throw new ExpressionError(`"${token.value}" no se puede usar en una expresión (posición ${token.position})`);
        }
        this.assertAllowedProperty(token.value);
        return { kind: 'identifier', name: token.value };
      case 'punctuator':
        if (token.value === '(') {
          const inner = this.parseConditional();
          this.expect(')');
          return inner;
        }
        if (token.value === '[') {
          const items: ExpressionNode[] = [];
          if (!this.isPunctuator(']')) {
            do {
              items.push(this.parseConditional());
            } while (this.accept(','));
          }
          this.expect(']');
          return { kind: 'array', items };
        }
        break;
    }

    const found = token.type === 'end' ? 'el final de la expresión' : `"${token.value}"`;
    throw new ExpressionError(`No se esperaba ${found} (posición ${token.position}) en "${this.source}"`);
  }

  private assertAllowedProperty(name: string): void {
    if (FORBIDDEN_PROPERTIES.has(name)) {
      throw new ExpressionError(`El acceso a "${name}" no está permitido`);
    }
  }
}

/** Analiza una expresión. Lanza `ExpressionError` si no es válida. */
export function parseExpression(source: string): ExpressionNode {
  return new Parser(tokenize(source), source).parse();
}

// ---------------------------------------------------------------------------
// Evaluación
// ---------------------------------------------------------------------------

/** Métodos de texto y arreglos que se pueden llamar con la sintaxis `valor.metodo(...)`. */
const ALLOWED_METHODS = new Set([
  'includes',
  'startsWith',
  'endsWith',
  'indexOf',
  'toLowerCase',
  'toUpperCase',
  'trim',
]);

function readMember(object: unknown, key: unknown): unknown {
  if (object === null || object === undefined) return undefined;

  if (typeof key === 'string' && FORBIDDEN_PROPERTIES.has(key)) {
    throw new ExpressionError(`El acceso a "${key}" no está permitido`);
  }

  if (typeof object === 'string' || Array.isArray(object)) {
    if (key === 'length') return object.length;
    if (typeof key === 'number') return (object as any)[key];
    return undefined;
  }

  if (typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key as PropertyKey)) {
    return (object as Record<PropertyKey, unknown>)[key as PropertyKey];
  }
  return undefined;
}

function applyBinary(operator: string, left: unknown, right: unknown): unknown {
  /* eslint-disable eqeqeq */
  switch (operator) {
    case '===': return left === right;
    case '!==': return left !== right;
    case '==': return left == right;
    case '!=': return left != right;
    case '<': return (left as any) < (right as any);
    case '<=': return (left as any) <= (right as any);
    case '>': return (left as any) > (right as any);
    case '>=': return (left as any) >= (right as any);
    case '+': return (left as any) + (right as any);
    case '-': return (left as any) - (right as any);
    case '*': return (left as any) * (right as any);
    case '/': return (left as any) / (right as any);
    case '%': return (left as any) % (right as any);
  }
  /* eslint-enable eqeqeq */
  throw new ExpressionError(`Operador desconocido "${operator}"`);
}

/**
 * Evalúa un árbol ya analizado. Un identificador que no existe vale
 * `undefined` (un campo puede no estar en el formulario); en cambio, llamar a
 * una función que no existe sí es un error de la configuración.
 */
export function evaluateNode(node: ExpressionNode, scope: ExpressionScope): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value;

    case 'identifier':
      return Object.prototype.hasOwnProperty.call(scope.variables, node.name)
        ? scope.variables[node.name]
        : undefined;

    case 'array':
      return node.items.map((item) => evaluateNode(item, scope));

    case 'unary': {
      const value = evaluateNode(node.operand, scope);
      if (node.operator === '!') return !value;
      return node.operator === '-' ? -(value as number) : +(value as number);
    }

    case 'binary': {
      // Cortocircuito: el lado derecho solo se evalúa si hace falta.
      if (node.operator === '&&') {
        const left = evaluateNode(node.left, scope);
        return left ? evaluateNode(node.right, scope) : left;
      }
      if (node.operator === '||') {
        const left = evaluateNode(node.left, scope);
        return left ? left : evaluateNode(node.right, scope);
      }
      if (node.operator === '??') {
        const left = evaluateNode(node.left, scope);
        return left ?? evaluateNode(node.right, scope);
      }
      return applyBinary(node.operator, evaluateNode(node.left, scope), evaluateNode(node.right, scope));
    }

    case 'conditional':
      return evaluateNode(node.test, scope)
        ? evaluateNode(node.consequent, scope)
        : evaluateNode(node.alternate, scope);

    case 'member': {
      const object = evaluateNode(node.object, scope);
      const key = typeof node.property === 'string' ? node.property : evaluateNode(node.property, scope);
      return readMember(object, key);
    }

    case 'call':
      return evaluateCall(node, scope);
  }
}

function evaluateCall(node: Extract<ExpressionNode, { kind: 'call' }>, scope: ExpressionScope): unknown {
  const args = node.args.map((arg) => evaluateNode(arg, scope));

  // fn(x): función del catálogo permitido.
  if (node.callee.kind === 'identifier') {
    const name = node.callee.name;
    if (!Object.prototype.hasOwnProperty.call(scope.functions, name)) {
      throw new ExpressionError(`La función "${name}" no existe`);
    }
    return scope.functions[name](...args);
  }

  // valor.metodo(x): solo métodos de texto/arreglo de la lista blanca.
  if (node.callee.kind === 'member' && typeof node.callee.property === 'string') {
    const method = node.callee.property;
    const target = evaluateNode(node.callee.object, scope);

    if (!ALLOWED_METHODS.has(method)) {
      throw new ExpressionError(`El método "${method}" no está permitido`);
    }
    // Un valor ausente no tiene métodos: la condición simplemente no se cumple.
    if (target === null || target === undefined) return undefined;
    if (typeof target !== 'string' && !Array.isArray(target)) {
      throw new ExpressionError(`"${method}" solo se puede usar con texto o listas`);
    }
    const fn = (target as any)[method];
    return typeof fn === 'function' ? fn.apply(target, args) : undefined;
  }

  throw new ExpressionError('Solo se pueden llamar funciones del catálogo o métodos de texto y listas');
}

/** Atajo: analiza y evalúa en un paso. */
export function evaluateExpression(source: string, scope: ExpressionScope): unknown {
  return evaluateNode(parseExpression(source), scope);
}
