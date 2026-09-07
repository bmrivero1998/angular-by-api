import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { FormConditionalLogicService } from './form-conditional-logic.service';
import { DYNAMIC_CONFIG } from '../dynamic-config.token';
import { FormFieldMapping } from '../models/form-field-mapping.model';

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
      tick(); // evaluación inicial vía setTimeout(0)

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

    it('trata una expresión mal formada como falsa y lo reporta por consola', fakeAsync(() => {
      spyOn(console, 'error');
      const mappings: FormFieldMapping[] = [{ controlName: 'extra', domSelector: '#extra', showIf: 'eval(esto no es valido' }];

      service.setupConditionalLogic(formGroup, container, mappings);
      tick();

      expect(inputEl.style.display).toBe('none');
      expect(console.error).toHaveBeenCalled();
    }));

    it('no hace nada si ningún mapping tiene showIf/hideIf', () => {
      const sub = service.setupConditionalLogic(formGroup, container, [{ controlName: 'extra', domSelector: '#extra' }]);
      expect(sub.closed).toBeFalse();
      sub.unsubscribe();
    });
  });
});
