import { inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { AbstractControl, FormControl, ValidationErrors } from '@angular/forms';
import { Subscription } from 'rxjs';
import { FormFieldMapping } from '../../models/form-field-mapping.model';
import { DYNAMIC_CONFIG } from '../../config/dynamic-config.token';
import { FormSpecialControlsService } from '../controls/form-special-controls.service';
import { InputMaskingService } from '../controls/input-masking.service';

/** Mensajes de último recurso, indexados por la clave del error en minúsculas. */
const SYSTEM_DEFAULT_ERROR_MESSAGES: Record<string, string> = {
  required: 'Este campo es obligatorio.',
  email: 'Formato de correo inválido.',
  minlength: 'El texto es muy corto.',
  maxlength: 'El texto es muy largo.',
  pattern: 'El formato no es válido.',
  min: 'El valor es menor al mínimo permitido.',
  max: 'El valor es mayor al máximo permitido.',
  matchvalue: 'El valor no es el esperado.',
  matchcontrol: 'Los valores no coinciden.',
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
  private inputMasking = inject(InputMaskingService);

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
          // Mismo criterio que resolveValidator: el tipo no distingue mayúsculas.
          switch (validator.type.toLowerCase()) {
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
            case 'minlength':
              // Con máscara, el validador mide el valor limpio (sin literales)
              // y el atributo nativo mediría el texto con guiones/paréntesis:
              // truncaría lo que el usuario escribe. El largo lo da la máscara.
              if (!mapping.inputMask) this.renderer.setAttribute(el, 'minlength', String(validator.value));
              break;
            case 'maxlength':
              if (!mapping.inputMask) this.renderer.setAttribute(el, 'maxlength', String(validator.value));
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
        // Un radio que se desmarca (perdió el check frente a otro del mismo
        // grupo) no debe "vaciar" el control: solo el radio que SÍ quedó
        // marcado es la fuente de verdad del nuevo valor.
        if (!mapping.valueProperty && el instanceof HTMLInputElement && el.type === 'radio' && !el.checked) {
          return;
        }

        let newValue: any;

        if (mapping.valueProperty) {
          newValue = mapping.useEventDetail
            ? (event as CustomEvent).detail
            : (event.target as Record<string, any>)[mapping.valueProperty];
        } else if (el instanceof HTMLInputElement && this.isMaskable(el, mapping)) {
          newValue = this.applyMaskToInput(el, mapping.inputMask!);
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
          // Un cambio hecho por el usuario ensucia el control (igual que hace
          // Angular con sus ControlValueAccessor). Va DESPUÉS de setValue:
          // markAsDirty refresca el DOM, y antes de setValue reescribiría el
          // input con el valor viejo.
          control.markAsDirty();
        }
      });
      listeners.push(unlisten);

      // Salir del campo lo marca como tocado: es lo que permite mostrar el
      // error de un campo obligatorio que el usuario dejó vacío.
      listeners.push(
        this.renderer.listen(el, 'blur', () => {
          if (!control.touched) control.markAsTouched();
        }),
      );
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
    const update = () =>
      this.updateSingleControlDomState(control, elements, mapping, container, externalInstances);

    // `events` unifica valor, estado, touched y pristine. Con solo
    // valueChanges/statusChanges el DOM no se enteraba de markAsTouched /
    // markAllAsTouched (p. ej. tras un submit inválido) y los errores no se pintaban.
    return control.events.subscribe(update);
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
      if (isInvalid) {
        this.renderer.setAttribute(el, 'aria-invalid', 'true');
      } else {
        this.renderer.removeAttribute(el, 'aria-invalid');
      }
      this.specialControls.updateSpecialElements(el, value, mapping, container);
    });

    this.updateErrorMessages(control, mapping, container);
  }

  /**
   * Si el control no tiene valor propio (ni `defaultValue` ni datos
   * iniciales), adopta el que ya trae el HTML: `checked`, `<option selected>`,
   * `value="..."`. Sin esto, conectar el formulario borraba lo que el HTML
   * mostraba (un <select> quedaba en blanco y un checkbox valía '' en vez de
   * false).
   */
  public adoptInitialDomValue(
    control: AbstractControl,
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
  ): void {
    if (mapping.defaultValue !== undefined || mapping.valueProperty) return;
    if (control.value !== '' || control.dirty) return;

    const first = elements[0];
    let domValue: any;

    if (first instanceof HTMLInputElement) {
      if (first.type === 'file') return;
      if (first.type === 'radio') {
        const checked = Array.from(elements).find(
          (el): el is HTMLInputElement => el instanceof HTMLInputElement && el.checked,
        );
        if (!checked) return;
        domValue = checked.value;
      } else if (this.isMaskable(first, mapping)) {
        domValue = this.inputMasking.applyMask(first.value, mapping.inputMask!).clean;
      } else {
        domValue = this.getInputValue(first, mapping);
      }
    } else if (first instanceof HTMLSelectElement) {
      domValue = this.getSelectValue(first);
    } else if (first instanceof HTMLTextAreaElement) {
      domValue = first.value;
    } else {
      return;
    }

    if (domValue === '' || domValue === null || domValue === undefined) return;
    control.setValue(domValue, { emitEvent: false });
  }

  /** La máscara solo aplica a inputs de texto (no a checkbox, number, date...). */
  private isMaskable(input: HTMLInputElement, mapping: FormFieldMapping): boolean {
    return !!mapping.inputMask && ['text', 'tel', 'search', 'password', ''].includes(input.type);
  }

  /**
   * Reformatea el input según la máscara, conserva la posición del cursor y
   * devuelve el valor limpio (sin literales), que es el que guarda el control
   * y el que ven los validadores.
   */
  private applyMaskToInput(input: HTMLInputElement, mask: string): string {
    const raw = input.value;
    const caret = input.selectionStart;
    const { formatted, clean } = this.inputMasking.applyMask(raw, mask);

    if (raw !== formatted) {
      input.value = formatted;
      if (caret !== null) {
        const position = this.inputMasking.computeCaretPosition(raw, caret, formatted);
        try {
          input.setSelectionRange(position, position);
        } catch {
          // Algunos tipos de input no admiten selección; no es un error.
        }
      }
    }

    return clean;
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
    } else if (el instanceof HTMLInputElement && this.isMaskable(el, mapping)) {
      // El control guarda el valor limpio; el input muestra el formateado.
      const formatted = this.inputMasking.applyMask(String(value ?? ''), mapping.inputMask!).formatted;
      if (el.value !== formatted) {
        this.renderer.setProperty(el, 'value', formatted);
      }
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
      case 'file':
        // Un input de archivo no admite que se le asigne un valor (lanza
        // InvalidStateError); lo único permitido es vaciarlo.
        if (value == null && input.value !== '') {
          this.renderer.setProperty(input, 'value', '');
        }
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
      const finalMessage = this.resolveErrorMessage(control.errors, mapping);

      this.renderer.setProperty(errorEl, 'textContent', finalMessage);
    } else {
      this.renderer.setProperty(errorEl, 'textContent', '');
    }
  }

  /**
   * Elige el mensaje del primer error del control. Prioridad: mensaje del
   * validador en el JSON > mensaje del validador asíncrono > mensaje que trae
   * el propio error (archivos) > `defaultErrorMessages` global > genérico.
   *
   * Se busca por la CLAVE del error que reporta Angular, que no siempre
   * coincide con el `type` del JSON: `requiredTrue` reporta `required`.
   */
  private resolveErrorMessage(errors: ValidationErrors, mapping: FormFieldMapping): string {
    const errorKey = Object.keys(errors)[0];
    const key = errorKey.toLowerCase();

    const fromValidatorConfig = mapping.validatorConfig?.find((v) => {
      const type = v.type.toLowerCase();
      return type === key || (key === 'required' && type === 'requiredtrue');
    })?.message;

    const fromAsyncValidator =
      mapping.asyncValidator?.errorKey.toLowerCase() === key ? mapping.asyncValidator.message : undefined;

    const errorValue = errors[errorKey];
    const fromErrorItself =
      Array.isArray(errorValue) && typeof errorValue[0] === 'string' ? errorValue[0] : undefined;

    const defaults = this.config?.defaultErrorMessages;

    return (
      fromValidatorConfig ||
      fromAsyncValidator ||
      fromErrorItself ||
      defaults?.[key] ||
      defaults?.[errorKey] ||
      SYSTEM_DEFAULT_ERROR_MESSAGES[key] ||
      defaults?.['generic'] ||
      SYSTEM_DEFAULT_ERROR_MESSAGES['generic']
    );
  }
}
