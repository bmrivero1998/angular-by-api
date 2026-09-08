import { inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { Subscription, debounceTime } from 'rxjs';
import { FormFieldMapping } from '../models/form-field-mapping.model';
import { DYNAMIC_CONFIG } from '../dynamic-config.token';

const VISIBILITY_CONTAINER_SELECTORS = [
  '.form-group',
  '.input-group',
  '.col-md-6', '.col-12', '.col-sm-6', '.col-lg-4',
  '.mb-3', '.mb-4',
  '.field-container',
  '[id*="section"]',
  '[id*="group"]',
  '.card-body',
  '.row > div',
];

/**
 * Motor de lógica condicional del formulario: evalúa `showIf`/`hideIf` sobre
 * el FormGroup y aplica (o retira) la visibilidad de los campos en el DOM.
 */
@Injectable({
  providedIn: 'root',
})
export class FormConditionalLogicService {
  private renderer: Renderer2;
  private config = inject(DYNAMIC_CONFIG, { optional: true });

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  /**
   * Suscribe el FormGroup para reevaluar visibilidad ante cada cambio y
   * aplica el estado inicial. Devuelve la suscripción para que el llamador
   * la administre.
   */
  public setupConditionalLogic(
    formGroup: FormGroup,
    container: HTMLElement,
    mappings: FormFieldMapping[],
  ): Subscription {
    const logicSubscription = new Subscription();

    const conditionalMappings = mappings.filter((m) => m.showIf || m.hideIf);
    if (conditionalMappings.length === 0) {
      return logicSubscription;
    }

    const evaluateAndApplyVisibility = () => {
      const formValues = formGroup.getRawValue();

      conditionalMappings.forEach((mapping) => {
        const control = formGroup.get(mapping.controlName);
        if (!control) return;

        const element = container.querySelector(mapping.domSelector) as HTMLElement;
        if (!element) return;

        const target = this.findVisibilityTarget(element, mapping);
        if (!target) return;

        let shouldBeVisible = true;
        if (mapping.showIf) {
          shouldBeVisible = this.evaluateExpression(mapping.showIf, formValues, formGroup);
        } else if (mapping.hideIf) {
          shouldBeVisible = !this.evaluateExpression(mapping.hideIf, formValues, formGroup);
        }

        this.applyVisibility(control, target, shouldBeVisible, mapping);
      });
    };

    logicSubscription.add(
      formGroup.valueChanges
        .pipe(debounceTime(this.config?.conditionalDebounceTime || 50))
        .subscribe(() => evaluateAndApplyVisibility()),
    );

    setTimeout(() => evaluateAndApplyVisibility(), 0);

    return logicSubscription;
  }

  /**
   * Encuentra el elemento objetivo para aplicar visibilidad
   */
  public findVisibilityTarget(element: HTMLElement, mapping: FormFieldMapping): HTMLElement | null {
    // Prioridad: selector personalizado > group > contenedores comunes > elemento mismo
    if (mapping.visibilityGroup) {
      const groupElement = element.closest(`[data-visibility-group="${mapping.visibilityGroup}"]`);
      if (groupElement) return groupElement as HTMLElement;
    }

    for (const selector of VISIBILITY_CONTAINER_SELECTORS) {
      const container = element.closest(selector);
      if (container) {
        return container as HTMLElement;
      }
    }

    return element;
  }

  /**
   * Aplica visibilidad al elemento
   */
  private applyVisibility(
    control: AbstractControl,
    element: HTMLElement,
    shouldBeVisible: boolean,
    mapping: FormFieldMapping,
  ): void {
    const currentlyVisible = element.style.display !== 'none';

    if (shouldBeVisible === currentlyVisible) return;

    if (shouldBeVisible) {
      this.renderer.removeStyle(element, 'display');
      this.renderer.removeClass(element, 'hidden');
      this.renderer.removeClass(element, 'd-none');
      this.renderer.setAttribute(element, 'aria-hidden', 'false');

      if (control.disabled && !mapping.alwaysDisabled) {
        control.enable({ emitEvent: false, onlySelf: true });
      }
    } else {
      this.renderer.setStyle(element, 'display', 'none');
      this.renderer.addClass(element, 'hidden');
      this.renderer.setAttribute(element, 'aria-hidden', 'true');

      if (control.enabled) {
        control.disable({ emitEvent: false, onlySelf: true });
      }

      if (this.config?.clearHiddenFields) {
        control.setValue(null, { emitEvent: false });
      }
    }

    if (this.config?.emitVisibilityEvents) {
      const event = new CustomEvent('field-visibility-change', {
        detail: {
          controlName: mapping.controlName,
          visible: shouldBeVisible,
          element,
        },
        bubbles: true,
      });
      element.dispatchEvent(event);
    }
  }

  /**
   * Evaluador seguro de expresiones JS para formularios (showIf/hideIf)
   */
  private evaluateExpression(expression: string, context: any, formGroup?: FormGroup): boolean {
    try {
      if (formGroup) {
        const formValues = formGroup.getRawValue();

        const formHelpers = {
          getControl: (controlName: string) => formGroup.get(controlName)?.value,
          hasValue: (controlName: string) => {
            const val = formGroup.get(controlName)?.value;
            return val !== null && val !== undefined && val !== '';
          },
          isValue: (controlName: string, expectedValue: any) => {
            return formGroup.get(controlName)?.value === expectedValue;
          },
          greaterThan: (controlName: string, min: number) => {
            const val = formGroup.get(controlName)?.value;
            return typeof val === 'number' && val > min;
          },
          isValid: (controlName: string) => {
            const control = formGroup.get(controlName);
            return control?.valid && (control?.dirty || control?.touched);
          },
        };

        const evalContext = {
          ...formValues,
          ...formHelpers,
          ...this.createSafePropertyAccess(formValues),
        };

        return this.executeExpression(expression, evalContext);
      }

      return this.executeExpression(expression, context);
    } catch (error) {
      console.error(`Error evaluando expresión "${expression}":`, error);
      return false;
    }
  }

  /**
   * Crea acceso seguro a propiedades del formulario
   */
  private createSafePropertyAccess(formValues: any): any {
    const result: any = {};

    Object.keys(formValues).forEach((key) => {
      if (!result[key]) {
        result[key] = formValues[key];
      }
    });

    return result;
  }

  /**
   * Ejecuta la expresión de forma segura
   */
  private executeExpression(expression: string, context: any): boolean {
    try {
      const cleanedExpr = expression.trim();

      const variableRegex = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
      const variables = cleanedExpr.match(variableRegex) || [];

      const keys = [...new Set(variables)];
      const values = keys.map((key) => (context[key] !== undefined ? context[key] : undefined));

      const helpers = {
        isEmpty: (val: any) => val == null || val === '' || (Array.isArray(val) && val.length === 0),
        isNotEmpty: (val: any) => !(val == null || val === '' || (Array.isArray(val) && val.length === 0)),
        includes: (arr: any[], val: any) => Array.isArray(arr) && arr.includes(val),
        equals: (a: any, b: any) => a === b,
        notEquals: (a: any, b: any) => a !== b,
        gt: (a: number, b: number) => a > b,
        lt: (a: number, b: number) => a < b,
        gte: (a: number, b: number) => a >= b,
        lte: (a: number, b: number) => a <= b,
        hasValue: (val: any) => val !== null && val !== undefined && val !== '',
        isChecked: (val: any) => val === true || val === 'true',
        isSelected: (val: any) => val && val !== '',
      };

      const allKeys = [...keys, ...Object.keys(helpers)];
      const allValues = [...values, ...Object.values(helpers)];

      const fn = new Function(...allKeys, `return (${cleanedExpr});`);
      const result = fn(...allValues);

      return Boolean(result);
    } catch (error) {
      console.error(`Error ejecutando expresión "${expression}":`, error);
      return false;
    }
  }
}
