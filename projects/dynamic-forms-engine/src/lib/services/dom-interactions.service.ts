import { Injectable, Renderer2 } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DynamicClickPayload } from '../interfaces/DynamicContent.interface';
import { FormFieldMapping, FilePayload } from '../models/form-field-mapping.model';
import { InputMaskingService } from './input-masking.service';
import { FileUploadService } from './file-upload.service';

/**
 * Snapshot de lo que un DynamicViewerComponent necesita para cablear los
 * listeners sobre su HTML inyectado en un momento dado. Se toma "fresco" en
 * cada llamada porque `dynamicForm`/`formMappings` pueden reemplazarse
 * (rebuild) durante la vida del componente.
 */
export interface DomInteractionsContext {
  container: HTMLElement;
  dynamicForm: FormGroup;
  formMappings?: FormFieldMapping[];
  isForm: boolean;
  formId: string;
  contentId: string;
}

/**
 * Cablea los listeners de interacción sobre el HTML inyectado dinámicamente
 * por DynamicViewerComponent: submit de formularios, clicks de acción,
 * filtrado de teclas, auto-formato de inputs, navegación/scroll de anclas,
 * inputs de archivo y clases visuales de validación.
 *
 * Cada método devuelve las funciones de "unlisten" (o la Subscription, para
 * los casos basados en Observables) para que el componente las administre
 * junto al resto de su ciclo de vida — este servicio no guarda estado propio.
 */
@Injectable({
  providedIn: 'root',
})
export class DomInteractionsService {
  constructor(
    private renderer: Renderer2,
    private inputMasking: InputMaskingService,
    private fileUpload: FileUploadService,
  ) {}

  public setupFormSubmitPrevention(ctx: DomInteractionsContext, onSubmit: () => void): Array<() => void> {
    const listeners: Array<() => void> = [];
    ctx.container.querySelectorAll('form').forEach((form) => {
      listeners.push(
        this.renderer.listen(form, 'submit', (event: Event) => {
          event.preventDefault();
          onSubmit();
        }),
      );
    });
    return listeners;
  }

  public setupActionClickListeners(
    ctx: DomInteractionsContext,
    onActionClicked: (payload: DynamicClickPayload) => void,
  ): Array<() => void> {
    const unlisten = this.renderer.listen(ctx.container, 'click', (event: Event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('button[data-dynamic-action]') as HTMLButtonElement;
      if (!button) return;

      const action = button.getAttribute('data-dynamic-action');
      if (!action) return;

      onActionClicked({
        action,
        sourceId: ctx.formId || ctx.contentId,
        clickedElement: button,
        originalEvent: event,
        formData: ctx.isForm ? ctx.dynamicForm.getRawValue() : null,
        formIsValid: ctx.isForm ? ctx.dynamicForm.valid : true,
        formId: ctx.formId || ctx.contentId,
      });
    });
    return [unlisten];
  }

  public setupKeyFiltering(ctx: DomInteractionsContext): Array<() => void> {
    const unlisten = this.renderer.listen(ctx.container, 'keydown', (event: KeyboardEvent) => {
      const target = event.target as HTMLInputElement;
      if (!target?.name || !['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      const mapping = ctx.formMappings?.find((m) => m.controlName === target.name);
      if (!mapping?.keyFilter) return;

      if (mapping.keyFilter === 'decimal' && event.key === '.' && target.value.includes('.')) {
        event.preventDefault();
        return;
      }

      if (this.inputMasking.shouldBlockKey(event, mapping.keyFilter)) {
        event.preventDefault();
      }
    });
    return [unlisten];
  }

  public setupAutoFormatting(
    ctx: DomInteractionsContext,
    scheduleTimeout: (fn: () => void, ms: number) => void,
  ): Array<() => void> {
    const unlisten = this.renderer.listen(ctx.container, 'input', (event: Event) => {
      const target = event.target as HTMLInputElement;
      const mapping = ctx.formMappings?.find(
        (m) => m.controlName === target.name || m.domSelector === `#${target.id}`,
      );
      if (!mapping?.inputMask) return;

      const cursorPosition = target.selectionStart;
      if (cursorPosition === null) return;

      const { formatted, clean } = this.inputMasking.applyMask(target.value, mapping.inputMask);

      const control = ctx.dynamicForm.get(target.name);
      if (control && control.value !== clean) {
        control.setValue(clean, { emitEvent: false });
      }

      target.value = formatted;

      const newCaret = this.inputMasking.computeCaretPosition(target.value, cursorPosition, formatted);
      scheduleTimeout(() => target.setSelectionRange(newCaret, newCaret), 0);
    });
    return [unlisten];
  }

  /**
   * Intercepta todos los <a href="..."> del contenido inyectado.
   *
   * Convención: si el href empieza con "#" (ej. "#musica"), se interpreta
   * como link de anclaje IN-PAGE y se hace scroll suave automáticamente al
   * elemento con ese id — sin necesidad de configurar nada extra, porque el
   * propio href="#seccion_id" ya es la fuente de verdad del mapeo
   * link -> sección (misma convención que usa el navegador nativamente).
   *
   * Se busca con `document.getElementById` (no solo dentro de este
   * contenedor) porque el menú y la sección destino suelen vivir en
   * <app-dynamic-viewer> distintos — son componentes hermanos, no el mismo.
   *
   * Cualquier otro href (ruta real, URL externa) se sigue delegando al host
   * vía `onActionClicked` con action: 'navigate', para que decida (router,
   * window.location, etc.).
   */
  public setupNavigationLinks(
    ctx: DomInteractionsContext,
    scrollOffset: number,
    onActionClicked: (payload: DynamicClickPayload) => void,
    onError: (message: string) => void,
  ): Array<() => void> {
    const listeners: Array<() => void> = [];

    ctx.container.querySelectorAll('a').forEach((link) => {
      if (!link.hasAttribute('href')) return;

      listeners.push(
        this.renderer.listen(link, 'click', (event: Event) => {
          event.preventDefault();
          const href = link.getAttribute('href');
          if (!href) return;

          let scrolled = false;
          if (href === '#') {
            // Convención estándar de HTML: href="#" (sin id) = volver al top
            // absoluto de la página. Ignora `scrollOffset` a propósito, porque
            // "top" significa top de verdad, no "top menos el navbar".
            window.scrollTo({ top: 0, behavior: 'smooth' });
            scrolled = true;
          } else if (href.startsWith('#') && href.length > 1) {
            scrolled = this.scrollToSection(href.slice(1), scrollOffset, onError);
          }

          onActionClicked({
            action: 'navigate',
            payload: { route: href, scrolled },
            sourceId: ctx.contentId,
            clickedElement: link,
            originalEvent: event,
            formData: ctx.isForm ? ctx.dynamicForm.getRawValue() : null,
            formIsValid: ctx.isForm ? ctx.dynamicForm.valid : false,
          });
        }),
      );
    });

    return listeners;
  }

  /**
   * Hace scroll suave al elemento con el id dado, respetando `scrollOffset`
   * (para headers sticky). Regresa `false` si no encontró el elemento, para
   * que el caller pueda decidir (ej. loguear un warning si el id no existe).
   */
  private scrollToSection(sectionId: string, scrollOffset: number, onError: (message: string) => void): boolean {
    const target = document.getElementById(sectionId);
    if (!target) {
      onError(`No se encontró la sección con id "${sectionId}" para hacer scroll.`);
      return false;
    }

    if (scrollOffset === 0) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }

    const top = target.getBoundingClientRect().top + window.scrollY - scrollOffset;
    window.scrollTo({ top, behavior: 'smooth' });
    return true;
  }

  public setupFileInputs(
    ctx: DomInteractionsContext,
    onFileSelected: (payload: FilePayload) => void,
    onControlError: (controlName: string, error: any) => void,
  ): Array<() => void> {
    if (!ctx.formMappings) return [];

    const listeners: Array<() => void> = [];

    const fileMappings = ctx.formMappings.filter((m) => {
      const el = ctx.container.querySelector(m.domSelector);
      return el && (el.getAttribute('type') === 'file' || m.fileUploadConfig);
    });

    fileMappings.forEach((mapping) => {
      const element = ctx.container.querySelector(mapping.domSelector) as HTMLInputElement;
      if (!element) return;

      if (mapping.fileUploadConfig?.accept) {
        this.renderer.setAttribute(element, 'accept', mapping.fileUploadConfig.accept);
      }
      if (mapping.fileUploadConfig?.multiple) {
        this.renderer.setAttribute(element, 'multiple', 'true');
      }

      listeners.push(
        this.renderer.listen(element, 'change', (event: any) => {
          const files = event.target.files;
          if (!files || files.length === 0) {
            ctx.dynamicForm.get(mapping.controlName)?.setValue(null);
            return;
          }

          const fileArray = Array.from(files) as File[];
          const fileToEmit = mapping.fileUploadConfig?.multiple ? fileArray : fileArray[0];

          const validationErrors = this.fileUpload.validateFiles(fileArray, mapping.fileUploadConfig);
          if (validationErrors.length > 0) {
            onControlError(mapping.controlName, { fileValidation: validationErrors });
            element.value = '';
            return;
          }

          ctx.dynamicForm.get(mapping.controlName)?.setValue(fileToEmit);
          ctx.dynamicForm.get(mapping.controlName)?.markAsDirty();
          ctx.dynamicForm.get(mapping.controlName)?.markAsTouched();

          onFileSelected({
            controlName: mapping.controlName,
            file: fileToEmit,
            formId: ctx.formId || ctx.contentId,
            isMultiple: mapping.fileUploadConfig?.multiple || false,
          });
        }),
      );
    });

    return listeners;
  }

  public setupErrorVisualsOnInputs(
    ctx: DomInteractionsContext,
    errorClasses: string[],
    successClasses: string[],
  ): Subscription {
    const subscription = new Subscription();
    if (!ctx.formMappings) return subscription;

    ctx.formMappings.forEach((mapping) => {
      const control = ctx.dynamicForm.get(mapping.controlName);
      const inputElement = ctx.container.querySelector(mapping.domSelector) as HTMLElement;
      if (!control || !inputElement) return;

      subscription.add(
        control.statusChanges.subscribe(() => {
          const isInvalid = control.invalid && (control.dirty || control.touched);
          const isValid = control.valid && (control.dirty || control.touched);

          errorClasses.forEach((cls) => this.renderer.removeClass(inputElement, cls));
          successClasses.forEach((cls) => this.renderer.removeClass(inputElement, cls));

          if (isInvalid) errorClasses.forEach((cls) => this.renderer.addClass(inputElement, cls));
          else if (isValid) successClasses.forEach((cls) => this.renderer.addClass(inputElement, cls));
        }),
      );
    });

    return subscription;
  }

  public syncDomAttributes(ctx: DomInteractionsContext): void {
    if (!ctx.formMappings) return;

    ctx.formMappings.forEach((mapping) => {
      const element = ctx.container.querySelector(mapping.domSelector) as HTMLElement;
      if (!element) return;

      if (!element.getAttribute('name')) {
        this.renderer.setAttribute(element, 'name', mapping.controlName);
      }
      if (mapping.inputMask) {
        this.renderer.setAttribute(element, 'autocomplete', 'off');
      }
    });
  }

  public processIdDomBindings(
    container: HTMLElement | undefined,
    dataBindings: Array<{ selector: string; value: any }> | undefined,
    onError: (message: string) => void,
  ): void {
    if (!container || !dataBindings) return;

    dataBindings.forEach((binding) => {
      if (!binding.selector) return;
      const element = container.querySelector(binding.selector);
      if (element) {
        element.textContent = String(binding.value ?? '');
      } else {
        onError(`El elemento con idDom "${binding.selector}" para dataBinding no fue encontrado.`);
      }
    });
  }
}
