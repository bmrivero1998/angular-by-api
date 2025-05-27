import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MOCK_DATA_COMPLEX_FORM } from '../mocks/getContent.mock';
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
    const mockData:DynamicContentInterface = MOCK_DATA_COMPLEX_FORM;
    return of(mockData).pipe(
    );
  }
}
