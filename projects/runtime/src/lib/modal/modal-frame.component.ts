import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { isCloseAction, isSaveAction, isSubmitAction } from '../actions/action-names';
import { DynamicViewerComponent } from '@ux-driven-viewer/engine';
import { ApiDrivenContent, DataBinding, DynamicFormSubmited } from '@ux-driven-viewer/engine';

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
    const action: string = payload.action || '';

    // 1. CERRAR / CANCELAR (Se va el modal inmediatamente). Se compara por
    // palabras completas: `disclose` o `closet` no cierran nada.
    if (isCloseAction(action)) {
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
    if (isSubmitAction(action) || isSaveAction(action)) {
        if (!this.modalForm.valid) {
            this.modalForm.markAllAsTouched();
            return; // Si hay error, no emitimos nada
        }
    }

    // 3. EMITIR ACCIÓN (Persistencia: El modal sigue abierto)
    this.triggerAction.emit(dataToEmit);
  }
}