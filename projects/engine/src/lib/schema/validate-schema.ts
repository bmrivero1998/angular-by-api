/**
 * Validador del JSON de pantalla (el contrato descrito en
 * `schema/ux-driven-viewer.schema.json`). Sin dependencias: recorre el arreglo
 * de secciones y devuelve la lista de problemas con su ruta, por ejemplo
 * `[2].formMappings[0].validatorConfig[1].type`.
 *
 * Además de la forma (tipos, campos obligatorios, valores permitidos) comprueba
 * lo que un JSON Schema no puede: ids de sección repetidos, selectores que no
 * encuentran su elemento en el `htmlComponent` de la sección y `matchControl`
 * hacia un control que no existe.
 *
 * Solo informa: nunca lanza ni modifica el contenido.
 */

export type SchemaIssueSeverity = 'error' | 'warning';

export interface SchemaIssue {
  /** Ruta al valor con problema, p. ej. `[2].formMappings[0].domSelector`. Vacía si es el JSON completo. */
  path: string;
  /** Qué está mal, en español. */
  message: string;
  severity: SchemaIssueSeverity;
  /** Identificador estable del tipo de problema (útil para filtrar). */
  code: SchemaIssueCode;
}

export type SchemaIssueCode =
  | 'not-array'
  | 'not-object'
  | 'missing-field'
  | 'invalid-type'
  | 'invalid-value'
  | 'unknown-field'
  | 'duplicate-id'
  | 'duplicate-control'
  | 'selector-invalid'
  | 'selector-not-found'
  | 'control-not-found';

const VALIDATOR_TYPES = [
  'required',
  'requiredtrue',
  'email',
  'minlength',
  'maxlength',
  'pattern',
  'min',
  'max',
  'matchvalue',
  'matchcontrol',
];
const VALIDATORS_WITH_VALUE = ['minlength', 'maxlength', 'pattern', 'min', 'max', 'matchvalue', 'matchcontrol'];

const FLAT_CONDITIONS = [
  'formIsInvalid',
  'formIsValid',
  'formIsPristine',
  'formIsDirty',
  'formIsTouched',
  'formIsUntouched',
  'formIsPending',
  'formIsInvalidOrPristine',
  'formIsEmpty',
  'formIsNotEmpty',
  'alwaysDisable',
  'neverDisable',
];
const CONTROL_CONDITIONS = [
  'controlIsInvalid',
  'controlIsValid',
  'controlIsEmpty',
  'controlIsNotEmpty',
  'controlsDoNotMatch',
];

type Kind = 'string' | 'nonEmptyString' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'any';
type FieldSpec = Kind | { kind: Kind; enum?: string[]; min?: number; nullable?: boolean };
type Spec = Record<string, FieldSpec>;

const SECTION_SPEC: Spec = {
  id_DocumentHTMLCSS: 'nonEmptyString',
  renderType: { kind: 'string', enum: ['static', 'dynamic'] },
  htmlComponent: 'string',
  cssComponent: 'string',
  configuracion: 'string',
  dynamicContentId: 'string',
  formId: 'string',
  formMappings: 'array',
  formInitialData: 'object',
  validators: 'array',
  buttonConfigs: 'array',
  dataBindings: 'array',
  tableBindings: 'array',
  otros: 'object',
};

const MAPPING_SPEC: Spec = {
  controlName: 'nonEmptyString',
  domSelector: 'nonEmptyString',
  eventType: 'string',
  errorDisplaySelector: { kind: 'string', nullable: true },
  defaultValue: 'any',
  validatorConfig: 'array',
  keyFilter: 'string',
  inputMask: 'string',
  hideIf: 'string',
  showIf: 'string',
  visibilityGroup: 'string',
  alwaysDisabled: 'boolean',
  valueProperty: 'string',
  useEventDetail: 'boolean',
  asyncValidator: 'object',
  toggleConfig: 'object',
  rangeConfig: 'object',
  colorConfig: 'object',
  dateTimeConfig: 'object',
  multiSelectConfig: 'object',
  captchaConfig: 'object',
  passwordConfig: 'object',
  sliderInputConfig: 'object',
  richTextConfig: 'object',
  autoCompleteConfig: 'object',
  fileUploadConfig: 'object',
  sliderConfig: 'object',
};

/** Config por tipo de control: campos permitidos. Los selectores se comprueban aparte. */
const CONFIG_SPECS: Record<string, { spec: Spec; required?: string[] }> = {
  asyncValidator: {
    spec: {
      endpoint: 'string',
      method: { kind: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
      debounceTime: { kind: 'number', min: 0 },
      errorKey: 'string',
      message: 'string',
    },
    required: ['endpoint', 'method', 'errorKey', 'message'],
  },
  toggleConfig: { spec: { checkedClass: 'string', uncheckedClass: 'string', trueValue: 'any', falseValue: 'any' } },
  rangeConfig: { spec: { displaySelector: 'nonEmptyString', displayFormat: 'string', step: 'number' } },
  colorConfig: { spec: { previewSelector: 'nonEmptyString', defaultColor: 'string' } },
  dateTimeConfig: {
    spec: {
      format: 'string',
      pickerType: { kind: 'string', enum: ['native', 'flatpickr', 'bootstrap'] },
      showTime: 'boolean',
      minDate: 'string',
      maxDate: 'string',
    },
  },
  multiSelectConfig: {
    spec: { separator: 'string', maxSelections: { kind: 'integer', min: 1 }, displaySelector: 'nonEmptyString' },
  },
  captchaConfig: {
    spec: {
      siteKey: 'string',
      theme: { kind: 'string', enum: ['light', 'dark'] },
      size: { kind: 'string', enum: ['normal', 'compact'] },
    },
    required: ['siteKey'],
  },
  passwordConfig: { spec: { strengthMeter: 'boolean', toggleVisibility: 'boolean' } },
  sliderInputConfig: { spec: { min: 'number', max: 'number', step: 'number', showValue: 'boolean' } },
  richTextConfig: {
    spec: {
      editorType: { kind: 'string', enum: ['quill', 'tinymce', 'ckeditor'] },
      toolbar: 'any',
      height: { kind: 'number', min: 0 },
    },
  },
  autoCompleteConfig: {
    spec: {
      source: 'array',
      sourceUrl: 'nonEmptyString',
      queryParam: 'nonEmptyString',
      minChars: { kind: 'integer', min: 0 },
      debounceTime: { kind: 'number', min: 0 },
    },
  },
  fileUploadConfig: {
    spec: {
      accept: 'string',
      maxSize: { kind: 'number', min: 0 },
      multiple: 'boolean',
      maxCount: { kind: 'integer', min: 1 },
      uploadUrl: 'nonEmptyString',
      method: { kind: 'string', enum: ['POST', 'PUT'] },
      fieldName: 'nonEmptyString',
      progressSelector: 'nonEmptyString',
      fileListSelector: 'nonEmptyString',
    },
  },
  sliderConfig: {
    spec: {
      min: 'number',
      max: 'number',
      step: 'number',
      orientation: { kind: 'string', enum: ['horizontal', 'vertical'] },
    },
  },
};

/** Campos de cada config que son selectores CSS y deben existir en el HTML. */
const CONFIG_SELECTOR_FIELDS: Record<string, string[]> = {
  rangeConfig: ['displaySelector'],
  colorConfig: ['previewSelector'],
  multiSelectConfig: ['displaySelector'],
  fileUploadConfig: ['progressSelector', 'fileListSelector'],
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Un documento HTML ya interpretado, o `null` si no hay DOMParser (fuera del navegador). */
type ParsedHtml = Document | null;

interface SectionContext {
  path: string;
  doc: ParsedHtml;
  formId: string;
  /** Nombres de control del formulario de esta sección (y de otras con el mismo formId). */
  controls: Set<string>;
}

/**
 * Valida el JSON de pantalla. Acepta el valor ya parseado (un arreglo de
 * secciones). Devuelve `[]` si no hay nada que avisar.
 */
export function validateSchema(json: unknown): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const add = (path: string, message: string, code: SchemaIssueCode, severity: SchemaIssueSeverity = 'error') =>
    issues.push({ path, message, code, severity });

  if (!Array.isArray(json)) {
    add('', 'El contenido debe ser un arreglo de secciones.', 'not-array');
    return issues;
  }

  // Controles por formId, para resolver matchControl y los botones aunque el formulario se reparta en varias secciones.
  const controlsByForm = new Map<string, Set<string>>();
  json.forEach((section) => {
    if (!isObject(section)) return;
    const formId = formIdOf(section);
    if (!Array.isArray(section['formMappings'])) return;
    const set = controlsByForm.get(formId) ?? new Set<string>();
    (section['formMappings'] as unknown[]).forEach((mapping) => {
      if (isObject(mapping) && typeof mapping['controlName'] === 'string') set.add(mapping['controlName']);
    });
    controlsByForm.set(formId, set);
  });

  const seenIds = new Map<string, number>();
  const seenControls = new Map<string, string>(); // `${formId}\u0000${controlName}` -> ruta del primero

  json.forEach((section, index) => {
    const path = `[${index}]`;
    if (!isObject(section)) {
      add(path, 'La sección debe ser un objeto.', 'not-object');
      return;
    }

    checkFields(section, SECTION_SPEC, path, ['id_DocumentHTMLCSS', 'renderType', 'htmlComponent'], add);

    const id = section['id_DocumentHTMLCSS'];
    if (typeof id === 'string' && id.trim()) {
      const first = seenIds.get(id.trim());
      if (first !== undefined) {
        add(
          `${path}.id_DocumentHTMLCSS`,
          `El id "${id}" está repetido (ya lo usa la sección [${first}]); el widget ignora esta sección.`,
          'duplicate-id',
        );
      } else {
        seenIds.set(id.trim(), index);
      }
    }

    const formId = formIdOf(section);
    const ctx: SectionContext = {
      path,
      doc: typeof section['htmlComponent'] === 'string' ? parseHtml(section['htmlComponent']) : null,
      formId,
      controls: controlsByForm.get(formId) ?? new Set<string>(),
    };

    if (Array.isArray(section['formMappings'])) {
      (section['formMappings'] as unknown[]).forEach((mapping, i) => {
        validateMapping(mapping, `${path}.formMappings[${i}]`, ctx, seenControls, add);
      });
    }
    if (Array.isArray(section['buttonConfigs'])) {
      (section['buttonConfigs'] as unknown[]).forEach((button, i) =>
        validateButton(button, `${path}.buttonConfigs[${i}]`, ctx, add),
      );
    }
    if (Array.isArray(section['dataBindings'])) {
      (section['dataBindings'] as unknown[]).forEach((binding, i) =>
        validateDataBinding(binding, `${path}.dataBindings[${i}]`, ctx, add),
      );
    }
    if (Array.isArray(section['tableBindings'])) {
      (section['tableBindings'] as unknown[]).forEach((binding, i) =>
        validateTableBinding(binding, `${path}.tableBindings[${i}]`, ctx, add),
      );
    }
  });

  return issues;
}

/** Una línea legible por problema: `[2].formMappings[0].domSelector: mensaje`. */
export function formatSchemaIssue(issue: SchemaIssue): string {
  return issue.path ? `${issue.path}: ${issue.message}` : issue.message;
}

// ---------------------------------------------------------------------------
// Partes
// ---------------------------------------------------------------------------

type Add = (path: string, message: string, code: SchemaIssueCode, severity?: SchemaIssueSeverity) => void;

function formIdOf(section: Record<string, unknown>): string {
  if (typeof section['formId'] === 'string' && section['formId']) return section['formId'];
  return typeof section['id_DocumentHTMLCSS'] === 'string' ? section['id_DocumentHTMLCSS'] : '';
}

function validateMapping(
  mapping: unknown,
  path: string,
  ctx: SectionContext,
  seenControls: Map<string, string>,
  add: Add,
): void {
  if (!isObject(mapping)) {
    add(path, 'El mapeo debe ser un objeto.', 'not-object');
    return;
  }
  checkFields(mapping, MAPPING_SPEC, path, ['controlName', 'domSelector'], add);

  const controlName = mapping['controlName'];
  if (typeof controlName === 'string' && controlName) {
    const key = `${ctx.formId}\u0000${controlName}`;
    const first = seenControls.get(key);
    if (first) {
      add(
        `${path}.controlName`,
        `El control "${controlName}" ya está definido en ${first}; los dos mapeos se pisarían.`,
        'duplicate-control',
      );
    } else {
      seenControls.set(key, path);
    }
  }

  checkSelector(mapping['domSelector'], `${path}.domSelector`, ctx, add, 'error');
  if (typeof mapping['errorDisplaySelector'] === 'string') {
    checkSelector(mapping['errorDisplaySelector'], `${path}.errorDisplaySelector`, ctx, add, 'error');
  }

  if (Array.isArray(mapping['validatorConfig'])) {
    (mapping['validatorConfig'] as unknown[]).forEach((validator, i) =>
      validateValidator(validator, `${path}.validatorConfig[${i}]`, ctx, add),
    );
  }

  for (const name of Object.keys(CONFIG_SPECS)) {
    const config = mapping[name];
    if (config === undefined || !isObject(config)) continue;
    const { spec, required } = CONFIG_SPECS[name];
    checkFields(config, spec, `${path}.${name}`, required ?? [], add);
    for (const field of CONFIG_SELECTOR_FIELDS[name] ?? []) {
      if (typeof config[field] === 'string') {
        checkSelector(config[field], `${path}.${name}.${field}`, ctx, add, 'warning');
      }
    }
  }

  const auto = mapping['autoCompleteConfig'];
  if (isObject(auto) && Array.isArray(auto['source'])) {
    (auto['source'] as unknown[]).forEach((item, i) => {
      if (typeof item !== 'string') {
        add(`${path}.autoCompleteConfig.source[${i}]`, 'Cada sugerencia debe ser un texto.', 'invalid-type');
      }
    });
  }
  if (isObject(auto) && auto['source'] === undefined && auto['sourceUrl'] === undefined) {
    add(
      `${path}.autoCompleteConfig`,
      'Falta source (lista fija) o sourceUrl (endpoint): sin ninguno no hay sugerencias.',
      'missing-field',
      'warning',
    );
  }
}

function validateValidator(validator: unknown, path: string, ctx: SectionContext, add: Add): void {
  if (!isObject(validator)) {
    add(path, 'El validador debe ser un objeto.', 'not-object');
    return;
  }
  checkFields(validator, { type: 'nonEmptyString', value: 'any', message: 'string' }, path, ['type', 'message'], add);

  const type = validator['type'];
  if (typeof type !== 'string' || !type) return;
  const normalized = type.toLowerCase();
  if (!VALIDATOR_TYPES.includes(normalized)) {
    add(
      `${path}.type`,
      `Tipo de validador desconocido "${type}". Los válidos son: required, requiredTrue, email, minLength, maxLength, pattern, min, max, matchValue, matchControl.`,
      'invalid-value',
    );
    return;
  }
  if (!VALIDATORS_WITH_VALUE.includes(normalized)) return;

  const value = validator['value'];
  if (value === undefined || value === null) {
    add(`${path}.value`, `El validador "${type}" necesita un "value".`, 'missing-field');
    return;
  }
  if (['minlength', 'maxlength', 'min', 'max'].includes(normalized) && (typeof value !== 'number' || !isFinite(value))) {
    add(`${path}.value`, `El "value" de "${type}" debe ser un número.`, 'invalid-type');
  } else if (normalized === 'pattern') {
    if (typeof value !== 'string') {
      add(`${path}.value`, 'El "value" de "pattern" debe ser una expresión regular escrita como texto.', 'invalid-type');
    } else {
      try {
        new RegExp(value);
      } catch {
        add(`${path}.value`, `La expresión regular "${value}" no es válida.`, 'invalid-value');
      }
    }
  } else if (normalized === 'matchcontrol') {
    if (typeof value !== 'string') {
      add(`${path}.value`, 'El "value" de "matchControl" debe ser el controlName del otro campo.', 'invalid-type');
    } else if (!ctx.controls.has(value)) {
      add(
        `${path}.value`,
        `matchControl apunta al control "${value}", que no existe en el formulario "${ctx.formId}".`,
        'control-not-found',
      );
    }
  }
}

function validateButton(button: unknown, path: string, ctx: SectionContext, add: Add): void {
  if (!isObject(button)) {
    add(path, 'El botón debe ser un objeto.', 'not-object');
    return;
  }
  checkFields(button, { selector: 'nonEmptyString', disableWhen: 'string' }, path, ['selector'], add);
  checkSelector(button['selector'], `${path}.selector`, ctx, add, 'warning');

  const when = button['disableWhen'];
  if (typeof when !== 'string' || !when) return;
  const [rawCondition, rawNames] = when.split(':');
  const condition = rawCondition.trim();
  if (rawNames === undefined) {
    if (!FLAT_CONDITIONS.includes(condition)) {
      add(`${path}.disableWhen`, `Condición desconocida "${when}".`, 'invalid-value');
    }
    return;
  }
  if (!CONTROL_CONDITIONS.includes(condition)) {
    add(`${path}.disableWhen`, `Condición de control desconocida "${condition}".`, 'invalid-value');
    return;
  }
  const names = rawNames.split(',').map((name) => name.trim());
  if (names.some((name) => !name)) {
    add(`${path}.disableWhen`, `"${condition}" necesita al menos un nombre de control.`, 'missing-field');
    return;
  }
  if (condition === 'controlsDoNotMatch' && names.length < 2) {
    add(`${path}.disableWhen`, '"controlsDoNotMatch" necesita dos controles.', 'missing-field');
  }
  names
    .filter((name) => !ctx.controls.has(name))
    .forEach((name) =>
      add(`${path}.disableWhen`, `El control "${name}" no existe en el formulario "${ctx.formId}".`, 'control-not-found'),
    );
}

function validateDataBinding(binding: unknown, path: string, ctx: SectionContext, add: Add): void {
  if (!isObject(binding)) {
    add(path, 'El binding debe ser un objeto.', 'not-object');
    return;
  }
  checkFields(binding, { selector: 'nonEmptyString', value: 'any' }, path, ['selector'], add);
  const value = binding['value'];
  if (value !== undefined && value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
    add(`${path}.value`, 'El valor debe ser texto, número, booleano o null.', 'invalid-type');
  }
  checkSelector(binding['selector'], `${path}.selector`, ctx, add, 'warning');
}

function validateTableBinding(binding: unknown, path: string, ctx: SectionContext, add: Add): void {
  if (!isObject(binding)) {
    add(path, 'El binding de tabla debe ser un objeto.', 'not-object');
    return;
  }
  checkFields(
    binding,
    { tableSelector: 'nonEmptyString', columns: 'array', data: 'array', actions: 'array' },
    path,
    ['tableSelector', 'columns', 'data'],
    add,
  );
  checkSelector(binding['tableSelector'], `${path}.tableSelector`, ctx, add, 'warning');
  if (Array.isArray(binding['columns'])) {
    (binding['columns'] as unknown[]).forEach((column, i) => {
      const p = `${path}.columns[${i}]`;
      if (!isObject(column)) return add(p, 'La columna debe ser un objeto.', 'not-object');
      checkFields(column, { key: 'string', header: 'string', isHtml: 'boolean' }, p, ['key', 'header'], add);
    });
  }
  if (Array.isArray(binding['actions'])) {
    (binding['actions'] as unknown[]).forEach((action, i) => {
      const p = `${path}.actions[${i}]`;
      if (!isObject(action)) return add(p, 'La acción debe ser un objeto.', 'not-object');
      checkFields(action, { label: 'string', action: 'string', cssClass: 'string' }, p, ['label', 'action'], add);
    });
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function parseHtml(html: string): ParsedHtml {
  if (typeof DOMParser === 'undefined') return null;
  try {
    return new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return null;
  }
}

/** Comprueba que el selector sea válido y encuentre algo en el HTML de la sección. */
function checkSelector(
  selector: unknown,
  path: string,
  ctx: SectionContext,
  add: Add,
  severity: SchemaIssueSeverity,
): void {
  if (typeof selector !== 'string' || !selector.trim() || !ctx.doc) return;
  try {
    if (!ctx.doc.querySelector(selector)) {
      add(
        path,
        `El selector "${selector}" no encuentra ningún elemento en el htmlComponent de la sección.`,
        'selector-not-found',
        severity,
      );
    }
  } catch {
    add(path, `El selector "${selector}" no es un selector CSS válido.`, 'selector-invalid');
  }
}

/** Tipos, obligatorios, valores permitidos y campos desconocidos de un objeto. */
function checkFields(
  obj: Record<string, unknown>,
  spec: Spec,
  path: string,
  required: string[],
  add: Add,
): void {
  for (const name of required) {
    if (obj[name] === undefined) add(`${path}.${name}`, `Falta el campo obligatorio "${name}".`, 'missing-field');
  }
  for (const key of Object.keys(obj)) {
    const fieldPath = `${path}.${key}`;
    const field = spec[key];
    if (field === undefined) {
      add(fieldPath, `Campo desconocido "${key}"; el widget lo ignora.`, 'unknown-field', 'warning');
      continue;
    }
    const { kind, enum: allowed, min, nullable } = typeof field === 'string' ? { kind: field } as Exclude<FieldSpec, string> : field;
    const value = obj[key];
    if (value === undefined || (value === null && nullable)) continue;

    const bad = (expected: string) =>
      add(fieldPath, `Debe ser ${expected}.`, 'invalid-type');

    switch (kind) {
      case 'string':
      case 'nonEmptyString':
        if (typeof value !== 'string') bad('un texto');
        else if (kind === 'nonEmptyString' && !value.trim()) add(fieldPath, 'No puede estar vacío.', 'invalid-value');
        else if (allowed && !allowed.includes(value)) {
          add(fieldPath, `Valor no permitido "${value}". Opciones: ${allowed.join(', ')}.`, 'invalid-value');
        }
        break;
      case 'number':
      case 'integer':
        if (typeof value !== 'number' || !isFinite(value) || (kind === 'integer' && !Number.isInteger(value))) {
          bad(kind === 'integer' ? 'un número entero' : 'un número');
        } else if (min !== undefined && value < min) {
          add(fieldPath, `Debe ser como mínimo ${min}.`, 'invalid-value');
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') bad('verdadero o falso');
        break;
      case 'object':
        if (!isObject(value)) bad('un objeto');
        break;
      case 'array':
        if (!Array.isArray(value)) bad('un arreglo');
        break;
    }
  }
}
