import { inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { Subscription, debounceTime } from 'rxjs';
import { FormFieldMapping } from '../../models/form-field-mapping.model';
import { DYNAMIC_CONFIG } from '../../config/dynamic-config.token';
import {
  ExpressionError,
  ExpressionFunction,
  ExpressionNode,
  ExpressionScope,
  evaluateNode,
  parseExpression,
} from './expression-evaluator';

/**
 * Contenedores habituales de un campo, de más específico a más genérico. Se
 * usan SOLO si el mapping no declara `visibilityGroup`.
 */
const FIELD_WRAPPER_SELECTORS = ['.form-group', '.input-group', '.field-container', '.mb-3', '.mb-4'];

/** `col`, `col-6`, `col-md-4`... pero no `col-form-label`. */
const COLUMN_CLASS = /^col(-(sm|md|lg|xl|xxl))?(-\d{1,2}|-auto)?$/;

/** Contexto opcional para elegir bien qué ocultar (ver `findVisibilityTarget`). */
export interface VisibilityContext {
  /** Raíz del contenido inyectado: nunca se oculta ni se sale de ella. */
  container: HTMLElement;
  /** Todos los mappings del formulario, para no ocultar campos ajenos. */
  mappings: FormFieldMapping[];
}

/**
 * Motor de lógica condicional del formulario: evalúa `showIf`/`hideIf` sobre
 * el FormGroup y aplica (o retira) la visibilidad de los campos en el DOM.
 *
 * Las expresiones se analizan con un evaluador propio (ver
 * `expression-evaluator.ts`); no se ejecutan como JavaScript.
 */
@Injectable({
  providedIn: 'root',
})
export class FormConditionalLogicService {
  private renderer: Renderer2;
  private config = inject(DYNAMIC_CONFIG, { optional: true });

  /** Expresiones ya analizadas (o el error de analizarlas), por texto. */
  private readonly compiled = new Map<string, ExpressionNode | ExpressionError>();
  /** Errores ya informados, para no repetir el mismo mensaje en cada tecla. */
  private readonly reportedErrors = new Set<string>();

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  /**
   * Evalúa la visibilidad ahora mismo y vuelve a evaluarla ante cada cambio
   * del FormGroup. Devuelve la suscripción para que el llamador la administre.
   *
   * Llamar DESPUÉS de que los controles tengan su valor inicial: la primera
   * evaluación es síncrona (así el contenido oculto nunca llega a pintarse).
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

    // Controles que ESTE motor deshabilitó al ocultarlos. Solo esos se
    // rehabilitan al mostrarse: uno que el host deshabilitó por su cuenta
    // debe seguir deshabilitado.
    const disabledByLogic = new Set<AbstractControl>();

    const evaluateAndApplyVisibility = () => {
      const scope = this.buildScope(formGroup);

      conditionalMappings.forEach((mapping) => {
        const control = formGroup.get(mapping.controlName);
        if (!control) return;

        const element = container.querySelector(mapping.domSelector) as HTMLElement | null;
        if (!element) return;

        const target = this.findVisibilityTarget(element, mapping, { container, mappings });
        if (!target) return;

        this.applyVisibility(control, target, this.shouldBeVisible(mapping, scope), mapping, disabledByLogic);
      });
    };

    evaluateAndApplyVisibility();

    logicSubscription.add(
      formGroup.valueChanges
        .pipe(debounceTime(this.config?.conditionalDebounceTime ?? 50))
        .subscribe(() => evaluateAndApplyVisibility()),
    );

    return logicSubscription;
  }

  /**
   * Encuentra el elemento a ocultar para un campo. Orden:
   *
   * 1. El ancestro con `data-visibility-group` igual al `visibilityGroup` del
   *    mapping. Es la forma recomendada: el autor decide qué se oculta.
   * 2. El contenedor de campo más cercano (`.form-group`, `.mb-3`...), que se
   *    amplía a su columna (`.col-*`) si esa columna no tiene nada más. Se
   *    descarta un contenedor que incluya OTROS campos del formulario: ocultar
   *    un campo nunca debe ocultar a sus vecinos.
   * 3. El propio elemento.
   *
   * Si se omite `context` no se hace la comprobación de campos vecinos.
   */
  public findVisibilityTarget(
    element: HTMLElement,
    mapping: FormFieldMapping,
    context?: VisibilityContext,
  ): HTMLElement | null {
    if (mapping.visibilityGroup) {
      const groupElement = element.closest(`[data-visibility-group="${mapping.visibilityGroup}"]`);
      if (groupElement) return groupElement as HTMLElement;
    }

    const root = context?.container;
    let wrapper: HTMLElement | null = null;

    for (let node: HTMLElement | null = element; node && node !== root; node = node.parentElement) {
      if (!this.isFieldWrapper(node)) continue;

      // Si el elemento mapeado ES el contenedor, el autor lo eligió: se respeta.
      if (node === element || !this.containsOtherFields(node, element, mapping, context)) {
        wrapper = node;
        break;
      }
    }

    if (!wrapper) return element;

    // Una columna que solo contiene este campo se oculta entera para no dejar un hueco.
    while (wrapper.parentElement && wrapper.parentElement !== root) {
      const parent: HTMLElement = wrapper.parentElement;
      if (!this.isColumn(parent) || parent.childElementCount !== 1) break;
      wrapper = parent;
    }

    return wrapper;
  }

  private isFieldWrapper(node: HTMLElement): boolean {
    return this.isColumn(node) || FIELD_WRAPPER_SELECTORS.some((selector) => node.matches(selector));
  }

  private isColumn(node: HTMLElement): boolean {
    return Array.from(node.classList).some((className) => COLUMN_CLASS.test(className));
  }

  /** ¿`candidate` contiene el elemento de algún campo que no sea este? */
  private containsOtherFields(
    candidate: HTMLElement,
    element: HTMLElement,
    mapping: FormFieldMapping,
    context?: VisibilityContext,
  ): boolean {
    if (!context) return false;

    return context.mappings.some((other) => {
      if (other === mapping || other.domSelector === mapping.domSelector) return false;
      try {
        return Array.from(candidate.querySelectorAll(other.domSelector)).some(
          (found) => found !== element && !element.contains(found),
        );
      } catch {
        return false; // selector inválido en la configuración
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Visibilidad
  // ---------------------------------------------------------------------------

  private applyVisibility(
    control: AbstractControl,
    element: HTMLElement,
    shouldBeVisible: boolean,
    mapping: FormFieldMapping,
    disabledByLogic: Set<AbstractControl>,
  ): void {
    const currentlyVisible = element.style.display !== 'none';

    if (shouldBeVisible === currentlyVisible) return;

    // enable()/disable() emiten eventos a propósito: así el DOM del campo, la
    // validez del formulario y los botones se actualizan. Un campo oculto
    // obligatorio no debe seguir bloqueando el envío.
    if (shouldBeVisible) {
      this.renderer.removeStyle(element, 'display');
      this.renderer.removeClass(element, 'hidden');
      this.renderer.removeClass(element, 'd-none');
      this.renderer.setAttribute(element, 'aria-hidden', 'false');

      if (disabledByLogic.delete(control) && !mapping.alwaysDisabled) {
        control.enable();
      }
    } else {
      this.renderer.setStyle(element, 'display', 'none');
      this.renderer.addClass(element, 'hidden');
      this.renderer.setAttribute(element, 'aria-hidden', 'true');

      if (this.config?.clearHiddenFields) {
        control.setValue(null, { emitEvent: false });
      }
      if (control.enabled) {
        disabledByLogic.add(control);
        control.disable();
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
   * Decide si el campo debe verse. Si la expresión es inválida se informa UNA
   * vez y el campo se deja visible: ocultarlo en silencio lo sacaría de la
   * validación y del envío por un error de configuración.
   */
  private shouldBeVisible(mapping: FormFieldMapping, scope: ExpressionScope): boolean {
    const isShowIf = !!mapping.showIf;
    const expression = (isShowIf ? mapping.showIf : mapping.hideIf)!;

    try {
      const result = Boolean(evaluateNode(this.compile(expression), scope));
      return isShowIf ? result : !result;
    } catch (error) {
      this.reportOnce(mapping, isShowIf ? 'showIf' : 'hideIf', expression, error);
      return true;
    }
  }

  private compile(expression: string): ExpressionNode {
    let entry = this.compiled.get(expression);
    if (!entry) {
      try {
        entry = parseExpression(expression);
      } catch (error) {
        entry = error instanceof ExpressionError ? error : new ExpressionError(String(error));
      }
      this.compiled.set(expression, entry);
    }
    if (entry instanceof ExpressionError) throw entry;
    return entry;
  }

  private reportOnce(mapping: FormFieldMapping, kind: string, expression: string, error: unknown): void {
    const key = `${mapping.controlName}|${kind}|${expression}`;
    if (this.reportedErrors.has(key)) return;
    this.reportedErrors.add(key);

    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Error en ${kind} de "${mapping.controlName}" ("${expression}"): ${reason}`);
  }

  // ---------------------------------------------------------------------------
  // Alcance de las expresiones
  // ---------------------------------------------------------------------------

  /**
   * Variables y funciones disponibles para las expresiones. Se leen los
   * valores "crudos" (incluidos los campos deshabilitados u ocultos), porque
   * una condición puede depender de un campo que a su vez está oculto.
   */
  private buildScope(formGroup: FormGroup): ExpressionScope {
    const values = formGroup.getRawValue() as Record<string, unknown>;

    const variables: Record<string, unknown> = { ...values };
    // `form.campo` es un alias de `campo`, salvo que haya un campo llamado "form".
    if (!Object.prototype.hasOwnProperty.call(values, 'form')) {
      variables['form'] = values;
    }

    const isEmpty = (val: unknown) =>
      val == null || val === '' || (Array.isArray(val) && val.length === 0);

    const functions: Record<string, ExpressionFunction> = {
      // Sobre valores
      isEmpty,
      isNotEmpty: (val) => !isEmpty(val),
      hasValue: (val) => val !== null && val !== undefined && val !== '',
      isChecked: (val) => val === true || val === 'true',
      isSelected: (val) => !!val && val !== '',
      includes: (arr, val) => Array.isArray(arr) && arr.includes(val),
      equals: (a, b) => a === b,
      notEquals: (a, b) => a !== b,
      gt: (a, b) => a > b,
      lt: (a, b) => a < b,
      gte: (a, b) => a >= b,
      lte: (a, b) => a <= b,

      // Sobre controles, por nombre
      getControl: (name) => formGroup.get(String(name))?.value,
      isValue: (name, expected) => formGroup.get(String(name))?.value === expected,
      greaterThan: (name, min) => {
        const val = formGroup.get(String(name))?.value;
        return typeof val === 'number' && val > (min as number);
      },
      isValid: (name) => {
        const control = formGroup.get(String(name));
        return !!control && control.valid && (control.dirty || control.touched);
      },
    };

    return { variables, functions };
  }
}
