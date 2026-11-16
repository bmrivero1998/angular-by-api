import { Injectable, Injector, Renderer2, RendererFactory2 } from '@angular/core';
import { Subscription } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { DynamicClickPayload } from '../models/dynamic-content.model';
import { FormFieldMapping, FilePayload, FileUploadChange, FileUploadConfig } from '../models/form-field-mapping.model';
import { InputMaskingService } from '../forms/controls/input-masking.service';
import { FileUploadService } from '../forms/controls/file-upload.service';
import { FileUploadTransferService } from '../forms/controls/file-upload-transfer.service';

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
  /** Orígenes, además del de la página, a los que se permite subir archivos (ver FileUploadConfig.uploadUrl). */
  uploadOrigins?: string[];
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
    private injector: Injector,
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
    onUploadChange?: (change: FileUploadChange) => void,
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
      const config = mapping.fileUploadConfig;

      if (config?.accept) {
        this.renderer.setAttribute(element, 'accept', config.accept);
      }
      if (config?.multiple) {
        this.renderer.setAttribute(element, 'multiple', 'true');
      }

      // Subida en curso de este campo. Elegir otros archivos la cancela
      // (aborta la petición), igual que destruir el formulario.
      let activeUpload: Subscription | null = null;
      const cancelUpload = () => {
        activeUpload?.unsubscribe();
        activeUpload = null;
      };
      listeners.push(cancelUpload);

      const control = () => ctx.dynamicForm.get(mapping.controlName);

      listeners.push(
        this.renderer.listen(element, 'change', (event: any) => {
          cancelUpload();

          const files = event.target.files;
          if (!files || files.length === 0) {
            control()?.setValue(null);
            this.renderFileList(ctx, config, []);
            this.renderProgress(ctx, config, null);
            return;
          }

          const fileArray = Array.from(files) as File[];
          const fileToEmit = config?.multiple ? fileArray : fileArray[0];

          const validationErrors = this.fileUpload.validateFiles(fileArray, config);
          if (validationErrors.length > 0) {
            // El archivo rechazado no debe quedar como valor del formulario.
            // Va antes de reportar el error: cambiar el valor revalida el
            // control y borraría el error recién puesto.
            control()?.setValue(null, { emitEvent: false });
            element.value = '';
            this.renderFileList(ctx, config, []);
            this.renderProgress(ctx, config, null);
            onControlError(mapping.controlName, { fileValidation: validationErrors });
            return;
          }

          control()?.setValue(fileToEmit);
          control()?.markAsDirty();
          control()?.markAsTouched();
          this.renderFileList(ctx, config, fileArray);

          onFileSelected({
            controlName: mapping.controlName,
            file: fileToEmit,
            formId: ctx.formId || ctx.contentId,
            isMultiple: config?.multiple || false,
          });

          if (config?.uploadUrl) {
            activeUpload = this.startUpload(ctx, mapping, config, element, fileArray, onControlError, onUploadChange);
          }
        }),
      );
    });

    return listeners;
  }

  /**
   * Sube los archivos de un campo a su `uploadUrl`. Mientras dura, el control
   * está `pending` (el formulario no es válido y `formIsPending` deshabilita
   * los botones). Al terminar, el valor del control pasa a ser la respuesta del
   * servidor; si falla, el control queda con el error `upload`.
   */
  private startUpload(
    ctx: DomInteractionsContext,
    mapping: FormFieldMapping,
    config: FileUploadConfig,
    element: HTMLInputElement,
    files: File[],
    onControlError: (controlName: string, error: any) => void,
    onUploadChange?: (change: FileUploadChange) => void,
  ): Subscription | null {
    const control = ctx.dynamicForm.get(mapping.controlName);
    const emit = (change: Omit<FileUploadChange, 'controlName' | 'formId'>) =>
      onUploadChange?.({ controlName: mapping.controlName, formId: ctx.formId || ctx.contentId, ...change });

    const fail = (message: string) => {
      control?.setValue(null, { emitEvent: false });
      element.value = ''; // para poder volver a elegir el mismo archivo
      this.renderFileList(ctx, config, []);
      this.renderProgress(ctx, config, null);
      onControlError(mapping.controlName, { upload: message });
      emit({ status: 'error', progress: 0, error: message });
    };

    let transfer: FileUploadTransferService;
    try {
      transfer = this.injector.get(FileUploadTransferService);
    } catch {
      fail('La subida de archivos necesita que la aplicación provea HttpClient.');
      return null;
    }

    control?.markAsPending();
    this.renderProgress(ctx, config, 0);

    return transfer.upload(files, config, ctx.uploadOrigins ?? []).subscribe({
      next: (state) => {
        this.renderProgress(ctx, config, state.progress);

        if (state.status === 'uploading') {
          emit({ status: 'uploading', progress: state.progress });
          return;
        }

        // Una respuesta vacía no deja el campo vacío: queda el nombre del archivo.
        const result = Array.isArray(state.result)
          ? state.result.map((item, index) => item ?? files[index]?.name ?? null)
          : state.result ?? files[0].name;
        control?.setValue(result);
        control?.markAsDirty();
        control?.markAsTouched();
        emit({ status: 'done', progress: 100, result });
      },
      error: (error: unknown) => fail(error instanceof Error ? error.message : 'No se pudo subir el archivo.'),
    });
  }

  /** Muestra el avance en `progressSelector`: un `<progress>` o el texto `45%`. `null` lo reinicia. */
  private renderProgress(ctx: DomInteractionsContext, config: FileUploadConfig | undefined, percent: number | null): void {
    if (!config?.progressSelector) return;
    const el = ctx.container.querySelector(config.progressSelector);
    if (!el) return;

    if (el instanceof HTMLProgressElement) {
      this.renderer.setProperty(el, 'max', 100);
      this.renderer.setProperty(el, 'value', percent ?? 0);
    } else {
      this.renderer.setProperty(el, 'textContent', percent === null ? '' : `${percent}%`);
    }
  }

  /** Lista los archivos elegidos en `fileListSelector`: un `<li>` por archivo en `<ul>`/`<ol>`, o texto separado por comas. */
  private renderFileList(ctx: DomInteractionsContext, config: FileUploadConfig | undefined, files: File[]): void {
    if (!config?.fileListSelector) return;
    const el = ctx.container.querySelector(config.fileListSelector);
    if (!el) return;

    const labels = files.map((file) => `${file.name} (${this.fileUpload.formatBytes(file.size)})`);

    if (el instanceof HTMLUListElement || el instanceof HTMLOListElement) {
      el.replaceChildren();
      labels.forEach((label) => {
        const item = this.renderer.createElement('li');
        this.renderer.setProperty(item, 'textContent', label);
        this.renderer.appendChild(el, item);
      });
    } else {
      this.renderer.setProperty(el, 'textContent', labels.join(', '));
    }
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
