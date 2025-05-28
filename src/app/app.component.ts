import {
  Component,
  OnInit,
  OnDestroy,
  Renderer2,
  ElementRef,
  ViewChild,
  AfterViewInit,
  ChangeDetectorRef // Importar ChangeDetectorRef
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';

import { DynamicClickPayload, DynamicContentInterface, DynamicFormDataPayload } from './interfaces/DynamicContent.interface';
import { DynamicContentService } from './services/dynamic-content.service';
import { DynamicInyectCssService } from './services/dynamic-inyect-css.service';
import { DynamicInteractionService } from './services/dynamic-interaction.service';
import { DynamicViewerComponent } from './components/dynamic-viewer/dynamic-viewer.component';
import { CommonModule } from '@angular/common';

// Interfaz para el contenido que se mostrará
export interface DisplayableDynamicContent extends DynamicContentInterface {
  safeHtml: SafeHtml | null;
  styleId?: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DynamicViewerComponent, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {

  // Almacenará todos los contenidos dinámicos listos para mostrar
  public displayableContents: DisplayableDynamicContent[] = [];
  private dynamicStyleIds: string[] = []; // Para rastrear los IDs de todos los CSS inyectados

  // Referencia al elemento HOST que CONTENDRÁ los <app-dynamic-viewer>
  @ViewChild('dynamicContentHost', { static: false }) dynamicContentHostRef!: ElementRef<HTMLElement>;

  private unlistenClickFn: (() => void) | null = null;
  private unlistenSubmitFn: (() => void) | null = null;

  private clickSubscription: Subscription | undefined;
  private formSubscription: Subscription | undefined;

  constructor(
    private readonly dcs: DynamicContentService,
    private readonly dycs: DynamicInyectCssService,
    private readonly dis: DynamicInteractionService,
    private readonly sanitizer: DomSanitizer,
    private readonly renderer: Renderer2,
    private readonly cdr: ChangeDetectorRef // Inyectar ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadDynamicContent(); // Cargar el contenido al iniciar

    this.clickSubscription = this.dis.clickAction$.subscribe(payload => {
      this.handleServiceClickEvent(payload);
    });

    this.formSubscription = this.dis.formDataSubmitted$.subscribe(payload => {
      this.handleServiceFormEvent(payload);
    });
  }

  /**
   * Configura los listeners para los eventos de clic y submit de formularios en el contenido dinámico
   * solo si hay contenido y el host (<div #dynamicContentHost>) está listo.
   * Esto se debe a que dynamicContentHostRef no estará disponible hasta que se complete el ciclo de
   * vida ngAfterViewInit.
   */
  ngAfterViewInit(): void {
    // Si hay contenido y el host está listo, configurar listeners.
    // Esto es importante porque dynamicContentHostRef no estará disponible hasta AfterViewInit.
    if (this.displayableContents.length > 0 && this.dynamicContentHostRef) {
      this.setupEventListenersOnDynamicContent();
    }
  }

  /**
   * Carga el contenido dinámico desde el servicio y lo renderiza en la plantilla.
   * Si el contenido ya se cargó previamente, limpiará los estilos CSS inyectados y
   * volverá a renderizar el contenido.
   * Notifica a Angular de los cambios en los datos con ChangeDetectorRef.
   * Si el contenido se carga por primera vez, ngAfterViewInit se encargará de
   * configurar los listeners para los eventos de clic y submit en el contenido dinámico.
   * Si el contenido ya se cargó previamente, usará setTimeout para asegurarse de que
   * el DOM esté renderizado por el *ngFor antes de configurar los listeners.
   * En caso de error, notifica a Angular de los cambios en los datos y vacía el
   * arreglo de contenido.
   */
  private loadDynamicContent(): void {
    // Limpiar estilos anteriores si se recarga el contenido
    this.dynamicStyleIds.forEach(id => this.dycs.removeCss(id));
    this.dynamicStyleIds = [];
    this.displayableContents = [];

    this.dcs.getContent().subscribe({
      next: (apiResponseData) => {
        if (!apiResponseData || apiResponseData.length === 0) {
          this.displayableContents = [];
          this.cdr.detectChanges(); // Notificar a Angular de los cambios
          return;
        }

        this.displayableContents = apiResponseData.map((response: DynamicContentInterface) => {
          let styleId: string | undefined;
          if (response.css && response.id_DocumentHTMLCSS) {
            styleId = this.dycs.generateStyleId(response.id_DocumentHTMLCSS);
            this.dycs.injectCss(response.css, styleId);
            this.dynamicStyleIds.push(styleId+ Math.random().toString(36).substring(2, 15)); // Asegurar un ID único
          }

          return {
            ...response, // Copia todas las propiedades de DynamicContentInterface
            safeHtml: response.plantillaHTML
              ? this.sanitizer.bypassSecurityTrustHtml(response.plantillaHTML)
              : null,
            styleId: styleId
          };
        });
        
        this.cdr.detectChanges(); // Notificar a Angular que los datos han cambiado

        // Esperar a que el DOM se actualice con *ngFor y luego configurar listeners
        // si dynamicContentHostRef ya está disponible (lo cual debería ser si no es la primera carga).
        // Para la primera carga, ngAfterViewInit se encargará.
        if (this.dynamicContentHostRef && this.displayableContents.length > 0) {
          // Usamos setTimeout para asegurar que el DOM está renderizado por el *ngFor
           setTimeout(() => this.setupEventListenersOnDynamicContent(), 0);
        }
      },
      error: (err) => {
        console.error("Error al cargar contenido dinámico:", err);
        this.displayableContents = [];
        this.cdr.detectChanges();
      }
    });
  }

/**
 * Configura los listeners para los eventos de clic y submit de formularios en el contenido dinámico.
 * Este método se llama en ngAfterViewInit y cada vez que el contenido dinámico cambia.
 * Primero, borra los listeners anteriores y luego configura los nuevos.
 * Si dynamicContentHostRef no existe o no hay contenido para configurar listeners, no hace nada.
 * Luego, configura un listener para clicks en el host y otro para submits de formularios.
 * Estos listeners utilizan la delegación de eventos para detectar los eventos en los componentes dinámicos.
 * Si se detecta un clic en un botón dinámico, se llama a reportClick con los detalles del clic.
 * Si se detecta un submit de formulario, se llama a reportFormSubmit con los datos del formulario.
 * En ambos casos, se utiliza la configuración del item específico para determinar el sourceId.
 */
  setupEventListenersOnDynamicContent(): void {
    this.removeEventListenersFromDynamicContent(); // Limpiar listeners anteriores

    if (!this.dynamicContentHostRef || !this.dynamicContentHostRef.nativeElement || this.displayableContents.length === 0) {
      // console.warn('AppComponent: dynamicContentHostRef no disponible o no hay contenido para configurar listeners.');
      return;
    }

    const hostElement = this.dynamicContentHostRef.nativeElement;

    // Listener para Clics (Delegación de eventos en el host)
    this.unlistenClickFn = this.renderer.listen(hostElement, 'click', (event: Event) => {
      let targetElement = event.target as HTMLElement;
      // Buscar el contenedor del componente dinámico específico que originó el evento
      const dynamicItemContainer = targetElement.closest('app-dynamic-viewer');
      if (!dynamicItemContainer) return;

      const configuracion = dynamicItemContainer.getAttribute('data-configuracion');
      const sourceId = configuracion || dynamicItemContainer.getAttribute('data-id_DocumentHTMLCSS') || 'unknown-dynamic-content';

      while (targetElement && targetElement !== hostElement && targetElement !== dynamicItemContainer.parentElement) {
         // Asegurarse que el targetElement está DENTRO del dynamicItemContainer correcto
        if (!dynamicItemContainer.contains(targetElement)) break;

        if (targetElement.matches('button[data-dynamic-action]')) {
          const action = targetElement.getAttribute('data-dynamic-action');
          this.dis.reportClick({
            action: action || 'unknown_click_action',
            sourceId: sourceId, // Usar la configuración del item específico
            clickedElement: targetElement,
            originalEvent: event
          });
          break;
        }
        targetElement = targetElement.parentElement as HTMLElement;
      }
    });

    // Listener para Submit de Formularios (Delegación de eventos en el host)
    this.unlistenSubmitFn = this.renderer.listen(hostElement, 'submit', (event: Event) => {
      event.preventDefault();
      const formElement = event.target as HTMLFormElement;
      // Buscar el contenedor del componente dinámico específico que originó el evento
      const dynamicItemContainer = formElement.closest('app-dynamic-viewer');
      if (!dynamicItemContainer) return;
      
      const configuracion = dynamicItemContainer.getAttribute('data-configuracion');
      const sourceId = configuracion || dynamicItemContainer.getAttribute('data-id_DocumentHTMLCSS') || 'unknown-dynamic-form';

      const formValues = this.dis.extractFormData(formElement);
      const formName = formElement.name || undefined;

      this.dis.reportFormSubmit({
        data: formValues,
        formName: formName,
        sourceId: sourceId // Usar la configuración del item específico
      });
    });
  }

/**
 * Elimina los event listeners de clic y envío de formularios del contenido dinámico.
 * Si los listeners están activos, se desactivan y se liberan los recursos asociados.
 */
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

  /**
   * Manejador de clics de botones dinámicos. Se encarga de procesar los
   * eventos de clic en botones dinámicos y mostrar una alerta con un mensaje
   * amigable.
   * @param payload - Información del clic.
   */
  private handleServiceClickEvent(payload: DynamicClickPayload): void {
    console.log('AppComponent (manejador de servicio): Clic procesado!', payload);
    if (payload.action === 'saludarUsuario') {
      alert(`¡Hola desde ${payload.sourceId}! El botón "${payload.clickedElement?.textContent?.trim()}" fue presionado.`);
    }
  }

  /**
   * Manejador de eventos de formularios dinámicos. Se encarga de procesar los
   * eventos de envío de formularios dinámicos y mostrar una alerta con un mensaje
   * amigable.
   * @param payload - Información del formulario.
   */
  private handleServiceFormEvent(payload: DynamicFormDataPayload): void {
    console.log('AppComponent (manejador de servicio): Formulario procesado!', payload);
    alert(`Datos del formulario "${payload.formName}" de "${payload.sourceId}" recibidos: ${JSON.stringify(payload.data)}`);
  }

  ngOnDestroy() {
    this.dynamicStyleIds.forEach(id => this.dycs.removeCss(id));
    this.dynamicStyleIds = [];
    this.removeEventListenersFromDynamicContent();

    this.clickSubscription?.unsubscribe();
    this.formSubscription?.unsubscribe();
  }
}