import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { FormStepper, FormStepperOptions } from './form-stepper';

/**
 * Crea el stepper de una sección. Existe para darle a `FormStepper` un
 * `Renderer2` (que no se puede inyectar en una clase suelta) sin que el
 * componente tenga que crearlo.
 */
@Injectable({ providedIn: 'root' })
export class FormStepperService {
  private readonly renderer: Renderer2;

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  /** Devuelve `null` si el elemento no tiene ningún paso (`[data-dynamic-step]`). */
  public create(options: Omit<FormStepperOptions, 'renderer'>): FormStepper | null {
    const stepper = new FormStepper({ ...options, renderer: this.renderer });
    return stepper.steps.length > 0 ? stepper : null;
  }
}
