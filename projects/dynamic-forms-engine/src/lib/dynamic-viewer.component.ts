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
import { ExternalLibsCleanupService } from './services/external-libs-cleanup.service';
import { DomInteractionsService, DomInteractionsContext } from './services/dom-interactions.service';
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
    private externalLibsCleanup: ExternalLibsCleanupService,
    private domInteractions: DomInteractionsService
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
      this.timers.safeTimeout(
        () => this.domInteractions.processIdDomBindings(this.htmlContainerRef?.nativeElement, this.dataBindings, (m) => this.emitError(m)),
        0,
        (e) => this.emitError(String(e))
      );
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

  private buildInteractionsContext(): DomInteractionsContext {
    return {
      container: this.htmlContainerRef.nativeElement,
      dynamicForm: this.dynamicForm,
      formMappings: this.formMappings,
      isForm: this.isForm,
      formId: this.formId,
      contentId: this.contentId,
    };
  }

  private initializeInjectedContentInteractions(): void {
    this.cleanupDomInteractions();

    const setupLogic = (): boolean => {
      if (!this.htmlContainerRef?.nativeElement?.childElementCount) return false;

      this.checkAndLoadExternalDependencies();
      const ctx = this.buildInteractionsContext();

      if (this.isForm && this.formMappings) {
        this.synchronizer.connect(
          this.formId,
          this.dynamicForm,
          this.htmlContainerRef.nativeElement,
          this.formMappings
        );

        this.domListeners.push(
          ...this.domInteractions.setupFormSubmitPrevention(ctx, () => this.triggerSubmit()),
        );

        const errorClasses = (this.config?.errorClassName || DEFAULT_ERROR_CLASS).split(' ');
        const successClasses = (this.config?.successClassName || DEFAULT_SUCCESS_CLASS).split(' ');
        this.subscriptions.add(this.domInteractions.setupErrorVisualsOnInputs(ctx, errorClasses, successClasses));

        this.domListeners.push(...this.domInteractions.setupKeyFiltering(ctx));
        this.domListeners.push(
          ...this.domInteractions.setupAutoFormatting(ctx, (fn, ms) =>
            this.timers.safeTimeout(fn, ms, (e) => this.emitError(String(e))),
          ),
        );
        this.domInteractions.syncDomAttributes(ctx);
        this.domListeners.push(
          ...this.domInteractions.setupFileInputs(
            ctx,
            (payload) => this.fileSelected.emit(payload),
            (controlName, error) => this.setControlError(controlName, error),
          ),
        );
      }

      this.domListeners.push(
        ...this.domInteractions.setupNavigationLinks(
          ctx,
          this.scrollOffset,
          (payload) => this.actionClicked.emit(payload),
          (message) => this.emitError(message),
        ),
      );
      this.domListeners.push(
        ...this.domInteractions.setupActionClickListeners(ctx, (payload) => this.actionClicked.emit(payload)),
      );
      this.cacheButtonElements();
      this.updateButtonStates();
      this.domInteractions.processIdDomBindings(this.htmlContainerRef.nativeElement, this.dataBindings, (m) =>
        this.emitError(m),
      );

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

  // --- ESTILOS ---

  private injectCss(): void {
    if (this.styleId && this.htmlContainerRef) {
      this.cssInjector.removeCss(this.styleId, this.htmlContainerRef.nativeElement);
    }
    if (this.cssContentString && this.contentId && this.htmlContainerRef) {
      this.styleId = this.cssInjector.generateStyleId(`viewer-${this.contentId}`);
      this.cssInjector.injectCss(this.cssContentString, this.styleId, this.htmlContainerRef.nativeElement);
    }
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