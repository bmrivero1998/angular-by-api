import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DynamicViewerComponent } from '../../../../projects/dynamic-forms-engine/src/lib/dynamic-viewer.component';
import { ApiDrivenContent, DataBinding, DynamicFormSubmited } from '../../../../projects/dynamic-forms-engine/src/lib/interfaces/DynamicContent.interface';

@Component({
  selector: 'app-modal-frame',
  templateUrl: './modal-frame.component.html',
  styleUrls: ['./modal-frame.component.css'],
  standalone: true,
  imports: [DynamicViewerComponent, CommonModule, ReactiveFormsModule],
})
export class ModalFrameComponent implements OnInit {
  @Input() contentConfig!: ApiDrivenContent;
  
  // Canal para cerrar/destruir
  @Output() close = new EventEmitter<any>();
  // Canal para avisar al padre (Persistencia)
  @Output() triggerAction = new EventEmitter<any>();

  modalForm = new FormGroup({});
  modalTitle = 'Información';

  constructor() {}

  ngOnInit(): void {
    if (this.contentConfig?.dataBindings) {
      const titleBinding = this.contentConfig.dataBindings.find(
        (b) => b.selector === '#modal-title-display'
      );
      if (titleBinding) {
        this.modalTitle = String(titleBinding.value);
      }
    }
  }

  onClose(result: any = null): void {
    this.close.emit(result);
  }

  // Manejo de submit nativo (Enter en el form)
  onFormSubmit(payload: DynamicFormSubmited): void {
    // Normalizamos para que el padre reciba la misma estructura que en los botones
    const dataToEmit = {
        action: 'submit',
        data: payload.data,
        formValue: this.modalForm.value,
        isValid: this.modalForm.valid
    };
    this.triggerAction.emit(dataToEmit);
  }

  onActionClick(payload: any): void {
    const action = (payload.action || '').toLowerCase();

    // 1. CERRAR / CANCELAR (Se va el modal inmediatamente)
    if (action.includes('close') || action.includes('cancel')) {
      this.onClose(null); 
      return;
    }

    // Preparar el paquete de datos para el padre
    const dataToEmit = {
        action: payload.action, 
        data: payload.data || null, 
        formValue: this.modalForm.value,
        isValid: this.modalForm.valid
    };

    // 2. VALIDACIÓN DE FORMULARIO (Solo si es Submit/Save)
    if (action.includes('submit') || action.includes('save')) {
        if (!this.modalForm.valid) {
            this.modalForm.markAllAsTouched();
            return; // Si hay error, no emitimos nada
        }
    }

    // 3. EMITIR ACCIÓN (Persistencia: El modal sigue abierto)
    this.triggerAction.emit(dataToEmit);
  }
}