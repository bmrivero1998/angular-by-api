import { formatSchemaIssue, SchemaIssue, validateSchema } from './validate-schema';

import archivos from '../../../../../examples/schemas/archivos.json';
import autocompletado from '../../../../../examples/schemas/autocompletado.json';
import formularioBasico from '../../../../../examples/schemas/formulario-basico.json';
import formularioCompleto from '../../../../../examples/schemas/formulario-completo.json';
import landing from '../../../../../examples/schemas/landing.json';
import pasos from '../../../../../examples/schemas/pasos.json';
import tailwind from '../../../../../examples/schemas/tailwind.json';
import secciones from '../../../../../examples/schemas/secciones.json';

/** Una sección mínima válida; cada test la modifica. */
function section(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id_DocumentHTMLCSS: 's1',
    renderType: 'static',
    htmlComponent: '<form><input id="a"><input id="b"><div data-error-for="a"></div><button id="go">Ok</button></form>',
    formId: 'f1',
    ...extra,
  };
}

const mapping = (extra: Record<string, unknown> = {}) => ({ controlName: 'a', domSelector: '#a', ...extra });
const pathsOf = (issues: SchemaIssue[]) => issues.map((i) => i.path);
const errorsOf = (issues: SchemaIssue[]) => issues.filter((i) => i.severity === 'error');

describe('validateSchema', () => {
  describe('ejemplos oficiales (examples/schemas)', () => {
    // Si agregas un archivo a examples/schemas, agrégalo también aquí.
    const examples: Record<string, unknown> = {
      'archivos.json': archivos,
      'autocompletado.json': autocompletado,
      'formulario-basico.json': formularioBasico,
      'formulario-completo.json': formularioCompleto,
      'landing.json': landing,
      'pasos.json': pasos,
      'tailwind.json': tailwind,
      'secciones.json': secciones,
    };

    Object.entries(examples).forEach(([name, json]) => {
      it(`${name} valida sin problemas`, () => {
        const issues = validateSchema(json);
        expect(issues.map(formatSchemaIssue)).toEqual([]);
      });
    });
  });

  it('una sección mínima es válida', () => {
    expect(validateSchema([section()])).toEqual([]);
    expect(validateSchema([])).toEqual([]);
  });

  it('rechaza lo que no es un arreglo', () => {
    const issues = validateSchema({ a: 1 });
    expect(issues.length).toBe(1);
    expect(issues[0].code).toBe('not-array');
    expect(issues[0].path).toBe('');
    expect(validateSchema(null)[0].code).toBe('not-array');
  });

  it('rechaza secciones que no son objetos', () => {
    const issues = validateSchema([section(), 'hola', null]);
    expect(pathsOf(issues)).toEqual(['[1]', '[2]']);
    expect(issues[0].code).toBe('not-object');
  });

  it('exige id_DocumentHTMLCSS, renderType y htmlComponent', () => {
    const issues = validateSchema([{}]);
    expect(pathsOf(issues).sort()).toEqual(['[0].htmlComponent', '[0].id_DocumentHTMLCSS', '[0].renderType']);
    expect(issues.every((i) => i.code === 'missing-field')).toBeTrue();
  });

  it('renderType solo admite static o dynamic', () => {
    const issues = validateSchema([section({ renderType: 'otro' })]);
    expect(pathsOf(issues)).toEqual(['[0].renderType']);
    expect(issues[0].message).toContain('static, dynamic');
  });

  it('avisa de tipos incorrectos', () => {
    const issues = validateSchema([section({ cssComponent: 5, formMappings: {}, formInitialData: [] })]);
    expect(pathsOf(issues).sort()).toEqual(['[0].cssComponent', '[0].formInitialData', '[0].formMappings']);
    expect(issues.every((i) => i.code === 'invalid-type')).toBeTrue();
  });

  it('avisa (sin error) de campos desconocidos', () => {
    const issues = validateSchema([section({ formMapings: [] })]);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].code).toBe('unknown-field');
    expect(issues[0].path).toBe('[0].formMapings');
  });

  describe('ids duplicados', () => {
    it('señala la segunda sección con el mismo id', () => {
      const issues = validateSchema([section(), section({ id_DocumentHTMLCSS: 's2' }), section()]);
      expect(issues.length).toBe(1);
      expect(issues[0].code).toBe('duplicate-id');
      expect(issues[0].path).toBe('[2].id_DocumentHTMLCSS');
      expect(issues[0].message).toContain('[0]');
    });
  });

  describe('formMappings', () => {
    it('exige controlName y domSelector', () => {
      const issues = validateSchema([section({ formMappings: [{}] })]);
      expect(pathsOf(issues).sort()).toEqual(['[0].formMappings[0].controlName', '[0].formMappings[0].domSelector']);
    });

    it('detecta un domSelector que no encuentra elemento', () => {
      const issues = validateSchema([section({ formMappings: [mapping({ domSelector: '#no-existe' })] })]);
      expect(issues.length).toBe(1);
      expect(issues[0].code).toBe('selector-not-found');
      expect(issues[0].severity).toBe('error');
      expect(issues[0].path).toBe('[0].formMappings[0].domSelector');
    });

    it('busca el selector solo en el HTML de su propia sección', () => {
      const other = section({ id_DocumentHTMLCSS: 's2', htmlComponent: '<input id="solo-en-s2">', formId: 'f2' });
      const issues = validateSchema([
        section({ formMappings: [mapping({ domSelector: '#solo-en-s2' })] }),
        other,
      ]);
      expect(issues.map((i) => i.code)).toEqual(['selector-not-found']);
    });

    it('detecta un selector CSS inválido', () => {
      const issues = validateSchema([section({ formMappings: [mapping({ domSelector: '[[' })] })]);
      expect(issues[0].code).toBe('selector-invalid');
    });

    it('detecta un errorDisplaySelector inexistente', () => {
      const issues = validateSchema([
        section({ formMappings: [mapping({ errorDisplaySelector: "[data-error-for='zzz']" })] }),
      ]);
      expect(issues.length).toBe(1);
      expect(issues[0].path).toBe('[0].formMappings[0].errorDisplaySelector');
      expect(issues[0].code).toBe('selector-not-found');
    });

    it('acepta errorDisplaySelector null o existente', () => {
      expect(validateSchema([section({ formMappings: [mapping({ errorDisplaySelector: null })] })])).toEqual([]);
      expect(
        validateSchema([section({ formMappings: [mapping({ errorDisplaySelector: "[data-error-for='a']" })] })]),
      ).toEqual([]);
    });

    it('detecta controlName repetido en el mismo formulario', () => {
      const issues = validateSchema([
        section({ formMappings: [mapping(), mapping({ domSelector: '#b' })] }),
      ]);
      expect(issues.map((i) => i.code)).toEqual(['duplicate-control']);
      expect(issues[0].path).toBe('[0].formMappings[1].controlName');
    });

    it('avisa de selectores de configs que no existen (aviso)', () => {
      const issues = validateSchema([
        section({ formMappings: [mapping({ fileUploadConfig: { progressSelector: '#nada' } })] }),
      ]);
      expect(issues.length).toBe(1);
      expect(issues[0].path).toBe('[0].formMappings[0].fileUploadConfig.progressSelector');
      expect(issues[0].severity).toBe('warning');
    });

    it('valida los valores de las configs', () => {
      const issues = validateSchema([
        section({
          formMappings: [
            mapping({
              fileUploadConfig: { method: 'PATCH', maxSize: 'grande', maxCount: 1.5 },
              asyncValidator: { endpoint: '/x', method: 'GET' },
              autoCompleteConfig: {},
            }),
          ],
        }),
      ]);
      const paths = pathsOf(issues);
      expect(paths).toContain('[0].formMappings[0].fileUploadConfig.method');
      expect(paths).toContain('[0].formMappings[0].fileUploadConfig.maxSize');
      expect(paths).toContain('[0].formMappings[0].fileUploadConfig.maxCount');
      expect(paths).toContain('[0].formMappings[0].asyncValidator.errorKey');
      expect(paths).toContain('[0].formMappings[0].asyncValidator.message');
      expect(paths).toContain('[0].formMappings[0].autoCompleteConfig');
    });
  });

  describe('validatorConfig', () => {
    const withValidators = (validatorConfig: unknown[], extraMappings: unknown[] = []) =>
      validateSchema([section({ formMappings: [mapping({ validatorConfig }), ...extraMappings] })]);

    it('acepta todos los tipos, sin distinguir mayúsculas', () => {
      const issues = withValidators(
        [
          { type: 'required', message: 'm' },
          { type: 'REQUIRED', message: 'm' },
          { type: 'requiredTrue', message: 'm' },
          { type: 'email', message: 'm' },
          { type: 'minLength', value: 2, message: 'm' },
          { type: 'minlength', value: 2, message: 'm' },
          { type: 'maxLength', value: 9, message: 'm' },
          { type: 'pattern', value: '^[a-z]+$', message: 'm' },
          { type: 'min', value: 0, message: 'm' },
          { type: 'max', value: 9, message: 'm' },
          { type: 'matchValue', value: 'x', message: 'm' },
          { type: 'matchControl', value: 'b', message: 'm' },
        ],
        [mapping({ controlName: 'b', domSelector: '#b' })],
      );
      expect(issues.map(formatSchemaIssue)).toEqual([]);
    });

    it('detecta un tipo desconocido con su ruta exacta', () => {
      const issues = validateSchema([
        section(),
        section({ id_DocumentHTMLCSS: 's2' }),
        section({
          id_DocumentHTMLCSS: 's3',
          formMappings: [
            mapping({
              validatorConfig: [
                { type: 'required', message: 'm' },
                { type: 'telefono', message: 'm' },
              ],
            }),
          ],
        }),
      ]);
      expect(pathsOf(issues)).toEqual(['[2].formMappings[0].validatorConfig[1].type']);
      expect(issues[0].message).toContain('telefono');
    });

    it('exige message y value cuando corresponde', () => {
      const issues = withValidators([{ type: 'minLength' }]);
      expect(pathsOf(issues).sort()).toEqual([
        '[0].formMappings[0].validatorConfig[0].message',
        '[0].formMappings[0].validatorConfig[0].value',
      ]);
    });

    it('valida el tipo del value', () => {
      const issues = withValidators([
        { type: 'min', value: '3', message: 'm' },
        { type: 'pattern', value: 5, message: 'm' },
        { type: 'pattern', value: '(', message: 'm' },
      ]);
      expect(pathsOf(issues)).toEqual([
        '[0].formMappings[0].validatorConfig[0].value',
        '[0].formMappings[0].validatorConfig[1].value',
        '[0].formMappings[0].validatorConfig[2].value',
      ]);
    });

    it('detecta un matchControl hacia un control inexistente', () => {
      const issues = withValidators([{ type: 'matchControl', value: 'fantasma', message: 'm' }]);
      expect(issues.length).toBe(1);
      expect(issues[0].code).toBe('control-not-found');
      expect(issues[0].path).toBe('[0].formMappings[0].validatorConfig[0].value');
    });

    it('resuelve matchControl entre secciones con el mismo formId', () => {
      const issues = validateSchema([
        section({ formMappings: [mapping({ validatorConfig: [{ type: 'matchControl', value: 'z', message: 'm' }] })] }),
        section({
          id_DocumentHTMLCSS: 's2',
          htmlComponent: '<input id="z">',
          formMappings: [{ controlName: 'z', domSelector: '#z' }],
        }),
      ]);
      expect(issues).toEqual([]);
    });
  });

  describe('buttonConfigs', () => {
    it('acepta condiciones planas y por control', () => {
      const issues = validateSchema([
        section({
          formMappings: [mapping(), mapping({ controlName: 'b', domSelector: '#b' })],
          buttonConfigs: [
            { selector: '#go', disableWhen: 'formIsInvalid' },
            { selector: '#go', disableWhen: 'controlsDoNotMatch:a,b' },
            { selector: '#go' },
          ],
        }),
      ]);
      expect(issues).toEqual([]);
    });

    it('detecta condiciones desconocidas y controles inexistentes', () => {
      const issues = validateSchema([
        section({
          formMappings: [mapping()],
          buttonConfigs: [
            { selector: '#go', disableWhen: 'formIsRaro' },
            { selector: '#go', disableWhen: 'controlIsInvalid:nada' },
            { selector: '#go', disableWhen: 'controlsDoNotMatch:a' },
          ],
        }),
      ]);
      expect(issues.map((i) => i.path)).toEqual([
        '[0].buttonConfigs[0].disableWhen',
        '[0].buttonConfigs[1].disableWhen',
        '[0].buttonConfigs[2].disableWhen',
      ]);
      expect(issues[1].code).toBe('control-not-found');
    });

    it('avisa de un botón que no está en el HTML', () => {
      const issues = validateSchema([section({ buttonConfigs: [{ selector: '#fantasma' }] })]);
      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('warning');
      expect(errorsOf(issues)).toEqual([]);
    });
  });

  describe('dataBindings y tableBindings', () => {
    it('valida selector y valor', () => {
      const issues = validateSchema([
        section({ dataBindings: [{ selector: '#a', value: 'x' }, { selector: '#nada', value: {} }] }),
      ]);
      expect(pathsOf(issues).sort()).toEqual(['[0].dataBindings[1].selector', '[0].dataBindings[1].value']);
    });

    it('valida columnas y acciones de una tabla', () => {
      const issues = validateSchema([
        section({
          htmlComponent: '<table id="t"></table>',
          tableBindings: [
            { tableSelector: '#t', columns: [{ key: 'a' }], data: [], actions: [{ label: 'x' }] },
          ],
        }),
      ]);
      expect(pathsOf(issues).sort()).toEqual([
        '[0].tableBindings[0].actions[0].action',
        '[0].tableBindings[0].columns[0].header',
      ]);
    });
  });

  it('formatSchemaIssue une ruta y mensaje', () => {
    expect(formatSchemaIssue({ path: '[0].x', message: 'mal', code: 'invalid-type', severity: 'error' })).toBe(
      '[0].x: mal',
    );
    expect(formatSchemaIssue({ path: '', message: 'mal', code: 'not-array', severity: 'error' })).toBe('mal');
  });
});
