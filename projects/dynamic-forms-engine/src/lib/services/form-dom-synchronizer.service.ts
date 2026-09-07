import { inject, Injectable } from '@angular/core';
import { FormGroup, FormControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { FormFieldMapping } from '../models/form-field-mapping.model';
import { FormConditionalLogicService } from './form-conditional-logic.service';
import { FormSpecialControlsService } from './form-special-controls.service';
import { FormDomValueSyncService } from './form-dom-value-sync.service';

interface ManagedFormInstance {
  formGroup: FormGroup;
  formContainer: HTMLElement;
  fieldMappings: FormFieldMapping[];
  subscriptions: Subscription;
  domListeners: Array<() => void>;
  externalInstances: Map<string, any>;
}

/**
 * Orquestador de la sincronización DOM <-> FormGroup. Delega cada
 * responsabilidad concreta a un servicio dedicado:
 * - FormConditionalLogicService: visibilidad condicional (showIf/hideIf).
 * - FormSpecialControlsService: editores/widgets externos (Quill, Flatpickr,
 *   reCAPTCHA, range/color/multi-select, autocomplete, password toggle).
 * - FormDomValueSyncService: lectura/escritura de valores y clases de
 *   validación entre el FormControl y el elemento del DOM.
 *
 * Este servicio solo administra el ciclo de vida de cada formulario
 * conectado (conexión, desconexión y forzado de actualización).
 */
@Injectable({
  providedIn: 'root',
})
export class FormDomSynchronizerService {
  private managedForms = new Map<string, ManagedFormInstance>();

  private conditionalLogic = inject(FormConditionalLogicService);
  private specialControls = inject(FormSpecialControlsService);
  private valueSync = inject(FormDomValueSyncService);

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

    // PRIMERO: Configurar el motor de lógica condicional.
    // Se debe ejecutar antes de los listeners individuales.
    instanceSubscriptions.add(
      this.conditionalLogic.setupConditionalLogic(formGroup, formContainer, fieldMappings),
    );

    // LUEGO: Configurar los mappings individuales
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
          `SYNC_SVC (${formInstanceId} - ${mapping.controlName}): Elemento DOM no encontrado para el selector '${mapping.domSelector}'.`,
        );
        return;
      }

      // 1. Inicializar controles especiales ANTES de los listeners
      this.specialControls.initializeSpecialControls(elements, mapping, control, formContainer, externalInstances);

      // 2. Configurar atributos de validación nativos
      this.valueSync.setupNativeValidationAttributes(elements, mapping);

      // 3. Configurar listeners del DOM
      const domToFormListeners = this.valueSync.setupDomToFormSync(control, elements, mapping);
      instanceDomListeners.push(...domToFormListeners);

      // 4. Configurar suscripciones al FormGroup
      const formToDomSubscriptions = this.valueSync.setupFormToDomSync(
        control,
        elements,
        mapping,
        formContainer,
        externalInstances,
      );
      instanceSubscriptions.add(formToDomSubscriptions);

      // 5. Aplicar estado inicial
      this.valueSync.updateSingleControlDomState(control, elements, mapping, formContainer, externalInstances);

      // 6. Configurar autocomplete si existe
      if (mapping.autoCompleteConfig) {
        this.specialControls.setupAutocomplete(control, elements, mapping, formContainer, externalInstances);
      }

      // 7. Configurar password si existe
      if (mapping.passwordConfig) {
        this.specialControls.setupPasswordToggle(elements, mapping, formContainer);
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
   * Método auxiliar para forzar reevaluación de lógica condicional
   */
  public reevaluateConditionalLogic(formInstanceId: string): void {
    const instance = this.managedForms.get(formInstanceId);
    if (!instance) return;

    instance.formGroup.updateValueAndValidity({ onlySelf: false, emitEvent: true });
  }

  /**
   * Verifica si un campo es actualmente visible
   */
  public isFieldVisible(formInstanceId: string, controlName: string): boolean {
    const instance = this.managedForms.get(formInstanceId);
    if (!instance) return false;

    const mapping = instance.fieldMappings.find((m) => m.controlName === controlName);
    if (!mapping || (!mapping.showIf && !mapping.hideIf)) return true;

    const element = instance.formContainer.querySelector(mapping.domSelector) as HTMLElement;
    if (!element) return true;

    const target = this.conditionalLogic.findVisibilityTarget(element, mapping);
    return target ? target.style.display !== 'none' : true;
  }

  /**
   * Desconecta un formulario
   */
  public disconnect(formInstanceId: string): void {
    const instance = this.managedForms.get(formInstanceId);
    if (instance) {
      instance.subscriptions.unsubscribe();
      instance.domListeners.forEach((unlistenFn) => unlistenFn());
      this.specialControls.destroyExternalInstances(instance.externalInstances);
      this.managedForms.delete(formInstanceId);
    }
  }

  /**
   * Desconecta todos los formularios
   */
  public disconnectAll(): void {
    this.managedForms.forEach((_instance, id) => {
      this.disconnect(id);
    });
  }

  /**
   * Fuerza actualización del DOM
   */
  public forceDomUpdateForForm(formInstanceId: string): void {
    const instance = this.managedForms.get(formInstanceId);
    if (!instance) {
      console.warn(`SYNC_SVC (${formInstanceId}): No se encontró instancia para forzar la actualización.`);
      return;
    }

    instance.fieldMappings.forEach((mapping) => {
      const control = instance.formGroup.get(mapping.controlName) as FormControl | null;
      const elements = instance.formContainer.querySelectorAll(mapping.domSelector) as NodeListOf<HTMLElement>;
      if (control && elements.length > 0) {
        this.valueSync.updateSingleControlDomState(
          control,
          elements,
          mapping,
          instance.formContainer,
          instance.externalInstances,
        );
      }
    });
  }
}
