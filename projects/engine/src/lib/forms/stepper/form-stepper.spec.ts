import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FormFieldMapping } from '../../models/form-field-mapping.model';
import { FormStepper, StepChange } from './form-stepper';
import { FormStepperService } from './form-stepper.service';

describe('FormStepper', () => {
  let container: HTMLElement;
  let form: FormGroup;
  let changes: Array<Omit<StepChange, 'formId'>>;
  let stepper: FormStepper;

  const MAPPINGS: FormFieldMapping[] = [
    { controlName: 'nombre', domSelector: '#nombre' },
    { controlName: 'email', domSelector: '#email' },
    { controlName: 'plan', domSelector: '#plan' },
    { controlName: 'acepta', domSelector: '#acepta' },
  ];

  const HTML = `
    <form data-dynamic-stepper>
      <ol data-dynamic-stepper-nav></ol>
      <div id="paso1" data-dynamic-step="datos" data-step-title="Tus datos">
        <input id="nombre"><input id="email">
      </div>
      <div id="paso2" data-dynamic-step="plan" data-step-title="Plan"><input id="plan"></div>
      <div id="paso3" data-dynamic-step="fin" data-step-title="Confirmar"><input id="acepta" type="checkbox"></div>
      <button id="prev" type="button" data-show-on-step="not-first">Atrás</button>
      <button id="next" type="button" data-show-on-step="not-last">Siguiente</button>
      <button id="send" type="submit" data-show-on-step="last">Enviar</button>
    </form>`;

  function build(html = HTML, mappings = MAPPINGS): FormStepper | null {
    container.innerHTML = html;
    changes = [];
    return TestBed.inject(FormStepperService).create({
      root: container.querySelector('[data-dynamic-stepper]') as HTMLElement,
      container,
      form,
      mappings,
      onChange: (change) => changes.push(change),
    });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    container = document.createElement('div');
    document.body.appendChild(container);
    form = new FormGroup({
      nombre: new FormControl('', Validators.required),
      email: new FormControl('', [Validators.required, Validators.email]),
      plan: new FormControl('basico'),
      acepta: new FormControl(false, Validators.requiredTrue),
    });
    stepper = build()!;
  });

  afterEach(() => {
    stepper?.destroy();
    container.remove();
  });

  const hidden = (id: string) => (container.querySelector(`#${id}`) as HTMLElement).style.display === 'none';
  const state = (id: string) => container.querySelector(`#${id}`)!.getAttribute('data-step-state');
  const fill = () => {
    form.get('nombre')!.setValue('Ana');
    form.get('email')!.setValue('ana@correo.com');
  };

  describe('descubrimiento', () => {
    it('encuentra los pasos en el orden del HTML, con su id y título', () => {
      expect(stepper.steps.map((s) => [s.id, s.title])).toEqual([
        ['datos', 'Tus datos'],
        ['plan', 'Plan'],
        ['fin', 'Confirmar'],
      ]);
    });

    it('asigna a cada paso los campos que contiene', () => {
      expect(stepper.steps.map((s) => s.controlNames)).toEqual([['nombre', 'email'], ['plan'], ['acepta']]);
    });

    it('sin id ni título usa step-<n> y el propio id como título', () => {
      const s = build('<form data-dynamic-stepper><div data-dynamic-step><input id="nombre"></div></form>')!;

      expect(s.steps[0].id).toBe('step-1');
      expect(s.steps[0].title).toBe('step-1');
    });

    it('un id repetido se hace único', () => {
      const s = build('<form data-dynamic-stepper><div data-dynamic-step="a"></div><div data-dynamic-step="a"></div></form>')!;

      expect(s.steps.map((x) => x.id)).toEqual(['a', 'a-2']);
    });

    it('sin ningún paso no se crea el stepper', () => {
      expect(build('<form data-dynamic-stepper><input id="nombre"></form>')).toBeNull();
    });

    it('un domSelector inválido en un mapping no rompe el descubrimiento', () => {
      expect(() => build(HTML, [...MAPPINGS, { controlName: 'x', domSelector: '###' }])).not.toThrow();
    });
  });

  describe('presentación', () => {
    it('solo el primer paso se ve al empezar, y se informa el estado de cada uno', () => {
      expect(hidden('paso1')).toBeFalse();
      expect(hidden('paso2')).toBeTrue();
      expect(hidden('paso3')).toBeTrue();
      expect([state('paso1'), state('paso2'), state('paso3')]).toEqual(['active', 'pending', 'pending']);
      expect(container.querySelector('#paso2')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('emite el paso inicial', () => {
      expect(changes).toEqual([{ stepId: 'datos', index: 0, total: 3, direction: 'init', completed: [] }]);
    });

    it('los botones se muestran según data-show-on-step', () => {
      const visible = () => ['prev', 'next', 'send'].filter((id) => !hidden(id));

      expect(visible()).toEqual(['next']);
      fill();
      stepper.next();
      expect(visible()).toEqual(['prev', 'next']);
      stepper.next();
      expect(visible()).toEqual(['prev', 'send']);
    });

    it('data-show-on-step acepta ids de paso y varias condiciones', () => {
      const s = build(
        `<form data-dynamic-stepper><div data-dynamic-step="a"></div><div data-dynamic-step="b"></div>
         <button id="x" data-show-on-step="b">x</button><button id="y" data-show-on-step="first, b">y</button></form>`,
      )!;

      expect([hidden('x'), hidden('y')]).toEqual([true, false]);
      s.next();
      expect([hidden('x'), hidden('y')]).toEqual([false, false]);
    });

    it('un display puesto en línea por el autor se restituye al mostrar el paso', () => {
      const s = build(
        `<form data-dynamic-stepper><div id="a" data-dynamic-step="a" style="display:flex"></div>
         <div id="b" data-dynamic-step="b" style="display:grid"></div></form>`,
        [],
      )!;
      expect((container.querySelector('#b') as HTMLElement).style.display).toBe('none');

      s.next();

      expect((container.querySelector('#b') as HTMLElement).style.display).toBe('grid');
      expect((container.querySelector('#a') as HTMLElement).style.display).toBe('none');
    });

    it('dibuja el indicador con número y título, y marca el paso actual con aria-current', () => {
      const items = Array.from(container.querySelectorAll('[data-dynamic-stepper-nav] li'));

      expect(items.map((i) => i.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['1 Tus datos', '2 Plan', '3 Confirmar']);
      expect(items.map((i) => i.getAttribute('data-step-state'))).toEqual(['active', 'pending', 'pending']);
      expect(items[0].getAttribute('aria-current')).toBe('step');
      expect(items[1].hasAttribute('aria-current')).toBeFalse();
    });

    it('un indicador que no es una lista usa <span>', () => {
      build('<form data-dynamic-stepper><div id="nav" data-dynamic-stepper-nav></div><div data-dynamic-step="a"></div></form>');

      expect(container.querySelectorAll('#nav > span[data-step-id]').length).toBe(1);
    });

    it('el título del paso se escribe como texto, no como HTML', () => {
      build('<form data-dynamic-stepper><ol data-dynamic-stepper-nav></ol><div data-dynamic-step="a" data-step-title="<b>x</b>"></div></form>');

      expect(container.querySelector('[data-dynamic-stepper-nav] b')).toBeNull();
    });
  });

  describe('next()', () => {
    it('no avanza si hay un campo inválido: marca los campos como tocados y enfoca el primero inválido', () => {
      const advanced = stepper.next();

      expect(advanced).toBeFalse();
      expect(stepper.index).toBe(0);
      expect(form.get('nombre')!.touched).toBeTrue();
      expect(form.get('email')!.touched).toBeTrue();
      expect(document.activeElement).toBe(container.querySelector('#nombre'));
      expect(changes.length).toBe(1); // solo el init
    });

    it('enfoca el campo inválido aunque el primero sea válido', () => {
      form.get('nombre')!.setValue('Ana');

      stepper.next();

      expect(document.activeElement).toBe(container.querySelector('#email'));
    });

    it('avanza si los campos del paso son válidos y marca el paso como completado', () => {
      fill();

      expect(stepper.next()).toBeTrue();

      expect(stepper.index).toBe(1);
      expect(hidden('paso1')).toBeTrue();
      expect(hidden('paso2')).toBeFalse();
      expect([state('paso1'), state('paso2')]).toEqual(['completed', 'active']);
      expect(changes[changes.length - 1]).toEqual({ stepId: 'plan', index: 1, total: 3, direction: 'next', completed: ['datos'] });
    });

    it('solo valida los campos del paso actual: los de pasos posteriores no bloquean', () => {
      fill(); // 'acepta' (paso 3) sigue inválido

      expect(stepper.next()).toBeTrue();
      expect(form.get('acepta')!.touched).toBeFalse(); // y no se les muestran errores antes de tiempo
    });

    it('en el último paso no avanza', () => {
      fill();
      stepper.next();
      stepper.next();

      expect(stepper.isLast()).toBeTrue();
      expect(stepper.next()).toBeFalse();
    });

    it('un campo pendiente (una subida o un validador asíncrono) bloquea el paso', () => {
      fill();
      form.get('email')!.markAsPending();

      expect(stepper.next()).toBeFalse();
    });

    it('los campos deshabilitados (p. ej. ocultos por showIf) no cuentan', () => {
      form.get('nombre')!.disable();
      form.get('email')!.disable();

      expect(stepper.next()).toBeTrue();
    });

    it('un paso sin campos avanza siempre', () => {
      const s = build('<form data-dynamic-stepper><div data-dynamic-step="a"></div><div data-dynamic-step="b"></div></form>', [])!;

      expect(s.next()).toBeTrue();
    });
  });

  describe('previous() y goTo()', () => {
    beforeEach(() => {
      fill();
      stepper.next();
      stepper.next();
    });

    it('previous() vuelve sin validar', () => {
      form.get('acepta')!.setValue(false);

      expect(stepper.previous()).toBeTrue();
      expect(stepper.index).toBe(1);
      expect(changes[changes.length - 1].direction).toBe('previous');
    });

    it('en el primer paso previous() no hace nada', () => {
      stepper.previous();
      stepper.previous();

      expect(stepper.previous()).toBeFalse();
      expect(stepper.index).toBe(0);
    });

    it('goTo() lleva a un paso ya alcanzado, por id o por posición', () => {
      expect(stepper.goTo('datos')).toBeTrue();
      expect(stepper.index).toBe(0);
      expect(stepper.goTo(2)).toBeTrue(); // ya se había llegado
      expect(stepper.index).toBe(2);
      expect(changes[changes.length - 1].direction).toBe('goto');
    });

    it('goTo() no salta a un paso al que todavía no se llegó', () => {
      const s = build()!;

      expect(s.goTo('fin')).toBeFalse();
      expect(s.index).toBe(0);
    });

    it('goTo() rechaza ids y posiciones que no existen, y el paso actual', () => {
      expect(stepper.goTo('nada')).toBeFalse();
      expect(stepper.goTo(9)).toBeFalse();
      expect(stepper.goTo(-1)).toBeFalse();
      expect(stepper.goTo(stepper.index)).toBeFalse();
    });

    it('al volver, los pasos ya completados siguen marcados como completados', () => {
      stepper.goTo('datos');

      expect([state('paso1'), state('paso2'), state('paso3')]).toEqual(['active', 'completed', 'pending']);
    });

    it('hacer clic en un paso del indicador vuelve a él', () => {
      (container.querySelectorAll('[data-dynamic-stepper-nav] li')[0] as HTMLElement).click();

      expect(stepper.index).toBe(0);
    });

    it('el indicador no permite saltar a un paso al que no se llegó', () => {
      const s = build()!;

      (container.querySelectorAll('[data-dynamic-stepper-nav] li')[2] as HTMLElement).click();

      expect(s.index).toBe(0);
    });
  });

  describe('revealFirstInvalid()', () => {
    it('lleva al primer paso con un campo inválido y muestra sus errores', () => {
      fill();
      stepper.next(); // paso 2
      stepper.next(); // paso 3
      form.get('email')!.setValue(''); // el usuario "rompe" el paso 1 desde otro sitio

      const index = stepper.revealFirstInvalid();

      expect(index).toBe(0);
      expect(stepper.index).toBe(0);
      expect(form.get('email')!.touched).toBeTrue();
      expect(document.activeElement).toBe(container.querySelector('#email'));
    });

    it('si hay errores en pasos que aún no se alcanzaron, también lleva allí', () => {
      fill();

      expect(stepper.revealFirstInvalid()).toBe(2); // 'acepta' es obligatorio y está en el paso 3
      expect(stepper.index).toBe(2);
    });

    it('devuelve -1 y no se mueve si todo es válido', () => {
      fill();
      form.get('acepta')!.setValue(true);

      expect(stepper.revealFirstInvalid()).toBe(-1);
      expect(stepper.index).toBe(0);
    });
  });

  it('un formulario de un solo paso funciona: es el primero y el último', () => {
    const s = build('<form data-dynamic-stepper><div data-dynamic-step="solo"><input id="nombre"></div></form>', MAPPINGS)!;

    expect([s.isFirst(), s.isLast()]).toEqual([true, true]);
    expect(s.next()).toBeFalse();
    expect(s.previous()).toBeFalse();
  });

  it('destroy() deja de reaccionar a los clics del indicador', () => {
    fill();
    stepper.next();
    stepper.destroy();

    (container.querySelectorAll('[data-dynamic-stepper-nav] li')[0] as HTMLElement).click();

    expect(stepper.index).toBe(1);
  });
});
