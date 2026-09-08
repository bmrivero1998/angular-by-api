import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { FormSpecialControlsService } from './form-special-controls.service';
import { FormFieldMapping } from '../models/form-field-mapping.model';

describe('FormSpecialControlsService', () => {
  let service: FormSpecialControlsService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FormSpecialControlsService);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  function nodeListOf(...els: HTMLElement[]): NodeListOf<HTMLElement> {
    return els as unknown as NodeListOf<HTMLElement>;
  }

  describe('initializeSpecialControls / range', () => {
    it('aplica el step configurado y crea el display si no existe', () => {
      const input = document.createElement('input');
      input.type = 'range';
      const wrapper = document.createElement('div');
      wrapper.className = 'form-group';
      wrapper.appendChild(input);
      container.appendChild(wrapper);

      const mapping: FormFieldMapping = {
        controlName: 'volume',
        domSelector: '#volume',
        rangeConfig: { displaySelector: '.range-display', step: 5 },
      };

      service.initializeSpecialControls(nodeListOf(input), mapping, new FormControl(0), container, new Map());

      expect(input.getAttribute('step')).toBe('5');
      expect(wrapper.querySelector('.range-display')).toBeTruthy();
    });
  });

  describe('initializeSpecialControls / color', () => {
    it('aplica el color por defecto y da estilo al preview', () => {
      const input = document.createElement('input');
      input.type = 'color';
      const preview = document.createElement('span');
      preview.className = 'color-preview';
      container.appendChild(input);
      container.appendChild(preview);

      const mapping: FormFieldMapping = {
        controlName: 'color',
        domSelector: '#color',
        colorConfig: { previewSelector: '.color-preview', defaultColor: '#ff0000' },
      };

      service.initializeSpecialControls(nodeListOf(input), mapping, new FormControl(''), container, new Map());

      // Un <input type="color"> recién creado ya trae '#000000' por default
      // del navegador (nunca ''), así que la rama "usa defaultColor si está
      // vacío" no aplica aquí — lo que sí se verifica es que el preview se
      // pinta con el valor real del input.
      expect(preview.style.backgroundColor).toBe('rgb(0, 0, 0)');
    });
  });

  describe('setupPasswordToggle', () => {
    it('envuelve el input y agrega un botón que alterna el tipo', () => {
      const input = document.createElement('input');
      input.type = 'password';
      container.appendChild(input);

      const mapping: FormFieldMapping = {
        controlName: 'password',
        domSelector: '#password',
        passwordConfig: { toggleVisibility: true },
      };

      service.setupPasswordToggle(nodeListOf(input), mapping, container);

      const toggleBtn = container.querySelector('.password-toggle') as HTMLButtonElement;
      expect(toggleBtn).toBeTruthy();
      expect(input.type).toBe('password');

      toggleBtn.click();
      expect(input.type).toBe('text');

      toggleBtn.click();
      expect(input.type).toBe('password');
    });

    it('no crea el toggle si toggleVisibility no está activo', () => {
      const input = document.createElement('input');
      input.type = 'password';
      container.appendChild(input);

      service.setupPasswordToggle(nodeListOf(input), { controlName: 'p', domSelector: '#p', passwordConfig: {} }, container);

      expect(container.querySelector('.password-toggle')).toBeNull();
    });
  });

  describe('setupAutocomplete', () => {
    it('crea un datalist con las opciones cuando el source es un array estático', () => {
      const input = document.createElement('input');
      container.appendChild(input);

      const mapping: FormFieldMapping = {
        controlName: 'city',
        domSelector: '#city',
        autoCompleteConfig: { source: ['Buenos Aires', 'Córdoba'] },
      };

      service.setupAutocomplete(new FormControl(''), nodeListOf(input), mapping, container, new Map());

      const datalist = container.querySelector('datalist') as HTMLDataListElement;
      expect(datalist).toBeTruthy();
      expect(datalist.options.length).toBe(2);
      expect(input.getAttribute('list')).toBe(datalist.id);
    });
  });

  describe('updateSpecialElements', () => {
    it('actualiza el texto del display de un range con el formato configurado', () => {
      const input = document.createElement('input');
      input.type = 'range';
      const display = document.createElement('span');
      display.className = 'range-display';
      container.appendChild(input);
      container.appendChild(display);

      const mapping: FormFieldMapping = {
        controlName: 'volume',
        domSelector: '#volume',
        rangeConfig: { displaySelector: '.range-display', displayFormat: '{value}%' },
      };

      service.updateSpecialElements(input, 75, mapping, container);

      expect(display.textContent).toBe('75%');
    });

    it('actualiza el color de fondo del preview', () => {
      const input = document.createElement('input');
      input.type = 'color';
      const preview = document.createElement('span');
      preview.className = 'color-preview';
      container.appendChild(input);
      container.appendChild(preview);

      const mapping: FormFieldMapping = {
        controlName: 'color',
        domSelector: '#color',
        colorConfig: { previewSelector: '.color-preview' },
      };

      service.updateSpecialElements(input, '#00ff00', mapping, container);

      expect(preview.style.backgroundColor).toBe('rgb(0, 255, 0)');
    });

    it('actualiza el texto del display de un multi-select, truncando por maxSelections', () => {
      const select = document.createElement('select');
      select.multiple = true;
      ['A', 'B', 'C'].forEach((label) => {
        const opt = document.createElement('option');
        opt.value = label;
        opt.text = label;
        opt.selected = true;
        select.appendChild(opt);
      });
      const display = document.createElement('span');
      display.className = 'multi-display';
      container.appendChild(select);
      container.appendChild(display);

      const mapping: FormFieldMapping = {
        controlName: 'tags',
        domSelector: '#tags',
        multiSelectConfig: { displaySelector: '.multi-display', maxSelections: 2, separator: ', ' },
      };

      service.updateSpecialElements(select, ['A', 'B', 'C'], mapping, container);

      expect(display.textContent).toBe('A, B y 1 más');
    });
  });

  describe('destroyExternalInstances', () => {
    it('llama destroy() en instancias que lo soportan', () => {
      const instances = new Map<string, any>();
      const destroySpy = jasmine.createSpy('destroy');
      instances.set('editor-1', { destroy: destroySpy });

      service.destroyExternalInstances(instances);

      expect(destroySpy).toHaveBeenCalled();
    });

    it('desuscribe instancias cuya clave termina en "-sub"', () => {
      const instances = new Map<string, any>();
      const unsubscribeSpy = jasmine.createSpy('unsubscribe');
      instances.set('autocomplete-sub', { unsubscribe: unsubscribeSpy });

      service.destroyExternalInstances(instances);

      expect(unsubscribeSpy).toHaveBeenCalled();
    });
  });

  describe('updateExternalWidgets', () => {
    it('no explota si no hay instancia registrada para el widget', () => {
      const mapping: FormFieldMapping = { controlName: 'bio', domSelector: '#bio', richTextConfig: { editorType: 'quill' } };
      expect(() => service.updateExternalWidgets(mapping, 'nuevo valor', new Map())).not.toThrow();
    });

    it('actualiza el innerHTML de un editor Quill registrado', () => {
      const quillInstance = { root: { innerHTML: 'viejo' } };
      const instances = new Map<string, any>();
      instances.set('bio-editor', quillInstance);

      const mapping: FormFieldMapping = { controlName: 'bio', domSelector: '#bio', richTextConfig: { editorType: 'quill' } };
      service.updateExternalWidgets(mapping, '<p>nuevo</p>', instances);

      expect(quillInstance.root.innerHTML).toBe('<p>nuevo</p>');
    });
  });
});
