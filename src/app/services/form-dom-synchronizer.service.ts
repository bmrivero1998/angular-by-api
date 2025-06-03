import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { FormGroup, FormControl, AbstractControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { FormFieldMapping } from '../models/form-field-mapping.model'; // Ajusta la ruta

interface ManagedFormInstance {
  formGroup: FormGroup;
  formContainer: HTMLElement;
  fieldMappings: FormFieldMapping[];
  subscriptions: Subscription;
  domListeners: Array<() => void>;
}

@Injectable({
  providedIn: 'root'
})
export class FormDomSynchronizerService {
  private renderer: Renderer2;
  private managedForms = new Map<string, ManagedFormInstance>();

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
    fieldMappings: FormFieldMapping[]
  ): void {
    this.disconnect(formInstanceId); // Limpia conexiones previas para este ID específico

    const instanceSubscriptions = new Subscription();
    const instanceDomListeners: Array<() => void> = [];

    fieldMappings.forEach(mapping => {
      const control = formGroup.get(mapping.controlName) as FormControl | null;
      const elements = formContainer.querySelectorAll(mapping.domSelector) as NodeListOf<HTMLElement>;

      if (!control) {
        console.warn(`SYNC_SVC (${formInstanceId} - ${mapping.controlName}): FormControl no encontrado.`);
        return;
      }
      if (elements.length === 0) {
        console.warn(`SYNC_SVC (${formInstanceId} - ${mapping.controlName}): Elemento DOM no encontrado con selector "${mapping.domSelector}".`);
        return;
      }

      // 1. Configurar listeners del DOM para actualizar el FormGroup (DOM -> FormGroup)
      const domToFormListeners = this.setupDomToFormSync(control, elements, mapping);
      instanceDomListeners.push(...domToFormListeners);

      // 2. Configurar suscripciones al FormGroup para actualizar el DOM (FormGroup -> DOM)
      const formToDomSubscriptions = this.setupFormToDomSync(control, elements, mapping, formContainer);
      instanceSubscriptions.add(formToDomSubscriptions);
      
      // 3. Aplicar el estado inicial completo del FormControl al DOM
      this.updateSingleControlDomState(control, elements, mapping, formContainer);
      
      // 4. (Opcional) Forzar una emisión de statusChanges para asegurar que todo se actualice si es necesario
       control.updateValueAndValidity({ emitEvent: true });
    });

    this.managedForms.set(formInstanceId, {
      formGroup,
      formContainer,
      fieldMappings,
      subscriptions: instanceSubscriptions,
      domListeners: instanceDomListeners
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
    const firstElement = elements[0] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const eventToListen = mapping.eventType ||
                         (firstElement.type === 'checkbox' || firstElement.type === 'radio' ? 'change' : 'input');

    if (firstElement.type === 'radio') {
      elements.forEach(radioNode => {
        const radioElement = radioNode as HTMLInputElement;
        const listener = this.renderer.listen(radioElement, eventToListen, (event: Event) => {
          const targetRadio = event.target as HTMLInputElement;
          if (targetRadio.checked && control.value !== targetRadio.value) {
            control.setValue(targetRadio.value, { emitEvent: true });
          }
        });
        listeners.push(listener);
      });
    } else { // Checkbox, text, select, textarea
      const listener = this.renderer.listen(firstElement, eventToListen, (event: Event) => {
        const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        let value: any = target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;
        if (control.value !== value) {
          control.setValue(value, { emitEvent: true });
        }
      });
      listeners.push(listener);
    }
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
    formContainer: HTMLElement
  ): Subscription {
    const combinedSubscription = new Subscription();
    combinedSubscription.add(
      control.valueChanges.subscribe(() => {
        this.updateSingleControlDomState(control, elements, mapping, formContainer);
      })
    );
    combinedSubscription.add(
      control.statusChanges.subscribe(() => {
        this.updateSingleControlDomState(control, elements, mapping, formContainer);
      })
    );
    return combinedSubscription;
  }

  /**
   * Actualiza todos los aspectos visuales y funcionales del DOM para un control específico
   * basándose en el estado actual del AbstractControl.
   */
  private updateSingleControlDomState(
    control: AbstractControl,
    elements: NodeListOf<HTMLElement>,
    mapping: FormFieldMapping,
    formContainer: HTMLElement
  ): void {
    if (elements.length === 0) return;
    const firstElement = elements[0] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

    // A. Actualizar Valor del DOM
    if (firstElement.type === 'radio') {
      elements.forEach(radioNode => {
        const radioElement = radioNode as HTMLInputElement;
        this.renderer.setProperty(radioElement, 'checked', radioElement.value === control.value);
      });
    } else if (firstElement.type === 'checkbox') {
      this.renderer.setProperty(firstElement, 'checked', !!control.value);
    } else {
      // Solo actualizar si es diferente para evitar quitar foco innecesariamente en algunos navegadores/casos
      if (firstElement.value !== control.value) {
         this.renderer.setProperty(firstElement, 'value', control.value === null || control.value === undefined ? '' : control.value);
      }
    }

    // B. Actualizar Estado Habilitado/Deshabilitado y Clases/ARIA de Validación
    const isDisabled = control.disabled;
    const isInvalidAndInteracted = control.invalid && (control.dirty || control.touched);
    const isValidAndInteracted = control.valid && (control.dirty || control.touched);

    elements.forEach(el => {
      this.renderer.setProperty(el, 'disabled', isDisabled);
      this.renderer.setAttribute(el, 'aria-disabled', isDisabled.toString());
      this.renderer.setAttribute(el, 'aria-invalid', isInvalidAndInteracted.toString());

      if (isDisabled) {
        this.renderer.addClass(el, 'disabled');
        this.renderer.removeClass(el, 'is-invalid');
        this.renderer.removeClass(el, 'is-valid');
      } else {
        this.renderer.removeClass(el, 'disabled');
        if (isInvalidAndInteracted) {
          this.renderer.addClass(el, 'is-invalid');
          this.renderer.removeClass(el, 'is-valid');
        } else if (isValidAndInteracted) {
          this.renderer.addClass(el, 'is-valid');
          this.renderer.removeClass(el, 'is-invalid');
        } else {
          this.renderer.removeClass(el, 'is-invalid');
          this.renderer.removeClass(el, 'is-valid');
        }
      }
    });

    // C. Actualizar Mensajes de Error Textuales
    if (mapping.errorDisplaySelector) {
      const errorElement = formContainer.querySelector(mapping.errorDisplaySelector) as HTMLElement | null;
      if (errorElement) {
        if (isInvalidAndInteracted) {
          let errorMessage = 'Entrada inválida.'; // Default
          if (control.errors) {
            const firstErrorKey = Object.keys(control.errors)[0];
            const validatorDef = mapping.validatorConfig?.find(v => v.type.toLowerCase() === firstErrorKey.toLowerCase());
            if (validatorDef && validatorDef.message) {
              errorMessage = validatorDef.message;
            } else {
              if (firstErrorKey === 'required') errorMessage = 'Este campo es obligatorio.';
              else if (firstErrorKey === 'email') errorMessage = 'Formato de email incorrecto.';
              else if (firstErrorKey === 'minlength') errorMessage = `Mínimo ${control.errors['minlength']?.requiredLength} caracteres.`;
              else if (firstErrorKey === 'maxlength') errorMessage = `Máximo ${control.errors['maxlength']?.requiredLength} caracteres.`;
              else if (firstErrorKey === 'pattern') errorMessage = 'El formato no es válido.';
              else if (firstErrorKey === 'requiredtrue') errorMessage = 'Debes seleccionar esta opción.';
              else errorMessage = `Error: ${firstErrorKey}`;
            }
          }
          this.renderer.setProperty(errorElement, 'textContent', errorMessage);
        } else {
          this.renderer.setProperty(errorElement, 'textContent', '');
        }
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
      instance.domListeners.forEach(unlistenFn => unlistenFn());
      this.managedForms.delete(formInstanceId);
    }
  }

  /**
   * Desconecta todos los formularios gestionados.
   */
  public disconnectAll(): void {
    this.managedForms.forEach((instance, id) => {
      instance.subscriptions.unsubscribe();
      instance.domListeners.forEach(unlistenFn => unlistenFn());
    });
    this.managedForms.clear();
  }

  /**
   * Fuerza una re-sincronización del DOM para un formulario específico.
   */
  public forceDomUpdateForForm(formInstanceId: string): void {
    const instance = this.managedForms.get(formInstanceId);
    if (instance) {
      instance.fieldMappings.forEach(mapping => {
        const control = instance.formGroup.get(mapping.controlName) as FormControl | null;
        const elements = instance.formContainer.querySelectorAll(mapping.domSelector) as NodeListOf<HTMLElement>;
        if (control && elements.length > 0) {
          this.updateSingleControlDomState(control, elements, mapping, instance.formContainer);
        }
      });
    } else {
      console.warn(`SYNC_SVC: No se encontró instancia "${formInstanceId}" para forzar actualización.`);
    }
  }
}