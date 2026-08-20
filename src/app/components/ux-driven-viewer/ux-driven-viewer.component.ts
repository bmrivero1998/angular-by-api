import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Observable, Subscription, finalize, take, debounceTime, distinctUntilChanged } from 'rxjs';

// Imports de tu librería
import { DynamicViewerComponent, ControlChangeEvent } from '../../../../projects/dynamic-forms-engine/src/lib/dynamic-viewer.component';
import { ApiDrivenContent, DynamicClickPayload } from '../../../../projects/dynamic-forms-engine/src/lib/interfaces/DynamicContent.interface';
import { DynamicViewerService } from '../../../../projects/dynamic-forms-engine/src/lib/services/dynamic-viewer.service';
import { ModalService } from '../../../../projects/dynamic-forms-engine/src/lib/services/modal-service.service';
import { FilePayload } from '../../../../projects/dynamic-forms-engine/src/lib/models/form-field-mapping.model';

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

@Component({
  selector: 'ux-driven-viewer-widget',
  standalone: true,
  imports: [CommonModule, DynamicViewerComponent, ReactiveFormsModule],
  templateUrl: './ux-driven-viewer.component.html',
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
  @Input() scrollOffset = 0;
  /** Gap en px entre secciones del grid estructural de 12 columnas. Puramente layout, no diseño — el diseño real vive en cssComponent de cada item. */
  @Input() gridGap = 0;

  // --------------------------------------------------------
  // Inputs del botón "volver arriba"
  // --------------------------------------------------------
  /** Si es false, no se renderiza el botón "volver arriba" en absoluto. */
  @Input() showBackToTop = true;
  /** Píxeles de scroll antes de que aparezca el botón. */
  @Input() backToTopThreshold = 400;

  // --------------------------------------------------------
  // Inputs de Telemetría / Debug
  // --------------------------------------------------------
  /** Si es true, hace console.group de cada evento interno (control, form, acción). Útil embebido en un host externo sin devtools cómodos. */
  @Input() debug = false;
  /** Debounce en ms para `formStateChanged`. 0 = sin debounce (emite en cada tecla). */
  @Input() formStateDebounce = 150;

  // --------------------------------------------------------
  // Outputs (Eventos)
  // --------------------------------------------------------
  @Output() formSubmit = new EventEmitter<any>();
  @Output() actionTriggered = new EventEmitter<DynamicClickPayload>();
  @Output() modalResult = new EventEmitter<any>();
  @Output() errorOccurred = new EventEmitter<string>();
  @Output() ready = new EventEmitter<boolean>();
  @Output() fileSelected = new EventEmitter<FilePayload>();

  /** Cada vez que CUALQUIER control de CUALQUIER sub-form cambia (valor o estado). */
  @Output() controlChanged = new EventEmitter<ControlChangeEvent>();
  /** Snapshot del FormGroup completo (todos los sub-forms combinados), debounced. */
  @Output() formStateChanged = new EventEmitter<FormStateSnapshot>();

  // --------------------------------------------------------
  // Estado Interno
  // --------------------------------------------------------
  public staticContent$: Observable<ApiDrivenContent[]>;
  public dynamicContent$: Observable<ApiDrivenContent[]>;
  public isLoading = false;
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
    private modalService: ModalService
  ) {
    this.staticContent$ = this.dws.staticContent$;
    this.dynamicContent$ = this.dws.dynamicContent$;
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
       this.isLoading = true;
       setTimeout(() => {
           this.dws.setLocalContent(this.localSchema);
           this.handleDataPatching();
           this.isLoading = false;
           this.ready.emit(true);
       }, 0);
    }
    else if (apiChange && !this.localSchema) {
       if (this.apiUrl && this.apiUrl.trim().length > 0) {
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

  public refresh(): void {
    if (this.apiUrl) this.loadData();
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
    this.subs.add(this.formGroup.statusChanges.subscribe(emit));
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
    this.isLoading = true;
    const sub = this.dws.loadInitialContent(this.apiUrl!)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.ready.emit(true);
        if (this.initialData) {
            setTimeout(() => this.setFormValues(this.initialData), 100);
        }
      }))
      .subscribe({
        error: (err) => {
          console.error('[UXWidget] Error:', err);
          this.errorOccurred.emit('Error cargando configuración dinámica');
        }
      });
    this.subs.add(sub);
  }

  private loadDataFromApi(): void {
    this.loadData();
  }

  // --- LOGICA DE EVENTOS ---
  handleViewerActionClick(payload: DynamicClickPayload): void {
    const action = payload.action;
    this.logDebug('actionTriggered (raw)', payload);

    if (action.includes('modal') || action === 'close') {
      this.modalService.close();
      return;
    }

    if (action.includes('reset')) {
      this.formGroup.reset();
    }

    if (action.includes('submit')) {
      if (this.formGroup.valid) {
        this.formSubmit.emit(this.formGroup.value);
      } else {
        this.formGroup.markAllAsTouched();
        this.errorOccurred.emit('El formulario contiene errores.');
      }
      return;
    }

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

  public onFormSubmitted(event: { formId: string, data: any}): void {
      this.formSubmit.emit(event.data);
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
      if (this.localSchema) {
          this.dws.setLocalContent(this.localSchema);
          this.handleDataPatching();
          this.ready.emit(true);
      } else if (this.apiUrl && this.apiUrl.trim().length > 0) {
          this.loadDataFromApi();
      }
  }
}