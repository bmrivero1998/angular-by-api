import { Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable, tap } from 'rxjs';
import { ApiDrivenContent } from '../interfaces/DynamicContent.interface'; // Ajusta la ruta
import { DynamicContentService } from './dynamic-content.service';

@Injectable({
  providedIn: 'root',
})
export class DynamicViewerService {
  private readonly _dynamicContent$ = new BehaviorSubject<ApiDrivenContent[]>(
    []
  );

  public readonly dynamicContent$: Observable<ApiDrivenContent[]> =
    this._dynamicContent$.asObservable();

  constructor(private dcs: DynamicContentService) {}

  /**
   * Carga el contenido inicial llamando al DynamicContentService.
   * Como dcs ya procesa la respuesta, aquí solo necesitamos usar 'tap'
   * para actualizar nuestro estado interno (el BehaviorSubject).
   * @param contentIdentifier El identificador del contenido a cargar.
   */
  public loadInitialContent(
    contentIdentifier: string
  ): Observable<ApiDrivenContent[]> {
    return this.dcs.getContent(contentIdentifier).pipe(
      tap((processedPayloads: ApiDrivenContent[]) => {
        console.log(
          'DynamicViewerService: Contenido recibido de DynamicContentService. Actualizando estado:',
          processedPayloads
        );
        this._dynamicContent$.next(processedPayloads);
      })
    );
  }

  /**
   * Actualiza el valor de un data-binding específico de forma inmutable.
   * @param contentId El 'id_DocumentHTMLCSS' del componente a modificar.
   * @param bindingSelector El selector CSS del elemento a actualizar.
   * @param newValue El nuevo valor a mostrar.
   */
  public updateBindingValue(
    contentId: string,
    bindingSelector: string,
    newValue: any
  ): void {
    const currentState = this._dynamicContent$.getValue();

    const newState = currentState.map((component) => {
      if (component.id_DocumentHTMLCSS !== contentId) {
        return component;
      }

      return {
        ...component,
        dataBindings: (component.dataBindings || []).map((binding) => {
          if (binding.selector !== bindingSelector) {
            return binding;
          }

          return {
            ...binding,
            value: newValue,
          };
        }),
      };
    });

    this._dynamicContent$.next(newState);

    console.log(
      `Servicio: Estado actualizado para '${bindingSelector}' en '${contentId}' con valor '${newValue}'.`
    );
  }

  /**
   * Añade un nuevo componente dinámico al final de la lista.
   * @param newComponent El nuevo componente a añadir.
   */
  public addComponent(newComponent: ApiDrivenContent): void {
    const currentState = this._dynamicContent$.getValue();
    this._dynamicContent$.next([...currentState, newComponent]);
  }

  /**
   * Limpia todo el contenido dinámico.
   */
  public clearContent(): void {
    this._dynamicContent$.next([]);
  }
}
