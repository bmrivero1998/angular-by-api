import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MOCK_DATA } from '../mocks/getContent.mock';
import { DynamicContentInterface } from '../interfaces/DynamicContent.interface';

@Injectable({
  providedIn: 'root'
})
export class DynamicContentService {
  private apiUrl = 'https://api.example.com/content'; // Replace with your API URL


  constructor(
    //private http: HttpClient,
  ) { 
  }


  public getContent(): Observable<DynamicContentInterface> {
    const mockData:DynamicContentInterface = MOCK_DATA;
    return of(mockData).pipe(
      // Uncomment the following line to fetch from the API instead of mock data
      // this.http.get<DynamicContentInterface>(this.apiUrl)
    );
  }
}
