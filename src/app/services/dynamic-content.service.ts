import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  ApiDrivenContent,
  DynamicApiResponse,
} from '../interfaces/DynamicContent.interface';
import { HttpClient } from '@angular/common/http';
import { MockApiResponseData } from '../mocks/getContent.mock';

@Injectable({
  providedIn: 'root',
})
export class DynamicContentService {
  //private readonly apiUrl = 'http://localhost:3001/api/v2/vacancies';
  private readonly apiUrl = 'http://localhost:3000/api/html-css/'; 
  constructor(private readonly http: HttpClient) {}

  /**
   * Realiza una petición GET a la API para obtener el contenido dinámico.
   * El contenido se devuelve como un Observable de un array de objetos DynamicContentInterface,
   * que incluyen la configuración, el HTML y los estilos CSS para cada contenido.
   * Si no se obtiene respuesta, se devuelve un array vacío.
   * @returns Observable<ApiDrivenContent[]>
   */
  getContent(): Observable<ApiDrivenContent[]> {
    const mock = MockApiResponseData;
    return this.http.get<DynamicApiResponse>(this.apiUrl).pipe(
      map((response) => {
        // Usa el operador map aquí

        if (response && response.doc) {
          console.log(response.doc);
          return response.doc.map(
            (item) =>
              ({
                configuracion: item.url,
                plantillaHTML: item?.plantillaHTML || item.htmlComponent,
                css: item?.css || item.cssComponent,
                id_DocumentHTMLCSS: item.id_DocumentHTMLCSS,
                formId: item.formId,
                formMappings: item.formMappings,
                formInitialData: item.formInitialData,
                buttonConfigs: item?.buttonConfigs ?? item?.buttonsConfig,
                validators: item.validators,
                otros: {}, // Puedes agregar más propiedades si es necesario
              }) as ApiDrivenContent,
          );
        }
        return [];
      }),
    );
  }
}
