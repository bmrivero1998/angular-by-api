import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { DynamicViewerComponent } from '../../../../projects/dynamic-forms-engine/src/lib/dynamic-viewer.component';

import { CommonModule } from '@angular/common';
import { ApiDrivenContent, DataBinding, DynamicFormSubmited } from '../../../../projects/dynamic-forms-engine/src/lib/interfaces/DynamicContent.interface';

@Component({
  selector: 'app-modal-frame',
  templateUrl: './modal-frame.component.html',
  styleUrls: ['./modal-frame.component.css'],
  imports: [DynamicViewerComponent, CommonModule, ReactiveFormsModule],
})
export class ModalFrameComponent implements OnInit {
  @Input() contentConfig!: ApiDrivenContent;
  @Output() close = new EventEmitter<any>();

  modalForm = new FormGroup({});
  dataBindings: DataBinding[] = [];

  constructor() {}

  ngOnInit(): void {
    if (this.contentConfig.dataBindings) {
      this.dataBindings = this.contentConfig.dataBindings;
      const titleBinding = this.dataBindings.find(
        (b) => b.selector === '#modal-title-display'
      );
      if (titleBinding) {
        setTimeout(() => {
          const titleEl = document.getElementById('modal-title-display');
          if (titleEl) titleEl.textContent = String(titleBinding.value);
        }, 0);
      }
    }
  }

  onClose(result: any = null): void {
    this.close.emit(result);
  }

  onFormSubmit(payload: DynamicFormSubmited): void {
    this.onClose(payload.data);
  }

  onActionClick(payload: any): void {
    if (payload.action === 'cancel') {
      this.onClose(null);
    }
    this.onClose(payload.data || this.modalForm?.getRawValue() || null);
  }
}
