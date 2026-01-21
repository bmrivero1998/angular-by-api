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
  ViewEncapsulation,
  inject,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ValidatorFn,
  AbstractControl,
} from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';

import { CommonModule } from '@angular/common';
import { DataBinding, DynamicFormSubmited, DynamicClickPayload } from './interfaces/DynamicContent.interface';
import { FormFieldMapping, ButtonConfig, FilePayload } from './models/form-field-mapping.model';
import { DynamicInyectCssService } from './services/dynamic-inyect-css.service';
import { FormDomSynchronizerService } from './services/form-dom-synchronizer.service';
import { DYNAMIC_CONFIG } from './dynamic-config.token';
import { DynamicValidationService } from './services/dynamic-validation.service';


/**
 * @description
 * Componente de alto nivel capaz de renderizar dinámicamente HTML y CSS,
 * y de construir y gestionar un FormGroup de Angular a partir de una configuración
 * JSON. Está diseñado para arquitecturas "Backend-Driven UI", donde la estructura,
 * validación y comportamiento de un formulario son definidos por una API.
 *
 * @example
 * * <app-dynamic-viewer
 * [contentId]="'user-profile-form'"
 * [htmlContentString]="htmlFromApi"
 * [cssContentString]="cssFromApi"
 * [formMappings]="mappingsFromApi"
 * [formInitialData]="userData"
 * [buttonConfigs]="buttonsFromApi"
 * (formSubmitted)="onProfileSubmit($event)"
 * (actionClicked)="onCustomAction($event)"
 * (componentError)="logError($event)">
 * </app-dynamic-viewer>
 *
 * @remarks
 * ¡IMPORTANTE! Este componente utiliza `bypassSecurityTrustHtml` para renderizar
 * el HTML. Es IMPERATIVO que el contenido recibido de la API sea de una fuente
 * completamente confiable y sanitizado en el backend para prevenir ataques
 * de Cross-Site Scripting (XSS).
 */
@Component({
  selector: 'app-dynamic-viewer',
  standalone: true,
  imports: [CommonModule],
  template: ` <div #htmlContainer [innerHTML]="safeHtmlContent"></div> `,
  styleUrls: ['./dynamic-viewer.component.css'],
})
export class DynamicViewerComponent <T = any>
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

  @Output() formSubmitted = new EventEmitter<{ formId: string, data: T }>();
  @Output() actionClicked = new EventEmitter<DynamicClickPayload>();
  @Output() componentError = new EventEmitter<string>();
  @Output() fileSelected = new EventEmitter<FilePayload>()
  @Output() controlValueChange = new EventEmitter<{
  controlName: string;
  value: any;
  formId: string;
}>();

  safeHtmlContent!: SafeHtml;
  dynamicForm!: FormGroup;
  isForm: boolean = false;

  private buttonElements = new Map<string, HTMLButtonElement | null>();
  private viewInitialized = false;
  private styleId?: string;
  private activeMutationObserver: MutationObserver | null = null;
  private subscriptions = new Subscription();
  private domListeners: Array<() => void> = [];
  private config = inject(DYNAMIC_CONFIG, { optional: true });
  private timeoutIds = new Set<number>();
  private intervalIds = new Set<number>();

  @ViewChild('htmlContainer') htmlContainerRef!: ElementRef<HTMLDivElement>;

  constructor(
    private sanitizer: DomSanitizer,
    private cssInjector: DynamicInyectCssService,
    private formBuilder: FormBuilder,
    private synchronizer: FormDomSynchronizerService,
    private renderer: Renderer2,
    private validationService: DynamicValidationService,
  ) {}

  ngOnInit(): void {
    this.buildAndInitializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    let needsFullRebuild = false;

    if (changes['htmlContentString']) {
      this.safeHtmlContent = this.sanitizer.bypassSecurityTrustHtml(
        this.htmlContentString
      );
      needsFullRebuild = true;
    }

    if (changes['formMappings']) {
      needsFullRebuild = true;
    }

    if (this.viewInitialized) {
      if (needsFullRebuild) {
        this.rebuildAndReconnect();
      } else {
        if (changes['formInitialData'] && this.dynamicForm) {
          this.dynamicForm.patchValue(this.formInitialData, {
            emitEvent: false,
          });
        }
        if (changes['buttonConfigs']) {
          // Schedule update after DOM is stable
           this.safeTimeout(() => this.updateButtonStates(), 0);
        }
        if (changes['cssContentString'] || changes['contentId']) {
          this.injectCss();
        }
        if (changes['dataBindings']) {
           this.safeTimeout(() => this.processIdDomBindings(), 0);
        }
      }
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
  }

  // --- MÉTODOS PÚBLICOS DE CONTROL ---

  /**
   * Desencadena el evento de submit del formulario, si existe y es válido.
   * Si no existe el formulario, emite un error.
   * Si el formulario no es válido, emite un error.
   */
  public triggerSubmit(): void {
    if (!this.dynamicForm) {
      this.emitError(
        `triggerSubmit llamado pero dynamicForm no está definido.`
      );
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

  /**
   * Deshabilita un campo de formulario por su nombre de control.
   * Si el campo no existe, no se produce un error.
   * @param controlName nombre del campo de formulario a deshabilitar
   */
  public disableFormField(controlName: string): void {
    this.dynamicForm.get(controlName)?.disable();
  }

  /**
   * Habilita un campo de formulario por su nombre de control.
   * Si el campo no existe, no se produce un error.
   * @param controlName nombre del campo de formulario a habilitar
   */
  public enableFormField(controlName: string): void {
    this.dynamicForm.get(controlName)?.enable();
  }

  /**
   * Deshabilita el elemento del DOM que coincida con el selector CSS provisto.
   * @param selector selector CSS del elemento a deshabilitar
   */
  public disableElementBySelector(selector: string): void {
    this.toggleElementBySelector(selector, true);
  }

  /**
   * Habilita el elemento del DOM que coincida con el selector CSS provisto.
   * @param selector selector CSS del elemento a habilitar
   */
  public enableElementBySelector(selector: string): void {
    this.toggleElementBySelector(selector, false);
  }

  /**
   * [PRO] Método para obtener los valores ya casteados al tipo esperado.
   */
  public getFormValues(): T {
    return this.dynamicForm.getRawValue() as T;
  }

    /**
   * [PRO] Acceso rápido a los valores del formulario.
   * Permite hacer: viewer.values.nombre en lugar de viewer.dynamicForm.get('nombre').value
   */
  get values(): T {
    return this.dynamicForm.value as T;
  }

  // --- NUEVOS MÉTODOS PÚBLICOS ---

/**
 * Actualiza el valor de un control específico
 */
public setFormValue(controlName: string, value: any): void {
  const control = this.dynamicForm.get(controlName);
  if (control) {
    control.setValue(value);
  }
}

/**
 * Resetea el formulario a valores iniciales
 */
public resetForm(values?: any): void {
  if (values) {
    this.dynamicForm.reset(values);
  } else {
    this.dynamicForm.reset();
    // Restaurar valores por defecto de los mappings
    this.formMappings?.forEach(mapping => {
      if (mapping.defaultValue !== undefined) {
        this.dynamicForm.get(mapping.controlName)?.setValue(mapping.defaultValue);
      }
    });
  }
}

/**
 * Obtiene el estado de validación de un control específico
 */
public getControlStatus(controlName: string): {
  valid: boolean;
  invalid: boolean;
  touched: boolean;
  dirty: boolean;
  errors: any;
} {
  const control = this.dynamicForm.get(controlName);
  if (!control) {
    return { valid: false, invalid: true, touched: false, dirty: false, errors: null };
  }
  
  return {
    valid: control.valid,
    invalid: control.invalid,
    touched: control.touched,
    dirty: control.dirty,
    errors: control.errors
  };
}

/**
 * Valida un control específico
 */
public validateControl(controlName: string): void {
  const control = this.dynamicForm.get(controlName);
  if (control) {
    control.markAsTouched();
    control.updateValueAndValidity();
  }
}

// --- MÉTODOS PARA CONTROLES ESPECIALES ---

/**
 * Actualiza las opciones de un select dinámicamente
 */
public updateSelectOptions(controlName: string, options: Array<{value: any, label: string}>): void {
  const mapping = this.formMappings?.find(m => m.controlName === controlName);
  if (!mapping) return;
  
  const select = this.htmlContainerRef.nativeElement.querySelector(
    mapping.domSelector
  ) as HTMLSelectElement;
  
  if (select) {
    // Guardar valor actual
    const currentValue = select.value;
    
    // Limpiar opciones
    while (select.options.length > 0) {
      select.remove(0);
    }
    
    // Agregar nuevas opciones
    options.forEach(option => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.text = option.label;
      select.add(opt);
    });
    
    // Restaurar valor si existe en nuevas opciones
    const exists = options.some(opt => opt.value === currentValue);
    if (exists) {
      select.value = currentValue;
    }
    
    // Actualizar control
    this.dynamicForm.get(controlName)?.setValue(select.value);
  }
}

/**
 * Actualiza sugerencias de autocomplete
 */
public updateAutocompleteSuggestions(controlName: string, suggestions: string[]): void {
  const mapping = this.formMappings?.find(m => m.controlName === controlName);
  if (!mapping?.autoCompleteConfig) return;
  
  const input = this.htmlContainerRef.nativeElement.querySelector(
    mapping.domSelector
  ) as HTMLInputElement;
  
  if (input) {
    // Actualizar datalist
    this.updateDatalist(input, suggestions, controlName);
  }
}

private updateDatalist(input: HTMLInputElement, suggestions: string[], controlName: string): void {
  const datalistId = `datalist-${controlName}`;
  let datalist = this.htmlContainerRef.nativeElement.querySelector(`#${datalistId}`) as HTMLDataListElement;
  
  if (!datalist) {
    datalist = document.createElement('datalist');
    datalist.id = datalistId;
    this.htmlContainerRef.nativeElement.appendChild(datalist);
    input.setAttribute('list', datalistId);
  }
  
  // Limpiar y actualizar
  datalist.innerHTML = '';
  suggestions.forEach(suggestion => {
    const option = document.createElement('option');
    option.value = suggestion;
    datalist.appendChild(option);
  });
}

  // --- LÓGICA DE CONSTRUCCIÓN Y SINCRONIZACIÓN ---

  /**
   * Reconstruye y reestablece la conexión del formulario dinámico con
   * sus controles en el DOM.
   * Limpia las suscripciones y los listeners del DOM, y luego
   * vuelve a construir y a inicializar el formulario dinámico.
   * Por último, reinicia las interacciones con el contenido inyectado
   * después de que el DOM se haya actualizado.
   */
  private rebuildAndReconnect(): void {
    this.cleanupDomInteractions();
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription();

    this.buildAndInitializeForm();

    // Interactions need to be re-initialized after the view updates
     this.safeTimeout(() => this.initializeInjectedContentInteractions(), 0);
  }

  /**
   * Construye e inicializa el formulario dinámico basado en los mapeos proporcionados.
   * - Establece el indicador `isForm` dependiendo de si hay mapeos de formulario.
   * - Crea un `FormGroup` utilizando los mapeos definidos.
   * - Aplica los datos iniciales del formulario si están presentes.
   * - Sincroniza el `dynamicForm` con el `parentForm` si se proporciona uno.
   * - Configura las suscripciones para cambios en el formulario.
   */
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

  /**
   * Construye el formulario dinámico (FormGroup) a partir de los mapeos
   * de campos de formulario proporcionados.
   * - Si no hay mapeos, crea un formulario vacío.
   * - Si hay mapeos, itera sobre ellos y configura los controles
   *   en el formulario dinámico con sus respectivos valores
   *   iniciales y validadores.
   */
  private buildFormGroup(): void {
    const groupConfig: { [key: string]: any } = {};
    if (!this.formMappings) {
      this.dynamicForm = this.formBuilder.group({});
      return;
    }

    this.formMappings.forEach((map) => {
      const validators = (map.validatorConfig || [])
        .map((config) => this.getValidator(config.type, config.value))
        .filter((v) => v) as ValidatorFn[];
      const asyncValidators = map.asyncValidator 
        ? [this.validationService.createAsyncValidator(map.asyncValidator)] 
        : [];

      groupConfig[map.controlName] = [
        map.defaultValue || '', 
        { validators, asyncValidators }
      ];  
    });
    
    this.dynamicForm = this.formBuilder.group(groupConfig);
  }

  /**
   * Convierte un objeto de configuración de validador en un ValidatorFn de Angular.
   * @param type tipo de validador (minúsculas)
   * @param value valor adicional para el validador (si es necesario)
   * @returns el ValidatorFn correspondiente o null si no se reconoce el tipo
   */
  private getValidator(type: string, value: any): ValidatorFn | null {
    switch (type.toLowerCase()) {
      case 'required':
        return Validators.required;
      case 'email':
        return Validators.email;
      case 'minlength':
        return Validators.minLength(value);
      case 'maxlength':
        return Validators.maxLength(value);
      case 'pattern':
        return Validators.pattern(value);
      case 'min':
        return Validators.min(value);
      case 'max':
        return Validators.max(value);
      case 'requiredtrue':
        return Validators.requiredTrue;
      case 'matchvalue':
        return (control: AbstractControl) =>
          control.value === value
            ? null
            : { matchValue: { valid: false, value } };
      default:
        this.emitError(`Validador no reconocido: ${type}`);
        return null;
    }
  }

  /**
   * Configura las interacciones del contenido dinámico inyectado en el host del componente.
   * - Limpia los listeners y las suscripciones previas.
   * - Si hay un formulario y mapeos de campos, configura la sincronización
   *   bidireccional entre el formulario y los elementos del DOM.
   * - Establece listeners para los clicks en los botones de acción.
   * - Establece una suscripción para cachear los elementos de botón y actualizar
   *   sus estados según sea necesario.
   * - Si el contenido HTML no ha sido renderizado todavía, establece un observador
   *   de mutaciones para intentar configurar las interacciones de nuevo cuando
   *   el contenido esté listo.
   */
  private initializeInjectedContentInteractions(): void {
    this.cleanupDomInteractions();

    const setupLogic = () => {
      if (!this.htmlContainerRef?.nativeElement?.childElementCount){
        return false;
      }
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

  /**
   * Limpia los listeners de interacciones del DOM y desecha la MutationObserver
   * activa.
   *
   * Si el componente tiene un formulario, llama a
   * `disconnect` en el FormDomSynchronizerService para deshabilitar la sincronización
   * entre el formulario y los elementos del DOM.
   *
   * Limpia también los listeners establecidos en los elementos del DOM.
   */
private cleanupDomInteractions(): void {
  // 1. Desconectar MutationObserver
  this.activeMutationObserver?.disconnect();
  this.activeMutationObserver = null;

  // 2. Desconectar sincronizador de formularios
  if (this.isForm) {
    this.synchronizer.disconnect(this.formId);
  }

  // 3. Remover listeners de DOM
  this.domListeners.forEach((unlisten) => unlisten());
  this.domListeners = [];

  // 4. Cancelar timeouts/intervals
  this.clearTimers();

  // 5. Limpiar instancias externas
  this.cleanupExternalInstances();

  // 6. Limpiar elementos creados dinámicamente
  this.cleanupDynamicElements();
}

/**
 * Cancela todos los timers creados por el componente
 */
private clearTimers(): void {
  // Aquí puedes almacenar y limpiar timeouts/intervals
  if (this.timeoutIds) {
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds.clear();
  }
  
  if (this.intervalIds) {
    this.intervalIds.forEach(id => clearInterval(id));
    this.intervalIds.clear();
  }
}

/**
 * Limpia elementos creados dinámicamente
 */
private cleanupDynamicElements(): void {
  // Remover estilos dinámicos
  const dynamicStyles = this.htmlContainerRef.nativeElement.querySelectorAll('style[data-dynamic-style]');
  dynamicStyles.forEach(style => style.remove());

  // Remover scripts dinámicos
  const dynamicScripts = this.htmlContainerRef.nativeElement.querySelectorAll('script[data-dynamic-script]');
  dynamicScripts.forEach(script => script.remove());

  // Remover elementos con atributos de datos dinámicos
  const dynamicElements = this.htmlContainerRef.nativeElement.querySelectorAll('[data-dynamic-element]');
  dynamicElements.forEach(element => element.remove());
}



  // --- GESTIÓN DE EVENTOS DEL DOM ---

  /**
   * Establece un listener para un evento en un elemento del DOM, y lo guarda en
   * {@link domListeners} para que pueda ser removido más tarde.
   *
   * @param element El elemento del DOM que debe recibir el listener.
   * @param event El nombre del evento que se quiere escuchar.
   * @param handler La función que se llamará cuando se produzca el evento.
   */
  private setupListener(
    element: any,
    event: string,
    handler: (event: any) => void
  ): void {
    if (!element) return;
    const unlisten = this.renderer.listen(element, event, handler);
    this.domListeners.push(unlisten);
  }

  /**
   * Establece un listener para el evento 'submit' en todos los formularios
   * del contenido dinámico inyectado, y evita que se envíen los formularios
   * de forma normal. En su lugar, llama a {@link triggerSubmit} para
   * procesar el formulario de forma programática.
   *
   * Esto es útil para evitar que los formularios se envíen de forma normal
   * cuando se han configurado para que se procesen de forma programática.
   */
  private setupInjectedFormSubmitPrevention(): void {
    const forms = this.htmlContainerRef.nativeElement.querySelectorAll('form');
    forms.forEach((form) => {
      this.setupListener(form, 'submit', (event: Event) => {
        event.preventDefault();
        this.triggerSubmit();
      });
    });
  }

  /**
   * Establece un listener para el evento 'click' en el contenedor del contenido
   * dinámico, y emite el evento 'actionClicked' cada vez que se hace clic en un
   * botón con el atributo 'data-dynamic-action'.
   *
   * La emisión del evento 'actionClicked' se hace con un objeto que contiene:
   * - 'action': el valor del atributo 'data-dynamic-action'
   * - 'sourceId': el identificador del formulario al que pertenece el botón
   * - 'clickedElement': el botón que se ha hecho clic
   * - 'originalEvent': el evento 'click' original
   *
   * Esto es útil para propagar los clics en botones con acciones dinámicas hacia
   * fuera del componente que renderiza el contenido dinámico, de forma que
   * otros componentes puedan responder a estos clics.
   */
  private setupInjectedActionClickListeners(): void {
    this.setupListener(
      this.htmlContainerRef.nativeElement,
      'click',
      (event: Event) => {
        const target = event.target as HTMLElement;
        const button = target.closest(
          'button[data-dynamic-action]'
        ) as HTMLButtonElement;

        if (button) {
          const action = button.getAttribute('data-dynamic-action');
          const formData = this.isForm ? this.dynamicForm.getRawValue() : null;
          const formIsValid = this.isForm ? this.dynamicForm.valid : true;
          if (action) {
            this.actionClicked.emit({
              action,
              sourceId: this.formId || this.contentId,
              clickedElement: button,
              originalEvent: event,
              // --- Metadatos PRO ---
              formData: formData,
              formIsValid: formIsValid ,
              formId: this.formId || this.contentId
            });
          }
        }
      }
    );
  }

  /**
   * Establece un listener para el evento 'keydown' en el contenedor del contenido
   * dinámico, y filtra las teclas que se pueden escribir en cada campo de texto.
   *
   * El filtrado se hace según la configuración de 'keyFilter' en el mapeo de campos.
   * Si se especifica un valor para 'keyFilter', se restringen las teclas que se pueden
   * escribir en el campo de texto asociado.
   *
   * Se permiten las siguientes teclas sin restricciones:
   * - Backspace
   * - Tab
   * - Enter
   * - Escape
   * - Delete
   * - Home
   * - End
   * - Flechas de dirección
   * - Ctrl + (cualquier tecla)
   * - Meta (Cmd en Mac) + (cualquier tecla)
   *
   * Si se especifica una expresión regular para 'keyFilter', se permite escribir
   * solo aquellas teclas que coinciden con la expresión regular.
   *
   * Se admiten las siguientes expresiones regulares predefinidas:
   * - int: solo números enteros
   * - number: solo números (con decimales)
   * - alpha: solo letras y espacios
   * - alphanum: solo letras, números y espacios
   * - hex: solo caracteres hexadecimales
   * - decimal: solo números con punto decimal (no permite repetir el punto decimal)
   *
   * Si se especifica una expresión regular no admitida, se muestra un error en la consola.
   */
  private setupInjectedKeyFiltering(): void {
    this.setupListener(
      this.htmlContainerRef.nativeElement,
      'keydown',
      (event: KeyboardEvent) => {
        const target = event.target as HTMLInputElement;
        if (!target?.name || !['INPUT', 'TEXTAREA'].includes(target.tagName))
          return;

        const mapping = this.formMappings?.find(
          (m) => m.controlName === target.name
        );
        if (!mapping?.keyFilter) return;

        const allowedKeys = [
          'Backspace',
          'Tab',
          'Enter',
          'Escape',
          'Delete',
          'Home',
          'End',
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
        ];
        if (allowedKeys.includes(event.key) || event.ctrlKey || event.metaKey)
          return;

        const regexMap: { [key: string]: RegExp } = {
          int: /^[0-9]$/,
          number: /^[0-9]$/,
          alpha: /^[a-zA-Z\s]$/,
          alphanum: /^[a-zA-Z0-9]$/,
          hex: /^[0-9a-fA-F]$/,
        };

        let regex = regexMap[mapping.keyFilter];
        if (mapping.keyFilter === 'decimal') {
          if (event.key === '.' && target.value.includes('.'))
            event.preventDefault();
          regex = /^[0-9.]$/;
        } else if (!regex) {
          try {
            regex = new RegExp(`^${mapping.keyFilter}$`);
          } catch {
            this.emitError(
              `Regex para keyFilter no válida: "${mapping.keyFilter}"`
            );
            return;
          }
        }

        if (regex && !regex.test(event.key)) {
          event.preventDefault();
        }
      }
    );
  }

  /**
   * Establece un listener para el evento 'input' en el contenedor del contenido
   * dinámico, y aplica un formato automático a los campos de texto que lo requieren.
   *
   * El formato se aplica según la configuración de 'inputMask' en el mapeo de campos.
   * Se aplica el formato solo si se especifica un valor para 'inputMask'.
   *
   * La función {@link formatWithMask} se encarga de aplicar el formato.
   */
  private setupAutoFormatting(): void {
    this.setupListener(
      this.htmlContainerRef.nativeElement,
      'input',
      (event: Event) => {
        const target = event.target as HTMLInputElement;
        const mapping = this.formMappings?.find(
          (m) => m.controlName === target.name || m.domSelector === `#${target.id}`
        );
        if (mapping?.inputMask) {
          this.formatWithMask(target, mapping.inputMask);
        }
      }
    );
  }

  /**
   * Aplica un formato automático a un campo de texto según una máscara especificada.
   *
   * La máscara se aplica según la configuración de 'inputMask' en el mapeo de campos.
   * Se aplica el formato solo si se especifica un valor para 'inputMask'.
   *
   * @param target El elemento HTMLInputElement que se va a formatear.
   * @param mask La máscara que se va a aplicar.
   */
  private formatWithMask(target: HTMLInputElement, mask: string): void {
    const cursorPosition = target.selectionStart;
    if (cursorPosition === null) return;

    const originalValue = target.value;
    const dataCharsBeforeCursor = originalValue
      .substring(0, cursorPosition)
      .replace(/[^a-zA-Z0-9]/g, '').length;

    const cleanedValue = originalValue.replace(/[^a-zA-Z0-9]/g, '');
    let formattedValue = '';
    let valueIndex = 0;
    let maskIndex = 0;

    while (maskIndex < mask.length && valueIndex < cleanedValue.length) {
      const maskChar = mask[maskIndex];
      const inputChar = cleanedValue[valueIndex];

      const isDigitMatch = maskChar === '9' && /[0-9]/.test(inputChar);
      const isAlphaMatch =
        maskChar.toLowerCase() === 'x' && /[a-zA-Z]/.test(inputChar);
      const isAlphaNumMatch = maskChar === '*' && /[a-zA-Z0-9]/.test(inputChar);

      if (isDigitMatch || isAlphaMatch || isAlphaNumMatch) {
        formattedValue += isAlphaMatch ? inputChar.toUpperCase() : inputChar;
        valueIndex++;
        maskIndex++;
      } else {
        formattedValue += maskChar;
        // Si el caracter literal de la máscara coincide con el que ya estaba, avanzamos
        if (inputChar === maskChar) valueIndex++;
        maskIndex++;
      }
    }

    const finalCleanedValue = formattedValue.replace(/[^a-zA-Z0-9]/g, '');
    const control = this.dynamicForm.get(target.name);
    if (control && control.value !== finalCleanedValue) {
      control.setValue(finalCleanedValue, { emitEvent: false });
    }

    target.value = formattedValue;

    let newCursorPosition = 0;
    let dataCharsCounted = 0;
    for (const char of formattedValue) {
      newCursorPosition++;
      if (/[a-zA-Z0-9]/.test(char)) {
        dataCharsCounted++;
      }
      if (dataCharsCounted === dataCharsBeforeCursor) break;
    }

     this.safeTimeout(() => {
        target.setSelectionRange(newCursorPosition, newCursorPosition);
      }, 0);
  }

  // --- ACTUALIZACIÓN DE ESTADO Y UI ---

  /**
   * Actualiza el estado de los botones según las condiciones definidas en
   * `buttonConfigs`. Si se encuentra una condición desconocida, se emitirá un
   * error.
   *
   * El valor de `disableWhen` en cada `ButtonConfig` puede ser:
   *   - Una función que devuelva un booleano. La función recibirá el `FormGroup`
   *     actual como parámetro.
   *   - Una cadena que indique una condición común, como por ejemplo:
   *     - `formIsInvalid`
   *     - `formIsValid`
   *     - `formIsPristine`
   *     - `formIsDirty`
   *     - `formIsTouched`
   *     - `formIsUntouched`
   *     - `formIsPending`
   *     - `formItselfIsDisabled`
   *     - `formItselfIsEnabled`
   *     - `alwaysDisable`
   *     - `neverDisable`
   *     - `formIsInvalidOrPristine`
   *     - `formIsEmpty`
   *     - `formIsNotEmpty`
   *     - `controlIsInvalid:control`
   *
   * La función `isFormEffectivelyEmpty()` se utiliza para determinar si el
   * formulario está vacío en el caso de que contenga algún campo que no sea
   * un campo de formulario (como un campo `mat-hint` o un `div` sin
   * `name`).
   */
  private updateButtonStates(): void {
    if (!this.buttonConfigs || !this.dynamicForm) return;

    const form = this.dynamicForm;

    this.buttonConfigs.forEach((config) => {
      const button = this.buttonElements.get(config.selector);
      if (!button) return;

      let isDisabled = false;
      const condition = config.disableWhen;

      if (typeof condition === 'function') {
        isDisabled = condition(form);
      } else if (typeof condition === 'string') {
        if (condition.includes(':')) {
          isDisabled = this._evaluateControlCondition(
            form,
            condition,
            config.selector
          );
        } else {
          const conditionMap: { [key: string]: boolean } = {
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
            formIsEmpty: this.isFormEffectivelyEmpty(),
            formIsNotEmpty: !this.isFormEffectivelyEmpty(),
          };

          if (condition in conditionMap) {
            isDisabled = conditionMap[condition];
          } else {
            this.emitError(
              `Condición de 'disableWhen' desconocida: ${condition}`
            );
          }
        }
      }

      this.renderer.setProperty(button, 'disabled', isDisabled);
    });
  }
  /**
   * Evalúa condiciones de deshabilitación que dependen de controles específicos del formulario.
   * @param form El FormGroup que contiene los controles.
   * @param conditionString La condición completa, ej. 'controlIsInvalid:email,name'.
   * @param buttonSelector El selector del botón, para mensajes de error claros.
   * @returns `true` si el botón debe estar deshabilitado.
   */
  private _evaluateControlCondition(
    form: FormGroup,
    conditionString: string,
    buttonSelector: string
  ): boolean {
    const parts = conditionString.split(':');
    const condition = parts[0].trim();
    const controlNames = (parts[1] || '').split(',').map((s) => s.trim());

    if (controlNames.length === 0 || controlNames[0] === '') {
      this.emitError(
        `La condición '${condition}' requiere al menos un nombre de control para el botón '${buttonSelector}'.`
      );
      return true;
    }

    const controls = controlNames
      .map((name) => {
        const control = form.get(name);
        if (!control) {
          this.emitError(
            `Control '${name}' no encontrado para el botón '${buttonSelector}'.`
          );
        }
        return control;
      })
      .filter((c) => c !== null) as AbstractControl[];

    if (controls.length !== controlNames.length) {
      return true; // Deshabilitamos por seguridad
    }

    switch (condition) {
      case 'controlIsInvalid':
        return controls.some((c) => c.invalid);

      case 'controlIsValid':
        return controls.every((c) => c.valid);

      case 'controlIsEmpty':
        return controls.some((c) => !c.value);

      case 'controlIsNotEmpty':
        return controls.every((c) => !!c.value);

      case 'controlsDoNotMatch':
        if (controls.length < 2) {
          this.emitError(
            `La condición '${condition}' requiere dos controles para el botón '${buttonSelector}'.`
          );
          return true;
        }
        const [control1, control2] = controls;
        if (control1.touched && control2.touched) {
          return control1.value !== control2.value;
        }
        return false;

      default:
        this.emitError(`Condición de control desconocida: ${condition}`);
        return false;
    }
  }

  /**
   * Suscribe a los cambios en el estado de los controles del formulario y agrega/
   * quita las clases CSS 'is-invalid' y 'is-valid' a los elementos del DOM
   * correspondientes según sea necesario.
   *
   * La clase 'is-invalid' se utiliza para indicar que el control es inválido y
   * ha sido tocado (ya sea por el usuario o por el programa).
   *
   * La clase 'is-valid' se utiliza para indicar que el control es válido y ha
   * sido tocado (ya sea por el usuario o por el programa).
   */
  private subscribeAndSetErrorVisualsOnInputs(): void {
  if (!this.formMappings) return;

  const errorClasses = (this.config?.errorClassName || 'is-invalid').split(' ');
  const successClasses = (this.config?.successClassName || 'is-valid').split(' ');

  this.formMappings.forEach((mapping) => {
    const control = this.dynamicForm.get(mapping.controlName);
    const inputElement = this.htmlContainerRef.nativeElement.querySelector(mapping.domSelector) as HTMLElement;

    if (control && inputElement) {
      const sub = control.statusChanges.subscribe(() => {
        const isInvalid = control.invalid && (control.dirty || control.touched);
        const isValid = control.valid && (control.dirty || control.touched);

        // Limpiar clases
        errorClasses.forEach(cls => this.renderer.removeClass(inputElement, cls));
        successClasses.forEach(cls => this.renderer.removeClass(inputElement, cls));

        if (isInvalid) {
          errorClasses.forEach(cls => this.renderer.addClass(inputElement, cls));
        } else if (isValid) {
          successClasses.forEach(cls => this.renderer.addClass(inputElement, cls));
        }
      });
      this.subscriptions.add(sub);
    }
  });
}

  /**
   * Busca y guarda en memoria los elementos HTML que coinciden con los selectores
   * definidos en `buttonConfigs`. Si no se encuentra un elemento para un selector,
   * se emitirá un error.
   *
   * Este método se llama en el constructor y cada vez que se actualiza el
   * contenido del contenedor HTML.
   */
  private cacheButtonElements(): void {
    this.buttonElements.clear();
    this.buttonConfigs?.forEach((config) => {
      const element = this.htmlContainerRef.nativeElement.querySelector(
        config.selector
      ) as HTMLButtonElement | null;
      this.buttonElements.set(config.selector, element);
      if (!element) {
        this.emitError(
          `Botón con selector "${config.selector}" no encontrado.`
        );
      }
    });
  }

  /**
   * Suscribe al evento de cambios en el valor del formulario (valueChanges) y
   * al evento de cambios en el estado del formulario (statusChanges), para
   * actualizar los estados de los botones configurados en buttonConfigs.
   *
   * Este método se llama solo si el contenido dinámico tiene un formulario.
   */
  private setupFormSubscriptions(): void {
    if (!this.isForm) return;


    const updateAll = () => {
      this.updateButtonStates();
    };

    const sub = this.dynamicForm.valueChanges.subscribe(updateAll);
    const statusSub = this.dynamicForm.statusChanges.subscribe(updateAll);

    this.subscriptions.add(sub);
    this.subscriptions.add(statusSub);


     this.safeTimeout(() => updateAll(), 0);
  }

  // --- MÉTODOS AUXILIARES ---

 /**
   * Quita el estilo CSS previamente injectado y vuelve a injectar
   * DENTRO del contenedor del componente para soportar Shadow DOM.
   */
  private injectCss(): void {
    // Si ya existe un styleId, intentamos removerlo primero del contenedor actual
    if (this.styleId && this.htmlContainerRef) {
        this.cssInjector.removeCss(this.styleId, this.htmlContainerRef.nativeElement);
    }

    if (this.cssContentString && this.contentId && this.htmlContainerRef) {
      this.styleId = this.cssInjector.generateStyleId(
        `viewer-${this.contentId}`
      );
      
      // CAMBIO CLAVE: Pasamos el nativeElement como tercer argumento
      this.cssInjector.injectCss(
          this.cssContentString, 
          this.styleId, 
          this.htmlContainerRef.nativeElement
      );
    }
  }

  /**
   * Procesa los bindings de datos basados en un array de objetos {idDom, value}.
   * Busca cada elemento por su ID y actualiza su contenido.
   */
  private processIdDomBindings(): void {
    if (!this.htmlContainerRef || !this.dataBindings) {
      return;
    }

    this.dataBindings.forEach((binding) => {
      if (!binding.selector) return;
      const element = this.htmlContainerRef.nativeElement.querySelector(
        binding.selector
      );

      if (element) {
        element.textContent = String(binding.value ?? '');
      } else {
        this.emitError(
          `El elemento con idDom "${binding.selector}" para dataBinding no fue encontrado.`
        );
      }
    });
  }

  /**
   * Busca todos los enlaces <a> dentro del contenido inyectado y previene
   * su comportamiento de navegación por defecto para que no recarguen la página.
   */
  private preventStandardNavigationLinks(): void {
    if (!this.htmlContainerRef) {
      return;
    }

    const links = this.htmlContainerRef.nativeElement.querySelectorAll('a');

    links.forEach((link) => {
      if (link.hasAttribute('href')) {
        this.setupListener(link, 'click', (event: Event) => {
          event.preventDefault();

          const href = link.getAttribute('href');

          if (href) {
            this.actionClicked.emit({
              action: 'navigate',
              payload: { route: href },
              sourceId: this.contentId,
              clickedElement: link,
              originalEvent: event,
              formData: this.isForm ? this.dynamicForm.getRawValue() : null,
              formIsValid: this.isForm ? this.dynamicForm.valid : false
            });
          }
        });
      }
    });
  }

  /**
   * Busca un elemento HTML en el contenedor con el selector especificado y lo
   * habilita o deshabilita según el valor de `disable`.
   *
   * Si no se encuentra el elemento, se emitirá un error con un mensaje como
   * "Elemento no encontrado con selector [selector] para
   * [deshabilitar/habilitar]".
   *
   * @param selector selector CSS del elemento a habilitar o deshabilitar
   * @param disable si es `true`, el elemento se deshabilitará; si es `false`,
   * el elemento se habilitará
   */
  private toggleElementBySelector(selector: string, disable: boolean): void {
    const element = this.htmlContainerRef?.nativeElement.querySelector(
      selector
    ) as HTMLElement;
    if (element) {
      this.renderer.setProperty(element, 'disabled', disable);
    } else {
      this.emitError(
        `Elemento no encontrado con selector [${selector}] para ${
          disable ? 'deshabilitar' : 'habilitar'
        }.`
      );
    }
  }

  /**
   * Verifica si el formulario está efectivamente vacío. Un formulario se considera
   * vacío si todos los valores de sus controles son nulos, indefinidos o cadenas
   * vacías.
   * @returns `true` si el formulario está vacío, `false` en caso contrario
   */
  private isFormEffectivelyEmpty(): boolean {
    const formValues = this.dynamicForm.getRawValue();
    return Object.values(formValues).every(
      (value) => value === null || value === undefined || value === ''
    );
  }


   /**
   * @description
   * [PRO] Motor de evaluación de expresiones dinámicas.
   * * Evalúa una cadena de texto como una expresión lógica de JavaScript utilizando el 
   * estado actual de los valores del formulario (`getRawValue`) como contexto.
   * * @param condition - La cadena con la expresión lógica a evaluar (ej: "edad >= 18").
   * @returns `boolean` - Resultado de la evaluación. Devuelve `false` si hay un error de sintaxis.
   * * @example
   * // Si el formulario tiene { tipo: 'empresa' }
   * evaluateCondition("tipo === 'empresa'") // true
   * * @private
   * @memberof DynamicViewerComponent
   */
  private evaluateCondition(condition: string): boolean {
  try {
    const form = this.dynamicForm.getRawValue();
    return new Function('form', `with(form) { return ${condition}; }`)(form);
  } catch (e) {
    console.warn('Error evaluando condición:', condition, e);
    return false;
  }
}


/**
 * Traduce la configuración de validadores lógicos a atributos físicos del HTML.
 * Esto permite que el navegador impida escribir más caracteres de los permitidos (maxlength)
 * o muestre el comportamiento nativo de campos requeridos.
 */
private injectNativeValidators(): void {
  if (!this.formMappings || !this.htmlContainerRef) return;

  this.formMappings.forEach((mapping) => {
    // Buscamos el elemento físico
    const element = this.htmlContainerRef.nativeElement.querySelector(
      mapping.domSelector
    ) as HTMLElement;

    if (!element || !mapping.validatorConfig) return;

    mapping.validatorConfig.forEach((validator) => {
      // Usamos Renderer2 para ser "Angular Friendly"
      switch (validator.type.toLowerCase()) {
        case 'required':
        case 'requiredtrue':
          this.renderer.setAttribute(element, 'required', 'true');
          // También es buena práctica poner el aria-required para accesibilidad
          this.renderer.setAttribute(element, 'aria-required', 'true');
          break;

        case 'maxlength':
          // ESTE es el que soluciona tu problema de que sigan escribiendo
          this.renderer.setAttribute(element, 'maxlength', String(validator.value));
          break;

        case 'minlength':
          this.renderer.setAttribute(element, 'minlength', String(validator.value));
          break;

        case 'min':
          this.renderer.setAttribute(element, 'min', String(validator.value));
          break;

        case 'max':
          this.renderer.setAttribute(element, 'max', String(validator.value));
          break;

        case 'pattern':
          this.renderer.setAttribute(element, 'pattern', String(validator.value));
          break;
          
        // Caso especial: Si validas email, podrías forzar el type="email"
        // aunque esto es opcional si ya viene en el HTML
        case 'email':
            // Opcional: Solo si es un input
            if (element.tagName === 'INPUT') {
                this.renderer.setAttribute(element, 'type', 'email');
            }
            break;
      }
    });
  });
}


/**
 * Sincroniza los atributos del DOM con la configuración
 * de los mapeos de campos.
 * - Establece el atributo `name` en los elementos del DOM
 *   si no lo tienen.
 * - Establece el atributo `autocomplete` en `off` en los
 *   elementos del DOM que tengan una máscara de entrada.
 * @private
 * @memberof DynamicViewerComponent
 */
private syncDomAttributes(): void {
  if (!this.formMappings || !this.htmlContainerRef) return;

  this.formMappings.forEach((mapping) => {
    const element = this.htmlContainerRef.nativeElement.querySelector(
      mapping.domSelector
    ) as HTMLElement;

    if (element) {
      if (!element.getAttribute('name')) {
        this.renderer.setAttribute(element, 'name', mapping.controlName);
      }
      
      if (mapping.inputMask) {
         this.renderer.setAttribute(element, 'autocomplete', 'off');
      }
    }
  });
}

/**
   * Configura listeners y atributos para inputs de tipo archivo.
   * Vincula el evento 'change' con el FormGroup y el Output fileSelected.
   */

  private setupFileInputs(): void {
    if (!this.formMappings || !this.htmlContainerRef) return;

    // Filtramos mappings relevantes
    const fileMappings = this.formMappings.filter((m) => {
      const el = this.htmlContainerRef.nativeElement.querySelector(m.domSelector);
      return el && (el.getAttribute('type') === 'file' || m.fileUploadConfig);
    });

    fileMappings.forEach((mapping) => {
      const element = this.htmlContainerRef.nativeElement.querySelector(
        mapping.domSelector
      ) as HTMLInputElement;

      if (!element) return;

      // Configurar atributos visuales (El servicio ya hace parte de esto, pero esto asegura atributos específicos de file)
      if (mapping.fileUploadConfig) {
        if (mapping.fileUploadConfig.accept) {
          this.renderer.setAttribute(element, 'accept', mapping.fileUploadConfig.accept);
        }
        if (mapping.fileUploadConfig.multiple) {
          this.renderer.setAttribute(element, 'multiple', 'true');
        }
      }

      // --- CORRECCIÓN CLAVE: Guardamos la referencia para limpiar el listener después ---
      const unlisten = this.renderer.listen(element, 'change', (event: any) => {
        const files = event.target.files;
        
        if (files && files.length > 0) {
          // Convertir FileList a Array para facilitar validación
          const fileArray = Array.from(files) as File[];
          const fileToEmit = mapping.fileUploadConfig?.multiple ? fileArray : fileArray[0];

          // 1. Usar tu validador helper (estaba sin usar)
          const validationErrors = this.validateFiles(fileArray, mapping, mapping.fileUploadConfig);
          
          if (validationErrors.length > 0) {
             // Si hay error, marcamos el control y limpiamos el input
             this.setControlError(mapping.controlName, { fileValidation: validationErrors });
             element.value = ''; // Limpiar el input físico
             return;
          }

          // 2. Actualizar FormControl (El servicio también lo hace, pero esto asegura consistencia inmediata para el evento)
          this.dynamicForm.get(mapping.controlName)?.setValue(fileToEmit);
          this.dynamicForm.get(mapping.controlName)?.markAsDirty();
          this.dynamicForm.get(mapping.controlName)?.markAsTouched();

          // 3. Emitir evento
          const payload: FilePayload = {
            controlName: mapping.controlName,
            file: fileToEmit, // Puede ser File o File[]
            formId: this.formId || this.contentId,
            isMultiple: mapping.fileUploadConfig?.multiple || false
          };
          
          this.fileSelected.emit(payload);
        } else {
          // Reset si el usuario cancela
          this.dynamicForm.get(mapping.controlName)?.setValue(null);
        }
      });

      // ¡IMPORTANTE! Agregamos el listener a la lista de limpieza
      this.domListeners.push(unlisten);
    });
  }

/**
 * Valida archivos según configuración
 */
private validateFiles(files: File[], mapping: FormFieldMapping, fileConfig?: any): string[] {
  const errors: string[] = [];
  const config = fileConfig || {};
  
  files.forEach(file => {
    // Validar tamaño máximo
    if (config.maxSize && file.size > config.maxSize) {
      errors.push(`El archivo ${file.name} excede el tamaño máximo de ${this.formatBytes(config.maxSize)}`);
    }
    
    // Validar tipos aceptados
    if (config.accept && !this.checkFileType(file, config.accept)) {
      errors.push(`El archivo ${file.name} no es de un tipo aceptado: ${config.accept}`);
    }
  });
  
  // Validar cantidad máxima
  if (config.maxCount && files.length > config.maxCount) {
    errors.push(`Máximo ${config.maxCount} archivos permitidos`);
  }
  
  return errors;
}

private formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}


private checkFileType(file: File, accept: string): boolean {
  const types = accept.split(',').map(t => t.trim().toLowerCase());
  return types.some(type => {
    if (type.startsWith('.')) return file.name.toLowerCase().endsWith(type);
    if (type.endsWith('/*')) return file.type.startsWith(type.replace('/*', ''));
    return file.type === type;
  });
}


/**
 * Limpia todas las instancias externas y recursos asociados
 * como editores de texto, datepickers, sliders, etc.
 */
private cleanupExternalInstances(): void {
  if (!this.htmlContainerRef?.nativeElement) return;

  // 1. Limpiar instancias de Quill.js
  this.cleanupQuillInstances();

  // 2. Limpiar instancias de Flatpickr
  this.cleanupFlatpickrInstances();

  // 3. Limpiar instancias de Bootstrap Datepicker
  this.cleanupBootstrapDatepickers();

  // 4. Limpiar instancias de TinyMCE
  this.cleanupTinyMCEInstances();

  // 5. Limpiar instancias de CKEditor
  this.cleanupCKEditorInstances();

  // 6. Limpiar sliders/complex controls
  this.cleanupSliderInstances();

  // 7. Limpiar tooltips/popovers de Bootstrap
  this.cleanupBootstrapComponents();

  // 8. Limpiar reCAPTCHA
  this.cleanupRecaptchaInstances();

  // 9. Limpiar cualquier otro widget/plugin
  this.cleanupGenericWidgets();
}

/**
 * Limpia instancias de Quill.js
 */
private cleanupQuillInstances(): void {
  // Método 1: Buscar por clase CSS
  const quillEditors = this.htmlContainerRef.nativeElement.querySelectorAll('.ql-editor');
  quillEditors.forEach(editor => {
    const quillInstance = (editor as any).__quill;
    if (quillInstance && typeof quillInstance.destroy === 'function') {
      try {
        quillInstance.destroy();
        (editor as any).__quill = null;
      } catch (error) {
        console.warn('Error destruyendo instancia Quill:', error);
      }
    }
  });

  // Método 2: Buscar por atributo data-quill
  const quillContainers = this.htmlContainerRef.nativeElement.querySelectorAll('[data-quill-instance]');
  quillContainers.forEach(container => {
    const instanceId = container.getAttribute('data-quill-instance');
    if (instanceId && (window as any)[instanceId]) {
      try {
        (window as any)[instanceId].destroy();
        (window as any)[instanceId] = null;
        container.removeAttribute('data-quill-instance');
      } catch (error) {
        console.warn(`Error destruyendo Quill instance ${instanceId}:`, error);
      }
    }
  });
}

/**
 * Limpia instancias de Flatpickr
 */
private cleanupFlatpickrInstances(): void {
  const flatpickrInputs = this.htmlContainerRef.nativeElement.querySelectorAll('.flatpickr-input, [data-fp-instance]');
  
  flatpickrInputs.forEach(input => {
    // Método 1: Flatpickr almacena referencia en _flatpickr
    const fpInstance = (input as any)._flatpickr;
    if (fpInstance && typeof fpInstance.destroy === 'function') {
      try {
        fpInstance.destroy();
        (input as any)._flatpickr = null;
      } catch (error) {
        console.warn('Error destruyendo Flatpickr:', error);
      }
    }
    
    // Método 2: Buscar por atributo data
    const instanceId = input.getAttribute('data-fp-instance');
    if (instanceId && (window as any)[instanceId]) {
      try {
        (window as any)[instanceId].destroy();
        (window as any)[instanceId] = null;
        input.removeAttribute('data-fp-instance');
      } catch (error) {
        console.warn(`Error destruyendo Flatpickr instance ${instanceId}:`, error);
      }
    }
  });
}

/**
 * Limpia instancias de Bootstrap Datepicker
 */
private cleanupBootstrapDatepickers(): void {
  const datepickerInputs = this.htmlContainerRef.nativeElement.querySelectorAll('.datepicker, [data-datepicker]');
  
  if ((window as any).jQuery?.fn?.datepicker) {
    datepickerInputs.forEach(input => {
      try {
        const $input = (window as any).jQuery(input);
        if ($input.data('datepicker')) {
          $input.datepicker('destroy');
          $input.removeData('datepicker');
        }
      } catch (error) {
        console.warn('Error destruyendo Bootstrap Datepicker:', error);
      }
    });
  }
}

/**
 * Limpia instancias de TinyMCE
 */
private cleanupTinyMCEInstances(): void {
  if ((window as any).tinymce) {
    const tinyMCEIds: string[] = [];
    
    // Buscar textareas con clase de TinyMCE
    const tinyEditors = this.htmlContainerRef.nativeElement.querySelectorAll('.mce-tinymce, [data-tinymce-id]');
    
    tinyEditors.forEach(editor => {
      const editorId = editor.id || editor.getAttribute('data-tinymce-id');
      if (editorId) {
        tinyMCEIds.push(editorId);
      }
    });
    
    // Destruir cada instancia
    tinyMCEIds.forEach(editorId => {
      try {
        const instance = (window as any).tinymce.get(editorId);
        if (instance && typeof instance.remove === 'function') {
          instance.remove();
        }
      } catch (error) {
        console.warn(`Error destruyendo TinyMCE instance ${editorId}:`, error);
      }
    });
  }
}

/**
 * Limpia instancias de CKEditor
 */
private cleanupCKEditorInstances(): void {
  if ((window as any).CKEDITOR) {
    const ckEditorInstances = Object.keys((window as any).CKEDITOR.instances);
    
    ckEditorInstances.forEach(instanceName => {
      const instance = (window as any).CKEDITOR.instances[instanceName];
      const container = instance?.container?.$;
      
      // Verificar si el editor está dentro de nuestro contenedor
      if (container && this.htmlContainerRef.nativeElement.contains(container)) {
        try {
          instance.destroy();
        } catch (error) {
          console.warn(`Error destruyendo CKEditor instance ${instanceName}:`, error);
        }
      }
    });
  }
}

/**
 * Limpia instancias de sliders y controles complejos
 */
private cleanupSliderInstances(): void {
  // Sliders con noUiSlider
  const noUiSliders = this.htmlContainerRef.nativeElement.querySelectorAll('[data-nouislider]');
  noUiSliders.forEach(slider => {
    const instance = (slider as any).noUiSlider;
    if (instance && typeof instance.destroy === 'function') {
      try {
        instance.destroy();
        (slider as any).noUiSlider = null;
      } catch (error) {
        console.warn('Error destruyendo noUiSlider:', error);
      }
    }
  });

  // Sliders con jQuery UI
  if ((window as any).jQuery?.fn?.slider) {
    const jquerySliders = this.htmlContainerRef.nativeElement.querySelectorAll('.ui-slider');
    jquerySliders.forEach(slider => {
      try {
        const $slider = (window as any).jQuery(slider);
        if ($slider.hasClass('ui-slider')) {
          $slider.slider('destroy');
        }
      } catch (error) {
        console.warn('Error destruyendo jQuery UI Slider:', error);
      }
    });
  }
}

/**
 * Limpia componentes de Bootstrap
 */
private cleanupBootstrapComponents(): void {
    // Verificamos si jQuery está disponible antes de intentar usarlo
    const $ = (window as any).jQuery;
    if (!$) return; // Si no hay jQuery, no hacemos nada y evitamos el crash

    // Tooltips
    const tooltips = this.htmlContainerRef.nativeElement.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltips.forEach((element) => {
      try {
        const $el = $(element);
        // Verificamos si tiene el plugin data antes de llamar a dispose
        if ($el.data && $el.data('bs.tooltip')) {
          $el.tooltip('dispose');
        }
      } catch (error) {
        console.warn('Error limpiando Bootstrap Tooltip:', error);
      }
    });

    // Popovers
    const popovers = this.htmlContainerRef.nativeElement.querySelectorAll('[data-bs-toggle="popover"]');
    popovers.forEach((element) => {
      try {
        const $el = $(element);
        if ($el.data && $el.data('bs.popover')) {
          $el.popover('dispose');
        }
      } catch (error) {
        console.warn('Error limpiando Bootstrap Popover:', error);
      }
    });

    // Modals (Solo cerrar si están abiertos, no destruir el DOM globalmente)
    const modals = this.htmlContainerRef.nativeElement.querySelectorAll('.modal');
    modals.forEach((element) => {
      try {
        const $el = $(element);
        if ($el.modal) {
          $el.modal('hide');
        }
      } catch (error) {
        // Ignorar errores de modal si no estaba inicializado
      }
    });
  }

/**
 * Limpia instancias de reCAPTCHA
 */
private cleanupRecaptchaInstances(): void {
  const recaptchaContainers = this.htmlContainerRef.nativeElement.querySelectorAll('.g-recaptcha, [data-recaptcha-id]');
  
  recaptchaContainers.forEach(container => {
    const widgetId = container.getAttribute('data-recaptcha-id');
    if (widgetId && (window as any).grecaptcha) {
      try {
        (window as any).grecaptcha.reset(widgetId);
      } catch (error) {
        console.warn('Error reseteando reCAPTCHA:', error);
      }
    }
  });
}

/**
 * Limpia widgets genéricos
 */
private cleanupGenericWidgets(): void {
  // Limpiar cualquier intervalo o timeout creado por widgets
  const widgetElements = this.htmlContainerRef.nativeElement.querySelectorAll('[data-widget-id]');
  
  widgetElements.forEach(element => {
    const widgetId = element.getAttribute('data-widget-id');
    if (widgetId && (window as any)[`widget_${widgetId}`]) {
      const widget = (window as any)[`widget_${widgetId}`];
      
      // Intentar llamar a destroy si existe
      if (widget && typeof widget.destroy === 'function') {
        try {
          widget.destroy();
        } catch (error) {
          console.warn(`Error destruyendo widget ${widgetId}:`, error);
        }
      }
      
      // Limpiar referencia
      (window as any)[`widget_${widgetId}`] = null;
      element.removeAttribute('data-widget-id');
    }
    
    // Limpiar event listeners almacenados en data attributes
    const listenerKeys = ['click', 'change', 'input', 'blur', 'focus'];
    listenerKeys.forEach(key => {
      const listenerId = element.getAttribute(`data-listener-${key}`);
      if (listenerId && (window as any)[listenerId]) {
        try {
          element.removeEventListener(key, (window as any)[listenerId]);
          (window as any)[listenerId] = null;
        } catch (error) {
          console.warn(`Error removiendo listener ${listenerId}:`, error);
        }
      }
    });
  });
}

/**
 * setTimeout que se autolimpia y maneja errores
 */
protected safeTimeout(callback: () => void, delay: number): number {
  const id = window.setTimeout(() => {
    try {
      callback();
    } catch (error) {
      console.error('Error en safeTimeout:', error);
      this.emitError(`Error en timer: ${error}`);
    } finally {
      this.timeoutIds.delete(id);
    }
  }, delay);
  
  this.timeoutIds.add(id);
  return id;
}

/**
 * setInterval con registro para limpieza
 */
protected safeInterval(callback: () => void, delay: number): number {
  const id = window.setInterval(() => {
    try {
      callback();
    } catch (error) {
      console.error('Error en safeInterval:', error);
      this.emitError(`Error en intervalo: ${error}`);
    }
  }, delay);
  
  this.intervalIds.add(id);
  return id;
}

/**
 * Cancela un timeout específico
 */
protected cancelTimeout(id: number): void {
  clearTimeout(id);
  this.timeoutIds.delete(id);
}

/**
 * Cancela un interval específico
 */
protected cancelInterval(id: number): void {
  clearInterval(id);
  this.intervalIds.delete(id);
}

/**
 * Cancela todos los timers activos
 */
protected cancelAllTimers(): void {
  this.timeoutIds.forEach(id => clearTimeout(id));
  this.intervalIds.forEach(id => clearInterval(id));
  this.timeoutIds.clear();
  this.intervalIds.clear();
}


  /**
   * Analiza los mapeos para cargar hojas de estilo de terceros si se requieren
   */
  private checkAndLoadExternalDependencies(): void {
    this.formMappings?.forEach(mapping => {
      // Si el mapeo requiere Quill Editor
      if (mapping.richTextConfig?.editorType === 'quill') {
        this.loadCss('https://cdn.quilljs.com/1.3.6/quill.snow.css');
      }
      // Si el mapeo requiere Flatpickr
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
   this.safeTimeout(() => {
    document.head.appendChild(link);
  }, 0);
}




  /**
   * Emite un error al exterior del componente, mostrando un mensaje de warning
   * en la consola y emitiendo un evento `componentError` con el mensaje
   * completo.
   *
   * El mensaje emitido es del tipo `[ID de contenido] [mensaje de error]`.
   *
   * @param message mensaje de error a emitir
   */
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
