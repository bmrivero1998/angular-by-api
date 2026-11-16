import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { DynamicClickPayload } from '../models/dynamic-content.model';
import { FormFieldMapping, FilePayload } from '../models/form-field-mapping.model';
import { InputMaskingService } from '../forms/controls/input-masking.service';
import { FileUploadService } from '../forms/controls/file-upload.service';

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
 * filtrado de teclas, navegación/scroll de anclas e inputs de archivo.
 *
 * Cada método devuelve las funciones de "unlisten" para que el componente las administre
 * junto al resto de su ciclo de vida — este servicio no guarda estado propio.
 */
@Injectable({
  providedIn: 'root',
})
export class DomInteractionsService {
  // `Renderer2` no es inyectable directamente en un servicio `providedIn:
  // 'root'` (solo el compilador lo provee mágicamente por-componente); hay
  // que pedir `RendererFactory2` (sí es un provider real de la app) y crear
  // el renderer manualmente, igual que el resto de los servicios de la
  // librería que también lo necesitan.
  private renderer: Renderer2;

  constructor(
    rendererFactory: RendererFactory2,
    private inputMasking: InputMaskingService,
    private fileUpload: FileUploadService,
  ) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  public setupFormSubmitPrevention(ctx: DomInteractionsContext, onSubmit: () => void): Array<() => void> {
    const listeners: Array<() => void> = [];
    ctx.container.querySelectorAll('form').forEach((form) => {
      // La validación la hace el motor. Sin `novalidate`, el navegador
      // bloquea el submit de un campo `required` vacío con su propio globo y
      // el evento `submit` nunca llega, así que no se pintarían los errores.
      this.renderer.setAttribute(form, 'novalidate', '');

      listeners.push(
        this.renderer.listen(form, 'submit', (event: SubmitEvent) => {
          event.preventDefault();

          // Un botón con `data-dynamic-action` ya se reporta como acción (ver
          // setupActionClickListeners). Si además disparara el submit nativo,
          // el mismo click produciría dos eventos distintos.
          if (event.submitter?.hasAttribute('data-dynamic-action')) return;

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
      if (!target || !['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      const mapping = this.findMappingForElement(ctx, target, (m) => !!m.keyFilter);
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

  /**
   * Busca el mapping que corresponde a un elemento del DOM por su
   * `domSelector`, que es la fuente de verdad del enlace campo <-> control
   * (el atributo `name` del HTML puede no coincidir con `controlName`).
   */
  private findMappingForElement(
    ctx: DomInteractionsContext,
    element: Element,
    predicate: (mapping: FormFieldMapping) => boolean,
  ): FormFieldMapping | undefined {
    return ctx.formMappings?.find((mapping) => {
      if (!predicate(mapping)) return false;
      try {
        return element.matches(mapping.domSelector);
      } catch {
        return false; // selector inválido en la configuración
      }
    });
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
            // El archivo rechazado no debe quedar como valor del formulario.
            // Va antes de reportar el error: cambiar el valor revalida el
            // control y borraría el error recién puesto.
            ctx.dynamicForm.get(mapping.controlName)?.setValue(null, { emitEvent: false });
            element.value = '';
            onControlError(mapping.controlName, { fileValidation: validationErrors });
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
