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
import {
  ButtonConfig,
  FormFieldMapping,
} from '../../models/form-field-mapping.model'; 
import { DynamicInyectCssService } from '../../services/dynamic-inyect-css.service'; 
import { FormDomSynchronizerService } from '../../services/form-dom-synchronizer.service'; 
import { CommonModule } from '@angular/common';
import { DynamicClickPayload } from '../../interfaces/DynamicContent.interface';

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
export class DynamicViewerComponent
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

  @Output() formSubmitted = new EventEmitter<{ formId?: string; data: any }>();
  @Output() actionClicked = new EventEmitter<DynamicClickPayload>();
  @Output() componentError = new EventEmitter<string>();

  safeHtmlContent!: SafeHtml;
  dynamicForm!: FormGroup;
  isForm: boolean = false;

  private buttonElements = new Map<string, HTMLButtonElement | null>();
  private viewInitialized = false;
  private styleId?: string;
  private activeMutationObserver: MutationObserver | null = null;
  private subscriptions = new Subscription();
  private domListeners: Array<() => void> = [];

  @ViewChild('htmlContainer') htmlContainerRef!: ElementRef<HTMLDivElement>;

  constructor(
    private sanitizer: DomSanitizer,
    private cssInjector: DynamicInyectCssService,
    private formBuilder: FormBuilder,
    private synchronizer: FormDomSynchronizerService,
    private renderer: Renderer2
  ) {}

  ngOnInit(): void {
    this.buildAndInitializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    let needsFullRebuild = false;

    if (changes['htmlContentString']) {
      this.safeHtmlContent = this.sanitizer.bypassSecurityTrustHtml(this.htmlContentString);
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
                this.dynamicForm.patchValue(this.formInitialData, { emitEvent: false });
            }
            if (changes['buttonConfigs']) {
                // Schedule update after DOM is stable
                setTimeout(() => this.updateButtonStates(), 0);
            }
            if (changes['cssContentString'] || changes['contentId']) {
                this.injectCss();
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
    if (this.styleId) {
      this.cssInjector.removeCss(this.styleId);
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
    setTimeout(() => this.initializeInjectedContentInteractions(), 0);
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

    if (this.parentForm) {
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
      const validators = (map.validatorConfig || []).map(config => this.getValidator(config.type, config.value)).filter(v => v) as ValidatorFn[];
      groupConfig[map.controlName] = [map.defaultValue || '', validators];
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
          case 'required': return Validators.required;
          case 'email': return Validators.email;
          case 'minlength': return Validators.minLength(value);
          case 'maxlength': return Validators.maxLength(value);
          case 'pattern': return Validators.pattern(value);
          case 'min': return Validators.min(value);
          case 'max': return Validators.max(value);
          case 'requiredtrue': return Validators.requiredTrue;
          case 'matchvalue': return (control: AbstractControl) => 
              control.value === value ? null : { matchValue: { valid: false, value } };
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
      if (!this.htmlContainerRef?.nativeElement?.childElementCount) return false;

      if (this.isForm && this.formMappings) {
        this.synchronizer.connect(this.formId, this.dynamicForm, this.htmlContainerRef.nativeElement, this.formMappings);
        this.setupInjectedFormSubmitPrevention();
        this.subscribeAndSetErrorVisualsOnInputs();
        this.setupInjectedKeyFiltering();
        this.setupAutoFormatting();
      }
      this.setupInjectedActionClickListeners();
      this.cacheButtonElements();
      this.updateButtonStates();

      return true;
    };

    if (!setupLogic()) {
      this.activeMutationObserver = new MutationObserver((_, obs) => {
        if (setupLogic()) {
          obs.disconnect();
          this.activeMutationObserver = null;
        }
      });
      this.activeMutationObserver.observe(this.htmlContainerRef.nativeElement, { childList: true, subtree: true });
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
    this.activeMutationObserver?.disconnect();
    this.activeMutationObserver = null;
    
    if (this.isForm) {
      this.synchronizer.disconnect(this.formId);
    }
    
    this.domListeners.forEach((unlisten) => unlisten());
    this.domListeners = [];
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
  private setupListener(element: any, event: string, handler: (event: any) => void): void {
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
    this.setupListener(this.htmlContainerRef.nativeElement, 'click', (event: Event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('button[data-dynamic-action]') as HTMLButtonElement;
      
      if (button) {
        const action = button.getAttribute('data-dynamic-action');
        if (action) {
          this.actionClicked.emit({
            action,
            sourceId: this.formId || this.contentId,
            clickedElement: button,
            originalEvent: event,
          });
        }
      }
    });
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
    this.setupListener(this.htmlContainerRef.nativeElement, 'keydown', (event: KeyboardEvent) => {
      const target = event.target as HTMLInputElement;
      if (!target?.name || !['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      
      const mapping = this.formMappings?.find(m => m.controlName === target.name);
      if (!mapping?.keyFilter) return;

      const allowedKeys = ['Backspace', 'Tab', 'Enter', 'Escape', 'Delete', 'Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (allowedKeys.includes(event.key) || (event.ctrlKey || event.metaKey)) return;

      const regexMap: { [key: string]: RegExp } = {
          int: /^[0-9]$/, number: /^[0-9]$/, alpha: /^[a-zA-Z\s]$/,
          alphanum: /^[a-zA-Z0-9]$/, hex: /^[0-9a-fA-F]$/,
      };

      let regex = regexMap[mapping.keyFilter];
      if (mapping.keyFilter === 'decimal') {
          if (event.key === '.' && target.value.includes('.')) event.preventDefault();
          regex = /^[0-9.]$/;
      } else if (!regex) {
          try {
              regex = new RegExp(`^${mapping.keyFilter}$`);
          } catch {
              this.emitError(`Regex para keyFilter no válida: "${mapping.keyFilter}"`);
              return;
          }
      }

      if (regex && !regex.test(event.key)) {
        event.preventDefault();
      }
    });
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
    this.setupListener(this.htmlContainerRef.nativeElement, 'input', (event: Event) => {
      const target = event.target as HTMLInputElement;
      const mapping = this.formMappings?.find(m => m.controlName === target.name);
      if (mapping?.inputMask) {
        this.formatWithMask(target, mapping.inputMask);
      }
    });
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
      const dataCharsBeforeCursor = originalValue.substring(0, cursorPosition).replace(/[^a-zA-Z0-9]/g, '').length;
      
      const cleanedValue = originalValue.replace(/[^a-zA-Z0-9]/g, '');
      let formattedValue = '';
      let valueIndex = 0;
      let maskIndex = 0;

      while (maskIndex < mask.length && valueIndex < cleanedValue.length) {
          const maskChar = mask[maskIndex];
          const inputChar = cleanedValue[valueIndex];

          const isDigitMatch = maskChar === '9' && /[0-9]/.test(inputChar);
          const isAlphaMatch = maskChar.toLowerCase() === 'x' && /[a-zA-Z]/.test(inputChar);
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
      
      requestAnimationFrame(() => {
          target.setSelectionRange(newCursorPosition, newCursorPosition);
      });
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
      if (typeof config.disableWhen === 'function') {
        isDisabled = config.disableWhen(form);
      } else if (typeof config.disableWhen === 'string') {
        // Mapeo directo para condiciones comunes
        const conditionMap: { [key: string]: boolean } = {
            formIsInvalid: form.invalid,
            formIsValid: form.valid,
            formIsPristine: form.pristine,
            formIsDirty: form.dirty,
            formIsTouched: form.touched,
            formIsUntouched: form.untouched,
            formIsPending: form.pending,
            formItselfIsDisabled: form.disabled,
            formItselfIsEnabled: form.enabled,
            alwaysDisable: true,
            neverDisable: false,
            // Condiciones compuestas
            formIsInvalidOrPristine: form.invalid || form.pristine,
            formIsEmpty: this.isFormEffectivelyEmpty(),
            formIsNotEmpty: !this.isFormEffectivelyEmpty(),
        };
  
        if (config.disableWhen in conditionMap) {
            isDisabled = conditionMap[config.disableWhen];
        } else {
            this.emitError(`Condición de 'disableWhen' desconocida: ${config.disableWhen}`);
        }
      }
      this.renderer.setProperty(button, 'disabled', isDisabled);
    });
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
    this.formMappings.forEach((mapping) => {
      const control = this.dynamicForm.get(mapping.controlName);
      const inputElement = this.htmlContainerRef.nativeElement.querySelector(mapping.domSelector) as HTMLElement;

      if (control && inputElement) {
        const sub = control.statusChanges.subscribe(() => {
          const isInvalid = control.invalid && (control.dirty || control.touched);
          this.renderer.setProperty(inputElement, 'classList.is-invalid', isInvalid);
          this.renderer.setProperty(inputElement, 'classList.is-valid', !isInvalid && (control.dirty || control.touched));
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
      const element = this.htmlContainerRef.nativeElement.querySelector(config.selector) as HTMLButtonElement | null;
      this.buttonElements.set(config.selector, element);
      if (!element) {
        this.emitError(`Botón con selector "${config.selector}" no encontrado.`);
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
    const sub = this.dynamicForm.valueChanges.subscribe(() => this.updateButtonStates());
    const statusSub = this.dynamicForm.statusChanges.subscribe(() => this.updateButtonStates());
    this.subscriptions.add(sub);
    this.subscriptions.add(statusSub);
  }

  // --- MÉTODOS AUXILIARES ---

  /**
   * Quita el estilo CSS previamente injectado (si lo había) y vuelve a injectar
   * el contenido del estilo CSS en la etiqueta `<style>` correspondiente en el
   * `<head>` del documento.
   *
   * Si no hay contenido de estilo CSS o no hay un ID de contenido, no hace
   * nada.
   */
  private injectCss(): void {
    if (this.styleId) {
      this.cssInjector.removeCss(this.styleId);
    }
    if (this.cssContentString && this.contentId) {
      this.styleId = this.cssInjector.generateStyleId(`viewer-${this.contentId}`);
      this.cssInjector.injectCss(this.cssContentString, this.styleId);
    }
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
      const element = this.htmlContainerRef?.nativeElement.querySelector(selector) as HTMLElement;
      if (element) {
          this.renderer.setProperty(element, 'disabled', disable);
      } else {
          this.emitError(`Elemento no encontrado con selector [${selector}] para ${disable ? 'deshabilitar' : 'habilitar'}.`);
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
}