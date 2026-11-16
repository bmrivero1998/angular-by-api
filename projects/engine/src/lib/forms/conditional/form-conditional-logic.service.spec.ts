import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FormConditionalLogicService } from './form-conditional-logic.service';
import { DYNAMIC_CONFIG } from '../../config/dynamic-config.token';
import { FormFieldMapping } from '../../models/form-field-mapping.model';

describe('FormConditionalLogicService', () => {
  let service: FormConditionalLogicService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FormConditionalLogicService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('findVisibilityTarget', () => {
    it('prioriza el visibilityGroup si está configurado', () => {
      const group = document.createElement('div');
      group.setAttribute('data-visibility-group', 'g1');
      const input = document.createElement('input');
      group.appendChild(input);
      document.body.appendChild(group);

      const target = service.findVisibilityTarget(input, {
        controlName: 'x',
        domSelector: '#x',
        visibilityGroup: 'g1',
      });

      expect(target).toBe(group);
      document.body.removeChild(group);
    });

    it('usa el contenedor común más cercano (.form-group) si no hay visibilityGroup', () => {
      const container = document.createElement('div');
      container.className = 'form-group';
      const input = document.createElement('input');
      container.appendChild(input);

      const target = service.findVisibilityTarget(input, { controlName: 'x', domSelector: '#x' });

      expect(target).toBe(container);
    });

    it('usa el elemento mismo si no hay ningún contenedor reconocido', () => {
      const input = document.createElement('input');

      const target = service.findVisibilityTarget(input, { controlName: 'x', domSelector: '#x' });

      expect(target).toBe(input);
    });
  });

  describe('setupConditionalLogic', () => {
    let formGroup: FormGroup;
    let container: HTMLElement;
    let inputEl: HTMLInputElement;

    beforeEach(() => {
      formGroup = new FormGroup({ status: new FormControl('inactive'), extra: new FormControl('') });
      container = document.createElement('div');
      inputEl = document.createElement('input');
      inputEl.id = 'extra';
      container.appendChild(inputEl);
    });

    it('oculta y deshabilita el control cuando showIf es falso desde el estado inicial', fakeAsync(() => {
      const mappings: FormFieldMapping[] = [{ controlName: 'extra', domSelector: '#extra', showIf: "status === 'active'" }];

      service.setupConditionalLogic(formGroup, container, mappings);

      // La evaluación inicial es síncrona: no hay un instante con el campo visible.
      expect(inputEl.style.display).toBe('none');
      expect(formGroup.get('extra')?.disabled).toBeTrue();
    }));

    it('muestra y rehabilita el control cuando la condición pasa a ser verdadera', fakeAsync(() => {
      const mappings: FormFieldMapping[] = [{ controlName: 'extra', domSelector: '#extra', showIf: "status === 'active'" }];
      service.setupConditionalLogic(formGroup, container, mappings);
      tick();

      formGroup.get('status')?.setValue('active');
      tick(50); // debounce por defecto

      expect(inputEl.style.display).not.toBe('none');
      expect(formGroup.get('extra')?.disabled).toBeFalse();
    }));

    it('hideIf invierte la condición respecto a showIf', fakeAsync(() => {
      const mappings: FormFieldMapping[] = [{ controlName: 'extra', domSelector: '#extra', hideIf: "status === 'active'" }];
      service.setupConditionalLogic(formGroup, container, mappings);
      tick();
      expect(inputEl.style.display).not.toBe('none'); // inactive -> hideIf false -> visible

      formGroup.get('status')?.setValue('active');
      tick(50);
      expect(inputEl.style.display).toBe('none');
    }));

    it('limpia el valor del control oculto cuando clearHiddenFields está activo', fakeAsync(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: DYNAMIC_CONFIG, useValue: { clearHiddenFields: true } }],
      });
      service = TestBed.inject(FormConditionalLogicService);

      formGroup = new FormGroup({ status: new FormControl('inactive'), extra: new FormControl('valor') });
      const mappings: FormFieldMapping[] = [{ controlName: 'extra', domSelector: '#extra', showIf: "status === 'active'" }];

      service.setupConditionalLogic(formGroup, container, mappings);
      tick();

      expect(formGroup.get('extra')?.value).toBeNull();
    }));

    it('respeta conditionalDebounceTime configurado', fakeAsync(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: DYNAMIC_CONFIG, useValue: { conditionalDebounceTime: 200 } }],
      });
      service = TestBed.inject(FormConditionalLogicService);

      const mappings: FormFieldMapping[] = [{ controlName: 'extra', domSelector: '#extra', showIf: "status === 'active'" }];
      service.setupConditionalLogic(formGroup, container, mappings);
      tick();

      formGroup.get('status')?.setValue('active');
      tick(50); // todavía no debería haberse re-evaluado
      expect(inputEl.style.display).toBe('none');

      tick(150); // se completan los 200ms del debounce configurado
      expect(inputEl.style.display).not.toBe('none');
    }));

    it('evalúa expresiones usando los helpers disponibles (gt)', fakeAsync(() => {
      formGroup = new FormGroup({ age: new FormControl(20), extra: new FormControl('') });
      const mappings: FormFieldMapping[] = [{ controlName: 'extra', domSelector: '#extra', showIf: 'gt(age, 18)' }];

      service.setupConditionalLogic(formGroup, container, mappings);
      tick();

      expect(inputEl.style.display).not.toBe('none');
    }));

    it('deja visible el campo si la expresión es inválida y lo informa UNA sola vez', fakeAsync(() => {
      spyOn(console, 'error');
      const mappings: FormFieldMapping[] = [{ controlName: 'extra', domSelector: '#extra', showIf: 'status ===' }];

      service.setupConditionalLogic(formGroup, container, mappings);
      formGroup.get('status')?.setValue('a');
      tick(50);
      formGroup.get('status')?.setValue('b');
      tick(50);

      // Ocultarlo en silencio lo sacaría de la validación y del envío.
      expect(inputEl.style.display).not.toBe('none');
      expect(formGroup.get('extra')?.enabled).toBeTrue();
      expect(console.error).toHaveBeenCalledTimes(1);
      expect((console.error as jasmine.Spy).calls.mostRecent().args[0]).toContain('"extra"');
    }));

    it('también informa una función desconocida', fakeAsync(() => {
      spyOn(console, 'error');
      const mappings: FormFieldMapping[] = [{ controlName: 'extra', domSelector: '#extra', showIf: 'alert(1)' }];

      service.setupConditionalLogic(formGroup, container, mappings);

      expect(inputEl.style.display).not.toBe('none');
      expect((console.error as jasmine.Spy).calls.mostRecent().args[0]).toContain('"alert" no existe');
    }));

    it('no hace nada si ningún mapping tiene showIf/hideIf', () => {
      const sub = service.setupConditionalLogic(formGroup, container, [{ controlName: 'extra', domSelector: '#extra' }]);
      expect(sub.closed).toBeFalse();
      sub.unsubscribe();
    });
  });

  describe('expresiones', () => {
    function setup(controls: Record<string, FormControl>, mapping: Partial<FormFieldMapping>) {
      const formGroup = new FormGroup<Record<string, FormControl>>({ ...controls, extra: new FormControl('') });
      const container = document.createElement('div');
      const input = document.createElement('input');
      input.id = 'extra';
      container.appendChild(input);
      service.setupConditionalLogic(formGroup, container, [
        { controlName: 'extra', domSelector: '#extra', ...mapping },
      ]);
      return { formGroup, input };
    }

    it('compara con el literal true (checkbox), que antes lanzaba SyntaxError', fakeAsync(() => {
      const { formGroup, input } = setup({ vip: new FormControl(false) }, { showIf: 'vip === true' });
      expect(input.style.display).toBe('none');

      formGroup.get('vip')?.setValue(true);
      tick(50);

      expect(input.style.display).not.toBe('none');
    }));

    it('acepta el prefijo form. como alias de los campos', fakeAsync(() => {
      const { formGroup, input } = setup(
        { tipo: new FormControl('estandar') },
        { showIf: "form.tipo === 'premium'" },
      );
      expect(input.style.display).toBe('none');

      formGroup.get('tipo')?.setValue('premium');
      tick(50);

      expect(input.style.display).not.toBe('none');
    }));

    it('un campo llamado "form" tiene prioridad sobre el alias', fakeAsync(() => {
      const { input } = setup({ form: new FormControl('x') }, { showIf: "form === 'x'" });

      expect(input.style.display).not.toBe('none');
    }));

    it('combina condiciones con && y ||', fakeAsync(() => {
      const { formGroup, input } = setup(
        { edad: new FormControl(20), pais: new FormControl('AR') },
        { showIf: "edad >= 18 && (pais === 'MX' || pais === 'AR')" },
      );
      expect(input.style.display).not.toBe('none');

      formGroup.get('pais')?.setValue('CL');
      tick(50);

      expect(input.style.display).toBe('none');
    }));

    it('una condición puede depender de un campo que está oculto', fakeAsync(() => {
      const formGroup = new FormGroup({
        a: new FormControl(true),
        b: new FormControl('valor'),
        c: new FormControl(''),
      });
      const container = document.createElement('div');
      container.innerHTML = '<input id="b"><input id="c">';
      service.setupConditionalLogic(formGroup, container, [
        { controlName: 'b', domSelector: '#b', showIf: 'a === true' },
        { controlName: 'c', domSelector: '#c', showIf: "b === 'valor'" },
      ]);
      formGroup.get('a')?.setValue(false);
      tick(50); // b se oculta (y queda deshabilitado)
      tick(50); // segunda pasada provocada por esa deshabilitación

      // getRawValue sigue viendo el valor de b aunque esté deshabilitado.
      expect((container.querySelector('#c') as HTMLElement).style.display).not.toBe('none');
    }));

    it('usa los helpers por nombre de control (isValue, getControl)', fakeAsync(() => {
      const { input } = setup(
        { plan: new FormControl('pro') },
        { showIf: "isValue('plan', 'pro') && getControl('plan') === 'pro'" },
      );

      expect(input.style.display).not.toBe('none');
    }));
  });

  describe('efecto sobre el formulario', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      container.innerHTML = '<input id="vip">';
    });

    it('un campo obligatorio oculto deja de bloquear al formulario y vuelve a bloquearlo al mostrarse', fakeAsync(() => {
      const formGroup = new FormGroup({
        tieneVip: new FormControl(false),
        vip: new FormControl('', Validators.required),
      });
      service.setupConditionalLogic(formGroup, container, [
        { controlName: 'vip', domSelector: '#vip', showIf: 'tieneVip === true' },
      ]);

      expect(formGroup.valid).toBeTrue();

      formGroup.get('tieneVip')?.setValue(true);
      tick(50);
      expect(formGroup.get('vip')?.enabled).toBeTrue();
      expect(formGroup.valid).toBeFalse();

      formGroup.get('tieneVip')?.setValue(false);
      tick(50);
      expect(formGroup.valid).toBeTrue();
    }));

    it('propaga el cambio de validez al formulario padre', fakeAsync(() => {
      const section = new FormGroup({
        tieneVip: new FormControl(false),
        vip: new FormControl('', Validators.required),
      });
      const root = new FormGroup({ seccion: section });
      service.setupConditionalLogic(section, container, [
        { controlName: 'vip', domSelector: '#vip', showIf: 'tieneVip === true' },
      ]);

      expect(root.valid).toBeTrue();
    }));

    it('emite eventos de estado al ocultar, para que botones y DOM se refresquen', fakeAsync(() => {
      const formGroup = new FormGroup({ tieneVip: new FormControl(false), vip: new FormControl('') });
      const statuses: string[] = [];
      formGroup.statusChanges.subscribe((status) => statuses.push(status));

      service.setupConditionalLogic(formGroup, container, [
        { controlName: 'vip', domSelector: '#vip', showIf: 'tieneVip === true' },
      ]);

      expect(statuses.length).toBeGreaterThan(0);
    }));

    it('no rehabilita un control que el host deshabilitó por su cuenta', fakeAsync(() => {
      const vip = new FormControl('');
      const formGroup = new FormGroup({ tieneVip: new FormControl(true), vip });
      service.setupConditionalLogic(formGroup, container, [
        { controlName: 'vip', domSelector: '#vip', showIf: 'tieneVip === true' },
      ]);
      vip.disable(); // el host lo deshabilita estando visible

      formGroup.get('tieneVip')?.setValue(false);
      tick(50);
      formGroup.get('tieneVip')?.setValue(true);
      tick(50);

      expect(vip.disabled).toBeTrue();
    }));

    it('no rehabilita un control con alwaysDisabled al mostrarse', fakeAsync(() => {
      const formGroup = new FormGroup({ tieneVip: new FormControl(false), vip: new FormControl('') });
      service.setupConditionalLogic(formGroup, container, [
        { controlName: 'vip', domSelector: '#vip', showIf: 'tieneVip === true', alwaysDisabled: true },
      ]);

      formGroup.get('tieneVip')?.setValue(true);
      tick(50);

      expect((container.querySelector('#vip') as HTMLElement).style.display).not.toBe('none');
      expect(formGroup.get('vip')?.disabled).toBeTrue();
    }));

    it('emite field-visibility-change si emitVisibilityEvents está activo', fakeAsync(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: DYNAMIC_CONFIG, useValue: { emitVisibilityEvents: true } }],
      });
      service = TestBed.inject(FormConditionalLogicService);
      const formGroup = new FormGroup({ tieneVip: new FormControl(true), vip: new FormControl('') });
      const details: any[] = [];
      container.addEventListener('field-visibility-change', (e) => details.push((e as CustomEvent).detail));
      service.setupConditionalLogic(formGroup, container, [
        { controlName: 'vip', domSelector: '#vip', showIf: 'tieneVip === true' },
      ]);

      formGroup.get('tieneVip')?.setValue(false);
      tick(50);

      expect(details.length).toBe(1);
      expect(details[0].controlName).toBe('vip');
      expect(details[0].visible).toBeFalse();
    }));

    it('deja de evaluar al cancelar la suscripción', fakeAsync(() => {
      const formGroup = new FormGroup({ tieneVip: new FormControl(true), vip: new FormControl('') });
      const sub = service.setupConditionalLogic(formGroup, container, [
        { controlName: 'vip', domSelector: '#vip', showIf: 'tieneVip === true' },
      ]);
      sub.unsubscribe();

      formGroup.get('tieneVip')?.setValue(false);
      tick(50);

      expect((container.querySelector('#vip') as HTMLElement).style.display).not.toBe('none');
    }));
  });

  describe('findVisibilityTarget (qué se oculta)', () => {
    function build(html: string): HTMLElement {
      const root = document.createElement('div');
      root.innerHTML = html;
      return root;
    }
    const mappings: FormFieldMapping[] = [
      { controlName: 'a', domSelector: '#a', showIf: 'x' },
      { controlName: 'b', domSelector: '#b' },
    ];

    it('elige el contenedor MÁS CERCANO, no el primero de una lista fija', () => {
      const root = build('<div class="col-md-6"><div class="mb-3" id="wrap"><input id="a"></div><p>otro</p></div>');
      const input = root.querySelector('#a') as HTMLElement;

      const target = service.findVisibilityTarget(input, mappings[0], { container: root, mappings });

      expect(target).toBe(root.querySelector('#wrap') as HTMLElement);
    });

    it('no oculta un contenedor que incluya a otros campos del formulario', () => {
      const root = build('<div class="mb-3" id="grupo"><input id="a"><input id="b"></div>');
      const input = root.querySelector('#a') as HTMLElement;

      const target = service.findVisibilityTarget(input, mappings[0], { container: root, mappings });

      expect(target).toBe(input);
    });

    it('amplía a la columna cuando solo contiene este campo, para no dejar un hueco', () => {
      const root = build('<div class="row"><div class="col-md-6" id="col"><div class="mb-3"><input id="a"></div></div></div>');
      const input = root.querySelector('#a') as HTMLElement;

      const target = service.findVisibilityTarget(input, mappings[0], { container: root, mappings });

      expect(target).toBe(root.querySelector('#col') as HTMLElement);
    });

    it('no amplía a una columna que tiene más contenido', () => {
      const root = build('<div class="col-md-6"><div class="mb-3" id="wrap"><input id="a"></div><h3>Título</h3></div>');
      const input = root.querySelector('#a') as HTMLElement;

      const target = service.findVisibilityTarget(input, mappings[0], { container: root, mappings });

      expect(target).toBe(root.querySelector('#wrap') as HTMLElement);
    });

    it('no confunde col-form-label con una columna', () => {
      const root = build('<div class="col-form-label"><input id="a"></div>');
      const input = root.querySelector('#a') as HTMLElement;

      expect(service.findVisibilityTarget(input, mappings[0], { container: root, mappings })).toBe(input);
    });

    it('nunca sube más allá del contenedor raíz ni lo oculta', () => {
      const root = build('<input id="a">');
      root.classList.add('mb-3');
      const input = root.querySelector('#a') as HTMLElement;

      expect(service.findVisibilityTarget(input, mappings[0], { container: root, mappings })).toBe(input);
    });

    it('respeta como contenedor al propio elemento mapeado si es un wrapper', () => {
      const root = build('<div id="a" class="mb-3"><input id="inner"></div>');
      const wrapper = root.querySelector('#a') as HTMLElement;

      expect(service.findVisibilityTarget(wrapper, mappings[0], { container: root, mappings })).toBe(wrapper);
    });

    it('ya no considera contenedores por coincidencia de id ni .card-body', () => {
      const root = build('<div id="seccion-datos" class="card-body"><input id="a"><input id="b"></div>');
      const input = root.querySelector('#a') as HTMLElement;

      expect(service.findVisibilityTarget(input, mappings[0], { container: root, mappings })).toBe(input);
    });

    it('tolera un domSelector inválido en otro mapping', () => {
      const root = build('<div class="mb-3"><input id="a"></div>');
      const input = root.querySelector('#a') as HTMLElement;
      const withBad = [...mappings, { controlName: 'c', domSelector: '###' }];

      expect(() => service.findVisibilityTarget(input, mappings[0], { container: root, mappings: withBad })).not.toThrow();
    });
  });
});
