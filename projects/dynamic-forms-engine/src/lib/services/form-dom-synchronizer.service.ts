import { inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { FormGroup, FormControl, AbstractControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { FormFieldMapping } from '../models/form-field-mapping.model'; // Ajusta la ruta
import { DYNAMIC_CONFIG } from '../dynamic-config.token';

interface ManagedFormInstance {
  formGroup: FormGroup;
  formContainer: HTMLElement;
  fieldMappings: FormFieldMapping[];
  subscriptions: Subscription;
  domListeners: Array<() => void>;
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
   * Conecta un FormGroup de Angular con elementos del DOM dentro de un contenedor,
   * asociándolo a un formInstanceId único.
   */
  public connect(
    formInstanceId: string,
    formGroup: FormGroup,
    formContainer: HTMLElement,
    fieldMappings: FormFieldMapping[],
  ): void {
    this.disconnect(formInstanceId); // Limpia conexiones previas para este ID específico

    const instanceSubscriptions = new Subscription();
    const instanceDomListeners: Array<() => void> = [];

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
        console.warn(
          `SYNC_SVC (${formInstanceId} - ${mapping.controlName}): Elemento DOM no encontrado con selector "${mapping.domSelector}".`,
        );
        return;
      }

      // 1. Configurar listeners del DOM para actualizar el FormGroup (DOM -> FormGroup)
      const domToFormListeners = this.setupDomToFormSync(
        control,
        elements,
        mapping,
      );
      instanceDomListeners.push(...domToFormListeners);

      // 2. Configurar suscripciones al FormGroup para actualizar el DOM (FormGroup -> DOM)
      const formToDomSubscriptions = this.setupFormToDomSync(
        control,
        elements,
        mapping,
        formContainer,
      );
      instanceSubscriptions.add(formToDomSubscriptions);

      // 3. Aplicar el estado inicial completo del FormControl al DOM
      this.updateSingleControlDomState(
        control,
        elements,
        mapping,
        formContainer,
      );

      // 4. (Opcional) Forzar una emisión de statusChanges para asegurar que todo se actualice si es necesario
      control.updateValueAndValidity({ emitEvent: true });
    });

    this.managedForms.set(formInstanceId, {
      formGroup,
      formContainer,
      fieldMappings,
      subscriptions: instanceSubscriptions,
      domListeners: instanceDomListeners,
    });
  }

  /**
   * Configura los event listeners en los elementos del DOM para actualizar el FormControl.
   * (DOM -> FormGroup)
   */
  private setupDomToFormSync(
    control: FormControl,
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping
  ): Array<() => void> {
    const listeners: Array<() => void> = [];
    
    elements.forEach((el) => {
      // Determinamos el evento: Prioridad al configurado, luego al tipo de input
      const eventToListen = mapping.eventType || (
        el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
          ? 'change'
          : 'input'
      );

      const unlisten = this.renderer.listen(el, eventToListen, (event: Event) => {
        let newValue: any;

        // RUTA A: Web Component (Prioridad)
        if (mapping.valueProperty) {
          newValue = mapping.useEventDetail 
            ? (event as CustomEvent).detail 
            : (event.target as Record<string, any>)[mapping.valueProperty];
        } 
        // RUTA B: Elementos estándar (HTML5)
        else if (el instanceof HTMLInputElement) {
          if (el.type === 'checkbox') newValue = el.checked;
          else if (el.type === 'radio') {
            if (el.checked) newValue = el.value;
            else return;
          } else newValue = el.value;
        } else if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
          newValue = el.value;
        }

        if (control.value !== newValue) {
          control.setValue(newValue, { emitEvent: true });
        }
      });
      listeners.push(unlisten);
    });

    return listeners;
  }

  /**
   * Configura las suscripciones a valueChanges y statusChanges del FormControl
   * para llamar a updateSingleControlDomState.
   * (FormGroup -> DOM)
   */
  private setupFormToDomSync(
    control: AbstractControl, // Usar AbstractControl aquí es más general
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
    formContainer: HTMLElement,
  ): Subscription {
    const combinedSubscription = new Subscription();
    combinedSubscription.add(
      control.valueChanges.subscribe(() => {
        this.updateSingleControlDomState(
          control,
          elements,
          mapping,
          formContainer,
        );
      }),
    );
    combinedSubscription.add(
      control.statusChanges.subscribe(() => {
        this.updateSingleControlDomState(
          control,
          elements,
          mapping,
          formContainer,
        );
      }),
    );
    return combinedSubscription;
  }

 /**
   * Actualiza el estado visual (valor, clases de validación y estado habilitado)
   * de los elementos del DOM asociados a un control.
   * [PRO] Soporta Web Components y múltiples clases de Frameworks (Tailwind/Bootstrap).
   */
  private updateSingleControlDomState(
    control: AbstractControl,
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
    formContainer: HTMLElement
  ): void {
    if (elements.length === 0) return;

    const isDisabled = control.disabled;
    const isInvalid = control.invalid && (control.dirty || control.touched);
    const isValid = control.valid && (control.dirty || control.touched);

    elements.forEach((el) => {
      if (mapping.valueProperty) {
        this.renderer.setProperty(el, mapping.valueProperty, control.value);
      } else if (el instanceof HTMLInputElement) {
        if (el.type === 'radio') {
          this.renderer.setProperty(el, 'checked', el.value === control.value);
        } else if (el.type === 'checkbox') {
          this.renderer.setProperty(el, 'checked', !!control.value);
        } else if (el.value !== control.value) {
          this.renderer.setProperty(el, 'value', control.value ?? '');
        }
      } else if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        if (el.value !== control.value) {
          this.renderer.setProperty(el, 'value', control.value ?? '');
        }
      }

      this.renderer.setProperty(el, 'disabled', isDisabled);
      
      this.ERROR_CLASSES.forEach(cls => this.renderer.removeClass(el, cls));
      this.SUCCESS_CLASSES.forEach(cls => this.renderer.removeClass(el, cls));
      this.renderer.removeClass(el, 'disabled');

      if (isDisabled) {
        this.renderer.addClass(el, 'disabled');
      } else {
        if (isInvalid) {
          this.ERROR_CLASSES.forEach(cls => this.renderer.addClass(el, cls));
        } else if (isValid) {
          this.SUCCESS_CLASSES.forEach(cls => this.renderer.addClass(el, cls));
        }
      }
    });

    this.updateErrorMessages(control, mapping, formContainer);
  }

  /**
   * Actualiza los mensajes de error para un control de formulario específico.
   * * Busca el elemento HTML designado para mostrar errores (según el selector proporcionado
   * en el mapping) y actualiza su contenido textual basándose en el estado de validación
   * del control. Solo muestra mensajes cuando el control es inválido y ha sido interactuado.
   * * @param control - Control del formulario cuyo estado de validación se evalúa.
   * @param mapping - Configuración de mapeo con selectores y validadores.
   * @param container - Elemento HTML contenedor donde se buscará el display de errores.
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
   * Desconecta un formulario específico gestionado por este servicio.
   */
  public disconnect(formInstanceId: string): void {
    const instance = this.managedForms.get(formInstanceId);
    if (instance) {
      instance.subscriptions.unsubscribe();
      instance.domListeners.forEach((unlistenFn) => unlistenFn());
      this.managedForms.delete(formInstanceId);
    }
  }

  /**
   * Desconecta todos los formularios gestionados.
   */
  public disconnectAll(): void {
    this.managedForms.forEach((instance, id) => {
      instance.subscriptions.unsubscribe();
      instance.domListeners.forEach((unlistenFn) => unlistenFn());
    });
    this.managedForms.clear();
  }

  /**
   * Fuerza una re-sincronización del DOM para un formulario específico.
   */
  public forceDomUpdateForForm(formInstanceId: string): void {
    const instance = this.managedForms.get(formInstanceId);
    if (instance) {
      instance.fieldMappings.forEach((mapping) => {
        const control = instance.formGroup.get(
          mapping.controlName,
        ) as FormControl | null;
        const elements = instance.formContainer.querySelectorAll(
          mapping.domSelector,
        ) as NodeListOf<HTMLElement>;
        if (control && elements.length > 0) {
          this.updateSingleControlDomState(
            control,
            elements,
            mapping,
            instance.formContainer,
          );
        }
      });
    } else {
      console.warn(
        `SYNC_SVC: No se encontró instancia "${formInstanceId}" para forzar actualización.`,
      );
    }
  }
}
