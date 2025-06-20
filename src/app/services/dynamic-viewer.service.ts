import { Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable, of, tap } from 'rxjs';
import {
  ApiDrivenContent,
  TableBindingColumn,
} from '../interfaces/DynamicContent.interface'; // Ajusta la ruta
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

  public loadInitialContent(
    contentIdentifier: string
  ): Observable<ApiDrivenContent[]> {
    return this.dcs.getContent(contentIdentifier).pipe(
      map((payloads: ApiDrivenContent[]) => {
        return payloads.map((payload) => this._processTableBindings(payload));
      }),
      tap((processedPayloads: ApiDrivenContent[]) => {
        console.log(
          'DynamicViewerService: Contenido procesado (incluyendo tablas). Actualizando estado:',
          processedPayloads
        );
        this._dynamicContent$.next(processedPayloads);
      })
    );
  }

  public updateBindingValue(
    contentId: string,
    bindingSelector: string,
    newValue: any
  ): void {
    const currentState = this._dynamicContent$.getValue();
    const newState = currentState.map((component) => {
      if (component.id_DocumentHTMLCSS !== contentId || !component.dataBindings)
        return component;
      return {
        ...component,
        dataBindings: component.dataBindings.map((binding) =>
          binding.selector === bindingSelector
            ? { ...binding, value: newValue }
            : binding
        ),
      };
    });
    this._dynamicContent$.next(newState);
  }

  /**
   * NUEVO MÉTODO MEJORADO: Reemplaza completamente la data y/o columnas de una tabla.
   * @param contentId El ID del componente que contiene la tabla.
   * @param tableSelector El selector de la tabla a actualizar.
   * @param newTableData Un objeto que puede contener las nuevas columnas y/o los nuevos datos.
   */
  public updateTable(
    contentId: string,
    tableSelector: string,
    newTableData: { columns?: TableBindingColumn[]; data?: any[] }
  ): void {
    const currentState = this._dynamicContent$.getValue();

    const newState = currentState.map((component) => {
      if (
        component.id_DocumentHTMLCSS !== contentId ||
        !component.tableBindings
      ) {
        return component;
      }

      // Creamos un nuevo array de tableBindings de forma inmutable
      const newTableBindings = component.tableBindings.map((table) => {
        if (table.tableSelector !== tableSelector) {
          return table;
        }
        // Creamos un nuevo objeto para la tabla, mezclando lo antiguo con lo nuevo
        return {
          ...table,
          columns: newTableData.columns || table.columns, // Usa las nuevas columnas si se proveen, si no, las antiguas
          data: newTableData.data || table.data, // Usa los nuevos datos si se proveen, si no, los antiguos
        };
      });

      // Reprocesamos el HTML del componente con la nueva configuración de la tabla
      return this._processTableBindings({
        ...component,
        tableBindings: newTableBindings,
      });
    });

    // Emitimos el nuevo estado completo
    this._dynamicContent$.next(newState);
    console.log(
      `Servicio: Tabla '${tableSelector}' en '${contentId}' ha sido actualizada.`
    );
  }

  public clearContent(): void {
    this._dynamicContent$.next([]);
  }

  // El método para generar el HTML de la tabla permanece igual
  private _processTableBindings(content: ApiDrivenContent): ApiDrivenContent {
    if (!content.tableBindings || !content.htmlComponent) return content;

    let finalHtml = content.htmlComponent;
    const container = document.createElement('div');
    container.innerHTML = finalHtml;

    content.tableBindings.forEach((tableBinding) => {
      const tableElement = container.querySelector(tableBinding.tableSelector);
      if (tableElement) {
        let theadHtml = '<thead><tr>';
        tableBinding.columns.forEach(
          (col) => (theadHtml += `<th scope="col">${col.header}</th>`)
        );
        theadHtml += '</tr></thead>';

        let tbodyHtml = '<tbody>';
        tableBinding.data.forEach((row) => {
          tbodyHtml += '<tr>';
          tableBinding.columns.forEach((col) => {
            tbodyHtml += `<td>${row[col.key] ?? ''}</td>`;
          });
          tbodyHtml += '</tr>';
        });
        tbodyHtml += '</tbody>';

        tableElement.innerHTML = theadHtml + tbodyHtml;
      }
    });

    return { ...content, htmlComponent: container.innerHTML };
  }
}
