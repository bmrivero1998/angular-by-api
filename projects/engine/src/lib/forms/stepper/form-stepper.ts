import { Renderer2 } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { FormFieldMapping } from '../../models/form-field-mapping.model';

/** Acciones (`data-dynamic-action`) que mueven el stepper. */
export const STEPPER_NEXT_ACTION = 'next_step';
export const STEPPER_PREVIOUS_ACTION = 'previous_step';

/** Un cambio de paso, tal como se informa al host. */
export interface StepChange {
  formId: string;
  stepId: string;
  /** Posición del paso actual, desde 0. */
  index: number;
  total: number;
  /** Qué provocó el cambio. `init` es el paso con el que arranca. */
  direction: 'init' | 'next' | 'previous' | 'goto';
  /** Pasos ya completados (se avanzó más allá de ellos validándolos). */
  completed: string[];
}

export interface FormStepperOptions {
  /** Elemento con `data-dynamic-stepper`. Sus `[data-dynamic-step]` son los pasos. */
  root: HTMLElement;
  /** Contenido de la sección: de aquí se resuelven los `domSelector` y los botones. */
  container: HTMLElement;
  form: FormGroup;
  mappings: FormFieldMapping[];
  renderer: Renderer2;
  onChange: (change: Omit<StepChange, 'formId'>) => void;
}

interface Step {
  id: string;
  title: string;
  element: HTMLElement;
  /** Controles de los campos que están dentro del paso. */
  controlNames: string[];
}

/**
 * Formulario de varios pasos, dirigido por el HTML de la sección (ver
 * docs/steppers.md). Muestra un paso a la vez, valida los campos de un paso
 * antes de dejar avanzar y dibuja un indicador de pasos si hay un elemento
 * `[data-dynamic-stepper-nav]`.
 */
export class FormStepper {
  public readonly steps: Step[];

  private currentIndex = 0;
  /** El paso más lejano al que se ha llegado: se puede volver a cualquiera hasta él. */
  private furthestIndex = 0;
  private readonly completed = new Set<string>();
  private readonly navItems: HTMLElement[] = [];
  private readonly unlisteners: Array<() => void> = [];

  constructor(private readonly options: FormStepperOptions) {
    this.steps = this.discoverSteps();
    if (this.steps.length === 0) return;

    this.renderNav();
    this.render();
    this.options.onChange(this.snapshot('init'));
  }

  // ---------------------------------------------------------------------------
  // Consulta
  // ---------------------------------------------------------------------------

  public get index(): number {
    return this.currentIndex;
  }

  public get current(): Step {
    return this.steps[this.currentIndex];
  }

  public isFirst(): boolean {
    return this.currentIndex === 0;
  }

  public isLast(): boolean {
    return this.currentIndex === this.steps.length - 1;
  }

  // ---------------------------------------------------------------------------
  // Navegación
  // ---------------------------------------------------------------------------

  /**
   * Avanza al siguiente paso si los campos del actual son válidos. Si no, los
   * marca como tocados (para que se vean sus errores), enfoca el primero
   * inválido y se queda donde está.
   */
  public next(): boolean {
    if (this.isLast()) return false;

    if (!this.validateCurrent()) {
      this.focusFirstInvalid(this.current);
      return false;
    }

    this.completed.add(this.current.id);
    this.moveTo(this.currentIndex + 1, 'next');
    return true;
  }

  /** Vuelve al paso anterior, sin validar. */
  public previous(): boolean {
    if (this.isFirst()) return false;
    this.moveTo(this.currentIndex - 1, 'previous');
    return true;
  }

  /** Va a un paso ya alcanzado (por id o posición). A uno al que aún no se llegó solo se llega con `next()`. */
  public goTo(target: string | number): boolean {
    const index = typeof target === 'number' ? target : this.steps.findIndex((step) => step.id === target);
    if (index < 0 || index >= this.steps.length || index > this.furthestIndex || index === this.currentIndex) {
      return false;
    }
    this.moveTo(index, 'goto');
    return true;
  }

  /**
   * Marca como tocados todos los campos de todos los pasos y lleva al primer
   * paso que tenga un campo inválido. Devuelve su posición, o -1 si todo es
   * válido. Es lo que hace falta al intentar enviar con un paso anterior mal.
   */
  public revealFirstInvalid(): number {
    this.steps.forEach((step) => this.enabledControls(step).forEach((control) => control.markAsTouched()));

    const index = this.steps.findIndex((step) => this.stepIsBlocked(step));
    if (index < 0) return -1;

    this.furthestIndex = Math.max(this.furthestIndex, index);
    if (index !== this.currentIndex) this.moveTo(index, 'goto');
    this.focusFirstInvalid(this.steps[index]);
    return index;
  }

  public destroy(): void {
    this.unlisteners.forEach((unlisten) => unlisten());
    this.unlisteners.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Validación
  // ---------------------------------------------------------------------------

  /** Marca los campos del paso actual como tocados y dice si se puede avanzar. */
  private validateCurrent(): boolean {
    this.enabledControls(this.current).forEach((control) => control.markAsTouched());
    return !this.stepIsBlocked(this.current);
  }

  /** Un paso bloquea si algún campo habilitado es inválido o está pendiente (p. ej. subiendo un archivo). */
  private stepIsBlocked(step: Step): boolean {
    return this.enabledControls(step).some((control) => control.invalid || control.pending);
  }

  /** Los campos deshabilitados (p. ej. ocultos por `showIf`) no cuentan. */
  private enabledControls(step: Step): AbstractControl[] {
    return step.controlNames
      .map((name) => this.options.form.get(name))
      .filter((control): control is AbstractControl => !!control && control.enabled);
  }

  private focusFirstInvalid(step: Step): void {
    const mapping = this.options.mappings.find((m) => {
      const control = step.controlNames.includes(m.controlName) ? this.options.form.get(m.controlName) : null;
      return !!control && control.enabled && (control.invalid || control.pending);
    });
    if (!mapping) return;

    const field = this.options.container.querySelector(mapping.domSelector) as HTMLElement | null;
    field?.focus?.();
  }

  // ---------------------------------------------------------------------------
  // Descubrimiento y dibujo
  // ---------------------------------------------------------------------------

  private discoverSteps(): Step[] {
    const { root, container, mappings } = this.options;
    const used = new Set<string>();

    return Array.from(root.querySelectorAll<HTMLElement>('[data-dynamic-step]')).map((element, index) => {
      let id = element.getAttribute('data-dynamic-step')?.trim() || `step-${index + 1}`;
      if (used.has(id)) id = `${id}-${index + 1}`;
      used.add(id);

      const controlNames = mappings
        .filter((mapping) => {
          try {
            const field = container.querySelector(mapping.domSelector);
            return !!field && element.contains(field);
          } catch {
            return false; // selector inválido en la configuración
          }
        })
        .map((mapping) => mapping.controlName);

      return { id, title: element.getAttribute('data-step-title')?.trim() || id, element, controlNames };
    });
  }

  private moveTo(index: number, direction: StepChange['direction']): void {
    this.currentIndex = index;
    this.furthestIndex = Math.max(this.furthestIndex, index);
    this.render();
    this.options.onChange(this.snapshot(direction));
  }

  private snapshot(direction: StepChange['direction']): Omit<StepChange, 'formId'> {
    return {
      stepId: this.current.id,
      index: this.currentIndex,
      total: this.steps.length,
      direction,
      completed: Array.from(this.completed),
    };
  }

  private stateOf(index: number): 'active' | 'completed' | 'pending' {
    if (index === this.currentIndex) return 'active';
    return index < this.currentIndex || this.completed.has(this.steps[index].id) ? 'completed' : 'pending';
  }

  private render(): void {
    const { renderer } = this.options;

    this.steps.forEach((step, index) => {
      const state = this.stateOf(index);
      renderer.setAttribute(step.element, 'data-step-state', state);
      if (state === 'active') {
        this.show(step.element);
      } else {
        this.hide(step.element);
      }
    });

    this.navItems.forEach((item, index) => {
      renderer.setAttribute(item, 'data-step-state', this.stateOf(index));
      if (index === this.currentIndex) {
        renderer.setAttribute(item, 'aria-current', 'step');
      } else {
        renderer.removeAttribute(item, 'aria-current');
      }
    });

    this.options.container.querySelectorAll<HTMLElement>('[data-show-on-step]').forEach((element) => {
      if (this.matchesShowOnStep(element.getAttribute('data-show-on-step') ?? '')) {
        this.show(element);
      } else {
        this.hide(element);
      }
    });
  }

  /**
   * `data-show-on-step="not-first"`: lista de condiciones separadas por coma;
   * el elemento se ve si se cumple alguna. Valen `first`, `last`, `not-first`,
   * `not-last` y el id de un paso.
   */
  private matchesShowOnStep(value: string): boolean {
    return value
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
      .some((token) => {
        switch (token) {
          case 'first': return this.isFirst();
          case 'last': return this.isLast();
          case 'not-first': return !this.isFirst();
          case 'not-last': return !this.isLast();
          default: return token === this.current.id;
        }
      });
  }

  /** Dibuja el indicador de pasos en `[data-dynamic-stepper-nav]`, si existe. */
  private renderNav(): void {
    const { renderer, container } = this.options;
    const nav = container.querySelector<HTMLElement>('[data-dynamic-stepper-nav]');
    if (!nav) return;

    nav.replaceChildren();
    const itemTag = nav instanceof HTMLOListElement || nav instanceof HTMLUListElement ? 'li' : 'span';

    this.steps.forEach((step, index) => {
      const item: HTMLElement = renderer.createElement(itemTag);
      renderer.setAttribute(item, 'data-step-id', step.id);

      const number: HTMLElement = renderer.createElement('span');
      renderer.addClass(number, 'step-index');
      renderer.setProperty(number, 'textContent', String(index + 1));
      const title: HTMLElement = renderer.createElement('span');
      renderer.addClass(title, 'step-title');
      renderer.setProperty(title, 'textContent', step.title);

      renderer.appendChild(item, number);
      renderer.appendChild(item, renderer.createText(' '));
      renderer.appendChild(item, title);
      renderer.appendChild(nav, item);

      // Volver a un paso ya alcanzado.
      this.unlisteners.push(renderer.listen(item, 'click', () => this.goTo(index)));
      this.navItems.push(item);
    });
  }

  /** Oculta guardando el `display` que el autor hubiera puesto en línea, para devolvérselo al mostrar. */
  private hide(element: HTMLElement): void {
    const { renderer } = this.options;
    if (!element.hasAttribute('data-step-hidden')) {
      renderer.setAttribute(element, 'data-step-display', element.style.display);
      renderer.setAttribute(element, 'data-step-hidden', '');
    }
    renderer.setStyle(element, 'display', 'none');
    renderer.setAttribute(element, 'aria-hidden', 'true');
  }

  private show(element: HTMLElement): void {
    const { renderer } = this.options;
    if (!element.hasAttribute('data-step-hidden')) return;

    const original = element.getAttribute('data-step-display') ?? '';
    if (original) {
      renderer.setStyle(element, 'display', original);
    } else {
      renderer.removeStyle(element, 'display');
    }
    renderer.removeAttribute(element, 'data-step-hidden');
    renderer.removeAttribute(element, 'data-step-display');
    renderer.removeAttribute(element, 'aria-hidden');
  }
}
