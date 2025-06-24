import {
  Injectable,
  ComponentFactoryResolver,
  Injector,
  ApplicationRef,
  EmbeddedViewRef,
  Type,
} from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { DynamicContentService } from './dynamic-content.service';
import { ModalFrameComponent } from '../components/modal-frame/modal-frame.component'; // Crearemos este componente
import { ApiDrivenContent } from '../interfaces/DynamicContent.interface';

@Injectable({
  providedIn: 'root',
})
export class ModalService {
  private modalResult$ = new Subject<any>();

  constructor(
    private componentFactoryResolver: ComponentFactoryResolver,
    private injector: Injector,
    private appRef: ApplicationRef,
    private dcs: DynamicContentService
  ) {}

  /**
   * Abre un modal con contenido dinámico cargado desde el backend.
   * @param contentIdentifier El ID del contenido a cargar para el modal.
   * @param initialData Datos iniciales que se pueden pasar al formulario del modal.
   * @returns Un Observable que emite un valor cuando el modal se cierra.
   */
  public open(contentIdentifier: string, initialData?: any): Observable<any> {
    this.dcs.getContent(contentIdentifier).subscribe((modalContentConfig) => {
      if (modalContentConfig && modalContentConfig.length > 0) {
        const content = modalContentConfig[0];
        content.formInitialData = {
          ...content.formInitialData,
          ...initialData,
        };
        this.attachModalComponent(content);
      } else {
        console.error(
          `No se encontró configuración para el modal con ID: ${contentIdentifier}`
        );
      }
    });

    return this.modalResult$.asObservable();
  }

  private attachModalComponent(contentConfig: ApiDrivenContent) {
    const componentFactory =
      this.componentFactoryResolver.resolveComponentFactory(
        ModalFrameComponent
      );
    const componentRef = componentFactory.create(this.injector);

    componentRef.instance.contentConfig = contentConfig;
    componentRef.instance.close.subscribe((result: any) => {
      this.close(result);
      this.appRef.detachView(componentRef.hostView);
      componentRef.destroy();
    });

    this.appRef.attachView(componentRef.hostView);

    const domElem = (componentRef.hostView as EmbeddedViewRef<any>)
      .rootNodes[0] as HTMLElement;
    document.body.appendChild(domElem);
  }

  /**
   * Cierra el modal y emite el resultado.
   */
  public close(result: any): void {
    this.modalResult$.next(result);
    this.modalResult$ = new Subject<any>();
  }
}
