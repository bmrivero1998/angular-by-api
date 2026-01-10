import { 
  Component, 
  Input, 
  OnChanges, 
  SimpleChanges, 
  Output, 
  EventEmitter, 
  inject,
  ViewEncapsulation // IMPORTANTE
} from '@angular/core';
import { CommonModule } from '@angular/common';
// Ojo: Si es un microfrontend externo, usualmente el viewer gestiona su propio form interno
// a menos que el host sea Angular. Aquí asumiremos que el viewer es autosuficiente.
import { FormGroup } from '@angular/forms'; 

import { DynamicViewerComponent } from '../../../../projects/dynamic-forms-engine/src/lib/dynamic-viewer.component';
import { ApiDrivenContent, DynamicClickPayload } from '../../../../projects/dynamic-forms-engine/src/lib/interfaces/DynamicContent.interface';
import { EncryptionService } from '../../../../projects/dynamic-forms-engine/src/lib/services/encryption.service';


@Component({
  selector: 'ux-driven-viewer-widget', // Nuevo nombre de etiqueta para el widget
  standalone: true,
  imports: [CommonModule, DynamicViewerComponent],
  // ShadowDom asegura que tus estilos (Tailwind/Bootstrap) no se fuguen ni se rompan
  encapsulation: ViewEncapsulation.ShadowDom, 
  template: `
    <style>
      @import "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css";
      /* Aquí también podrías inyectar tu Tailwind compilado si es necesario */
    </style>

    <div class="ux-widget-container">
      @if (decodedData) {
        <app-dynamic-viewer
          [contentId]="decodedData.id_DocumentHTMLCSS"
          [htmlContentString]="decodedData.htmlComponent"
          [cssContentString]="decodedData.cssComponent"
          
          [formId]="decodedData.formId || decodedData.id_DocumentHTMLCSS"
          [formMappings]="decodedData.formMappings"
          [formInitialData]="decodedData.formInitialData"
          [buttonConfigs]="decodedData.buttonConfigs"
          [dataBindings]="decodedData.dataBindings"
          
          (formSubmitted)="onFormSubmitted($event)"
          (actionClicked)="onActionClicked($event)"
          (componentError)="onComponentError($event)">
        </app-dynamic-viewer>
      } @else if (errorState) {
        <div style="color: red; padding: 10px; border: 1px solid red;">
          Error: Contenido protegido no válido.
        </div>
      }
    </div>
  `
})
export class UXDrivenViewerWidgetComponent implements OnChanges {
  @Input({ required: true }) encryptedContent!: string;
  
  // Outputs normales de Angular se convierten en CustomEvents en Web Components
  @Output() formSubmitted = new EventEmitter<any>();
  @Output() actionClicked = new EventEmitter<any>();
  @Output() componentError = new EventEmitter<string>();

  decodedData: ApiDrivenContent | null = null;
  errorState = false;
  private crypto = inject(EncryptionService);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['encryptedContent'] && this.encryptedContent) {
      this.processContent();
    }
  }

  private processContent() {
    this.errorState = false;
    this.decodedData = null;
    const result = this.crypto.decryptPayload(this.encryptedContent); // Tu servicio de desencriptación
    if (result) {
      this.decodedData = result as ApiDrivenContent;
    } else {
      this.errorState = true;
      this.componentError.emit('Decryption failed');
    }
  }

  onFormSubmitted(event: any) { this.formSubmitted.emit(event); }
  onActionClicked(event: any) { this.actionClicked.emit(event); }
  onComponentError(event: any) { this.componentError.emit(event); }
}