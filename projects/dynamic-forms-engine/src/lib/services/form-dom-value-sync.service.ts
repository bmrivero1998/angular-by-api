import { inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { AbstractControl, FormControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { FormFieldMapping } from '../models/form-field-mapping.model';
import { DYNAMIC_CONFIG } from '../dynamic-config.token';
import { FormSpecialControlsService } from './form-special-controls.service';

const SYSTEM_DEFAULT_ERROR_MESSAGES: Record<string, string> = {
  required: 'Este campo es obligatorio.',
  email: 'Formato de correo inválido.',
  minlength: 'El texto es muy corto.',
  generic: 'Entrada inválida.',
};

/**
 * Sincronización bidireccional de valores entre el DOM y un FormControl:
 * lee el valor del elemento nativo hacia el control (DOM -> Form), y aplica
 * valor/estado/clases de validación del control hacia el elemento
 * (Form -> DOM). Delega la actualización de controles especiales
 * (range/color/multi-select/editores externos) a FormSpecialControlsService.
 */
@Injectable({
  providedIn: 'root',
})
export class FormDomValueSyncService {
  private renderer: Renderer2;
  private config = inject(DYNAMIC_CONFIG, { optional: true });
  private specialControls = inject(FormSpecialControlsService);

  private readonly ERROR_CLASSES = (this.config?.errorClassName || 'is-invalid').split(' ');
  private readonly SUCCESS_CLASSES = (this.config?.successClassName || 'is-valid').split(' ');

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  /**
   * Configura atributos nativos HTML5 basándose en la configuración de validación
   */
  public setupNativeValidationAttributes(elements: NodeListOf<HTMLElement>, mapping: FormFieldMapping): void {
    if (!mapping.validatorConfig) return;

    elements.forEach((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        mapping.validatorConfig?.forEach((validator) => {
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
            case 'minLength':
              this.renderer.setAttribute(el, 'minlength', String(validator.value));
              break;
            case 'maxLength':
              this.renderer.setAttribute(el, 'maxlength', String(validator.value));
              break;
            case 'pattern':
              this.renderer.setAttribute(el, 'pattern', String(validator.value));
              break;
            case 'email':
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
   * Configura listeners DOM -> FormGroup
   */
  public setupDomToFormSync(
    control: FormControl,
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
  ): Array<() => void> {
    const listeners: Array<() => void> = [];

    elements.forEach((el) => {
      const eventToListen = mapping.eventType || this.determineDefaultEvent(el);

      const unlisten = this.renderer.listen(el, eventToListen, (event: Event) => {
        let newValue: any;

        if (mapping.valueProperty) {
          newValue = mapping.useEventDetail
            ? (event as CustomEvent).detail
            : (event.target as Record<string, any>)[mapping.valueProperty];
        } else if (el instanceof HTMLInputElement) {
          newValue = this.getInputValue(el, mapping);
        } else if (el instanceof HTMLSelectElement) {
          newValue = this.getSelectValue(el);
        } else if (el instanceof HTMLTextAreaElement) {
          newValue = el.value;
        } else if (mapping.toggleConfig) {
          newValue = this.getToggleValue(el, mapping);
        }

        if (!this.valuesEqual(control.value, newValue)) {
          control.setValue(newValue, { emitEvent: true });
        }
      });
      listeners.push(unlisten);
    });

    return listeners;
  }

  /**
   * Configura suscripciones FormGroup -> DOM
   */
  public setupFormToDomSync(
    control: AbstractControl,
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
    container: HTMLElement,
    externalInstances: Map<string, any>,
  ): Subscription {
    const combinedSubscription = new Subscription();

    const update = () =>
      this.updateSingleControlDomState(control, elements, mapping, container, externalInstances);

    combinedSubscription.add(control.valueChanges.subscribe(update));
    combinedSubscription.add(control.statusChanges.subscribe(update));

    return combinedSubscription;
  }

  /**
   * Actualiza estado del DOM (valor, disabled, clases de validación,
   * controles especiales y mensaje de error) a partir del estado actual del control.
   */
  public updateSingleControlDomState(
    control: AbstractControl,
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
    container: HTMLElement,
    externalInstances: Map<string, any>,
  ): void {
    if (elements.length === 0) return;

    const isDisabled = control.disabled;
    const isInvalid = control.invalid && (control.dirty || control.touched);
    const isValid = control.valid && (control.dirty || control.touched);
    const value = control.value;

    elements.forEach((el) => {
      this.applyValueToElement(el, value, mapping, externalInstances);
      this.renderer.setProperty(el, 'disabled', isDisabled);
      this.applyValidationClasses(el, isDisabled, isInvalid, isValid);
      this.specialControls.updateSpecialElements(el, value, mapping, container);
    });

    this.updateErrorMessages(control, mapping, container);
  }

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

  private getSelectValue(select: HTMLSelectElement): any {
    if (select.multiple) {
      return Array.from(select.selectedOptions).map((option) => option.value);
    }
    return select.value;
  }

  private getToggleValue(el: HTMLElement, mapping: FormFieldMapping): any {
    const config = mapping.toggleConfig!;
    const isChecked =
      el.classList.contains(config.checkedClass || 'active') ||
      el.getAttribute('aria-checked') === 'true' ||
      el.hasAttribute('checked');

    return isChecked ? config.trueValue ?? true : config.falseValue ?? false;
  }

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

  private valuesEqual(a: any, b: any): boolean {
    if (Array.isArray(a) && Array.isArray(b)) {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return a === b;
  }

  private applyValueToElement(
    el: HTMLElement,
    value: any,
    mapping: FormFieldMapping,
    externalInstances: Map<string, any>,
  ): void {
    if (mapping.valueProperty) {
      this.renderer.setProperty(el, mapping.valueProperty, value);
    } else if (el instanceof HTMLInputElement) {
      this.applyInputValue(el, value);
    } else if (el instanceof HTMLSelectElement) {
      this.applySelectValue(el, value);
    } else if (el instanceof HTMLTextAreaElement) {
      this.renderer.setProperty(el, 'value', value ?? '');
    } else if (mapping.toggleConfig) {
      this.applyToggleValue(el, value, mapping);
    }

    if (mapping.richTextConfig || (mapping.dateTimeConfig?.pickerType && mapping.dateTimeConfig.pickerType !== 'native')) {
      this.specialControls.updateExternalWidgets(mapping, value, externalInstances);
    }
  }

  private applyInputValue(input: HTMLInputElement, value: any): void {
    switch (input.type) {
      case 'checkbox':
        this.renderer.setProperty(input, 'checked', !!value);
        break;
      case 'radio':
        this.renderer.setProperty(input, 'checked', input.value === value);
        break;
      case 'range':
      case 'number': {
        const numValue = value != null ? value : '';
        if (input.value !== String(numValue)) {
          this.renderer.setProperty(input, 'value', numValue);
        }
        break;
      }
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

  private applySelectValue(select: HTMLSelectElement, value: any): void {
    if (select.multiple && Array.isArray(value)) {
      Array.from(select.options).forEach((option) => {
        this.renderer.setProperty(option, 'selected', value.includes(option.value));
      });
    } else {
      this.renderer.setProperty(select, 'value', value ?? '');
    }
  }

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

  private applyValidationClasses(el: HTMLElement, isDisabled: boolean, isInvalid: boolean, isValid: boolean): void {
    this.ERROR_CLASSES.forEach((cls) => this.renderer.removeClass(el, cls));
    this.SUCCESS_CLASSES.forEach((cls) => this.renderer.removeClass(el, cls));
    this.renderer.removeClass(el, 'disabled');

    if (isDisabled) {
      this.renderer.addClass(el, 'disabled');
    } else if (isInvalid) {
      this.ERROR_CLASSES.forEach((cls) => this.renderer.addClass(el, cls));
    } else if (isValid) {
      this.SUCCESS_CLASSES.forEach((cls) => this.renderer.addClass(el, cls));
    }
  }

  private updateErrorMessages(control: AbstractControl, mapping: FormFieldMapping, container: HTMLElement): void {
    if (!mapping.errorDisplaySelector) return;

    const errorEl = container.querySelector(mapping.errorDisplaySelector);
    if (!(errorEl instanceof HTMLElement)) return;

    const isInvalid = control.invalid && (control.dirty || control.touched);

    if (isInvalid && control.errors) {
      const firstErrorKey = Object.keys(control.errors)[0].toLowerCase();

      const apiCustomMessage = mapping.validatorConfig?.find(
        (v) => v.type.toLowerCase() === firstErrorKey,
      )?.message;

      const globalDefaultMessage = this.config?.defaultErrorMessages?.[firstErrorKey];

      const finalMessage =
        apiCustomMessage ||
        globalDefaultMessage ||
        SYSTEM_DEFAULT_ERROR_MESSAGES[firstErrorKey] ||
        SYSTEM_DEFAULT_ERROR_MESSAGES['generic'];

      this.renderer.setProperty(errorEl, 'textContent', finalMessage);
    } else {
      this.renderer.setProperty(errorEl, 'textContent', '');
    }
  }
}
