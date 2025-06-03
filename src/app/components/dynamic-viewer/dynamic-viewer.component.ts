// dynamic-viewer.component.ts
import {
  Component, Input, OnInit, OnChanges, OnDestroy,
  ElementRef, Renderer2,
  ViewChild, AfterViewInit, SimpleChanges, Output, EventEmitter
} from '@angular/core';
import { FormBuilder, FormGroup, Validators, ValidatorFn, AbstractControl } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { ButtonConfig, FormFieldMapping } from '../../models/form-field-mapping.model'; // Ajusta la ruta
import { DynamicInyectCssService } from '../../services/dynamic-inyect-css.service'; // Ajusta la ruta
import { FormDomSynchronizerService } from '../../services/form-dom-synchronizer.service'; // Ajusta la ruta
import { CommonModule } from '@angular/common';
import { DynamicClickPayload } from '../../interfaces/DynamicContent.interface';

@Component({
  selector: 'app-dynamic-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div #htmlContainer [innerHTML]="safeHtmlContent"></div>
  `,
  styleUrls: ['./dynamic-viewer.component.css']
})
export class DynamicViewerComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() contentId!: string;
  @Input() htmlContentString: string = '';
  @Input() cssContentString?: string;
  @Input() formId: string = 'genericForm';
  @Input() formMappings?: FormFieldMapping[];
  @Input() formInitialData?: any;
  @Input() buttonConfigs?: ButtonConfig[];
  @Input() parentForm?: FormGroup; // Si se usa en un formulario padre

  @Output() formSubmitted = new EventEmitter<{ formId?: string, data: any }>();
  @Output() actionClicked = new EventEmitter<DynamicClickPayload>();

  safeHtmlContent!: SafeHtml;
  dynamicForm!: FormGroup;
  isForm: boolean = false;

  private buttonElements = new Map<string, HTMLButtonElement | null>();
  private viewInitialized = false;
  private styleId?: string;
  private domFormSubmitListeners: Array<() => void> = [];
  private activeMutationObserver: MutationObserver | null = null;
  private domActionClickListeners: Array<() => void> = [];
  private subscriptions = new Subscription();

  @ViewChild('htmlContainer') htmlContainerRef!: ElementRef<HTMLDivElement>;

  constructor(
    private sanitizer: DomSanitizer,
    private cssInjector: DynamicInyectCssService,
    private formBuilder: FormBuilder,
    private synchronizer: FormDomSynchronizerService,
    private renderer: Renderer2
  ) {}

  ngOnInit(): void {
    this.isForm = !!(this.formMappings && this.formMappings.length > 0);
    this.buildAndInitializeForm();
    
    if (this.isForm && this.dynamicForm) {
      this.subscriptions.add(
        this.dynamicForm.valueChanges.subscribe((res) =>{ 
          this.updateButtonStates()})
      );
    }
  }
  
  private buildAndInitializeForm(): void {
    if (this.isForm && this.formMappings) {
        this.buildFormGroup();
        if (this.formInitialData && this.dynamicForm) {
            this.dynamicForm.patchValue(this.formInitialData, { emitEvent: false });
            this.parentForm?.removeControl(this.formId || this.contentId); // Asegurarse de que no haya duplicados
            this.parentForm?.addControl(this.formId || this.contentId, this.dynamicForm);
        }
        this.setupFormSubscriptions();
    } else {
        this.dynamicForm = this.formBuilder.group({}); // Siempre tener un FormGroup
    }
  }


  ngOnChanges(changes: SimpleChanges): void {
    let reInitializeDomInteractions = false;
    let formStructureChanged = false;
  
    if (changes['htmlContentString']) {
      this.safeHtmlContent = this.sanitizer.bypassSecurityTrustHtml(this.htmlContentString);
      reInitializeDomInteractions = true;
    }
    if (changes['formMappings'] || changes['formInitialData']) {
      this.isForm = !!(this.formMappings && this.formMappings.length > 0);
      this.subscriptions.unsubscribe();
      this.subscriptions = new Subscription();
      this.buildAndInitializeForm();
      reInitializeDomInteractions = true;
      formStructureChanged = true;
    }
    if (changes['buttonConfigs']) {
      if (this.viewInitialized && this.htmlContainerRef?.nativeElement) {
        setTimeout(() => {
          this.cacheButtonElements();
          this.updateButtonStates();
        }, 0);
      } else if (!this.viewInitialized) {
          reInitializeDomInteractions = true;
      }
    }
  
    if (this.viewInitialized && reInitializeDomInteractions && this.htmlContainerRef?.nativeElement) {
      this.cleanupDomInteractions(); 
      setTimeout(() => { 
        this.initializeInjectedContentInteractions();
        if (formStructureChanged) {
            this.updateButtonStates();
        }
      }, 0);
    }
    
    if (this.htmlContainerRef && (changes['cssContentString'] || changes['contentId']) && this.viewInitialized) {
      this.injectCss();
    }
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.injectCss();
    this.initializeInjectedContentInteractions();
  }

  private initializeInjectedContentInteractions(): void {
    this.cleanupDomInteractions(); // Limpiar cualquier observer o listener previo

    const setupLogic = (observerInstance?: MutationObserver) => {
      if (this.htmlContainerRef?.nativeElement && this.htmlContainerRef.nativeElement.childElementCount > 0) {
        if (this.isForm && this.dynamicForm && this.formMappings && this.formMappings.length > 0) {
          this.synchronizer.connect(this.formId, this.dynamicForm, this.htmlContainerRef.nativeElement, this.formMappings);
          this.setupInjectedFormSubmitPrevention();
          this.subscribeAndSetErrorVisualsOnInputs();
        }
        this.setupInjectedActionClickListeners();
        this.cacheButtonElements();
        this.updateButtonStates();
        
        if (observerInstance) {
          observerInstance.disconnect();
          this.activeMutationObserver = null;
        }
        return true;
      }
      return false;
    };

    if (this.htmlContainerRef?.nativeElement) {
      if (!setupLogic()) { // Intenta inmediatamente
        const observer = new MutationObserver((mutations, obs) => {
          setupLogic(obs);
        });
        observer.observe(this.htmlContainerRef.nativeElement, { childList: true, subtree: true });
        this.activeMutationObserver = observer;
      } else {
      }
    } else {
      console.warn(`DynamicViewer (${this.contentId}): htmlContainerRef no disponible para inicializar interacciones.`);
    }
  }


  /**
   * Establece los listeners para detectar clicks en botones con "data-dynamic-action" en el HTML inyectado.
   * Estos botones no son type="submit" y no están dentro de un <form>.
   * La lógica de este método se encarga de buscar hacia arriba en el DOM hasta encontrar un botón con
   * data-dynamic-action o hasta llegar al contenedor del HTML inyectado.
   * Si se encuentra un botón con data-dynamic-action, se emite el evento "actionClicked" con la acción
   * correspondiente y el botón que fue clickeado.
   * Se utiliza Renderer2 para escuchar el evento "click" en el contenedor del HTML inyectado.
   * Los listeners se guardan en un array para que se puedan limpiar en el futuro.
   */
private setupInjectedActionClickListeners(): void {
  this.domActionClickListeners.forEach(unlisten => unlisten());
  this.domActionClickListeners = [];

  if (!this.htmlContainerRef?.nativeElement) {
    console.warn(`DynamicViewer (${this.contentId}): htmlContainerRef no disponible para configurar ActionClickListeners.`);
    return;
  }

  
  const hostElement = this.htmlContainerRef.nativeElement;
  const unlistenClickFn = this.renderer.listen(hostElement, 'click', (event: Event) => {
    
    let currentElement = event.target as HTMLElement | null;
    let depth = 0; 

    while (currentElement && currentElement !== hostElement && depth < 10) {
      
      if (currentElement.matches && currentElement.matches('button[data-dynamic-action]')) {
        const action = currentElement.getAttribute('data-dynamic-action');
        if (action) {
          this.actionClicked.emit({
            action: action,
            sourceId: this.formId || this.contentId,
            clickedElement: currentElement,
            originalEvent: event
          });
        } else {
          console.warn(`DynamicViewer (${this.contentId}): Botón encontrado con data-dynamic-action pero el atributo está vacío.`);
        }
        break; // Salir del bucle una vez que encontramos un botón con data-dynamic-action
      }

      if (!currentElement.parentElement || currentElement.parentElement === hostElement.parentElement) {
        break;
      }
      
      currentElement = currentElement.parentElement;
      depth++;
    }
  });
  this.domActionClickListeners.push(unlistenClickFn);
}



  
/**
 * Limpia las interacciones del DOM previamente registradas.
 * Desconecta el MutationObserver si está activo, desconecta el
 * sincronizador de formularios si es aplicable, y elimina todos
 * los listeners asociados a los eventos de envío de formularios 
 * y acciones de clic en botones. También reinicia las listas de
 * listeners para evitar duplicados. 
 * No es necesario limpiar los elementos de botón, ya que 
 * `cacheButtonElements()` se encarga de ello.
 */

  private cleanupDomInteractions(): void {
    if (this.activeMutationObserver) {
      this.activeMutationObserver.disconnect();
      this.activeMutationObserver = null;
    }
    if (this.isForm) {
      this.synchronizer.disconnect(this.formId);
    }
    this.domFormSubmitListeners.forEach(unlisten => unlisten());
    this.domFormSubmitListeners = [];
    this.domFormSubmitListeners.forEach(unlisten => unlisten()); // Los de submit
    this.domFormSubmitListeners = [];
    this.domActionClickListeners.forEach(unlisten => unlisten()); 
    this.domActionClickListeners = [];
  }


  private setupInjectedFormSubmitPrevention(): void {
    this.domFormSubmitListeners.forEach(unlisten => unlisten());
    this.domFormSubmitListeners = [];

    if (!this.htmlContainerRef || !this.isForm) return;

    const formsInInjectedHtml = this.htmlContainerRef.nativeElement.querySelectorAll('form');
    formsInInjectedHtml.forEach((formElement: HTMLFormElement) => {
      const unlistenFn = this.renderer.listen(formElement, 'submit', (event: Event) => {
        event.preventDefault();
        this.triggerSubmit(); 
      });
      this.domFormSubmitListeners.push(unlistenFn);
    });
  }
  

  // injectCss, buildFormGroup, cacheButtonElements, updateButtonStates, triggerSubmit se mantienen como los definiste antes
  private injectCss(): void {
    if (this.styleId) {
      this.cssInjector.removeCss(this.styleId);
      this.styleId = undefined;
    }
    if (this.cssContentString && this.contentId) {
      this.styleId = this.cssInjector.generateStyleId(`viewer-${this.contentId}`);
      this.cssInjector.injectCss(this.cssContentString, this.styleId);
    }
  }

  /**
   * Crea un formulario din mico con los campos definidos en `formMappings`.
   * Los campos se inicializan con los valores por defecto especificados en `formMappings` o con una cadena vac a.
   * Los validadores se agregan a cada campo seg n la configuraci n especificada en `formMappings`.
   * Los tipos de validadores admitidos son:
   * - required
   * - email
   * - minlength
   * - maxlength
   * - pattern
   * - min
   * - max
   * - requiredtrue
   * - matchValue (verifica que el valor del campo coincida con el especificado en la configuraci n)
   * Si se especifica un tipo de validador no reconocido, se mostrar  una advertencia en la consola.
   */
  private buildFormGroup(): void { 
    const groupConfig: { [key: string]: any } = {};
    if (!this.formMappings) {
      this.dynamicForm = this.formBuilder.group({});
      return;
    }
    this.formMappings.forEach(map => {
      const controlValidators: ValidatorFn[] = [];
      if (map.validatorConfig) {
        map.validatorConfig.forEach(config => {
          switch (config.type.toLowerCase()) {
            case 'required': controlValidators.push(Validators.required); break;
            case 'email': controlValidators.push(Validators.email); break;
            case 'minlength': if (config.value !== undefined) controlValidators.push(Validators.minLength(config.value)); break;
            case 'maxlength': if (config.value !== undefined) controlValidators.push(Validators.maxLength(config.value)); break;
            case 'pattern': if (config.value) controlValidators.push(Validators.pattern(config.value)); break;
            case 'min': if (config.value !== undefined) controlValidators.push(Validators.min(config.value)); break;
            case 'max': if (config.value !== undefined) controlValidators.push(Validators.max(config.value)); break;
            case 'requiredtrue': controlValidators.push(Validators.requiredTrue); break;
            case 'matchValue': if (config.value) {
              controlValidators.push((control: AbstractControl) => {
                return control.value === config.value ? null : { matchValue: { valid: false, value: config.value } };
              })
            }
            break;
            default: console.warn(`Validador no reconocido: ${config.type}`);
          }
        });
      }
      groupConfig[map.controlName] = [map.defaultValue || '', controlValidators];
    });
    this.dynamicForm = this.formBuilder.group(groupConfig);
  }

  private cacheButtonElements(): void {
    this.buttonElements.clear();
    if (this.buttonConfigs && this.htmlContainerRef?.nativeElement) {
      this.buttonConfigs.forEach(config => {
        const element = this.htmlContainerRef.nativeElement.querySelector(config.selector) as HTMLButtonElement | null;
        this.buttonElements.set(config.selector, element);
        if (!element) {
          console.warn(`DynamicViewer (${this.contentId}): Botón con selector "${config.selector}" no encontrado.`);
        }
      });
    }
  }
  
  /**
   * Actualiza el estado de los botones con configuración de deshabilitación
   * según el estado del formulario.
   * @remarks
   * Si la configuración de un botón incluye una función de deshabilitación,
   * se llama con el formulario como parámetro y el valor de retorno determina
   * si el botón está deshabilitado.
   * Si la configuración de un botón incluye un string, se interpreta como una
   * condición de deshabilitación:
   * - 'formIsInvalid': El botón se deshabilita si el formulario es inválido.
   * - 'formIsPristine': El botón se deshabilita si el formulario es prístino.
   * - 'formIsInvalidOrPristine': El botón se deshabilita si el formulario es
   *   inválido o prístino.
   * De lo contrario, se muestra un warning en la consola.
   */
  private updateButtonStates(): void {
    if (!this.buttonConfigs || !this.dynamicForm || !this.htmlContainerRef?.nativeElement) return;
    this.buttonConfigs.forEach(config => {
      const buttonElement = this.buttonElements.get(config.selector);
      if (buttonElement) {
        let isDisabled = false;
        if (typeof config.disableWhen === 'function') {
          isDisabled = config.disableWhen(this.dynamicForm);
        } else if (typeof config.disableWhen === 'string') {
          switch (config.disableWhen) {
            case 'formIsInvalid': isDisabled = this.dynamicForm.invalid; break;
            case 'formIsPristine': isDisabled = this.dynamicForm.pristine; break;
            case 'formIsInvalidOrPristine': isDisabled = this.dynamicForm.invalid || this.dynamicForm.pristine; break;
            default: console.warn(`Condición desconocida: ${config.disableWhen}`);
          }
        }
        if (config.disableWhen !== undefined) {
            this.renderer.setProperty(buttonElement, 'disabled', isDisabled);
            this.renderer.setAttribute(buttonElement, 'aria-disabled', isDisabled.toString());
        }
      }
    });
  }
/**
 * Se suscribe a los cambios de estado de cada control en el dynamicForm
 * para actualizar visualmente los elementos del DOM (ej. añadir clases 'is-invalid' de Bootstrap).
 * Debería llamarse después de que el DOM esté listo y el dynamicForm construido.
 */
private subscribeAndSetErrorVisualsOnInputs(): void {
  if (!this.dynamicForm || !this.formMappings || !this.htmlContainerRef?.nativeElement) {
    console.warn('DynamicViewer: No se pueden configurar visuales de error. Formulario, mapeos o contenedor no listos.');
    return;
  }


  this.formMappings.forEach(mapping => {
    const control = this.dynamicForm.get(mapping.controlName);
    // El elemento DOM del INPUT (no el contenedor de errores)
    const inputElement = this.htmlContainerRef.nativeElement.querySelector(mapping.domSelector) as HTMLElement | null;

    if (control && inputElement) {
      // Función para actualizar los visuales del input
      const updateVisuals = () => {
        if (control.invalid && (control.dirty || control.touched)) {
          this.renderer.addClass(inputElement, 'is-invalid'); // Clase de Bootstrap para error
          this.renderer.setAttribute(inputElement, 'aria-invalid', 'true');
        } else {
          this.renderer.removeClass(inputElement, 'is-invalid');
          this.renderer.removeAttribute(inputElement, 'aria-invalid'); 
          // Opcional: Añadir clase 'is-valid' si es válido y tocado/sucio
          if (control.valid && (control.dirty || control.touched)) {
            this.renderer.addClass(inputElement, 'is-valid');
          } else {
            this.renderer.removeClass(inputElement, 'is-valid');
          }
        }
      };

      // Aplicar visuales iniciales basados en el estado actual del control
      updateVisuals();

      // Suscribirse a cambios de estado para actualizaciones continuas
      const sub = control.statusChanges.subscribe(() => {
        updateVisuals();
      });
      this.subscriptions.add(sub);

    } else {
      if (!control) {
        console.warn(`Visuals: FormControl no encontrado para "${mapping.controlName}"`);
      }
      if (!inputElement) {
        console.warn(`Visuals: Elemento DOM (input) no encontrado con selector "${mapping.domSelector}" para control "${mapping.controlName}"`);
      }
    }
  });
}


private setupFormSubscriptions(): void {
  if (this.isForm && this.dynamicForm) {
      this.subscriptions.add(
          this.dynamicForm.valueChanges.subscribe(() => {
              this.updateButtonStates();
          })
      );
      this.subscriptions.add(
          this.dynamicForm.statusChanges.subscribe(() => {
              this.updateButtonStates();
          })
      );
  }
}



/**
 * Lanza el evento de envío del formulario si el formulario es válido.
 * Marca todos los controles como "touched" y actualiza su estado de validación.
 * Emite el evento "formSubmitted" con los datos del formulario si es válido.
 * De lo contrario, muestra un mensaje de warning en la consola.
 */
  triggerSubmit(): void { 
    if (!this.dynamicForm) {
      console.warn(`DynamicViewer (${this.contentId}): triggerSubmit llamado pero dynamicForm no está definido.`);
      return;
    }
    this.dynamicForm.markAllAsTouched();
    Object.values(this.dynamicForm.controls).forEach(control => control.updateValueAndValidity({ emitEvent: true }));
    if (this.dynamicForm.valid) {
      const dataToSubmit = this.dynamicForm.value;
      this.formSubmitted.emit({ formId: this.formId || this.contentId, data: dataToSubmit });
    } else {
      console.warn(`DynamicViewer (${this.contentId}): Formulario Angular INVÁLIDO.`);
    }
  }


    /**
   * Deshabilita un campo del formulario basado en su controlName.
   */
    public disableFormField(controlName: string): void {
      if (this.dynamicForm && this.dynamicForm.get(controlName)) {
        this.dynamicForm.get(controlName)?.disable();
      } else {
        console.warn(`DynamicViewer (<span class="math-inline">\{this\.contentId\}\)\: No se pudo deshabilitar FormControl\: "</span>{controlName}"`);
      }
    }
  
    /**
     * Habilita un campo del formulario basado en su controlName.
     */
    public enableFormField(controlName: string): void {
      if (this.dynamicForm && this.dynamicForm.get(controlName)) {
        this.dynamicForm.get(controlName)?.enable();
      } else {
        console.warn(`DynamicViewer (<span class="math-inline">\{this\.contentId\}\)\: No se pudo habilitar FormControl\: "</span>{controlName}"`);
      }
    }
  
    /**
     * Deshabilita un elemento genérico del DOM (como un botón) usando un selector CSS.
     */
    public disableElementBySelector(selector: string): void {
      if (this.htmlContainerRef?.nativeElement) {
        const element = this.htmlContainerRef.nativeElement.querySelector(selector) as HTMLElement | null;
        if (element) {
          this.renderer.setProperty(element, 'disabled', true);
          this.renderer.setAttribute(element, 'aria-disabled', 'true');
        } else {
          console.warn(`DynamicViewer (<span class="math-inline">\{this\.contentId\}\)\: Elemento no encontrado para deshabilitar\: \[</span>{selector}]`);
        }
      }
    }
  
    /**
     * Habilita un elemento genérico del DOM usando un selector CSS.
     */
    public enableElementBySelector(selector: string): void {
       if (this.htmlContainerRef?.nativeElement) {
        const element = this.htmlContainerRef.nativeElement.querySelector(selector) as HTMLElement | null;
        if (element) {
          this.renderer.removeAttribute(element, 'disabled');
          this.renderer.removeAttribute(element, 'aria-disabled');
        } else {
          console.warn(`DynamicViewer (<span class="math-inline">\{this\.contentId\}\)\: Elemento no encontrado para habilitar\: \[</span>{selector}]`);
        }
      }
    }

  ngOnDestroy(): void {
    if (this.styleId) {
      this.cssInjector.removeCss(this.styleId);
    }
    this.cleanupDomInteractions(); // Usar el método de limpieza unificado
    this.subscriptions.unsubscribe();
  }
}