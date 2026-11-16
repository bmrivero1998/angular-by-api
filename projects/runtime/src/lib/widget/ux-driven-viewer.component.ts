import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  HostListener,
  ElementRef,
  booleanAttribute,
  numberAttribute
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormGroup, PristineChangeEvent, ReactiveFormsModule, TouchedChangeEvent } from '@angular/forms';
import { Observable, Subscription, filter, finalize, take, debounceTime } from 'rxjs';

// Imports de tu librería
import { DynamicViewerComponent, ControlChangeEvent } from '@ux-driven-viewer/engine';
import { ApiDrivenContent, DynamicClickPayload } from '@ux-driven-viewer/engine';
import { ContentChange, DynamicViewerService } from '../content/dynamic-viewer.service';
import { isCloseAction, isResetAction, isSubmitAction, RETRY_LOAD_ACTION } from '../actions/action-names';
import { ModalService } from '../modal/modal.service';
import { FilePayload } from '@ux-driven-viewer/engine';

/** Snapshot del FormGroup completo, emitido en cada tick relevante. */
export interface FormStateSnapshot {
  value: any;
  valid: boolean;
  invalid: boolean;
  dirty: boolean;
  pristine: boolean;
  touched: boolean;
  pending: boolean;
}

/**
 * Los atributos HTML llegan como texto: sin conversión, `show-back-to-top="false"`
 * valdría el texto "false" (que cuenta como verdadero) y `scroll-offset="72"`
 * un texto en vez de un número. Estas funciones los convierten; un valor
 * inválido cae al valor por defecto del input.
 */
function toOffset(value: unknown): number {
  return numberAttribute(value, 0);
}
function toThreshold(value: unknown): number {
  return numberAttribute(value, 400);
}
function toDebounce(value: unknown): number {
  return numberAttribute(value, 150);
}

@Component({
  selector: 'ux-driven-viewer-widget',
  standalone: true,
  imports: [CommonModule, DynamicViewerComponent, ReactiveFormsModule],
  templateUrl: './ux-driven-viewer.component.html',
  // Un servicio de contenido por widget: dos <ux-driven-viewer> en la misma
  // página no comparten secciones en memoria.
  providers: [DynamicViewerService],
  // Encapsulación por default (Emulated): cualquier estilo de este componente
  // queda scoped a él mismo, nunca se fuga a la página host. El diseño real
  // de cada sección SIEMPRE viene de `cssComponent` en el JSON — este
  // componente no debe imponer clases ni estilos propios más allá de lo
  // puramente estructural (el grid de 12 columnas, resuelto vía [ngStyle]
  // en el template, sin clases) y la animación del spinner de carga, que
  // por ser un @keyframes no puede expresarse como atributo `style` inline.
  styles: [`
    @keyframes ux-spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class UXDrivenViewerWidgetComponent implements OnInit, OnDestroy, OnChanges {

  // --------------------------------------------------------
  // Inputs de Configuración y Datos
  // --------------------------------------------------------
  @Input() apiUrl!: string;
  @Input() localSchema?: any;
  @Input() externalForm?: FormGroup;
  @Input() initialData?: any;

  // --------------------------------------------------------
  // Inputs de Modal
  // --------------------------------------------------------
  @Input() modalEndpoint?: string;
  @Input() modalContext?: any;
  @Input() modalSchema?: any;

  // --------------------------------------------------------
  // Inputs de Navegación
  // --------------------------------------------------------
  /** Compensación en px para el scroll suave de los anchors (#seccion). Útil si tienes un header sticky que tapa el top de la sección destino. Se propaga a cada <app-dynamic-viewer>. */
  @Input({ transform: toOffset }) scrollOffset = 0;
  /** Gap en px entre secciones del grid estructural de 12 columnas. Puramente layout, no diseño — el diseño real vive en cssComponent de cada item. */
  @Input({ transform: toOffset }) gridGap = 0;

  // --------------------------------------------------------
  // Inputs del botón "volver arriba"
  // --------------------------------------------------------
  /** Si es false, no se renderiza el botón "volver arriba" en absoluto. */
  @Input({ transform: booleanAttribute }) showBackToTop = true;
  /** Píxeles de scroll antes de que aparezca el botón. */
  @Input({ transform: toThreshold }) backToTopThreshold = 400;

  // --------------------------------------------------------
  // Input de errores de carga
  // --------------------------------------------------------
  /**
   * Si es false, un fallo en la primera carga por `api-url` solo se informa
   * por `errorOccurred` y no se pinta la página de error. Útil si el host
   * quiere mostrar la suya.
   */
  @Input({ transform: booleanAttribute }) showErrorPage = true;

  // --------------------------------------------------------
  // Inputs de Telemetría / Debug
  // --------------------------------------------------------
  /** Si es true, hace console.group de cada evento interno (control, form, acción). Útil embebido en un host externo sin devtools cómodos. */
  @Input({ transform: booleanAttribute }) debug = false;
  /** Debounce en ms para `formStateChanged`. 0 = sin debounce (emite en cada tecla). */
  @Input({ transform: toDebounce }) formStateDebounce = 150;

  // --------------------------------------------------------
  // Outputs (Eventos)
  // --------------------------------------------------------
  @Output() formSubmit = new EventEmitter<any>();
  @Output() actionTriggered = new EventEmitter<DynamicClickPayload>();
  @Output() modalResult = new EventEmitter<any>();
  @Output() errorOccurred = new EventEmitter<string>();
  @Output() ready = new EventEmitter<boolean>();
  @Output() fileSelected = new EventEmitter<FilePayload>();
  /**
   * Cada vez que cambia el contenido en pantalla. `detail.mode` indica qué
   * pasó: `initial` (primera carga), `patched` (solo se actualizaron las
   * secciones dynamic de `detail.changedIds`) o `reloaded` (cambió una
   * sección static: se recargó toda la pantalla). Si el contenido recibido es
   * idéntico al que hay, no se emite nada.
   */
  @Output() contentUpdated = new EventEmitter<ContentChange>();

  /** Cada vez que CUALQUIER control de CUALQUIER sub-form cambia (valor o estado). */
  @Output() controlChanged = new EventEmitter<ControlChangeEvent>();
  /** Snapshot del FormGroup completo (todos los sub-forms combinados), debounced. */
  @Output() formStateChanged = new EventEmitter<FormStateSnapshot>();

  // --------------------------------------------------------
  // Estado Interno
  // --------------------------------------------------------
  /** Secciones a pintar, en el orden del JSON. */
  public content$: Observable<ApiDrivenContent[]>;
  /** Solo es verdadero durante la primera carga por API, cuando todavía no hay nada que mostrar. */
  public isLoading = false;
  /** Evita pedir el contenido dos veces: lo dispara tanto ngOnChanges como ngOnInit. */
  private initialContentRequested = false;
  public formGroup: FormGroup = new FormGroup({});
  /** Controla la visibilidad del botón "volver arriba" — vive en el propio widget (código confiable), no en el HTML dinámico del JSON, porque ese HTML pasa por DOMPurify y nunca ejecuta <script>. */
  public showBackToTopButton = false;
  private subs = new Subscription();
  private formStateSub?: Subscription;
  private scrollListenerTicking = false;

  @HostListener('window:scroll')
  onWindowScroll(): void {
    // Throttle simple con requestAnimationFrame: evita recalcular en cada
    // evento de scroll (que puede dispararse decenas de veces por segundo).
    if (this.scrollListenerTicking || !this.showBackToTop) return;
    this.scrollListenerTicking = true;
    requestAnimationFrame(() => {
      this.showBackToTopButton = window.scrollY > this.backToTopThreshold;
      this.scrollListenerTicking = false;
    });
  }

  public scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  constructor(
    private dws: DynamicViewerService,
    private modalService: ModalService,
    host: ElementRef<HTMLElement>
  ) {
    this.content$ = this.dws.content$;
    this.exposeHostApi(host.nativeElement);
  }

  /** Identidad de cada sección para el `trackBy` de la plantilla. */
  public trackSection = (index: number, item: ApiDrivenContent): string => this.dws.trackSection(index, item);

  /**
   * Los métodos de un componente no son accesibles desde el custom element,
   * solo sus inputs y outputs. Se publican en el propio elemento para que el
   * host pueda llamarlos:
   *
   *   viewer.updateSections([...])   // actualiza secciones concretas
   *   viewer.refresh()               // vuelve a pedir el contenido a api-url
   */
  private exposeHostApi(element: HTMLElement): void {
    Object.defineProperties(element, {
      updateSections: { value: (sections: unknown) => this.updateSections(sections), configurable: true },
      refresh: { value: () => this.refresh(), configurable: true },
    });
  }

  ngOnInit(): void {
    if (this.externalForm) {
      this.formGroup = this.externalForm;
    }
    this.initContentStrategy();
    this.subscribeToFormState();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const jsonChange = changes['localSchema'];
    const apiChange = changes['apiUrl'];

    if (jsonChange && this.localSchema) {
       // Lo recibido se compara contra lo que ya hay en memoria: no se recarga
       // todo cada vez que el host vuelve a asignar localSchema.
       this.initialContentRequested = true;
       this.applyChange(this.dws.setLocalContent(this.localSchema));
    }
    else if (apiChange && !this.localSchema) {
       if (this.apiUrl && this.apiUrl.trim().length > 0) {
          this.initialContentRequested = true;
          this.loadDataFromApi();
       }
    }

    if (changes['externalForm'] && this.externalForm) {
       this.formGroup = this.externalForm;
       this.subscribeToFormState(); // el FormGroup cambió de instancia, hay que re-suscribir
    }

    if (changes['initialData'] && this.initialData) {
       this.handleDataPatching();
    }

    const modalKeys = ['modalSchema', 'modalEndpoint', 'modalContext'];
    const modalTriggered = modalKeys.some(key =>
        changes[key] && !changes[key].isFirstChange()
    );

    if (modalTriggered) {
       const source = this.modalSchema || this.modalEndpoint;
       if (source) {
          this.openModal(source, undefined, this.modalContext);
       } else {
          this.modalService.close();
       }
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.formStateSub?.unsubscribe();
  }

  /**
   * Vuelve a pedir el contenido a `api-url` y lo compara con lo que hay en
   * pantalla: solo se actualiza lo que cambió (ver `contentUpdated`).
   */
  public refresh(): void {
    if (this.apiUrl) this.loadData();
  }

  /**
   * Actualiza secciones concretas sin reenviar toda la pantalla. Cada sección
   * recibida reemplaza a la que tiene su mismo `id_DocumentHTMLCSS` (las
   * nuevas se agregan al final):
   * - si es `dynamic`, solo se actualiza esa sección y las demás conservan su
   *   estado;
   * - si es `static`, se recarga la pantalla completa.
   */
  public updateSections(sections: unknown): ContentChange {
    const change = this.dws.updateSections(sections);
    this.applyChange(change);
    return change;
  }

  // --- TELEMETRÍA CENTRALIZADA ---

  /**
   * Suscribe UNA sola vez a valueChanges/statusChanges del FormGroup raíz
   * (que agrupa todos los sub-forms de cada <app-dynamic-viewer> vía
   * parentForm.addControl). Así, sin importar cuántas secciones dinámicas
   * haya en el JSON, siempre hay UN solo stream con el estado global.
   */
  private subscribeToFormState(): void {
    this.formStateSub?.unsubscribe();

    const emit = () => {
      const snapshot: FormStateSnapshot = {
        value: this.formGroup.getRawValue(),
        valid: this.formGroup.valid,
        invalid: this.formGroup.invalid,
        dirty: this.formGroup.dirty,
        pristine: this.formGroup.pristine,
        touched: this.formGroup.touched,
        pending: this.formGroup.pending,
      };
      this.formStateChanged.emit(snapshot);
      this.logDebug('formStateChanged', snapshot);
    };

    const merged$ = this.formStateDebounce > 0
      ? this.formGroup.valueChanges.pipe(debounceTime(this.formStateDebounce))
      : this.formGroup.valueChanges;

    this.formStateSub = merged$.subscribe(emit);
    this.formStateSub.add(this.formGroup.statusChanges.subscribe(emit));
    // touched/dirty no pasan por valueChanges ni statusChanges.
    this.formStateSub.add(
      this.formGroup.events
        .pipe(filter((event) => event instanceof TouchedChangeEvent || event instanceof PristineChangeEvent))
        .subscribe(emit),
    );
  }

  /** Bindeado desde el template a (controlValueChange) de cada <app-dynamic-viewer>. */
  public handleControlValueChange(event: ControlChangeEvent): void {
    this.controlChanged.emit(event);
    this.logDebug('controlChanged', event);
  }

  private logDebug(label: string, payload: any): void {
    if (!this.debug) return;
    console.groupCollapsed(`%c[UXDrivenViewerWidget] ${label}`, 'color:#3b82f6;font-weight:bold;');
    console.log(payload);
    console.groupEnd();
  }

  // --- LOGICA DE CARGA ---
  private loadData(): void {
    // El spinner solo tiene sentido la primera vez: al volver a cargar, lo que
    // ya está en pantalla se queda hasta que llegue la respuesta.
    const firstLoad = !this.dws.hasContent();
    if (firstLoad) {
      // Un reintento desde la página de error: se quita para dejar solo el spinner.
      if (this.dws.isShowingErrorPage()) this.dws.clearContent();
      this.isLoading = true;
    }

    let readyEmitted = false;
    const sub = this.dws.loadInitialContent(this.apiUrl!)
      .pipe(finalize(() => {
        this.isLoading = false;
        // Compatibilidad: `ready` también se emitía cuando la primera carga fallaba.
        if (firstLoad && !readyEmitted) this.ready.emit(true);
      }))
      .subscribe({
        next: (change) => {
          readyEmitted = change.mode === 'initial' || change.mode === 'reloaded';
          this.applyChange(change);
        },
        error: (err) => {
          console.error('[UXWidget] Error:', err);
          const status = err instanceof HttpErrorResponse && err.status > 0 ? ` (HTTP ${err.status})` : '';
          this.errorOccurred.emit(`Error cargando configuración dinámica${status}`);

          // Solo la primera carga: si ya hay una pantalla funcionando, un fallo
          // al volver a cargar no la reemplaza por una página de error.
          if (firstLoad && this.showErrorPage) {
            const change = this.dws.showErrorPage(err);
            readyEmitted = change.mode === 'initial';
            this.applyChange(change);
          }
        }
      });
    this.subs.add(sub);
  }

  /**
   * Informa al host de lo que pasó con el contenido recibido. `ready` solo se
   * emite cuando la pantalla se pintó completa (primera carga o recarga).
   */
  private applyChange(change: ContentChange): void {
    change.issues.forEach((issue) => this.errorOccurred.emit(issue));
    if (change.mode === 'unchanged') return;

    this.contentUpdated.emit(change);
    this.logDebug('contentUpdated', change);

    if (change.mode === 'initial' || change.mode === 'reloaded') {
      this.handleDataPatching();
      this.ready.emit(true);
    }
  }

  private loadDataFromApi(): void {
    this.loadData();
  }

  // --- LOGICA DE EVENTOS ---
  handleViewerActionClick(payload: DynamicClickPayload): void {
    const action = payload.action;
    this.logDebug('actionTriggered (raw)', payload);

    // Botón "Reintentar" de la página de error: vuelve a pedir el contenido.
    if (action === RETRY_LOAD_ACTION) {
      this.refresh();
      return;
    }

    // Las acciones integradas se reconocen por palabras completas (ver
    // action-names.ts): `open_modal` ya no se confunde con cerrar un modal ni
    // `reset_password` con vaciar el formulario.
    if (isSubmitAction(action)) {
      this.submitAllForms();
      return;
    }

    if (isCloseAction(action)) {
      this.modalService.close();
    }

    if (isResetAction(action)) {
      this.formGroup.reset();
    }

    // Las integradas (cerrar, vaciar) también se reportan al host: antes
    // `close` y todo lo que contuviera "modal" se tragaba el evento.

    const enrichedPayload = {
      ...payload,
      context: {
        formValue: this.formGroup.value,
        formValid: this.formGroup.valid
      }
    };

    this.actionTriggered.emit(enrichedPayload);
  }

  // --- LOGICA DEL MODAL ---
  private openModal(source: string | any[], branch?: string, data?: any): void {
    this.modalService
      .open(source, branch, data)
      .pipe(take(1))
      .subscribe((result) => {
        if (result) {
          this.handleModalResult(result);
        }
      });
  }

  private handleModalResult(result: any): void {
    const formData = result.genericForm || result;
    this.modalResult.emit(formData);
  }

  // --- PARCHEO INTELIGENTE DE VALORES ---

  public setFormValues(data: any): void {
    if (!data || !this.formGroup) return;

    Object.keys(data).forEach(key => {
      const value = data[key];

      if (this.formGroup.contains(key)) {
         this.formGroup.get(key)?.patchValue(value);
      } else {
         const control = this.findControlDeep(this.formGroup, key);
         if (control) {
             control.patchValue(value);
         }
      }
    });
  }

  private handleDataPatching(): void {
      if (this.initialData) {
          setTimeout(() => this.setFormValues(this.initialData), 50);
      }
  }

  /** Submit nativo de una sección (Enter o un botón submit sin acción). */
  public onFormSubmitted(_event: { formId: string, data: any}): void {
      this.submitAllForms();
  }

  /**
   * Único camino de submit del widget, venga de un submit nativo o de un botón
   * con una acción "submit". Valida TODOS los formularios de la página y emite
   * siempre la misma forma: `{ [formId]: { campo: valor } }`.
   */
  private submitAllForms(): void {
      if (this.formGroup.valid) {
        this.formSubmit.emit(this.formGroup.value);
      } else {
        this.formGroup.markAllAsTouched();
        this.errorOccurred.emit('El formulario contiene errores.');
      }
  }

  private findControlDeep(form: FormGroup, controlName: string, depth = 0): AbstractControl | null {
      if (depth > 10) return null;
      for (const key of Object.keys(form.controls)) {
          const control = form.controls[key];

          if (key === controlName) {
              return control;
          }

          if (control instanceof FormGroup) {
              const found = this.findControlDeep(control, controlName, depth + 1);
              if (found) return found;
          }
      }
      return null;
  }

  private initContentStrategy(): void {
      if (this.initialContentRequested) return;

      if (this.localSchema) {
          this.initialContentRequested = true;
          this.applyChange(this.dws.setLocalContent(this.localSchema));
      } else if (this.apiUrl && this.apiUrl.trim().length > 0) {
          this.initialContentRequested = true;
          this.loadDataFromApi();
      }
  }
}