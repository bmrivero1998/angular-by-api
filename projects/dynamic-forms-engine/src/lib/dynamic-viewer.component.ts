import {
  Component,
  Input,
  OnInit,
  OnChanges,
  OnDestroy,
  ElementRef,
  Renderer2,
  ViewChild,
  AfterViewInit,
  SimpleChanges,
  Output,
  EventEmitter,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, ValidatorFn } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';

import { DataBinding, DynamicClickPayload } from './interfaces/DynamicContent.interface';

/**
 * Snapshot completo de un control cada vez que cambia su valor o su estado
 * (touched/dirty/valid). Es más rico que un simple {controlName, value} para
 * que el consumidor (el widget orquestador) no tenga que ir a buscar el
 * control por su cuenta para saber si es válido.
 */
export interface ControlChangeEvent {
  controlName: string;
  value: any;
  formId: string;
  valid: boolean;
  invalid: boolean;
  dirty: boolean;
  touched: boolean;
  pending: boolean;
  errors: any;
}
import { FormFieldMapping, ButtonConfig, FilePayload } from './models/form-field-mapping.model';
import { DynamicInyectCssService } from './services/dynamic-inyect-css.service';
import { FormDomSynchronizerService } from './services/form-dom-synchronizer.service';
import { DYNAMIC_CONFIG } from './dynamic-config.token';
import { DynamicValidationService } from './services/dynamic-validation.service';

import { resolveValidator } from './helpers/validators.helper';
import { TimerManagerService } from './services/timer-manager.service';
import { ButtonStateService } from './services/button-state.service';
import { InputMaskingService } from './services/input-masking.service';
import { FileUploadService } from './services/file-upload.service';
import { ExternalLibsCleanupService } from './services/external-libs-cleanup.service';
import { DEFAULT_ERROR_CLASS, DEFAULT_SUCCESS_CLASS } from './constants/dynamic-viewer.constants';

/**
 * @description
 * Componente de alto nivel para renderizar HTML/CSS dinámico y sincronizarlo
 * con un FormGroup construido a partir de configuración JSON ("Backend-Driven UI").
 *
 * @remarks
 * Este componente ahora actúa como ORQUESTADOR: su única responsabilidad es
 * coordinar el ciclo de vida de Angular, el DOM (vía Renderer2/ViewChild) y
 * delegar toda la lógica de negocio a servicios inyectables especializados.
 * Ver /services y /helpers para el detalle de cada pieza.
 *
 * ¡IMPORTANTE! Usa `bypassSecurityTrustHtml`. El HTML recibido debe venir
 * de una fuente confiable y sanitizada en backend (prevención de XSS).
 */
@Component({
  selector: 'app-dynamic-viewer',
  standalone: true,
  imports: [CommonModule],
  template: ` <div #htmlContainer [innerHTML]="safeHtmlContent"></div> `,
  styleUrls: ['./dynamic-viewer.component.css'],
  providers: [TimerManagerService], // instancia aislada por componente
})
export class DynamicViewerComponent<T = any>
  implements OnInit, OnChanges, AfterViewInit, OnDestroy
{
  @Input() contentId!: string;
  @Input() htmlContentString: string = '';
  @Input() cssContentString?: string;
  @Input() formId: string = 'genericForm';
  @Input() formMappings?: FormFieldMapping[];
  @Input() formInitialData?: any;
  @Input() buttonConfigs?: ButtonConfig[];
  @Input() parentForm?: FormGroup;
  @Input() dataBindings?: DataBinding[];
  /** Compensación en px para scroll suave (útil con headers sticky que tapan el top de la sección destino). */
  @Input() scrollOffset = 0;

  @Output() formSubmitted = new EventEmitter<{ formId: string; data: T }>();
  @Output() actionClicked = new EventEmitter<DynamicClickPayload>();
  @Output() componentError = new EventEmitter<string>();
  @Output() fileSelected = new EventEmitter<FilePayload>();
  @Output() controlValueChange = new EventEmitter<ControlChangeEvent>();

  safeHtmlContent!: SafeHtml;
  dynamicForm!: FormGroup;
  isForm = false;

  private buttonElements = new Map<string, HTMLButtonElement | null>();
  private viewInitialized = false;
  private styleId?: string;
  private activeMutationObserver: MutationObserver | null = null;
  private subscriptions = new Subscription();
  private domListeners: Array<() => void> = [];
  private config = inject(DYNAMIC_CONFIG, { optional: true });

  @ViewChild('htmlContainer') htmlContainerRef!: ElementRef<HTMLDivElement>;

  constructor(
    private sanitizer: DomSanitizer,
    private cssInjector: DynamicInyectCssService,
    private formBuilder: FormBuilder,
    private synchronizer: FormDomSynchronizerService,
    private renderer: Renderer2,
    private validationService: DynamicValidationService,
    private timers: TimerManagerService,
    private buttonState: ButtonStateService,
    private inputMasking: InputMaskingService,
    private fileUpload: FileUploadService,
    private externalLibsCleanup: ExternalLibsCleanupService
  ) {}

  // --- LIFECYCLE ---

  ngOnInit(): void {
    this.buildAndInitializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    let needsFullRebuild = false;

    if (changes['htmlContentString']) {
      const clean = DOMPurify.sanitize(this.htmlContentString, {
        ADD_ATTR: ['data-dynamic-action', 'data-dynamic-form'],
      });
      this.safeHtmlContent = this.sanitizer.bypassSecurityTrustHtml(clean);
      needsFullRebuild = true;
    }
    if (changes['formMappings']) {
      needsFullRebuild = true;
    }

    if (!this.viewInitialized) return;

    if (needsFullRebuild) {
      this.rebuildAndReconnect();
      return;
    }

    if (changes['formInitialData'] && this.dynamicForm) {
      this.dynamicForm.patchValue(this.formInitialData, { emitEvent: false });
    }
    if (changes['buttonConfigs']) {
      this.timers.safeTimeout(() => this.updateButtonStates(), 0, (e) => this.emitError(String(e)));
    }
    if (changes['cssContentString'] || changes['contentId']) {
      this.injectCss();
    }
    if (changes['dataBindings']) {
      this.timers.safeTimeout(() => this.processIdDomBindings(), 0, (e) => this.emitError(String(e)));
    }
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.injectCss();
    this.initializeInjectedContentInteractions();
  }

  ngOnDestroy(): void {
    if (this.styleId && this.htmlContainerRef) {
      this.cssInjector.removeCss(this.styleId, this.htmlContainerRef.nativeElement);
    }
    if (this.isForm) {
      this.parentForm?.removeControl(this.formId || this.contentId);
      this.synchronizer.disconnect(this.formId || this.contentId);
    }
    this.cleanupDomInteractions();
    this.subscriptions.unsubscribe();
    this.timers.cancelAll();
  }

  // --- API PÚBLICA (sin cambios de contrato) ---

  public triggerSubmit(): void {
    if (!this.dynamicForm) {
      this.emitError(`triggerSubmit llamado pero dynamicForm no está definido.`);
      return;
    }
    this.dynamicForm.markAllAsTouched();
    this.dynamicForm.updateValueAndValidity();

    if (this.dynamicForm.valid) {
      this.formSubmitted.emit({
        formId: this.formId || this.contentId,
        data: this.dynamicForm.getRawValue(),
      });
    } else {
      this.emitError(`Intento de submit con formulario inválido.`);
    }
  }

  public disableFormField(controlName: string): void {
    this.dynamicForm.get(controlName)?.disable();
  }

  public enableFormField(controlName: string): void {
    this.dynamicForm.get(controlName)?.enable();
  }

  public disableElementBySelector(selector: string): void {
    this.toggleElementBySelector(selector, true);
  }

  public enableElementBySelector(selector: string): void {
    this.toggleElementBySelector(selector, false);
  }

  public getFormValues(): T {
    return this.dynamicForm.getRawValue() as T;
  }

  get values(): T {
    return this.dynamicForm.value as T;
  }

  public setFormValue(controlName: string, value: any): void {
    this.dynamicForm.get(controlName)?.setValue(value);
  }

  public resetForm(values?: any): void {
    if (values) {
      this.dynamicForm.reset(values);
      return;
    }
    this.dynamicForm.reset();
    this.formMappings?.forEach((mapping) => {
      if (mapping.defaultValue !== undefined) {
        this.dynamicForm.get(mapping.controlName)?.setValue(mapping.defaultValue);
      }
    });
  }

  public getControlStatus(controlName: string) {
    const control = this.dynamicForm.get(controlName);
    if (!control) {
      return { valid: false, invalid: true, touched: false, dirty: false, errors: null };
    }
    return {
      valid: control.valid,
      invalid: control.invalid,
      touched: control.touched,
      dirty: control.dirty,
      errors: control.errors,
    };
  }

  public validateControl(controlName: string): void {
    const control = this.dynamicForm.get(controlName);
    control?.markAsTouched();
    control?.updateValueAndValidity();
  }

  public updateSelectOptions(controlName: string, options: Array<{ value: any; label: string }>): void {
    const mapping = this.formMappings?.find((m) => m.controlName === controlName);
    if (!mapping) return;

    const select = this.htmlContainerRef.nativeElement.querySelector(
      mapping.domSelector
    ) as HTMLSelectElement;
    if (!select) return;

    const currentValue = select.value;
    while (select.options.length > 0) select.remove(0);

    options.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.text = option.label;
      select.add(opt);
    });

    if (options.some((opt) => opt.value === currentValue)) {
      select.value = currentValue;
    }
    this.dynamicForm.get(controlName)?.setValue(select.value);
  }

  public updateAutocompleteSuggestions(controlName: string, suggestions: string[]): void {
    const mapping = this.formMappings?.find((m) => m.controlName === controlName);
    if (!mapping?.autoCompleteConfig) return;

    const input = this.htmlContainerRef.nativeElement.querySelector(
      mapping.domSelector
    ) as HTMLInputElement;
    if (input) this.updateDatalist(input, suggestions, controlName);
  }

  private updateDatalist(input: HTMLInputElement, suggestions: string[], controlName: string): void {
    const datalistId = `datalist-${controlName}`;
    let datalist = this.htmlContainerRef.nativeElement.querySelector(
      `#${datalistId}`
    ) as HTMLDataListElement;

    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = datalistId;
      this.htmlContainerRef.nativeElement.appendChild(datalist);
      input.setAttribute('list', datalistId);
    }

    datalist.innerHTML = '';
    suggestions.forEach((s) => {
      const option = document.createElement('option');
      option.value = s;
      datalist.appendChild(option);
    });
  }

  // --- CONSTRUCCIÓN Y SINCRONIZACIÓN DEL FORMULARIO ---

  private rebuildAndReconnect(): void {
    this.cleanupDomInteractions();
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription();

    this.buildAndInitializeForm();

    this.timers.safeTimeout(
      () => this.initializeInjectedContentInteractions(),
      0,
      (e) => this.emitError(String(e))
    );
  }

  private buildAndInitializeForm(): void {
    this.isForm = !!(this.formMappings && this.formMappings.length > 0);
    this.buildFormGroup();

    if (this.formInitialData) {
      this.dynamicForm.patchValue(this.formInitialData, { emitEvent: false });
    }
    if (this.parentForm && this.isForm) {
      const controlName = this.formId || this.contentId;
      this.parentForm.removeControl(controlName);
      this.parentForm.addControl(controlName, this.dynamicForm);
    }

    this.setupFormSubscriptions();
  }

  private buildFormGroup(): void {
    if (!this.formMappings) {
      this.dynamicForm = this.formBuilder.group({});
      return;
    }

    const groupConfig: { [key: string]: any } = {};
    this.formMappings.forEach((map) => {
      const validators = (map.validatorConfig || [])
        .map((c) => resolveValidator(c.type, c.value, (t) => this.emitError(`Validador no reconocido: ${t}`)))
        .filter((v): v is ValidatorFn => v !== null);

      const asyncValidators = map.asyncValidator
        ? [this.validationService.createAsyncValidator(map.asyncValidator)]
        : [];

      groupConfig[map.controlName] = [map.defaultValue || '', { validators, asyncValidators }];
    });

    this.dynamicForm = this.formBuilder.group(groupConfig);
  }

  private setupFormSubscriptions(): void {
    if (!this.isForm) return;

    const updateAll = () => this.updateButtonStates();
    this.subscriptions.add(this.dynamicForm.valueChanges.subscribe(updateAll));
    this.subscriptions.add(this.dynamicForm.statusChanges.subscribe(updateAll));

    this.timers.safeTimeout(updateAll, 0, (e) => this.emitError(String(e)));

    this.subscribeIndividualControlChanges();
  }

  /**
   * Emite `controlValueChange` por CADA control, en CADA cambio (valor,
   * validez, dirty o touched). Antes este Output existía en la interfaz
   * pública pero nunca se disparaba — nadie recibía nada.
   *
   * Se escuchan valueChanges (cambios de valor) y statusChanges (cambios de
   * validez, que también capturan marcados de touched/dirty vía
   * updateValueAndValidity) para no perder eventos que no muevan el valor
   * pero sí el estado del control (ej. markAsTouched desde triggerSubmit).
   */
  private subscribeIndividualControlChanges(): void {
    if (!this.formMappings) return;

    this.formMappings.forEach((mapping) => {
      const control = this.dynamicForm.get(mapping.controlName);
      if (!control) return;

      const emitSnapshot = () => {
        this.controlValueChange.emit({
          controlName: mapping.controlName,
          value: control.value,
          formId: this.formId || this.contentId,
          valid: control.valid,
          invalid: control.invalid,
          dirty: control.dirty,
          touched: control.touched,
          pending: control.pending,
          errors: control.errors,
        });
      };

      this.subscriptions.add(control.valueChanges.subscribe(emitSnapshot));
      this.subscriptions.add(control.statusChanges.subscribe(emitSnapshot));
    });
  }

  // --- CONEXIÓN CON EL DOM INYECTADO ---

  private initializeInjectedContentInteractions(): void {
    this.cleanupDomInteractions();

    const setupLogic = (): boolean => {
      if (!this.htmlContainerRef?.nativeElement?.childElementCount) return false;

      this.checkAndLoadExternalDependencies();

      if (this.isForm && this.formMappings) {
        this.synchronizer.connect(
          this.formId,
          this.dynamicForm,
          this.htmlContainerRef.nativeElement,
          this.formMappings
        );
        this.setupInjectedFormSubmitPrevention();
        this.subscribeAndSetErrorVisualsOnInputs();
        this.setupInjectedKeyFiltering();
        this.setupAutoFormatting();
        this.syncDomAttributes();
        this.setupFileInputs();
      }

      this.preventStandardNavigationLinks();
      this.setupInjectedActionClickListeners();
      this.cacheButtonElements();
      this.updateButtonStates();
      this.processIdDomBindings();

      return true;
    };

    if (!setupLogic()) {
      this.activeMutationObserver = new MutationObserver((_, obs) => {
        if (setupLogic()) {
          obs.disconnect();
          this.activeMutationObserver = null;
        }
      });
      this.activeMutationObserver.observe(this.htmlContainerRef.nativeElement, {
        childList: true,
        subtree: true,
      });
    }
  }

  private cleanupDomInteractions(): void {
    this.activeMutationObserver?.disconnect();
    this.activeMutationObserver = null;

    if (this.isForm) {
      this.synchronizer.disconnect(this.formId);
    }

    this.domListeners.forEach((unlisten) => unlisten());
    this.domListeners = [];

    this.timers.cancelAll();

    if (this.htmlContainerRef?.nativeElement) {
      this.externalLibsCleanup.cleanupAll(this.htmlContainerRef.nativeElement);
      this.cleanupDynamicElements();
    }
  }

  private cleanupDynamicElements(): void {
    const el = this.htmlContainerRef.nativeElement;
    el.querySelectorAll('style[data-dynamic-style]').forEach((s) => s.remove());
    el.querySelectorAll('script[data-dynamic-script]').forEach((s) => s.remove());
    el.querySelectorAll('[data-dynamic-element]').forEach((e) => e.remove());
  }

  // --- LISTENERS ---

  private setupListener(element: any, event: string, handler: (event: any) => void): void {
    if (!element) return;
    this.domListeners.push(this.renderer.listen(element, event, handler));
  }

  private setupInjectedFormSubmitPrevention(): void {
    this.htmlContainerRef.nativeElement.querySelectorAll('form').forEach((form) => {
      this.setupListener(form, 'submit', (event: Event) => {
        event.preventDefault();
        this.triggerSubmit();
      });
    });
  }

  private setupInjectedActionClickListeners(): void {
    this.setupListener(this.htmlContainerRef.nativeElement, 'click', (event: Event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('button[data-dynamic-action]') as HTMLButtonElement;
      if (!button) return;

      const action = button.getAttribute('data-dynamic-action');
      if (!action) return;

      this.actionClicked.emit({
        action,
        sourceId: this.formId || this.contentId,
        clickedElement: button,
        originalEvent: event,
        formData: this.isForm ? this.dynamicForm.getRawValue() : null,
        formIsValid: this.isForm ? this.dynamicForm.valid : true,
        formId: this.formId || this.contentId,
      });
    });
  }

  private setupInjectedKeyFiltering(): void {
    this.setupListener(this.htmlContainerRef.nativeElement, 'keydown', (event: KeyboardEvent) => {
      const target = event.target as HTMLInputElement;
      if (!target?.name || !['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      const mapping = this.formMappings?.find((m) => m.controlName === target.name);
      if (!mapping?.keyFilter) return;

      if (mapping.keyFilter === 'decimal' && event.key === '.' && target.value.includes('.')) {
        event.preventDefault();
        return;
      }

      if (this.inputMasking.shouldBlockKey(event, mapping.keyFilter)) {
        event.preventDefault();
      }
    });
  }

  private setupAutoFormatting(): void {
    this.setupListener(this.htmlContainerRef.nativeElement, 'input', (event: Event) => {
      const target = event.target as HTMLInputElement;
      const mapping = this.formMappings?.find(
        (m) => m.controlName === target.name || m.domSelector === `#${target.id}`
      );
      if (!mapping?.inputMask) return;

      const cursorPosition = target.selectionStart;
      if (cursorPosition === null) return;

      const { formatted, clean } = this.inputMasking.applyMask(target.value, mapping.inputMask);

      const control = this.dynamicForm.get(target.name);
      if (control && control.value !== clean) {
        control.setValue(clean, { emitEvent: false });
      }

      target.value = formatted;

      const newCaret = this.inputMasking.computeCaretPosition(target.value, cursorPosition, formatted);
      this.timers.safeTimeout(() => target.setSelectionRange(newCaret, newCaret), 0);
    });
  }

  /**
   * Intercepta todos los <a href="..."> del contenido inyectado.
   *
   * Convención: si el href empieza con "#" (ej. "#musica"), se interpreta
   * como link de anclaje IN-PAGE y se hace scroll suave automáticamente al
   * elemento con ese id — sin necesidad de configurar nada extra, porque
   * el propio href="#seccion_id" ya es la fuente de verdad del mapeo
   * link -> sección (misma convención que usa el navegador nativamente).
   *
   * Se busca con `document.getElementById` (no solo dentro de este
   * contenedor) porque el menú y la sección destino suelen vivir en
   * <app-dynamic-viewer> distintos — son componentes hermanos, no el mismo.
   *
   * Cualquier otro href (ruta real, URL externa) se sigue delegando al host
   * vía `actionClicked` con action: 'navigate', para que decida (router,
   * window.location, etc.) — eso no cambia.
   */
  private preventStandardNavigationLinks(): void {
    this.htmlContainerRef.nativeElement.querySelectorAll('a').forEach((link) => {
      if (!link.hasAttribute('href')) return;

      this.setupListener(link, 'click', (event: Event) => {
        event.preventDefault();
        const href = link.getAttribute('href');
        if (!href) return;

        let scrolled = false;
        if (href === '#') {
          // Convención estándar de HTML: href="#" (sin id) = volver al top
          // absoluto de la página. Se resuelve aparte porque no hay ningún
          // elemento que buscar — ignora `scrollOffset` a propósito, porque
          // "top" significa top de verdad, no "top menos el navbar".
          window.scrollTo({ top: 0, behavior: 'smooth' });
          scrolled = true;
        } else if (href.startsWith('#') && href.length > 1) {
          scrolled = this.scrollToSection(href.slice(1));
        }

        this.actionClicked.emit({
          action: 'navigate',
          payload: { route: href, scrolled },
          sourceId: this.contentId,
          clickedElement: link,
          originalEvent: event,
          formData: this.isForm ? this.dynamicForm.getRawValue() : null,
          formIsValid: this.isForm ? this.dynamicForm.valid : false,
        });
      });
    });
  }

  /**
   * Hace scroll suave al elemento con el id dado, respetando `scrollOffset`
   * (para headers sticky). Regresa `false` si no encontró el elemento, para
   * que el caller pueda decidir (ej. loguear un warning si el id no existe).
   */
  private scrollToSection(sectionId: string): boolean {
    const target = document.getElementById(sectionId);
    if (!target) {
      this.emitError(`No se encontró la sección con id "${sectionId}" para hacer scroll.`);
      return false;
    }

    if (this.scrollOffset === 0) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }

    const top = target.getBoundingClientRect().top + window.scrollY - this.scrollOffset;
    window.scrollTo({ top, behavior: 'smooth' });
    return true;
  }

  // --- ARCHIVOS ---

  private setupFileInputs(): void {
    if (!this.formMappings || !this.htmlContainerRef) return;

    const fileMappings = this.formMappings.filter((m) => {
      const el = this.htmlContainerRef.nativeElement.querySelector(m.domSelector);
      return el && (el.getAttribute('type') === 'file' || m.fileUploadConfig);
    });

    fileMappings.forEach((mapping) => {
      const element = this.htmlContainerRef.nativeElement.querySelector(
        mapping.domSelector
      ) as HTMLInputElement;
      if (!element) return;

      if (mapping.fileUploadConfig?.accept) {
        this.renderer.setAttribute(element, 'accept', mapping.fileUploadConfig.accept);
      }
      if (mapping.fileUploadConfig?.multiple) {
        this.renderer.setAttribute(element, 'multiple', 'true');
      }

      this.setupListener(element, 'change', (event: any) => {
        const files = event.target.files;
        if (!files || files.length === 0) {
          this.dynamicForm.get(mapping.controlName)?.setValue(null);
          return;
        }

        const fileArray = Array.from(files) as File[];
        const fileToEmit = mapping.fileUploadConfig?.multiple ? fileArray : fileArray[0];

        const validationErrors = this.fileUpload.validateFiles(fileArray, mapping.fileUploadConfig);
        if (validationErrors.length > 0) {
          this.setControlError(mapping.controlName, { fileValidation: validationErrors });
          element.value = '';
          return;
        }

        this.dynamicForm.get(mapping.controlName)?.setValue(fileToEmit);
        this.dynamicForm.get(mapping.controlName)?.markAsDirty();
        this.dynamicForm.get(mapping.controlName)?.markAsTouched();

        this.fileSelected.emit({
          controlName: mapping.controlName,
          file: fileToEmit,
          formId: this.formId || this.contentId,
          isMultiple: mapping.fileUploadConfig?.multiple || false,
        });
      });
    });
  }

  // --- BOTONES ---

  private updateButtonStates(): void {
    if (!this.buttonConfigs || !this.dynamicForm) return;

    this.buttonConfigs.forEach((config) => {
      const button = this.buttonElements.get(config.selector);
      if (!button) return;

      const isDisabled = this.buttonState.evaluate(this.dynamicForm, config, (msg) => this.emitError(msg));
      this.renderer.setProperty(button, 'disabled', isDisabled);
    });
  }

  private cacheButtonElements(): void {
    this.buttonElements.clear();
    this.buttonConfigs?.forEach((config) => {
      const element = this.htmlContainerRef.nativeElement.querySelector(
        config.selector
      ) as HTMLButtonElement | null;
      this.buttonElements.set(config.selector, element);
      if (!element) {
        this.emitError(`Botón con selector "${config.selector}" no encontrado.`);
      }
    });
  }

  private toggleElementBySelector(selector: string, disable: boolean): void {
    const element = this.htmlContainerRef?.nativeElement.querySelector(selector) as HTMLElement;
    if (element) {
      this.renderer.setProperty(element, 'disabled', disable);
    } else {
      this.emitError(
        `Elemento no encontrado con selector [${selector}] para ${disable ? 'deshabilitar' : 'habilitar'}.`
      );
    }
  }

  // --- ESTILOS Y CLASES DE VALIDACIÓN VISUAL ---

  private subscribeAndSetErrorVisualsOnInputs(): void {
    if (!this.formMappings) return;

    const errorClasses = (this.config?.errorClassName || DEFAULT_ERROR_CLASS).split(' ');
    const successClasses = (this.config?.successClassName || DEFAULT_SUCCESS_CLASS).split(' ');

    this.formMappings.forEach((mapping) => {
      const control = this.dynamicForm.get(mapping.controlName);
      const inputElement = this.htmlContainerRef.nativeElement.querySelector(
        mapping.domSelector
      ) as HTMLElement;
      if (!control || !inputElement) return;

      const sub = control.statusChanges.subscribe(() => {
        const isInvalid = control.invalid && (control.dirty || control.touched);
        const isValid = control.valid && (control.dirty || control.touched);

        errorClasses.forEach((cls) => this.renderer.removeClass(inputElement, cls));
        successClasses.forEach((cls) => this.renderer.removeClass(inputElement, cls));

        if (isInvalid) errorClasses.forEach((cls) => this.renderer.addClass(inputElement, cls));
        else if (isValid) successClasses.forEach((cls) => this.renderer.addClass(inputElement, cls));
      });
      this.subscriptions.add(sub);
    });
  }

  private syncDomAttributes(): void {
    if (!this.formMappings || !this.htmlContainerRef) return;

    this.formMappings.forEach((mapping) => {
      const element = this.htmlContainerRef.nativeElement.querySelector(
        mapping.domSelector
      ) as HTMLElement;
      if (!element) return;

      if (!element.getAttribute('name')) {
        this.renderer.setAttribute(element, 'name', mapping.controlName);
      }
      if (mapping.inputMask) {
        this.renderer.setAttribute(element, 'autocomplete', 'off');
      }
    });
  }

  private injectCss(): void {
    if (this.styleId && this.htmlContainerRef) {
      this.cssInjector.removeCss(this.styleId, this.htmlContainerRef.nativeElement);
    }
    if (this.cssContentString && this.contentId && this.htmlContainerRef) {
      this.styleId = this.cssInjector.generateStyleId(`viewer-${this.contentId}`);
      this.cssInjector.injectCss(this.cssContentString, this.styleId, this.htmlContainerRef.nativeElement);
    }
  }

  private processIdDomBindings(): void {
    if (!this.htmlContainerRef || !this.dataBindings) return;

    this.dataBindings.forEach((binding) => {
      if (!binding.selector) return;
      const element = this.htmlContainerRef.nativeElement.querySelector(binding.selector);
      if (element) {
        element.textContent = String(binding.value ?? '');
      } else {
        this.emitError(`El elemento con idDom "${binding.selector}" para dataBinding no fue encontrado.`);
      }
    });
  }

  private checkAndLoadExternalDependencies(): void {
    this.formMappings?.forEach((mapping) => {
      if (mapping.richTextConfig?.editorType === 'quill') {
        this.loadCss('https://cdn.quilljs.com/1.3.6/quill.snow.css');
      }
      if (mapping.dateTimeConfig?.pickerType === 'flatpickr') {
        this.loadCss('https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css');
      }
    });
  }

  private loadCss(href: string): void {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    this.timers.safeTimeout(() => document.head.appendChild(link), 0);
  }

  private emitError(message: string): void {
    console.warn(`DynamicViewer (${this.contentId}): ${message}`);
    this.componentError.emit(`[${this.contentId}] ${message}`);
  }

  private setControlError(controlName: string, error: any): void {
    const control = this.dynamicForm.get(controlName);
    if (control) {
      control.setErrors(error);
      control.markAsTouched();
    }
  }
}