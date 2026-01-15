import { 
  Component, 
  Input, 
  Output, 
  EventEmitter,
  ViewEncapsulation, // IMPORTANTE
  OnInit,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
// Ojo: Si es un microfrontend externo, usualmente el viewer gestiona su propio form interno
// a menos que el host sea Angular. Aquí asumiremos que el viewer es autosuficiente.
import { FormGroup } from '@angular/forms'; 

import { DynamicViewerComponent } from '../../../../projects/dynamic-forms-engine/src/lib/dynamic-viewer.component';
import { ApiDrivenContent, DisplayableInAppComponent, DynamicClickPayload } from '../../../../projects/dynamic-forms-engine/src/lib/interfaces/DynamicContent.interface';
import { DynamicContentService } from '../../../../projects/dynamic-forms-engine/src/lib/services/dynamic-content.service';
import { DomSanitizer } from '@angular/platform-browser';


@Component({
  selector: 'ux-driven-viewer-widget', // Nuevo nombre de etiqueta para el widget
  standalone: true,
  imports: [CommonModule, DynamicViewerComponent],
  // ShadowDom asegura que tus estilos (Tailwind/Bootstrap) no se fuguen ni se rompan
  encapsulation: ViewEncapsulation.ShadowDom, 
  templateUrl:'./ux-driven-viewer.component.html' 
})
export class UXDrivenViewerWidgetComponent implements OnInit {
  @Input() UxDrivenJson!: any;
  @Input() projectId?:string; // se implementa el uuid en caso de que el usuario unicamente quiera consumir el mfe directamente  
  @Input() angularForm?:FormGroup;

  // Outputs normales de Angular se convierten en CustomEvents en Web Components
  @Output() formSubmitted = new EventEmitter<any>();
  @Output() actionClicked = new EventEmitter<any>();
  @Output() componentError = new EventEmitter<string>();

  public displayableItems: DisplayableInAppComponent[] = [];

  decodedData: ApiDrivenContent | null = null;
  errorState = false;

  //Injectores para manejos de estados

   constructor(
    private dcs: DynamicContentService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if(this.projectId){
       this.loadDynamicContent(this?.projectId || null);
    }else if(this.UxDrivenJson){
      this.generateData(this.UxDrivenJson)
    }
   
  }


  private loadDynamicContent(projectId: string | null): void {
  if (!projectId) {
    this.errorState = true;
    return;
  }

  this.dcs.getContent(projectId).subscribe({
    next: (res) => {
      if (res && res.content) {
        this.generateData(res.content)
      } else {
        this.errorState = true;
      }
    },
    error: (err) => {
      console.error("UXDriven Widget Error:", err);
      this.errorState = true;
      this.cdr.detectChanges();
    }
  });
}

 private generateData(json:any){
   this.displayableItems = this.processApiResponse(json);
        this.errorState = this.displayableItems.length === 0;
        this.cdr.detectChanges();
 }

  /**
   * Transforma la respuesta del microservicio en objetos listos para renderizar.
   * Incluye la sanitización de HTML para evitar bloqueos de seguridad de Angular.
   */
  processApiResponse(data: any): DisplayableInAppComponent[] {
    try {
      const rawData = typeof data === 'string' ? JSON.parse(data) : data;
      
      if (!Array.isArray(rawData)) {
        console.error("Invalid format: Expected an array of components", rawData);
        return [];
      }

      return rawData.map(item => ({
        ...item,
        // Sanitizamos el HTML aquí para que DisplayableInAppComponent sea válido
        safeHtml: this.sanitizer.bypassSecurityTrustHtml(item.htmlComponent)
      }));
    } catch (error) {
      console.error("Error processing dynamic content JSON:", error);
      return [];
    }
  }

  get hasAForm():FormGroup | undefined{
    return this.angularForm || undefined 
  }


  onFormSubmitted(event: any) { this.formSubmitted.emit(event); }
  onActionClicked(event: any) { this.actionClicked.emit(event); }
  onComponentError(event: any) { this.componentError.emit(event); }
}