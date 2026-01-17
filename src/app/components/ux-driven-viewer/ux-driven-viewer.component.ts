import { 
  Component, 
  Input, 
  Output, 
  EventEmitter,
  ViewEncapsulation,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormGroup } from '@angular/forms'; // <-- Agregado AbstractControl
import { Observable, Subscription, finalize, take } from 'rxjs';

// Imports de tu librería
import { DynamicViewerComponent } from '../../../../projects/dynamic-forms-engine/src/lib/dynamic-viewer.component';
import { ApiDrivenContent, DynamicClickPayload } from '../../../../projects/dynamic-forms-engine/src/lib/interfaces/DynamicContent.interface';
import { DynamicViewerService } from '../../../../projects/dynamic-forms-engine/src/lib/services/dynamic-viewer.service';
import { ModalService } from '../../../../projects/dynamic-forms-engine/src/lib/services/modal-service.service';

@Component({
  selector: 'ux-driven-viewer-widget',
  standalone: true,
  imports: [CommonModule, DynamicViewerComponent],
  templateUrl: './ux-driven-viewer.component.html',
  encapsulation: ViewEncapsulation.None,
  styles: [`
    .ux-widget-container {
      display: grid !important;
      grid-template-columns: repeat(12, 1fr) !important;
      gap: 16px;
      width: 100%;
    }
  `]
})
export class UXDrivenViewerWidgetComponent implements OnInit, OnDestroy, OnChanges {
  
  // --- INPUTS ---
  @Input() projectId?: string; 
  @Input() branch?: string = 'main';
  
  // DATA: Objeto con valores para pre-llenar el formulario (ej: usuario a editar)
  @Input() data?: any; 

  // --- MODO LOCAL (Nuevo) ---
  @Input() UxDrivenJson?: any;

  // MODAL: Configuración para abrir el viewer como modal
  @Input() modalProjectId?: string; 
  @Input() modalBranch?: string = 'main';
  @Input() modalData?: any;
  @Input() modalJson?: any;


  // FORMULARIO EXTERNO: Permite pasar un FormGroup ya creado desde el padre
  @Input() externalForm?: FormGroup; 

  // --- OUTPUTS ---
  @Output() formSubmitted = new EventEmitter<any>();
  @Output() actionClicked = new EventEmitter<DynamicClickPayload>();
  @Output() modalEmitted = new EventEmitter<any>();
  @Output() componentError = new EventEmitter<string>();
  @Output() loaded = new EventEmitter<boolean>();

  // --- STATE ---
  public staticContent$: Observable<ApiDrivenContent[]>;
  public dynamicContent$: Observable<ApiDrivenContent[]>;
  public isLoading = false;

  public formGroup: FormGroup = new FormGroup({});
  
  private subs = new Subscription();

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
  }

 ngOnChanges(changes: SimpleChanges): void {

    // --- 1. ESTRATEGIA DE CONTENIDO (Local vs API) ---
    // Prioridad: Si hay JSON Local, siempre gana. Si no, usa API.
    
    const jsonChange = changes['UxDrivenJson'];
    const apiChange = (changes['projectId'] || changes['branch']);

    // CASO A: Nuevo JSON Local recibido
    if (jsonChange && this.UxDrivenJson) {
       this.isLoading = true;
       // Timeout(0) libera el hilo principal para que la UI no se congele al procesar el JSON
       setTimeout(() => {
           this.dws.setLocalContent(this.UxDrivenJson);
           this.handleDataPatching(); // Si ya había data, la reaplicamos
           this.isLoading = false;
           this.loaded.emit(true);
       }, 0);
    }
    // CASO B: Cambio en Configuración API (y no estamos en modo local)
    else if (apiChange && !apiChange.isFirstChange() && !this.UxDrivenJson) {
       if (this.projectId) this.loadDataFromApi();
    }


    // --- 2. SINCRONIZACIÓN DE FORMULARIO EXTERNO ---
    if (changes['externalForm'] && this.externalForm) {
       this.formGroup = this.externalForm;
    }


    // --- 3. PARCHEO DE DATOS (Smart Patching) ---
    if (changes['data'] && this.data) {
       this.handleDataPatching();
    }


    // --- 4. GESTOR DE MODALES (Trigger por Inputs) ---
    // Detectamos si cambió cualquier propiedad relacionada con modales
    const modalKeys = ['modalJson', 'modalProjectId', 'modalBranch', 'modalData'];
    const modalTriggered = modalKeys.some(key => 
        changes[key] && !changes[key].isFirstChange()
    );

    if (modalTriggered) {
       const source = this.modalJson || this.modalProjectId;
       
       if (source) {
          this.openModal(source, this.modalBranch, this.modalData);
       } else {
          this.modalService.close(); 
       }
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  public refresh(): void {
    if (this.projectId) this.loadData();
  }

  // --- LOGICA DE CARGA ---
  private loadData(): void {
    this.isLoading = true;
    const sub = this.dws.loadInitialContent(this.projectId!, this.branch)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.loaded.emit(true);
        // Si teníamos data pendiente esperando a que cargara el form, la aplicamos ahora
        if (this.data) {
            setTimeout(() => this.setFormValues(this.data), 100);
        }
      }))
      .subscribe({
        error: (err) => {
          console.error('[UXWidget] Error:', err);
          this.componentError.emit('Error cargando configuración dinámica');
        }
      });
    this.subs.add(sub);
  }

  // --- LOGICA DE EVENTOS ---
  handleViewerActionClick(payload: DynamicClickPayload): void {
    const action = payload.action;

    if (action.includes('modal') || action === 'close') {
    this.modalService.close(); 
    return; // Importante: cortamos aquí, no emitimos al padre
  }

    if (action.includes('reset')) {
      this.formGroup.reset();
    }

    if (action.includes('submit')) {
      if (this.formGroup.valid) {
        this.formSubmitted.emit(this.formGroup.value);
      } else {
        this.formGroup.markAllAsTouched();
        this.componentError.emit('El formulario contiene errores.');
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
    
    this.actionClicked.emit(enrichedPayload);
  }

  // --- LOGICA DEL MODAL ---
 private openModal(source: string | any[], branch?: string, data?: any): void {
    this.modalService
      .open(source, branch, data) // El servicio ya sabe qué hacer si es string o array
      .pipe(take(1))
      .subscribe((result) => {
        if (result) {
          this.handleModalResult(result);
        }
      });
  }

  

  private handleModalResult(result: any): void {
    // Ajuste: A veces el modal devuelve el objeto directo o dentro de una propiedad
    const formData = result.genericForm || result;
    this.modalEmitted.emit(formData);
  }

  // =========================================================
  // === NUEVA LÓGICA: PARCHEO INTELIGENTE DE VALORES ===
  // =========================================================

  /**
   * Recorre el objeto de datos recibido e intenta encontrar un control
   * coincidente en cualquier nivel de profundidad del Formulario.
   */
  public setFormValues(data: any): void {
    if (!data || !this.formGroup) return;

    Object.keys(data).forEach(key => {
      const value = data[key];
      
      // 1. Intento directo (Root Level)
      if (this.formGroup.contains(key)) {
         this.formGroup.get(key)?.patchValue(value);
      } else {
         // 2. Búsqueda Profunda (Deep Search)
         // Busca en sub-formularios generados dinámicamente
         const control = this.findControlDeep(this.formGroup, key);
         if (control) {
             control.patchValue(value);
         }
      }
    });
  }


  public onFormSubmitted(event: { formId: string, data: any}): void {
      this.formSubmitted.emit(event.data);
  }

  /**
   * Función recursiva que busca un control por su nombre
   * dentro de una jerarquía de FormGroups.
   */
  private findControlDeep(form: FormGroup, controlName: string): AbstractControl | null {
      // Recorremos todos los controles directos de este FormGroup
      for (const key of Object.keys(form.controls)) {
          const control = form.controls[key];

          // Si encontramos el nombre exacto (aunque esté anidado), éxito
          if (key === controlName) {
              return control;
          }

          // Si el hijo es otro FormGroup, bajamos un nivel (Recursión)
          if (control instanceof FormGroup) {
              const found = this.findControlDeep(control, controlName);
              if (found) return found;
          }
      }
      return null;
  }

  /**
   * Decide qué estrategia de carga usar
   */
  private initContentStrategy(): void {
      if (this.UxDrivenJson) {
          this.dws.setLocalContent(this.UxDrivenJson);
          this.handleDataPatching();
          this.loaded.emit(true);
      } else if (this.projectId) {
          this.loadDataFromApi();
      }
  }

  private loadDataFromApi(): void {
    this.isLoading = true;
    const sub = this.dws.loadInitialContent(this.projectId!, this.branch)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.loaded.emit(true);
        this.handleDataPatching();
      }))
      .subscribe({
        error: (err) => {
          console.error('[UXWidget] Error API:', err);
          this.componentError.emit('Error cargando configuración dinámica');
        }
      });
    this.subs.add(sub);
  }

  private handleDataPatching(): void {
      if (this.data) {
          // Delay técnico para asegurar que el DOM/FormGroup ya existan
          setTimeout(() => this.setFormValues(this.data), 50);
      }
  }
}