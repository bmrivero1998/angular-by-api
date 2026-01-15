// src/app/app.component.ts
import { Component, OnInit } from '@angular/core';
import { DynamicViewerComponent } from '../../projects/dynamic-forms-engine/src/lib/dynamic-viewer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DynamicViewerComponent],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  public formConfig: any;

 // src/app/app.component.ts
ngOnInit() {
  this.formConfig = {
    id_DocumentHTMLCSS: 'super-test-001',
    renderType: 'dynamic',
    // 1. HTML con IDs para Bindings y Tablas
    htmlComponent: `
      <div class="card p-4 shadow-lg" style="background: #f8f9fa; color: #333; border-radius: 20px;">
        <h2 id="titulo-dinamico" class="mb-4 text-primary">Cargando título...</h2>
        
        <form id="registroForm">
          <div class="mb-3">
            <label class="form-label">Nombre Completo (Solo letras):</label>
            <input name="nombre" class="form-control" placeholder="Escribe aquí...">
          </div>

          <div class="mb-3">
            <label class="form-label">Teléfono (Máscara: (999) 999-9999):</label>
            <input name="telefono" class="form-control" placeholder="(000) 000-0000">
          </div>

          <div class="mb-3 form-check">
            <input type="checkbox" name="mostrarExtra" class="form-check-input" id="checkExtra">
            <label class="form-check-label" for="checkExtra">¿Tienes un código VIP?</label>
          </div>

          <div id="seccion-vip" class="mb-3 p-3 bg-warning-subtle border border-warning rounded">
            <label class="form-label">Código VIP (Requerido si se muestra):</label>
            <input name="codigoVip" class="form-control" placeholder="VIP-123">
          </div>

          <div class="mt-4">
            <h5>Historial de Acciones</h5>
            <table id="tabla-logs" class="table table-sm table-striped"></table>
          </div>

          <button id="btn-enviar" class="btn btn-primary w-100 mt-3" data-dynamic-action="submit_form">
            Enviar Registro
          </button>
        </form>
      </div>
    `,
    cssComponent: `
      .card { max-width: 600px; margin: auto; }
      .is-invalid { border: 2px solid #dc3545 !important; }
      .is-valid { border: 2px solid #198754 !important; }
    `,
    // 2. Mapeos con TODA la artillería
    formMappings: [
      { 
        controlName: 'nombre', 
        domSelector: 'input[name="nombre"]', 
        keyFilter: 'alpha', // Solo letras y espacios
        validatorConfig: [{ type: 'required', message: 'Obligatorio' }]
      },
      { 
        controlName: 'telefono', 
        domSelector: 'input[name="telefono"]', 
        inputMask: '(999) 999-9999' // Máscara automática
      },
      { 
        controlName: 'mostrarExtra', 
        domSelector: 'input[name="mostrarExtra"]',
        defaultValue: false
      },
      { 
        controlName: 'codigoVip', 
        domSelector: '#seccion-vip',
        showIf: "form.mostrarExtra === true", // Lógica condicional PRO
        validatorConfig: [{ type: 'required', message: 'El código VIP es obligatorio' }]
      }
    ],
    // 3. Bindings de Datos (Actualiza el H2)
    dataBindings: [
      { selector: '#titulo-dinamico', value: 'Constructor de Webs Pro' }
    ],
    // 4. Configuración de Botones
    buttonConfigs: [
      { 
        selector: '#btn-enviar', 
        disableWhen: 'formIsInvalid' // Se bloquea si falta el VIP o nombre
      }
    ]
  } as any;
}
}