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
import { AbstractControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Observable, Subscription, finalize, take } from 'rxjs';

// Imports de tu librería
import { DynamicViewerComponent } from '../../../../projects/dynamic-forms-engine/src/lib/dynamic-viewer.component';
import { ApiDrivenContent, DynamicClickPayload } from '../../../../projects/dynamic-forms-engine/src/lib/interfaces/DynamicContent.interface';
import { DynamicViewerService } from '../../../../projects/dynamic-forms-engine/src/lib/services/dynamic-viewer.service';
import { ModalService } from '../../../../projects/dynamic-forms-engine/src/lib/services/modal-service.service';
import { FilePayload } from '../../../../projects/dynamic-forms-engine/src/lib/models/form-field-mapping.model';

@Component({
  selector: 'ux-driven-viewer-widget',
  standalone: true,
  imports: [CommonModule, DynamicViewerComponent, ReactiveFormsModule],
  templateUrl: './ux-driven-viewer.component.html',
  encapsulation: ViewEncapsulation.None,
  styles: [`
    .ux-widget-container {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 16px;
      width: 100%;
    }
    @media (max-width: 768px) {
      .ux-widget-container {
        display: flex;
        flex-direction: column;
      }
    }
  `]
})
export class UXDrivenViewerWidgetComponent implements OnInit, OnDestroy, OnChanges {
  
  // --------------------------------------------------------
  // Inputs de Configuración y Datos
  // --------------------------------------------------------
  @Input() apiUrl!: string; // Se mantiene igual por compatibilidad o gusto
  @Input() localSchema?: any; // Reemplaza UxDrivenJson
  @Input() externalForm?: FormGroup;
  @Input() initialData?: any; // Reemplaza data

  // --------------------------------------------------------
  // Inputs de Modal
  // --------------------------------------------------------
  @Input() modalEndpoint?: string; // Reemplaza modalApiUrl
  @Input() modalContext?: any;     // Reemplaza modalData
  @Input() modalSchema?: any;      // Reemplaza modalJson

  // --------------------------------------------------------
  // Outputs (Eventos)
  // --------------------------------------------------------
  @Output() formSubmit = new EventEmitter<any>();         // Reemplaza formSubmitted
  @Output() actionTriggered = new EventEmitter<DynamicClickPayload>(); // Reemplaza actionClicked
  @Output() modalResult = new EventEmitter<any>();        // Reemplaza modalEmitted
  @Output() errorOccurred = new EventEmitter<string>();   // Reemplaza componentError
  @Output() ready = new EventEmitter<boolean>();          // Reemplaza loaded
  @Output() fileSelected = new EventEmitter<FilePayload>(); // Se mantiene igual

  // --------------------------------------------------------
  // Estado Interno
  // --------------------------------------------------------
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
    const jsonChange = changes['localSchema'];
    const apiChange = changes['apiUrl'];

    // CASO A: Nuevo JSON Local recibido
    if (jsonChange && this.localSchema) {
       this.isLoading = true;
       setTimeout(() => {
           this.dws.setLocalContent(this.localSchema);
           this.handleDataPatching(); 
           this.isLoading = false;
           this.ready.emit(true);
       }, 0);
    }
    // CASO B: Cambio en Configuración API
    else if (apiChange && !this.localSchema) {
       if (this.apiUrl && this.apiUrl.trim().length > 0) {
          this.loadDataFromApi();
       }
    }

    // --- 2. SINCRONIZACIÓN DE FORMULARIO EXTERNO ---
    if (changes['externalForm'] && this.externalForm) {
       this.formGroup = this.externalForm;
    }

    // --- 3. PARCHEO DE DATOS ---
    if (changes['initialData'] && this.initialData) {
       this.handleDataPatching();
    }

    // --- 4. GESTOR DE MODALES ---
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
  }

  public refresh(): void {
    if (this.apiUrl) this.loadData();
  }

  // --- LOGICA DE CARGA ---
  private loadData(): void {
    this.isLoading = true;
    const sub = this.dws.loadInitialContent(this.apiUrl!)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.ready.emit(true);
        // Si teníamos data pendiente esperando a que cargara el form, la aplicamos ahora
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
      
      // 1. Intento directo (Root Level)
      if (this.formGroup.contains(key)) {
         this.formGroup.get(key)?.patchValue(value);
      } else {
         // 2. Búsqueda Profunda (Deep Search)
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
      if (depth > 10) return null; // Prevención de bucles infinitos
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