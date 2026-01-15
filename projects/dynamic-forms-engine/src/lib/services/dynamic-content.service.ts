import { Injectable } from '@angular/core';
import { delay, map, Observable, of } from 'rxjs';
import {
  ApiDrivenContent,
  DynamicApiResponse,
} from '../interfaces/DynamicContent.interface';
import { HttpClient } from '@angular/common/http';
import { FORM_PRO_MOCK } from '../../../../../src/app/mocks/getContent.mock';

@Injectable({
  providedIn: 'root',
})


export class DynamicContentService {
  private readonly apiUrl = 'http://localhost:3001/api/v2/vacancies';
  //private readonly apiUrl = 'http://localhost:3000/api/html-css/';
  constructor(private readonly http: HttpClient) {}
  /**
   * Realiza una petición GET a la API para obtener el contenido dinámico.
   * El contenido se devuelve como un Observable de un array de objetos DynamicContentInterface,
   * que incluyen la configuración, el HTML y los estilos CSS para cada contenido.
   * Si no se obtiene respuesta, se devuelve un array vacío.
   * @returns Observable<ApiDrivenContent[]>
   */
  getContent(id: string, branch?:string): Observable<any> {
    return this.http.get<any>('https://uxdrivenworker.khiemdoh.com/viewer/'+id+'/main').pipe()
  }
}