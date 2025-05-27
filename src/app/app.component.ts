import {
  Component,
  OnInit,
  OnDestroy,
  Renderer2,
  ElementRef,
  ViewChild,
  AfterViewInit
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs'; // Para manejar las suscripciones

import { DynamicClickPayload, DynamicContentInterface, DynamicFormDataPayload } from './interfaces/DynamicContent.interface';

import { DynamicContentService } from './services/dynamic-content.service';
import { DynamicInyectCssService } from './services/dynamic-inyect-css.service';
import { DynamicInteractionService } from './services/dynamic-interaction.service';
import { DynamicViewerComponent } from './components/dynamic-viewer/dynamic-viewer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ DynamicViewerComponent ], // DynamicViewerComponent también debe ser standalone
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {

  public data: DynamicContentInterface | null = null;
  public safeHtmlToDisplay: SafeHtml | null = null; // HTML sanitizado para el hijo
  private dynamicStyleId: string | null = null;

  // Referencia al elemento HOST de <app-dynamic-viewer>
  @ViewChild('dynamicViewerHost', { read: ElementRef }) dynamicViewerHostRef!: ElementRef<HTMLElement>;

  // Funciones para limpiar los listeners del DOM
  private unlistenClickFn: (() => void) | null = null;
  private unlistenSubmitFn: (() => void) | null = null;

  // Suscripciones a los observables del servicio de interacción
  private clickSubscription: Subscription | undefined;
  private formSubscription: Subscription | undefined;

  constructor(
    private readonly dcs: DynamicContentService,
    private readonly dycs: DynamicInyectCssService,
    private readonly dis: DynamicInteractionService, // El servicio de interacción
    private readonly sanitizer: DomSanitizer,      // Para sanitizar HTML
    private readonly renderer: Renderer2           // Para adjuntar listeners al DOM
  ) {}

  ngOnInit() {
    this.dcs.getContent().subscribe((apiResponseData) => {
      this.data = apiResponseData;

      // 1. Sanitizar el HTML
      if (apiResponseData.plantillaHTML) {
        this.safeHtmlToDisplay = this.sanitizer.bypassSecurityTrustHtml(apiResponseData.plantillaHTML);
      } else {
        this.safeHtmlToDisplay = null;
      }

      // 2. Inyectar el CSS
      if (apiResponseData.css && apiResponseData.configuracion) {
        this.dynamicStyleId = this.dycs.generateStyleId(apiResponseData.configuracion);
        this.dycs.injectCss(apiResponseData.css, this.dynamicStyleId);
      }

      // 3. Intentar configurar listeners.
      // Si dynamicViewerHostRef ya está disponible (puede que no en la primera carga dentro de ngOnInit),
      // se configurarán. Si no, ngAfterViewInit lo hará.
      // Usamos setTimeout para darle a Angular un ciclo para renderizar el [innerHTML]
      // antes de intentar acceder a su contenido.
      if (this.dynamicViewerHostRef) {
          setTimeout(() => this.setupEventListenersOnDynamicContent(), 0);
      }
    });

    // 4. Suscribirse a los eventos del DynamicInteractionService
    this.clickSubscription = this.dis.clickAction$.subscribe(payload => {
      this.handleServiceClickEvent(payload);
    });

    this.formSubscription = this.dis.formDataSubmitted$.subscribe(payload => {
      this.handleServiceFormEvent(payload);
    });
  }

  ngAfterViewInit(): void {
    // Si el HTML ya fue cargado por ngOnInit y el ViewChild está listo,
    // configuramos los listeners. Esto cubre el caso de la carga inicial.
    if (this.safeHtmlToDisplay && this.dynamicViewerHostRef) {
      this.setupEventListenersOnDynamicContent();
    }
  }

  setupEventListenersOnDynamicContent(): void {
    this.removeEventListenersFromDynamicContent(); // Limpiar listeners anteriores

    if (!this.dynamicViewerHostRef || !this.dynamicViewerHostRef.nativeElement) {
      console.warn('AppComponent: dynamicViewerHostRef no está disponible para configurar listeners.');
      return;
    }

    // El contenido de [innerHTML] está dentro de un <div> en la plantilla de DynamicViewerComponent
    const innerContentDiv = this.dynamicViewerHostRef.nativeElement.querySelector('div');

    if (innerContentDiv) {
      // Listener para Clics (Delegación de eventos)
      this.unlistenClickFn = this.renderer.listen(innerContentDiv, 'click', (event: Event) => {
        let targetElement = event.target as HTMLElement;
        while (targetElement && targetElement !== innerContentDiv) {
          if (targetElement.matches('button[data-dynamic-action]')) { // O cualquier selector para tus botones
            const action = targetElement.getAttribute('data-dynamic-action');
            // Reportar al servicio de interacción
            this.dis.reportClick({
              action: action || 'unknown_click_action',
              sourceId: this.data?.configuracion || 'app-root-dynamic-content',
              clickedElement: targetElement,
              originalEvent: event
            });
            break;
          }
          targetElement = targetElement.parentElement as HTMLElement;
        }
      });

      // Listener para Submit de Formularios (Delegación de eventos)
      this.unlistenSubmitFn = this.renderer.listen(innerContentDiv, 'submit', (event: Event) => {
        event.preventDefault(); // Prevenir el envío HTML tradicional
        const formElement = event.target as HTMLFormElement;
        const formValues = this.dis.extractFormData(formElement); // Usar helper del servicio
        const formName = formElement.name || undefined;

        // Reportar al servicio de interacción
        this.dis.reportFormSubmit({
          data: formValues,
          formName: formName,
          sourceId: this.data?.configuracion || 'app-root-dynamic-form'
        });
      });

    } else {
      console.warn('AppComponent: No se encontró el div interno en DynamicViewer para adjuntar listeners.');
    }
  }

  removeEventListenersFromDynamicContent(): void {
    if (this.unlistenClickFn) {
      this.unlistenClickFn();
      this.unlistenClickFn = null;
    }
    if (this.unlistenSubmitFn) {
      this.unlistenSubmitFn();
      this.unlistenSubmitFn = null;
    }
  }

  // Métodos para manejar los eventos que vienen del servicio de interacción
  private handleServiceClickEvent(payload: DynamicClickPayload): void {
    console.log('AppComponent (manejador de servicio): Clic procesado!', payload);
    // Aquí va tu lógica específica basada en la acción del clic
    if (payload.action === 'saludarUsuario') {
      alert(`¡Hola desde ${payload.sourceId}! El botón "${payload.clickedElement?.textContent?.trim()}" fue presionado.`);
    }
    // ... más lógica
  }

  private handleServiceFormEvent(payload: DynamicFormDataPayload): void {
    console.log('AppComponent (manejador de servicio): Formulario procesado!', payload);
    // Aquí va tu lógica para manejar los datos del formulario
    alert(`Datos del formulario "${payload.formName}" de "${payload.sourceId}" recibidos: ${JSON.stringify(payload.data)}`);
    // this.unServicioQueEnviaAlBackend.enviar(payload.data);
  }

  ngOnDestroy() {
    // Limpiar CSS
    if (this.dynamicStyleId) {
      this.dycs.removeCss(this.dynamicStyleId);
    }
    // Limpiar listeners del DOM
    this.removeEventListenersFromDynamicContent();

    // Limpiar suscripciones a observables
    this.clickSubscription?.unsubscribe();
    this.formSubscription?.unsubscribe();
  }
}