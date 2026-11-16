/**
 * Aislamiento del CSS de cada sección ("scoped CSS").
 *
 * El `cssComponent` de una sección se inserta como un `<style>` normal, y un
 * `<style>` aplica a TODO el documento: una regla `.card { ... }` del JSON
 * afectaría también a las tarjetas de la página host. Este módulo reescribe
 * los selectores para que cada regla solo alcance a la sección propia.
 *
 * Cada sección vive dentro de un elemento con la clase `dynamic-<id>` (la pone
 * el propio componente). Un selector sin prefijo se reescribe así:
 *
 *   .card .titulo   ->   :where(.dynamic-<id>) .card .titulo
 *
 * - Se usa `:where()` para que el prefijo NO sume especificidad: el CSS del
 *   autor sigue ganando o perdiendo contra otras reglas igual que antes.
 * - Un selector que ya empieza por `.dynamic-<id>` (el formato histórico del
 *   backend) se deja tal cual, así los JSON existentes siguen funcionando.
 * - `html`, `body` y `:root` pasan a significar "la raíz de la sección", de
 *   modo que no pueden tocar la página host.
 * - Se analiza con el parser CSS del navegador (CSSOM), no con expresiones
 *   regulares sobre el texto: comentarios, cadenas y bloques anidados los
 *   entiende el propio navegador.
 *
 * Qué NO se puede aislar con selectores y se deja global: `@font-face` y
 * `@property` (sus nombres son globales por definición) y `@page`. Los
 * `@keyframes` sí se aíslan renombrándolos.
 */

/** Caracteres que pueden continuar un identificador CSS. */
const IDENT_CHAR = /[A-Za-z0-9_\\-]|[^\x00-\x7f]/;

/** `html`, `body` o `:root` como inicio de un selector. */
const ROOT_TOKEN = /^(?:html|body|:root)(?![\w-])/i;

/** Clase que identifica la sección con el `contentId` dado. */
export function scopeClassFor(contentId: string): string {
  return `dynamic-${contentId}`;
}

function escapeIdent(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/[^\w-]/g, '\\$&');
}

/**
 * Reescribe `css` para que sus reglas solo apliquen dentro de un elemento con
 * la clase `scopeClass`. Es idempotente: reescribir un CSS ya reescrito no lo
 * cambia.
 *
 * Si el navegador no puede analizar CSS (no existe ninguna de las dos APIs que
 * se prueban), devuelve el CSS sin tocar y avisa por consola.
 */
export function scopeCss(css: string, scopeClass: string): string {
  if (!css || !css.trim()) return '';

  const sheet = parseStylesheet(css);
  if (!sheet) {
    console.warn('No se pudo aislar el CSS de la sección: el navegador no permite analizarlo. Se aplica sin aislar.');
    return css;
  }

  const scope = `.${escapeIdent(scopeClass)}`;
  const context: ScopeContext = {
    scope,
    wrapper: `:where(${scope})`,
    keyframePrefix: `${scopeClass.replace(/[^A-Za-z0-9_-]/g, '-')}__`,
    keyframeNames: new Map(),
  };

  collectKeyframes(sheet.cssRules, context);
  scopeRules(sheet, context);
  renameAnimations(sheet.cssRules, context);

  return Array.from(sheet.cssRules)
    .map((rule) => rule.cssText)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Análisis
// ---------------------------------------------------------------------------

function parseStylesheet(css: string): CSSStyleSheet | null {
  // 1) Hoja construida: ignora `@import` y no toca la red ni el documento.
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return sheet;
  } catch {
    // sigue con el plan B
  }

  // 2) Documento inerte: un <style> en un documento sin ventana ni red.
  try {
    const doc = document.implementation.createHTMLDocument('');
    const style = doc.createElement('style');
    style.textContent = css;
    doc.head.appendChild(style);
    return style.sheet;
  } catch {
    return null;
  }
}

interface ScopeContext {
  /** `.dynamic-<id>` */
  scope: string;
  /** `:where(.dynamic-<id>)` */
  wrapper: string;
  /** Prefijo con el que se renombran los @keyframes. */
  keyframePrefix: string;
  /** nombre original -> nombre aislado */
  keyframeNames: Map<string, string>;
}

interface RuleContainer {
  cssRules: CSSRuleList;
  deleteRule(index: number): void;
}

// ---------------------------------------------------------------------------
// Reglas
// ---------------------------------------------------------------------------

function scopeRules(container: RuleContainer, context: ScopeContext): void {
  // De atrás hacia adelante: borrar una regla no corre los índices pendientes.
  for (let i = container.cssRules.length - 1; i >= 0; i--) {
    const rule = container.cssRules[i];

    if (rule instanceof CSSStyleRule) {
      if (!scopeStyleRule(rule, context)) container.deleteRule(i);
    } else if (rule instanceof CSSImportRule || isNamespaceRule(rule)) {
      // @import carga recursos externos y @namespace altera el documento.
      container.deleteRule(i);
    } else if (rule instanceof CSSKeyframesRule) {
      renameKeyframes(rule, context);
    } else if (isGroupingRule(rule)) {
      // @media, @supports, @container, @layer { ... }: sus reglas internas
      // también se aíslan.
      scopeRules(rule, context);
    }
    // @font-face, @property, @page, @layer a, b; ... se dejan como están.
  }
}

function isNamespaceRule(rule: CSSRule): boolean {
  return typeof CSSNamespaceRule !== 'undefined' && rule instanceof CSSNamespaceRule;
}

function isGroupingRule(rule: CSSRule): rule is CSSGroupingRule {
  if (typeof CSSGroupingRule === 'undefined' || !(rule instanceof CSSGroupingRule)) return false;
  // En @scope las reglas internas son relativas a su propia raíz: reescribirlas
  // las rompería. Es una sintaxis que el backend no genera; se deja intacta.
  return rule.constructor?.name !== 'CSSScopeRule';
}

/** Devuelve `false` si la regla no se pudo aislar y hay que descartarla. */
function scopeStyleRule(rule: CSSStyleRule, context: ScopeContext): boolean {
  const original = rule.selectorText;
  const scoped = splitSelectorList(original)
    .map((selector) => scopeSelector(selector, context))
    .join(', ');

  if (scoped === original) return true;

  rule.selectorText = scoped;

  // Si el navegador rechazó el selector nuevo, la regla seguiría sin aislar:
  // mejor perderla que dejar que afecte a la página host.
  return rule.selectorText !== original;
}

// ---------------------------------------------------------------------------
// Selectores
// ---------------------------------------------------------------------------

/** Divide `a, b` por las comas de nivel superior (no las de `:is(a, b)` ni las de cadenas). */
export function splitSelectorList(selectorList: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let i = 0; i < selectorList.length; i++) {
    const char = selectorList[i];

    if (char === '\\') {
      i++; // el siguiente carácter está escapado
    } else if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(' || char === '[') {
      depth++;
    } else if (char === ')' || char === ']') {
      depth = Math.max(0, depth - 1);
    } else if (char === ',' && depth === 0) {
      parts.push(selectorList.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(selectorList.slice(start));

  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function scopeSelector(selector: string, context: ScopeContext): string {
  const { scope, wrapper } = context;

  if (startsWithSelector(selector, wrapper) || startsWithClass(selector, scope)) {
    return selector; // ya está aislado
  }

  // `html`, `body` y `:root` (solos o encadenados: `html body .x`) son la raíz de la sección.
  if (ROOT_TOKEN.test(selector)) {
    let rest = selector;
    for (;;) {
      rest = rest.replace(ROOT_TOKEN, '');
      const next = /^\s*>?\s*(?=(?:html|body|:root)(?![\w-]))/i.exec(rest);
      if (!next) break;
      rest = rest.slice(next[0].length);
    }
    return wrapper + rest;
  }

  return `${wrapper} ${selector}`;
}

/** ¿`selector` empieza con `prefix` seguido de algo que no continúa el identificador? */
function startsWithClass(selector: string, prefix: string): boolean {
  if (!selector.startsWith(prefix)) return false;
  const next = selector[prefix.length];
  return next === undefined || !IDENT_CHAR.test(next);
}

function startsWithSelector(selector: string, prefix: string): boolean {
  return selector.startsWith(prefix);
}

// ---------------------------------------------------------------------------
// @keyframes
// ---------------------------------------------------------------------------

function collectKeyframes(rules: CSSRuleList, context: ScopeContext): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSKeyframesRule) {
      context.keyframeNames.set(rule.name, context.keyframePrefix + rule.name);
    } else if (isGroupingRule(rule)) {
      collectKeyframes(rule.cssRules, context);
    }
  }
}

function renameKeyframes(rule: CSSKeyframesRule, context: ScopeContext): void {
  const renamed = context.keyframeNames.get(rule.name);
  if (renamed) rule.name = renamed;
}

/**
 * Los nombres de @keyframes son globales: dos secciones con un
 * `@keyframes aparecer` distinto se pisarían. Tras renombrarlos hay que
 * actualizar quién los usa (`animation` y `animation-name`).
 */
function renameAnimations(rules: CSSRuleList, context: ScopeContext): void {
  if (context.keyframeNames.size === 0) return;

  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      for (const property of ['animation', 'animation-name']) {
        const value = rule.style.getPropertyValue(property);
        if (!value) continue;

        const updated = value.replace(
          /(^|[^\w-])(-?[_a-zA-Z][\w-]*)/g,
          (match, before: string, ident: string) => before + (context.keyframeNames.get(ident) ?? ident),
        );
        if (updated !== value) {
          rule.style.setProperty(property, updated, rule.style.getPropertyPriority(property));
        }
      }
      // Reglas anidadas dentro de la regla (CSS nesting)
      const nested = (rule as { cssRules?: CSSRuleList }).cssRules;
      if (nested?.length) renameAnimations(nested, context);
    } else if (isGroupingRule(rule)) {
      renameAnimations(rule.cssRules, context);
    }
  }
}
