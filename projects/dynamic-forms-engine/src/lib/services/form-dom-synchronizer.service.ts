import { inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { FormGroup, FormControl, AbstractControl, Validators } from '@angular/forms';
import { Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { FormFieldMapping } from '../models/form-field-mapping.model';
import { DYNAMIC_CONFIG } from '../dynamic-config.token';

interface ManagedFormInstance {
  formGroup: FormGroup;
  formContainer: HTMLElement;
  fieldMappings: FormFieldMapping[];
  subscriptions: Subscription;
  domListeners: Array<() => void>;
  externalInstances: Map<string, any>;
}

@Injectable({
  providedIn: 'root',
})
export class FormDomSynchronizerService {
  private renderer: Renderer2;
  private managedForms = new Map<string, ManagedFormInstance>();
  private config = inject(DYNAMIC_CONFIG, { optional: true });
  
  private readonly ERROR_CLASSES = (this.config?.errorClassName || 'is-invalid').split(' ');
  private readonly SUCCESS_CLASSES = (this.config?.successClassName || 'is-valid').split(' ');

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  /**
   * Conecta un FormGroup de Angular con elementos del DOM
   */
  public connect(
    formInstanceId: string,
    formGroup: FormGroup,
    formContainer: HTMLElement,
    fieldMappings: FormFieldMapping[],
  ): void {
    this.disconnect(formInstanceId);

    const instanceSubscriptions = new Subscription();
    const instanceDomListeners: Array<() => void> = [];
    const externalInstances = new Map<string, any>();

    fieldMappings.forEach((mapping) => {
      const control = formGroup.get(mapping.controlName) as FormControl | null;
      const elements = formContainer.querySelectorAll(
        mapping.domSelector,
      ) as NodeListOf<HTMLElement>;

      if (!control) {
        console.warn(
          `SYNC_SVC (${formInstanceId} - ${mapping.controlName}): FormControl no encontrado.`,
        );
        return;
      }
      if (elements.length === 0) {
        return;
      }

      // 1. Inicializar controles especiales ANTES de los listeners
      this.initializeSpecialControls(elements, mapping, control, formContainer, externalInstances);

      // 2. Configurar atributos de validación nativos (min, max, required, etc.)
      this.setupNativeValidationAttributes(elements, mapping);

      // 3. Configurar listeners del DOM
      const domToFormListeners = this.setupDomToFormSync(
        control,
        elements,
        mapping,
        formContainer,
      );
      instanceDomListeners.push(...domToFormListeners);

      // 4. Configurar suscripciones al FormGroup
      const formToDomSubscriptions = this.setupFormToDomSync(
        control,
        elements,
        mapping,
        formContainer,
      );
      instanceSubscriptions.add(formToDomSubscriptions);

      // 5. Aplicar estado inicial
      this.updateSingleControlDomState(
        control,
        elements,
        mapping,
        formContainer,
      );

      // 6. Configurar autocomplete si existe
      if (mapping.autoCompleteConfig) {
        this.setupAutocomplete(control, elements, mapping, formContainer, externalInstances);
      }

      // 7. Configurar password si existe
      if (mapping.passwordConfig) {
        this.setupPasswordToggle(elements, mapping, formContainer);
      }
    });

    this.managedForms.set(formInstanceId, {
      formGroup,
      formContainer,
      fieldMappings,
      subscriptions: instanceSubscriptions,
      domListeners: instanceDomListeners,
      externalInstances,
    });
  }

  /**
   * Configura atributos nativos HTML5 basándose en la configuración de validación
   */
  private setupNativeValidationAttributes(elements: NodeListOf<HTMLElement>, mapping: FormFieldMapping): void {
    if (!mapping.validatorConfig) return;

    elements.forEach((el) => {
      // Solo aplicar a elementos de formulario estándar
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        
        mapping.validatorConfig?.forEach(validator => {
          switch (validator.type) {
            case 'required':
              this.renderer.setAttribute(el, 'required', '');
              this.renderer.setAttribute(el, 'aria-required', 'true');
              break;
            case 'min':
              this.renderer.setAttribute(el, 'min', String(validator.value));
              break;
            case 'max':
              this.renderer.setAttribute(el, 'max', String(validator.value));
              break;
            case 'minLength': // Nota: HTML usa maxlength pero minlength
              this.renderer.setAttribute(el, 'minlength', String(validator.value));
              break;
            case 'maxLength':
              this.renderer.setAttribute(el, 'maxlength', String(validator.value));
              break;
            case 'pattern':
              this.renderer.setAttribute(el, 'pattern', String(validator.value));
              break;
            case 'email':
               // Si es un input genérico, forzar tipo email ayuda a la validación nativa en móviles
               if (el instanceof HTMLInputElement && el.type === 'text') {
                 this.renderer.setAttribute(el, 'type', 'email');
               }
               break;
          }
        });
      }
    });
  }

  /**
   * Inicializa controles especiales
   */
  private initializeSpecialControls(
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
    control: FormControl,
    container: HTMLElement,
    externalInstances: Map<string, any>
  ): void {
    elements.forEach((el) => {
      // Rich text editors
      if (mapping.richTextConfig) {
        this.initializeRichTextEditor(el, mapping, control, externalInstances);
      }
      
      // Date pickers externos
      if (mapping.dateTimeConfig?.pickerType && mapping.dateTimeConfig.pickerType !== 'native') {
        this.initializeExternalDatePicker(el, mapping, control, externalInstances);
      }
      
      // Range con configuración especial
      if (mapping.rangeConfig && el instanceof HTMLInputElement && el.type === 'range') {
        this.initializeRangeInput(el, mapping);
      }
      
      // Color con preview
      if (mapping.colorConfig && el instanceof HTMLInputElement && el.type === 'color') {
        this.initializeColorInput(el, mapping, container);
      }
      
      // Multi-select con display
      if (mapping.multiSelectConfig && el instanceof HTMLSelectElement && el.multiple) {
        this.initializeMultiSelect(el, mapping, container);
      }
      
      // Captcha (reCAPTCHA v2)
      if (mapping.captchaConfig) {
        this.initializeCaptcha(el, mapping, control, externalInstances);
      }
    });
  }

  /**
   * Inicializa rich text editor
   */
  private initializeRichTextEditor(
    element: HTMLElement,
    mapping: FormFieldMapping,
    control: FormControl,
    externalInstances: Map<string, any>
  ): void {
    const config = mapping.richTextConfig!;
    const key = `${mapping.controlName}-editor`;

    // Quill.js
    if (config.editorType === 'quill' && (window as any).Quill) {
      try {
        const quill = new (window as any).Quill(element, {
          theme: 'snow',
          modules: {
            toolbar: config.toolbar || [
              ['bold', 'italic', 'underline'],
              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
              ['link', 'image'],
              ['clean']
            ]
          },
          placeholder: 'Escribe aquí...'
        });

        // Valor inicial
        if (control.value) {
          // Usamos setContents si es delta o innerHTML si es string
          // Quill maneja innerHTML a través de clipboard dangeriouslyPasteHTML o root.innerHTML
          quill.root.innerHTML = control.value;
        }

        // Sincronizar editor -> control
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

  /**
   * Inicializa date picker externo
   */
  private initializeExternalDatePicker(
    element: HTMLElement,
    mapping: FormFieldMapping,
    control: FormControl,
    externalInstances: Map<string, any>
  ): void {
    const config = mapping.dateTimeConfig!;
    const key = `${mapping.controlName}-datepicker`;

    // Flatpickr
    if (config.pickerType === 'flatpickr' && (window as any).flatpickr) {
      try {
        const fp = (window as any).flatpickr(element, {
          dateFormat: config.format || 'Y-m-d',
          enableTime: config.showTime,
          time_24hr: true,
          minDate: config.minDate,
          maxDate: config.maxDate,
          // locale: 'es', // Requeriría importar l10n de flatpickr
          onChange: (selectedDates: Date[], dateStr: string, instance: any) => {
            control.setValue(dateStr, { emitEvent: true });
          }
        });

        // Valor inicial
        if (control.value) {
          fp.setDate(control.value);
        }

        externalInstances.set(key, fp);
      } catch (error) {
        console.error('Error inicializando Flatpickr:', error);
      }
    }
  }

  /**
   * Inicializa range input con display
   */
  private initializeRangeInput(input: HTMLInputElement, mapping: FormFieldMapping): void {
    const config = mapping.rangeConfig!;
    
    if (config.step !== undefined) {
      this.renderer.setAttribute(input, 'step', config.step.toString());
    }
    
    // Crear display si no existe
    if (config.displaySelector) {
      // Buscar el padre más cercano o el contenedor del form-group
      const parent = input.closest('.form-group') || input.parentElement;
      if (parent && !parent.querySelector(config.displaySelector)) {
        // Si el selector es una clase, intentamos crear un span con esa clase
        const selectorClass = config.displaySelector.replace('.', '');
        const display = this.renderer.createElement('span');
        this.renderer.addClass(display, selectorClass);
        this.renderer.setAttribute(display, 'data-range-display', '');
        // Insertar después del input
        if (input.nextSibling) {
            this.renderer.insertBefore(input.parentNode, display, input.nextSibling);
        } else {
            this.renderer.appendChild(input.parentNode, display);
        }
      }
    }
  }

  /**
   * Inicializa color input con preview
   */
  private initializeColorInput(input: HTMLInputElement, mapping: FormFieldMapping, container: HTMLElement): void {
    const config = mapping.colorConfig!;
    
    // Valor por defecto
    if (config.defaultColor && !input.value) {
      this.renderer.setProperty(input, 'value', config.defaultColor);
    }
    
    // Crear preview si no existe
    if (config.previewSelector) {
      const previewEl = container.querySelector(config.previewSelector) as HTMLElement;
      if (previewEl) {
        this.renderer.setStyle(previewEl, 'backgroundColor', input.value || config.defaultColor || '#000000');
        // Estilos base para que se vea algo si no tiene CSS
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

  /**
   * Inicializa multi-select
   */
  private initializeMultiSelect(select: HTMLSelectElement, mapping: FormFieldMapping, container: HTMLElement): void {
    const config = mapping.multiSelectConfig!;
    
    // Actualizar display para selecciones actuales
    if (config.displaySelector) {
      const displayEl = container.querySelector(config.displaySelector) as HTMLElement;
      if (displayEl) {
        this.updateMultiSelectDisplay(select, displayEl, config);
      }
    }
  }

  /**
   * Inicializa captcha
   */
  private initializeCaptcha(element: HTMLElement, mapping: FormFieldMapping, control: FormControl, externalInstances: Map<string, any>): void {
    const config = mapping.captchaConfig!;
    const key = `${mapping.controlName}-captcha`;

    // reCAPTCHA v2
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
          }
        });

        externalInstances.set(key, widgetId);
      } catch (error) {
        console.error('Error inicializando reCAPTCHA:', error);
      }
    }
  }

  /**
   * Configura autocomplete
   */
  private setupAutocomplete(
    control: FormControl,
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
    container: HTMLElement,
    externalInstances: Map<string, any>
  ): void {
    const config = mapping.autoCompleteConfig!;
    
    elements.forEach((el) => {
      if (el instanceof HTMLInputElement) {
        // Crear datalist si source es array
        if (Array.isArray(config.source)) {
          this.createDatalist(el, config.source, mapping.controlName, container);
        }
        // O fuente dinámica
        else if (typeof config.source === 'function') {
          this.setupDynamicAutocomplete(el, control, config, mapping, externalInstances);
        }
      }
    });
  }

  /**
   * Crea datalist para autocomplete estático
   */
  private createDatalist(input: HTMLInputElement, source: string[], controlName: string, container: HTMLElement): void {
    const datalistId = `datalist-${controlName}`;
    let datalist = container.querySelector(`#${datalistId}`) as HTMLDataListElement;
    
    if (!datalist) {
      datalist = this.renderer.createElement('datalist');
      this.renderer.setAttribute(datalist, 'id', datalistId);
      this.renderer.appendChild(container, datalist);
    }
    
    // Limpiar opciones existentes
    while (datalist.firstChild) {
      datalist.removeChild(datalist.firstChild);
    }
    
    // Agregar nuevas opciones
    source.forEach(value => {
      const option = this.renderer.createElement('option');
      this.renderer.setProperty(option, 'value', value);
      this.renderer.appendChild(datalist, option);
    });
    
    // Vincular datalist al input
    this.renderer.setAttribute(input, 'list', datalistId);
  }

  /**
   * Configura autocomplete dinámico
   */
  private setupDynamicAutocomplete(
    input: HTMLInputElement,
    control: FormControl,
    config: any,
    mapping: FormFieldMapping,
    externalInstances: Map<string, any>
  ): void {
    const debounceTimeMs = config.debounceTime || 300;
    const minChars = config.minChars || 2;
    
    // Escuchar cambios en el input
    const sub = control.valueChanges
      .pipe(
        debounceTime(debounceTimeMs),
        distinctUntilChanged()
      )
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

  /**
   * Muestra sugerencias de autocomplete
   */
  private showAutocompleteSuggestions(input: HTMLInputElement, suggestions: string[], controlName: string): void {
    // Implementar lógica para mostrar dropdown con sugerencias
    // Esto depende de tu UI framework o implementación personalizada
    // Por simplicidad, aquí solo logueamos, pero se podría crear un ul/li dinámico
    console.log('Sugerencias para', controlName, ':', suggestions);
  }

  /**
   * Configura toggle para mostrar/ocultar contraseña
   */
  private setupPasswordToggle(elements: NodeListOf<HTMLElement>, mapping: FormFieldMapping, container: HTMLElement): void {
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
   * Crea botón para mostrar/ocultar contraseña
   */
  private createPasswordToggle(input: HTMLInputElement, container: HTMLElement): void {
    const wrapper = this.renderer.createElement('div');
    this.renderer.setStyle(wrapper, 'position', 'relative');
    this.renderer.setStyle(wrapper, 'display', 'inline-block');
    this.renderer.setStyle(wrapper, 'width', '100%');
    
    // Envolver input
    if (input.parentNode) {
        this.renderer.insertBefore(input.parentNode, wrapper, input);
        this.renderer.appendChild(wrapper, input);
    }
    
    // Crear botón toggle
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
    this.renderer.setStyle(toggleBtn, 'zIndex', '10'); // Asegurar que esté encima
    
    // Icono de ojo
    const eyeIcon = this.renderer.createElement('i');
    this.renderer.addClass(eyeIcon, 'fa');
    this.renderer.addClass(eyeIcon, 'fa-eye');
    this.renderer.appendChild(toggleBtn, eyeIcon);
    this.renderer.appendChild(wrapper, toggleBtn);
    
    // Toggle funcionalidad
    this.renderer.listen(toggleBtn, 'click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      
      // Cambiar icono
      this.renderer.removeClass(eyeIcon, isPassword ? 'fa-eye' : 'fa-eye-slash');
      this.renderer.addClass(eyeIcon, isPassword ? 'fa-eye-slash' : 'fa-eye');
    });
  }

  /**
   * Configura listeners DOM -> FormGroup
   */
  private setupDomToFormSync(
    control: FormControl,
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
    container: HTMLElement
  ): Array<() => void> {
    const listeners: Array<() => void> = [];
    
    elements.forEach((el) => {
      const eventToListen = mapping.eventType || this.determineDefaultEvent(el);
      
      const unlisten = this.renderer.listen(el, eventToListen, (event: Event) => {
        let newValue: any;

        // Web Components
        if (mapping.valueProperty) {
          newValue = mapping.useEventDetail 
            ? (event as CustomEvent).detail 
            : (event.target as Record<string, any>)[mapping.valueProperty];
        } 
        // Elementos estándar
        else if (el instanceof HTMLInputElement) {
          newValue = this.getInputValue(el, mapping);
        } else if (el instanceof HTMLSelectElement) {
          newValue = this.getSelectValue(el, mapping);
        } else if (el instanceof HTMLTextAreaElement) {
          newValue = el.value;
        }
        // Toggles personalizados
        else if (mapping.toggleConfig) {
          newValue = this.getToggleValue(el, mapping);
        }

        // Actualizar control si el valor cambió
        if (!this.valuesEqual(control.value, newValue)) {
          control.setValue(newValue, { emitEvent: true });
        }
      });
      listeners.push(unlisten);
    });

    return listeners;
  }

  /**
   * Compara valores considerando arrays y objetos
   */
  private valuesEqual(a: any, b: any): boolean {
    if (Array.isArray(a) && Array.isArray(b)) {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return a === b;
  }

  /**
   * Determina evento por defecto
   */
  private determineDefaultEvent(element: HTMLElement): string {
    if (element instanceof HTMLInputElement) {
      switch (element.type) {
        case 'checkbox':
        case 'radio':
        case 'file':
        case 'date':
        case 'datetime-local':
        case 'month':
        case 'week':
        case 'time':
        case 'color':
          return 'change';
        case 'range':
          return 'input';
        default:
          return 'input';
      }
    }
    return 'input';
  }

  /**
   * Obtiene valor de input según tipo
   */
  private getInputValue(input: HTMLInputElement, mapping: FormFieldMapping): any {
    switch (input.type) {
      case 'checkbox':
        return input.checked;
      case 'radio':
        return input.checked ? input.value : undefined;
      case 'range':
        return parseFloat(input.value);
      case 'number':
        return input.value === '' ? null : parseFloat(input.value);
      case 'date':
      case 'datetime-local':
      case 'month':
      case 'week':
      case 'time':
        return input.value || null;
      case 'color':
        return input.value;
      case 'file':
        return this.getFileValue(input, mapping);
      default:
        return input.value;
    }
  }

  /**
   * Obtiene valor de select
   */
  private getSelectValue(select: HTMLSelectElement, mapping: FormFieldMapping): any {
    if (select.multiple) {
      return Array.from(select.selectedOptions).map(option => option.value);
    }
    return select.value;
  }

  /**
   * Obtiene valor de toggle
   */
  private getToggleValue(el: HTMLElement, mapping: FormFieldMapping): any {
    const config = mapping.toggleConfig!;
    const isChecked = el.classList.contains(config.checkedClass || 'active') ||
                      el.getAttribute('aria-checked') === 'true' ||
                      el.hasAttribute('checked');
    
    return isChecked ? (config.trueValue ?? true) : (config.falseValue ?? false);
  }

  /**
   * Obtiene valor de file input
   */
  private getFileValue(input: HTMLInputElement, mapping: FormFieldMapping): any {
    if (!input.files || input.files.length === 0) {
      return null;
    }
    
    const fileConfig = mapping.fileUploadConfig;
    if (fileConfig?.multiple) {
      return Array.from(input.files);
    }
    
    return input.files[0];
  }

  /**
   * Configura suscripciones FormGroup -> DOM
   */
  private setupFormToDomSync(
    control: AbstractControl,
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
    container: HTMLElement,
  ): Subscription {
    const combinedSubscription = new Subscription();
    
    combinedSubscription.add(
      control.valueChanges.subscribe(() => {
        this.updateSingleControlDomState(
          control,
          elements,
          mapping,
          container,
        );
      }),
    );
    
    combinedSubscription.add(
      control.statusChanges.subscribe(() => {
        this.updateSingleControlDomState(
          control,
          elements,
          mapping,
          container,
        );
      }),
    );
    
    return combinedSubscription;
  }

  /**
   * Actualiza estado del DOM
   */
  private updateSingleControlDomState(
    control: AbstractControl,
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
    container: HTMLElement
  ): void {
    if (elements.length === 0) return;

    const isDisabled = control.disabled;
    const isInvalid = control.invalid && (control.dirty || control.touched);
    const isValid = control.valid && (control.dirty || control.touched);
    const value = control.value;

    elements.forEach((el) => {
      // Aplicar valor
      this.applyValueToElement(el, value, mapping, container);
      
      // Aplicar estado disabled
      this.renderer.setProperty(el, 'disabled', isDisabled);
      
      // Aplicar clases de validación
      this.applyValidationClasses(el, isDisabled, isInvalid, isValid);
      
      // Actualizar controles especiales
      this.updateSpecialElements(el, value, mapping, container);
    });

    this.updateErrorMessages(control, mapping, container);
  }

  /**
   * Aplica valor al elemento
   */
  private applyValueToElement(el: HTMLElement, value: any, mapping: FormFieldMapping, container: HTMLElement): void {
    if (mapping.valueProperty) {
      this.renderer.setProperty(el, mapping.valueProperty, value);
    } else if (el instanceof HTMLInputElement) {
      this.applyInputValue(el, value, mapping);
    } else if (el instanceof HTMLSelectElement) {
      this.applySelectValue(el, value, mapping);
    } else if (el instanceof HTMLTextAreaElement) {
      this.renderer.setProperty(el, 'value', value ?? '');
    } else if (mapping.toggleConfig) {
      this.applyToggleValue(el, value, mapping);
    }
    
    // Para rich text editors externos
    if (mapping.richTextConfig) {
      this.updateRichTextEditor(el, value, mapping, container);
    }
    
    // Para date pickers externos
    if (mapping.dateTimeConfig?.pickerType && mapping.dateTimeConfig.pickerType !== 'native') {
      this.updateExternalDatePicker(el, value, mapping, container);
    }
  }

  /**
   * Aplica valor a input
   */
  private applyInputValue(input: HTMLInputElement, value: any, mapping: FormFieldMapping): void {
    switch (input.type) {
      case 'checkbox':
        this.renderer.setProperty(input, 'checked', !!value);
        break;
      case 'radio':
        this.renderer.setProperty(input, 'checked', input.value === value);
        break;
      case 'range':
      case 'number':
        const numValue = value != null ? value : '';
        if (input.value !== String(numValue)) {
          this.renderer.setProperty(input, 'value', numValue);
        }
        break;
      case 'date':
      case 'datetime-local':
      case 'month':
      case 'week':
      case 'time':
      case 'color':
      case 'email':
      case 'tel':
      case 'url':
      case 'search':
        if (input.value !== value) {
          this.renderer.setProperty(input, 'value', value ?? '');
        }
        break;
      default:
        if (input.value !== value) {
          this.renderer.setProperty(input, 'value', value ?? '');
        }
    }
  }

  /**
   * Aplica valor a select
   */
  private applySelectValue(select: HTMLSelectElement, value: any, mapping: FormFieldMapping): void {
    if (select.multiple && Array.isArray(value)) {
      Array.from(select.options).forEach(option => {
        this.renderer.setProperty(option, 'selected', value.includes(option.value));
      });
    } else {
      this.renderer.setProperty(select, 'value', value ?? '');
    }
  }

  /**
   * Aplica valor a toggle
   */
  private applyToggleValue(el: HTMLElement, value: any, mapping: FormFieldMapping): void {
    const config = mapping.toggleConfig!;
    const targetValue = config.trueValue ?? true;
    const shouldBeChecked = value === targetValue;
    
    const checkedClass = config.checkedClass || 'active';
    if (shouldBeChecked) {
      this.renderer.addClass(el, checkedClass);
      this.renderer.setAttribute(el, 'aria-checked', 'true');
    } else {
      this.renderer.removeClass(el, checkedClass);
      this.renderer.setAttribute(el, 'aria-checked', 'false');
    }
  }

  /**
   * Actualiza rich text editor
   */
  private updateRichTextEditor(el: HTMLElement, value: any, mapping: FormFieldMapping, container: HTMLElement): void {
    const instance = this.getExternalInstance(container, `${mapping.controlName}-editor`);
    
    if (instance && mapping.richTextConfig?.editorType === 'quill') {
      if (instance.root.innerHTML !== value) {
        instance.root.innerHTML = value || '';
      }
    }
  }

  /**
   * Actualiza date picker externo
   */
  private updateExternalDatePicker(el: HTMLElement, value: any, mapping: FormFieldMapping, container: HTMLElement): void {
    const instance = this.getExternalInstance(container, `${mapping.controlName}-datepicker`);
    
    if (instance && mapping.dateTimeConfig?.pickerType === 'flatpickr') {
      try {
        instance.setDate(value);
      } catch (error) {
        console.error('Error actualizando datepicker:', error);
      }
    }
  }

  /**
   * Obtiene instancia externa
   */
  private getExternalInstance(container: HTMLElement, key: string): any {
    const formId = this.findFormIdByContainer(container);
    if (!formId) return null;
    
    const instance = this.managedForms.get(formId);
    return instance?.externalInstances.get(key);
  }

  /**
   * Encuentra formId por container
   */
  private findFormIdByContainer(container: HTMLElement): string | null {
    for (const [formId, instance] of this.managedForms.entries()) {
      if (instance.formContainer === container) {
        return formId;
      }
    }
    return null;
  }

  /**
   * Aplica clases de validación
   */
  private applyValidationClasses(el: HTMLElement, isDisabled: boolean, isInvalid: boolean, isValid: boolean): void {
    // Limpiar clases
    this.ERROR_CLASSES.forEach(cls => this.renderer.removeClass(el, cls));
    this.SUCCESS_CLASSES.forEach(cls => this.renderer.removeClass(el, cls));
    this.renderer.removeClass(el, 'disabled');

    // Aplicar clases según estado
    if (isDisabled) {
      this.renderer.addClass(el, 'disabled');
    } else {
      if (isInvalid) {
        this.ERROR_CLASSES.forEach(cls => this.renderer.addClass(el, cls));
      } else if (isValid) {
        this.SUCCESS_CLASSES.forEach(cls => this.renderer.addClass(el, cls));
      }
    }
  }

  /**
   * Actualiza controles especiales
   */
  private updateSpecialElements(el: HTMLElement, value: any, mapping: FormFieldMapping, container: HTMLElement): void {
    // Range display
    if (mapping.rangeConfig?.displaySelector && el instanceof HTMLInputElement && el.type === 'range') {
      const displayEl = container.querySelector(mapping.rangeConfig.displaySelector);
      if (displayEl) {
        const format = mapping.rangeConfig.displayFormat || '{value}';
        this.renderer.setProperty(displayEl, 'textContent', format.replace('{value}', value));
      }
    }
    
    // Color preview
    if (mapping.colorConfig?.previewSelector && el instanceof HTMLInputElement && el.type === 'color') {
      const previewEl = container.querySelector(mapping.colorConfig.previewSelector);
      if (previewEl) {
        this.renderer.setStyle(previewEl, 'backgroundColor', value || mapping.colorConfig.defaultColor || '#000000');
      }
    }
    
    // Multi-select display
    if (mapping.multiSelectConfig?.displaySelector && el instanceof HTMLSelectElement && el.multiple) {
      const displayEl = container.querySelector(mapping.multiSelectConfig.displaySelector) as HTMLElement;
      if (displayEl) {
        this.updateMultiSelectDisplay(el, displayEl, mapping.multiSelectConfig);
      }
    }
  }

  /**
   * Actualiza display de multi-select
   */
  private updateMultiSelectDisplay(select: HTMLSelectElement, displayEl: HTMLElement, config: any): void {
    const selected = Array.from(select.selectedOptions).map(option => option.text);
    const separator = config.separator || ', ';
    const text = selected.join(separator);
    
    if (config.maxSelections && selected.length > config.maxSelections) {
      this.renderer.setProperty(displayEl, 'textContent', 
        `${selected.slice(0, config.maxSelections).join(separator)} y ${selected.length - config.maxSelections} más`);
    } else {
      this.renderer.setProperty(displayEl, 'textContent', text);
    }
  }

  /**
   * Actualiza mensajes de error
   */
  private updateErrorMessages(control: AbstractControl, mapping: FormFieldMapping, container: HTMLElement): void {
    if (!mapping.errorDisplaySelector) return;
    
    const errorEl = container.querySelector(mapping.errorDisplaySelector);
    if (errorEl instanceof HTMLElement) {
      const isInvalid = control.invalid && (control.dirty || control.touched);
      
      if (isInvalid && control.errors) {
        const firstErrorKey = Object.keys(control.errors)[0].toLowerCase();
        
        const apiCustomMessage = mapping.validatorConfig?.find(
          v => v.type.toLowerCase() === firstErrorKey
        )?.message;

        const globalDefaultMessage = this.config?.defaultErrorMessages?.[firstErrorKey];

        const systemDefaults: Record<string, string> = {
          required: 'Este campo es obligatorio.',
          email: 'Formato de correo inválido.',
          minlength: 'El texto es muy corto.',
          generic: 'Entrada inválida.'
        };

        const finalMessage = apiCustomMessage || globalDefaultMessage || systemDefaults[firstErrorKey] || systemDefaults['generic'];

        this.renderer.setProperty(errorEl, 'textContent', finalMessage);
      } else {
        this.renderer.setProperty(errorEl, 'textContent', '');
      }
    }
  }

  /**
   * Desconecta un formulario
   */
  public disconnect(formInstanceId: string): void {
    const instance = this.managedForms.get(formInstanceId);
    if (instance) {
      instance.subscriptions.unsubscribe();
      instance.domListeners.forEach((unlistenFn) => unlistenFn());
      
      // Limpiar instancias externas
      instance.externalInstances.forEach((instance, key) => {
        if (instance && typeof instance.destroy === 'function') {
          instance.destroy();
        } else if (key.endsWith('-sub') && instance.unsubscribe) {
          instance.unsubscribe();
        }
      });
      
      this.managedForms.delete(formInstanceId);
    }
  }

  /**
   * Desconecta todos los formularios
   */
  public disconnectAll(): void {
    this.managedForms.forEach((instance, id) => {
      this.disconnect(id);
    });
  }

  /**
   * Fuerza actualización del DOM
   */
  public forceDomUpdateForForm(formInstanceId: string): void {
    const instance = this.managedForms.get(formInstanceId);
    if (instance) {
      instance.fieldMappings.forEach((mapping) => {
        const control = instance.formGroup.get(mapping.controlName) as FormControl | null;
        const elements = instance.formContainer.querySelectorAll(mapping.domSelector) as NodeListOf<HTMLElement>;
        if (control && elements.length > 0) {
          this.updateSingleControlDomState(control, elements, mapping, instance.formContainer);
        }
      });
    }
  }
}