import { Injectable } from '@angular/core';
import { map, Observable} from 'rxjs';
import { DynamicApiResponse, DynamicContentInterface } from '../interfaces/DynamicContent.interface';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class DynamicContentService {
  private readonly apiUrl = 'http://localhost:3000/api/html-css/'; // Replace with your API URL


  constructor(
    private readonly http: HttpClient,
  ) { 
  }


  /**
   * Realiza una petición GET a la API para obtener el contenido dinámico.
   * El contenido se devuelve como un Observable de un array de objetos DynamicContentInterface,
   * que incluyen la configuración, el HTML y los estilos CSS para cada contenido.
   * Si no se obtiene respuesta, se devuelve un array vacío.
   * @returns Observable<DynamicContentInterface[]>
   */
  getContent(): Observable<DynamicContentInterface[]> {
    return this.http.get<DynamicApiResponse>(this.apiUrl).pipe(
      map(response => { // Usa el operador map aquí
        if (response && response.doc) {
          return response.doc.map(item => ({
            configuracion: item.url,
            plantillaHTML: item.htmlComponent,
            css: item.cssComponent,
            otros: { id_DocumentHTMLCSS: item.id_DocumentHTMLCSS }
          } as DynamicContentInterface)); 
        }
        return []; 
      })
    );
  }
}
