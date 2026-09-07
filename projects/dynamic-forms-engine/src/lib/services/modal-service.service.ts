import {
  Injectable,
  ComponentFactoryResolver,
  Injector,
  ApplicationRef,
  EmbeddedViewRef,
  ComponentRef, // Importante
} from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';
import { DynamicContentService } from './dynamic-content.service';
import { ApiDrivenContent } from '../interfaces/DynamicContent.interface';
import { ModalFrameComponent } from '../../../../../src/app/components/modal-frame/modal-frame.component';

@Injectable({
  providedIn: 'root',
})
export class ModalService {
  private modalResult$ = new Subject<any>();
  
  // ARREGLO 1: Guardamos la referencia del componente vivo para poder matarlo después
  private activeComponentRef: ComponentRef<ModalFrameComponent> | null = null;
  // Suscripciones a los EventEmitters del componente activo (close/triggerAction).
  // Sin esto, cada `open()` deja una suscripción viva sobre la instancia
  // anterior — no se dispara en producción porque su DOM ya está desmontado,
  // pero es una fuga de memoria real y, si algo (test o no) reutiliza la
  // instancia, provoca que el mismo evento se procese más de una vez.
  private activeComponentSubscriptions = new Subscription();

  constructor(
    private componentFactoryResolver: ComponentFactoryResolver,
    private injector: Injector,
    private appRef: ApplicationRef,
    private dcs: DynamicContentService
  ) {}

 /**
   * Ahora acepta 'contentSource' que puede ser:
   * 1. Un string (ID/UUID) -> Va a la API.
   * 2. Un Array/Objeto (JSON en duro) -> Lo renderiza directo.
   */
  public open(contentSource: string | any[] | any, branch?: string, initialData?: any): Observable<any> {
    
    // 1. Limpieza preventiva
    if (this.activeComponentRef) {
        this.close(null);
    }

    // Función auxiliar para renderizar (evita repetir código)
    const render = (config: ApiDrivenContent[]) => {
       if (config && config.length > 0) {
         const content = config[0];
         content.formInitialData = { ...content.formInitialData, ...initialData };
         this.attachModalComponent(content);
       } else {
         console.warn('ModalService: Configuración vacía o inválida.');
       }
    };

    // 2. Lógica de decisión
    if (typeof contentSource === 'string') {
        // ES UN ID: Vamos a buscarlo a la API
        this.dcs.getContent(contentSource).subscribe((response: any) => {
            let config: ApiDrivenContent[] = [];
            try {
                // Parche para JSON stringificado
                if (response?.content && typeof response.content === 'string') {
                    config = JSON.parse(response.content);
                } else if (Array.isArray(response)) {
                    config = response;
                }
            } catch (e) { console.error('Error parseando modal:', e); }
            
            render(config);
        });
    } else {
        // ES UN JSON EN DURO (Array u Objeto)
        let config: ApiDrivenContent[] = [];
        if (Array.isArray(contentSource)) {
            config = contentSource;
        } else if (contentSource) {
            config = [contentSource]; // Si pasaron un solo objeto, lo envolvemos
        }
        
        // Renderizamos directo (podrías meter un setTimeout(0) si quieres asincronía visual)
        render(config);
    }

    return this.modalResult$.asObservable();
  }

  private attachModalComponent(contentConfig: ApiDrivenContent) {
    const componentFactory = this.componentFactoryResolver.resolveComponentFactory(ModalFrameComponent);
    const componentRef = componentFactory.create(this.injector);

    // Guardamos la referencia globalmente
    this.activeComponentRef = componentRef;

    componentRef.instance.contentConfig = contentConfig;

    this.activeComponentSubscriptions = new Subscription();

    // Suscripción al evento de cierre INTERNO del componente (la X o backdrop)
    this.activeComponentSubscriptions.add(
      componentRef.instance.close.subscribe((result: any) => {
        this.close(result); // Reutilizamos el método público
      })
    );

    this.activeComponentSubscriptions.add(
      componentRef.instance.triggerAction.subscribe((eventData: any) => {
        this.modalResult$.next(eventData);
      })
    );

    this.appRef.attachView(componentRef.hostView);

    const domElem = (componentRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement;
    document.body.appendChild(domElem);
  }

  /**
   * Cierra el modal, destruye el DOM y emite el resultado.
   * Ahora sí funciona si lo llamas desde fuera.
   */
  public close(result: any = null): void {
    // 1. Emitir resultado
    this.modalResult$.next(result);
    this.modalResult$ = new Subject<any>(); // Reset del subject

    // 2. DESTRUIR EL COMPONENTE VISUAL
    this.activeComponentSubscriptions.unsubscribe();
    if (this.activeComponentRef) {
        this.appRef.detachView(this.activeComponentRef.hostView);
        this.activeComponentRef.destroy();
        this.activeComponentRef = null; // Limpiar referencia
    }
  }
}