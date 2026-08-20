import { Injectable } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { ButtonConfig } from '../models/form-field-mapping.model';

/**
 * Toda la lógica de "¿este botón debe estar deshabilitado?" vivía mezclada
 * con caché de elementos DOM y con Renderer2 dentro del componente.
 * Aquí la separamos en dos capas:
 *   - evaluate(): pura, recibe un FormGroup y un ButtonConfig, regresa boolean.
 *   - El componente/otro servicio se encarga de aplicar `disabled` al DOM.
 */
@Injectable({ providedIn: 'root' })
export class ButtonStateService {
  /**
   * Evalúa si un botón debe estar deshabilitado según su `disableWhen`.
   * @param onUnknownCondition callback para reportar condiciones no reconocidas
   */
  evaluate(
    form: FormGroup,
    config: ButtonConfig,
    onUnknownCondition?: (msg: string) => void
  ): boolean {
    const condition = config.disableWhen;

    if (typeof condition === 'function') {
      return condition(form);
    }

    if (typeof condition !== 'string') {
      return false;
    }

    if (condition.includes(':')) {
      return this.evaluateControlCondition(form, condition, config.selector, onUnknownCondition);
    }

    const conditionMap: Record<string, boolean> = {
      formIsInvalid: form.invalid,
      formIsValid: form.valid,
      formIsPristine: form.pristine,
      formIsDirty: form.dirty,
      formIsTouched: form.touched,
      formIsUntouched: form.untouched,
      formIsPending: form.pending,
      alwaysDisable: true,
      neverDisable: false,
      formIsInvalidOrPristine: form.invalid || form.pristine,
      formIsEmpty: this.isFormEffectivelyEmpty(form),
      formIsNotEmpty: !this.isFormEffectivelyEmpty(form),
    };

    if (condition in conditionMap) {
      return conditionMap[condition];
    }

    onUnknownCondition?.(`Condición de 'disableWhen' desconocida: ${condition}`);
    return false;
  }

  /**
   * Un formulario se considera vacío si todos sus controles son
   * null, undefined o cadena vacía.
   */
  isFormEffectivelyEmpty(form: FormGroup): boolean {
    const values = form.getRawValue();
    return Object.values(values).every((v) => v === null || v === undefined || v === '');
  }

  private evaluateControlCondition(
    form: FormGroup,
    conditionString: string,
    buttonSelector: string,
    onUnknownCondition?: (msg: string) => void
  ): boolean {
    const [rawCondition, rawNames] = conditionString.split(':');
    const condition = rawCondition.trim();
    const controlNames = (rawNames || '').split(',').map((s) => s.trim());

    if (controlNames.length === 0 || controlNames[0] === '') {
      onUnknownCondition?.(
        `La condición '${condition}' requiere al menos un nombre de control para el botón '${buttonSelector}'.`
      );
      return true;
    }

    const controls: (AbstractControl | null)[] = controlNames.map((name) => {
      const control = form.get(name);
      if (!control) {
        onUnknownCondition?.(`Control '${name}' no encontrado para el botón '${buttonSelector}'.`);
      }
      return control;
    });

    const resolvedControls = controls.filter((c): c is AbstractControl => c !== null);
    if (resolvedControls.length !== controlNames.length) {
      return true; // deshabilitamos por seguridad si falta algún control
    }

    switch (condition) {
      case 'controlIsInvalid':
        return resolvedControls.some((c) => c.invalid);

      case 'controlIsValid':
        return resolvedControls.every((c) => c.valid);

      case 'controlIsEmpty':
        return resolvedControls.some((c) => !c.value);

      case 'controlIsNotEmpty':
        return resolvedControls.every((c) => !!c.value);

      case 'controlsDoNotMatch': {
        if (resolvedControls.length < 2) {
          onUnknownCondition?.(
            `La condición '${condition}' requiere dos controles para el botón '${buttonSelector}'.`
          );
          return true;
        }
        const [c1, c2] = resolvedControls;
        return c1.touched && c2.touched ? c1.value !== c2.value : false;
      }

      default:
        onUnknownCondition?.(`Condición de control desconocida: ${condition}`);
        return false;
    }
  }
}