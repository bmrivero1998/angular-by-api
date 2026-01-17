import { Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable, of, tap } from 'rxjs';
import {
  ApiDrivenContent,
  DisplayableInAppComponent,
  TableBindingColumn,
} from '../interfaces/DynamicContent.interface'; // Ajusta la ruta
import { DynamicContentService } from './dynamic-content.service';
import { DomSanitizer } from '@angular/platform-browser';
// Asumimos que el mock se importa para la demo

@Injectable({
  providedIn: 'root',
})
export class DynamicViewerService {
  private readonly _staticContent$ = new BehaviorSubject<ApiDrivenContent[]>(
    []
  );
  public readonly staticContent$: Observable<ApiDrivenContent[]> =
    this._staticContent$.asObservable();

  private readonly _dynamicContent$ = new BehaviorSubject<ApiDrivenContent[]>(
    []
  );
  public readonly dynamicContent$: Observable<ApiDrivenContent[]> =
    this._dynamicContent$.asObservable();

  constructor(private dcs: DynamicContentService,
    private sanitizer: DomSanitizer,
  ) {}

  public getStaticContentValue(): ApiDrivenContent[] {
    return this._staticContent$.getValue();
  }

  public getDynamicContentValue(): ApiDrivenContent[] {
    return this._dynamicContent$.getValue();
  }

  /**
   * Carga y procesa el contenido inicial, incluyendo las tablas,
   * y luego lo separa en streams estáticos y dinámicos.
   */
  public loadInitialContent(
    pageIdentifier: string,
    branch?: string
  ): Observable<ApiDrivenContent[]> {
    return this.dcs.getContent(pageIdentifier, branch).pipe(
     map((apiResponse: any) => {
        try {
          if (apiResponse && apiResponse.content && typeof apiResponse.content === 'string') {
            return JSON.parse(apiResponse.content) as ApiDrivenContent[];
          }
          if (Array.isArray(apiResponse)) {
            return apiResponse;
          }
          return [];
        } catch (e) {
          console.error('Error parseando JSON del DynamicContent:', e);
          return [];
        }
      }),

      // PASO 2: Procesar Tablas (Generar HTML de las tablas)
      map((payloads: ApiDrivenContent[]) => {
        return payloads.map((payload) => this._processTableBindings(payload));
      }),

      tap((processedPayloads: ApiDrivenContent[]) => {
        const staticContent = processedPayloads.filter(
          (p) => p.renderType === 'static'
        );
        const dynamicContent = processedPayloads.filter(
          (p) => p.renderType === 'dynamic'
        );
        this._staticContent$.next(staticContent);
        this._dynamicContent$.next(dynamicContent);
      })
    );
  }

  /**
   * Actualiza el contenido dinámico con el contenido cargado desde
   * la API con el ID especificado.
   * @param contentId El ID del contenido a actualizar.
   * @param branch La rama del contenido a actualizar.
   * @returns Un Observable que emite un array de objetos ApiDrivenContent una vez
   * que se haya cargado el contenido dinámico.
   */
  public updateDynamicContent(
    contentId: string,
    branch?: string
  ): Observable<ApiDrivenContent[]> {
    this._dynamicContent$.next([]);
    return this.dcs.getContent(contentId, branch).pipe(
      map((payloads: ApiDrivenContent[]) => {
        return payloads.map((payload) => this._processTableBindings(payload));
      }),
      tap((processedPayloads: ApiDrivenContent[]) => {
        const dynamicContent = processedPayloads.filter(
          (p) => p.renderType === 'dynamic'
        );
        this._dynamicContent$.next(dynamicContent);
      })
    );
  }


  /**
   * Actualiza el contenido estático con el contenido cargado desde
   * la API con el ID especificado.
   * @param contentId El ID del contenido a actualizar.
   * @param branch La rama del contenido a actualizar.
   * @returns Un Observable que emite un array de objetos ApiDrivenContent una vez
   * que se haya cargado el contenido estático.
   */
  public updateStaticContent(
    contentId: string,
    branch?: string
  ): Observable<ApiDrivenContent[]> {
    this._staticContent$.next([]);
    return this.dcs.getContent(contentId, branch).pipe(
      map((payloads: ApiDrivenContent[]) => {
        return payloads.map((payload) => this._processTableBindings(payload));
      }),
      tap((processedPayloads: ApiDrivenContent[]) => {
        const staticContent = processedPayloads.filter(
          (p) => p.renderType === 'static'
        );
        this._staticContent$.next(staticContent);
      })
    );
  }

  public updateTable(
  /**
   * Actualiza la tabla en el contenido dinámico o estático
   * con el ID especificado.
   * @param contentId El ID del contenido que contiene la tabla a actualizar.
   * @param tableSelector El selector de la tabla a actualizar.
   * @param newTableData Los nuevos datos de la tabla.
   */
    contentId: string,
    tableSelector: string,
    newTableData: { columns?: TableBindingColumn[]; data?: any[] }
  ): void {
    const staticState = this._staticContent$.getValue();
    const dynamicState = this._dynamicContent$.getValue();

    let staticUpdated = false;
    const newStaticState = staticState.map((component) => {
      if (
        component.id_DocumentHTMLCSS === contentId &&
        component.tableBindings
      ) {
        staticUpdated = true;
        const newTableBindings = this._getUpdatedTableBindings(
          component.tableBindings,
          tableSelector,
          newTableData
        );
        return this._processTableBindings({
          ...component,
          tableBindings: newTableBindings,
        });
      }
      return component;
    });

    if (staticUpdated) {
      this._staticContent$.next(newStaticState);
      return;
    }

    // Si no se encontró en el estático, intentamos en el dinámico
    let dynamicUpdated = false;
    const newDynamicState = dynamicState.map((component) => {
      if (
        component.id_DocumentHTMLCSS === contentId &&
        component.tableBindings
      ) {
        dynamicUpdated = true;
        const newTableBindings = this._getUpdatedTableBindings(
          component.tableBindings,
          tableSelector,
          newTableData
        );
        return this._processTableBindings({
          ...component,
          tableBindings: newTableBindings,
        });
      }
      return component;
    });

    if (dynamicUpdated) {
      this._dynamicContent$.next(newDynamicState);
    }
  }

/**
 * Actualiza el valor de un binding en el contenido dinámico o estático
 * con el ID especificado.
 * @param contentId El ID del contenido que contiene el binding a actualizar.
 * @param bindingSelector El selector del binding a actualizar.
 * @param newValue El nuevo valor del binding.
 */
  public updateBindingValue(
    contentId: string,
    bindingSelector: string,
    newValue: any
  ): void {
    const staticState = this._staticContent$.getValue();
    let updated = false;

    const newStaticState = staticState.map((c) => {
      if (c.id_DocumentHTMLCSS === contentId && c.dataBindings) {
        updated = true;
        return {
          ...c,
          dataBindings: c.dataBindings.map((b) =>
            b.selector === bindingSelector ? { ...b, value: newValue } : b
          ),
        };
      }
      return c;
    });
    if (updated) {
      this._staticContent$.next(newStaticState);
      return;
    }

    const dynamicState = this._dynamicContent$.getValue();
    const newDynamicState = dynamicState.map((c) => {
      if (c.id_DocumentHTMLCSS === contentId && c.dataBindings) {
        return {
          ...c,
          dataBindings: c.dataBindings.map((b) =>
            b.selector === bindingSelector ? { ...b, value: newValue } : b
          ),
        };
      }
      return c;
    });
    this._dynamicContent$.next(newDynamicState);
  }



  public clearContent(): void {
    this._staticContent$.next([]);
    this._dynamicContent$.next([]);
  }

  private _getUpdatedTableBindings(
    currentBindings: any[],
    tableSelector: string,
    newTableData: any
  ) {
    return currentBindings.map((table) => {
      if (table.tableSelector !== tableSelector) return table;
      return {
        ...table,
        columns: newTableData.columns || table.columns,
        data: newTableData.data || table.data,
      };
    });
  }

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
        if (tableBinding.actions && tableBinding.actions.length > 0)
          theadHtml += `<th scope="col">Acciones</th>`;
        theadHtml += '</tr></thead>';
        let tbodyHtml = '<tbody>';
        tableBinding.data.forEach((row) => {
          tbodyHtml += '<tr>';
          tableBinding.columns.forEach((col) => {
            tbodyHtml += `<td>${row[col.key] ?? ''}</td>`;
          });
          if (tableBinding.actions && tableBinding.actions.length > 0) {
            tbodyHtml += '<td>';
            tableBinding.actions.forEach((action) => {
              tbodyHtml += `<button type="button" class="${
                action.cssClass || 'btn btn-sm'
              }" data-dynamic-action="${action.action}" data-row-id="${
                row.id || ''
              }">${action.label}</button> `;
            });
            tbodyHtml += '</td>';
          }
          tbodyHtml += '</tr>';
        });
        tbodyHtml += '</tbody>';
        tableElement.innerHTML = theadHtml + tbodyHtml;
      }
    });
    return { ...content, htmlComponent: container.innerHTML };
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

/**
 * Permite cargar contenido directamente desde un objeto o string JSON local,
 * sin realizar peticiones HTTP. Reutiliza la lógica de procesamiento de tablas.
 */
public setLocalContent(rawData: any): void {
  let content: ApiDrivenContent[] = [];

  try {
    // CASO 1: Viene como String puro
    if (typeof rawData === 'string') {
      content = JSON.parse(rawData);
    } 
    // CASO 2: Viene como la respuesta de la API ({ content: "..." })
    else if (rawData && rawData.content && typeof rawData.content === 'string') {
      content = JSON.parse(rawData.content);
    }
    // CASO 3: Ya es el array de objetos
    else if (Array.isArray(rawData)) {
      content = rawData;
    }
  } catch (e) {
    console.error('Error parseando JSON local:', e);
    return;
  }

  // REUTILIZAMOS LA LÓGICA DE TABLAS (Importante para que se generen los HTMLs)
  const processedPayloads = content.map(item => this._processTableBindings(item));

  // SEPARAMOS Y ACTUALIZAMOS EL STORE
  const staticContent = processedPayloads.filter(p => p.renderType === 'static');
  const dynamicContent = processedPayloads.filter(p => p.renderType === 'dynamic');

  this._staticContent$.next(staticContent);
  this._dynamicContent$.next(dynamicContent);
}
}
