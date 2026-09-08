import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { FormFieldMapping, MultiSelectConfig } from '../models/form-field-mapping.model';

/**
 * Inicializa y actualiza controles especiales del formulario: editores de
 * texto enriquecido, date pickers externos, range/color/multi-select con
 * previews, captcha, autocomplete y el toggle de "mostrar contraseña".
 *
 * Las instancias de librerías externas (Quill, Flatpickr, reCAPTCHA, etc.)
 * se guardan en el `externalInstances` del formulario que las creó, para
 * poder actualizarlas o destruirlas sin volver a buscarlas en el DOM.
 */
@Injectable({
  providedIn: 'root',
})
export class FormSpecialControlsService {
  private renderer: Renderer2;

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  /**
   * Inicializa controles especiales
   */
  public initializeSpecialControls(
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
    control: FormControl,
    container: HTMLElement,
    externalInstances: Map<string, any>,
  ): void {
    elements.forEach((el) => {
      if (mapping.richTextConfig) {
        this.initializeRichTextEditor(el, mapping, control, externalInstances);
      }

      if (mapping.dateTimeConfig?.pickerType && mapping.dateTimeConfig.pickerType !== 'native') {
        this.initializeExternalDatePicker(el, mapping, control, externalInstances);
      }

      if (mapping.rangeConfig && el instanceof HTMLInputElement && el.type === 'range') {
        this.initializeRangeInput(el, mapping);
      }

      if (mapping.colorConfig && el instanceof HTMLInputElement && el.type === 'color') {
        this.initializeColorInput(el, mapping, container);
      }

      if (mapping.multiSelectConfig && el instanceof HTMLSelectElement && el.multiple) {
        this.initializeMultiSelect(el, mapping, container);
      }

      if (mapping.captchaConfig) {
        this.initializeCaptcha(el, mapping, control, externalInstances);
      }
    });
  }

  /**
   * Configura autocomplete
   */
  public setupAutocomplete(
    control: FormControl,
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
    container: HTMLElement,
    externalInstances: Map<string, any>,
  ): void {
    const config = mapping.autoCompleteConfig!;

    elements.forEach((el) => {
      if (el instanceof HTMLInputElement) {
        if (Array.isArray(config.source)) {
          this.createDatalist(el, config.source, mapping.controlName, container);
        } else if (typeof config.source === 'function') {
          this.setupDynamicAutocomplete(el, control, config, mapping, externalInstances);
        }
      }
    });
  }

  /**
   * Configura toggle para mostrar/ocultar contraseña
   */
  public setupPasswordToggle(
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
    container: HTMLElement,
  ): void {
    const config = mapping.passwordConfig!;

    if (config.toggleVisibility) {
      elements.forEach((el) => {
        if (el instanceof HTMLInputElement && el.type === 'password') {
          this.createPasswordToggle(el, container);
        }
      });
    }
  }

  /**
   * Actualiza los controles especiales cuyo estado depende del valor actual
   * del FormControl (range display, color preview, multi-select display).
   */
  public updateSpecialElements(
    el: HTMLElement,
    value: any,
    mapping: FormFieldMapping,
    container: HTMLElement,
  ): void {
    if (mapping.rangeConfig?.displaySelector && el instanceof HTMLInputElement && el.type === 'range') {
      const displayEl = container.querySelector(mapping.rangeConfig.displaySelector);
      if (displayEl) {
        const format = mapping.rangeConfig.displayFormat || '{value}';
        this.renderer.setProperty(displayEl, 'textContent', format.replace('{value}', value));
      }
    }

    if (mapping.colorConfig?.previewSelector && el instanceof HTMLInputElement && el.type === 'color') {
      const previewEl = container.querySelector(mapping.colorConfig.previewSelector);
      if (previewEl) {
        this.renderer.setStyle(previewEl, 'backgroundColor', value || mapping.colorConfig.defaultColor || '#000000');
      }
    }

    if (mapping.multiSelectConfig?.displaySelector && el instanceof HTMLSelectElement && el.multiple) {
      const displayEl = container.querySelector(mapping.multiSelectConfig.displaySelector) as HTMLElement;
      if (displayEl) {
        this.updateMultiSelectDisplay(el, displayEl, mapping.multiSelectConfig);
      }
    }
  }

  /**
   * Actualiza editores/widgets externos (rich text, date picker) a partir
   * de las instancias guardadas al inicializarlos.
   */
  public updateExternalWidgets(
    mapping: FormFieldMapping,
    value: any,
    externalInstances: Map<string, any>,
  ): void {
    if (mapping.richTextConfig) {
      const instance = externalInstances.get(`${mapping.controlName}-editor`);
      if (instance && mapping.richTextConfig.editorType === 'quill') {
        if (instance.root.innerHTML !== value) {
          instance.root.innerHTML = value || '';
        }
      }
    }

    if (mapping.dateTimeConfig?.pickerType && mapping.dateTimeConfig.pickerType !== 'native') {
      const instance = externalInstances.get(`${mapping.controlName}-datepicker`);
      if (instance && mapping.dateTimeConfig.pickerType === 'flatpickr') {
        try {
          instance.setDate(value);
        } catch (error) {
          console.error('Error actualizando datepicker:', error);
        }
      }
    }
  }

  /**
   * Libera las instancias externas asociadas a un formulario (editores,
   * pickers, captcha, suscripciones de autocomplete, etc.)
   */
  public destroyExternalInstances(externalInstances: Map<string, any>): void {
    externalInstances.forEach((instance, key) => {
      if (instance && typeof instance.destroy === 'function') {
        instance.destroy();
      } else if (key.endsWith('-sub') && instance?.unsubscribe) {
        instance.unsubscribe();
      }
    });
  }

  private initializeRichTextEditor(
    element: HTMLElement,
    mapping: FormFieldMapping,
    control: FormControl,
    externalInstances: Map<string, any>,
  ): void {
    const config = mapping.richTextConfig!;
    const key = `${mapping.controlName}-editor`;

    if (config.editorType === 'quill' && (window as any).Quill) {
      try {
        const quill = new (window as any).Quill(element, {
          theme: 'snow',
          modules: {
            toolbar: config.toolbar || [
              ['bold', 'italic', 'underline'],
              [{ list: 'ordered' }, { list: 'bullet' }],
              ['link', 'image'],
              ['clean'],
            ],
          },
          placeholder: 'Escribe aquí...',
        });

        if (control.value) {
          quill.root.innerHTML = control.value;
        }

        quill.on('text-change', () => {
          const html = quill.root.innerHTML;
          if (control.value !== html) {
            control.setValue(html, { emitEvent: true });
          }
        });

        externalInstances.set(key, quill);
      } catch (error) {
        console.error('Error inicializando Quill:', error);
      }
    }
  }

  private initializeExternalDatePicker(
    element: HTMLElement,
    mapping: FormFieldMapping,
    control: FormControl,
    externalInstances: Map<string, any>,
  ): void {
    const config = mapping.dateTimeConfig!;
    const key = `${mapping.controlName}-datepicker`;

    if (config.pickerType === 'flatpickr' && (window as any).flatpickr) {
      try {
        const fp = (window as any).flatpickr(element, {
          dateFormat: config.format || 'Y-m-d',
          enableTime: config.showTime,
          time_24hr: true,
          minDate: config.minDate,
          maxDate: config.maxDate,
          onChange: (selectedDates: Date[], dateStr: string) => {
            control.setValue(dateStr, { emitEvent: true });
          },
        });

        if (control.value) {
          fp.setDate(control.value);
        }

        externalInstances.set(key, fp);
      } catch (error) {
        console.error('Error inicializando Flatpickr:', error);
      }
    }
  }

  private initializeRangeInput(input: HTMLInputElement, mapping: FormFieldMapping): void {
    const config = mapping.rangeConfig!;

    if (config.step !== undefined) {
      this.renderer.setAttribute(input, 'step', config.step.toString());
    }

    if (config.displaySelector) {
      const parent = input.closest('.form-group') || input.parentElement;
      if (parent && !parent.querySelector(config.displaySelector)) {
        const selectorClass = config.displaySelector.replace('.', '');
        const display = this.renderer.createElement('span');
        this.renderer.addClass(display, selectorClass);
        this.renderer.setAttribute(display, 'data-range-display', '');
        if (input.nextSibling) {
          this.renderer.insertBefore(input.parentNode, display, input.nextSibling);
        } else {
          this.renderer.appendChild(input.parentNode, display);
        }
      }
    }
  }

  private initializeColorInput(input: HTMLInputElement, mapping: FormFieldMapping, container: HTMLElement): void {
    const config = mapping.colorConfig!;

    if (config.defaultColor && !input.value) {
      this.renderer.setProperty(input, 'value', config.defaultColor);
    }

    if (config.previewSelector) {
      const previewEl = container.querySelector(config.previewSelector) as HTMLElement;
      if (previewEl) {
        this.renderer.setStyle(previewEl, 'backgroundColor', input.value || config.defaultColor || '#000000');
        this.renderer.setStyle(previewEl, 'width', '30px');
        this.renderer.setStyle(previewEl, 'height', '30px');
        this.renderer.setStyle(previewEl, 'display', 'inline-block');
        this.renderer.setStyle(previewEl, 'border', '1px solid #ccc');
        this.renderer.setStyle(previewEl, 'borderRadius', '4px');
        this.renderer.setStyle(previewEl, 'marginLeft', '10px');
        this.renderer.setStyle(previewEl, 'verticalAlign', 'middle');
      }
    }
  }

  private initializeMultiSelect(select: HTMLSelectElement, mapping: FormFieldMapping, container: HTMLElement): void {
    const config = mapping.multiSelectConfig!;

    if (config.displaySelector) {
      const displayEl = container.querySelector(config.displaySelector) as HTMLElement;
      if (displayEl) {
        this.updateMultiSelectDisplay(select, displayEl, config);
      }
    }
  }

  private initializeCaptcha(
    element: HTMLElement,
    mapping: FormFieldMapping,
    control: FormControl,
    externalInstances: Map<string, any>,
  ): void {
    const config = mapping.captchaConfig!;
    const key = `${mapping.controlName}-captcha`;

    if ((window as any).grecaptcha) {
      try {
        const widgetId = (window as any).grecaptcha.render(element, {
          sitekey: config.siteKey,
          theme: config.theme || 'light',
          size: config.size || 'normal',
          callback: (response: string) => {
            control.setValue(response, { emitEvent: true });
          },
          'expired-callback': () => {
            control.setValue(null, { emitEvent: true });
          },
        });

        externalInstances.set(key, widgetId);
      } catch (error) {
        console.error('Error inicializando reCAPTCHA:', error);
      }
    }
  }

  private createDatalist(input: HTMLInputElement, source: string[], controlName: string, container: HTMLElement): void {
    const datalistId = `datalist-${controlName}`;
    let datalist = container.querySelector(`#${datalistId}`) as HTMLDataListElement;

    if (!datalist) {
      datalist = this.renderer.createElement('datalist');
      this.renderer.setAttribute(datalist, 'id', datalistId);
      this.renderer.appendChild(container, datalist);
    }

    while (datalist.firstChild) {
      datalist.removeChild(datalist.firstChild);
    }

    source.forEach((value) => {
      const option = this.renderer.createElement('option');
      this.renderer.setProperty(option, 'value', value);
      this.renderer.appendChild(datalist, option);
    });

    this.renderer.setAttribute(input, 'list', datalistId);
  }

  private setupDynamicAutocomplete(
    input: HTMLInputElement,
    control: FormControl,
    config: any,
    mapping: FormFieldMapping,
    externalInstances: Map<string, any>,
  ): void {
    const debounceTimeMs = config.debounceTime || 300;
    const minChars = config.minChars || 2;

    const sub = control.valueChanges
      .pipe(debounceTime(debounceTimeMs), distinctUntilChanged())
      .subscribe(async (value: string) => {
        if (value && value.length >= minChars && typeof config.source === 'function') {
          try {
            const suggestions = await config.source(value);
            this.showAutocompleteSuggestions(input, suggestions, mapping.controlName);
          } catch (error) {
            console.error('Error en autocomplete:', error);
          }
        }
      });

    externalInstances.set(`${mapping.controlName}-autocomplete-sub`, sub);
  }

  private showAutocompleteSuggestions(input: HTMLInputElement, suggestions: string[], controlName: string): void {
    // Implementar lógica para mostrar dropdown con sugerencias
    // Esto depende de tu UI framework o implementación personalizada
    console.log('Sugerencias para', controlName, ':', suggestions);
  }

  private createPasswordToggle(input: HTMLInputElement, container: HTMLElement): void {
    const wrapper = this.renderer.createElement('div');
    this.renderer.setStyle(wrapper, 'position', 'relative');
    this.renderer.setStyle(wrapper, 'display', 'inline-block');
    this.renderer.setStyle(wrapper, 'width', '100%');

    if (input.parentNode) {
      this.renderer.insertBefore(input.parentNode, wrapper, input);
      this.renderer.appendChild(wrapper, input);
    }

    const toggleBtn = this.renderer.createElement('button');
    this.renderer.setAttribute(toggleBtn, 'type', 'button');
    this.renderer.addClass(toggleBtn, 'password-toggle');
    this.renderer.setStyle(toggleBtn, 'position', 'absolute');
    this.renderer.setStyle(toggleBtn, 'right', '10px');
    this.renderer.setStyle(toggleBtn, 'top', '50%');
    this.renderer.setStyle(toggleBtn, 'transform', 'translateY(-50%)');
    this.renderer.setStyle(toggleBtn, 'background', 'transparent');
    this.renderer.setStyle(toggleBtn, 'border', 'none');
    this.renderer.setStyle(toggleBtn, 'cursor', 'pointer');
    this.renderer.setStyle(toggleBtn, 'zIndex', '10');

    const eyeIcon = this.renderer.createElement('i');
    this.renderer.addClass(eyeIcon, 'fa');
    this.renderer.addClass(eyeIcon, 'fa-eye');
    this.renderer.appendChild(toggleBtn, eyeIcon);
    this.renderer.appendChild(wrapper, toggleBtn);

    this.renderer.listen(toggleBtn, 'click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      this.renderer.removeClass(eyeIcon, isPassword ? 'fa-eye' : 'fa-eye-slash');
      this.renderer.addClass(eyeIcon, isPassword ? 'fa-eye-slash' : 'fa-eye');
    });
  }

  private updateMultiSelectDisplay(select: HTMLSelectElement, displayEl: HTMLElement, config: MultiSelectConfig): void {
    const selected = Array.from(select.selectedOptions).map((option) => option.text);
    const separator = config.separator || ', ';
    const text = selected.join(separator);

    if (config.maxSelections && selected.length > config.maxSelections) {
      this.renderer.setProperty(
        displayEl,
        'textContent',
        `${selected.slice(0, config.maxSelections).join(separator)} y ${selected.length - config.maxSelections} más`,
      );
    } else {
      this.renderer.setProperty(displayEl, 'textContent', text);
    }
  }
}
