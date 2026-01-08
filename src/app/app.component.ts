// src/app/app.component.ts
import { Component, OnInit } from '@angular/core';
import { DynamicViewerComponent } from '../../projects/dynamic-forms-engine/src/lib/dynamic-viewer.component';
import { ApiDrivenContent } from '../../projects/dynamic-forms-engine/src/lib/interfaces/DynamicContent.interface';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DynamicViewerComponent],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  formConfig?: ApiDrivenContent;

  ngOnInit() {
    // FORZAMOS EL HOLA MUNDO AQUÍ (Bypass de servicio)
    this.formConfig = {
      id_DocumentHTMLCSS: 'test-001',
      renderType: 'static',
      htmlComponent: '<h1 style="color: red;">¡HOLA MUNDO DESDE EL MOTOR!</h1>',
      cssComponent: 'h1 { font-family: sans-serif; }'
    } as ApiDrivenContent;
  }

  onFinalSubmit(event: any) { console.log(event); }
  onInteraction(event: any) { console.log(event); }
}