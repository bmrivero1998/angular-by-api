import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import {
  DynamicClickPayload,
  DynamicFormDataPayload,
} from '../interfaces/DynamicContent.interface';

@Injectable({
  providedIn: 'root',
})
export class DynamicInteractionService {
  // Subject para emitir eventos de clic
  private clickActionSource = new Subject<DynamicClickPayload>();
  public clickAction$: Observable<DynamicClickPayload> =
    this.clickActionSource.asObservable();

  // Subject para emitir datos de formularios
  private formDataSubmitedSource = new Subject<DynamicFormDataPayload>();
  public formDataSubmitted$: Observable<DynamicFormDataPayload> =
    this.formDataSubmitedSource.asObservable();

  constructor() {}

  /**
   * Método para ser llamado cuando se detecta un clic en un elemento dinámico.
   * El componente que maneja el DOM (ej. AppComponent) llamará a este método.
   * @param payload - Información sobre el clic.
   */
  reportClick(payload: DynamicClickPayload): void {
    this.clickActionSource.next(payload);
  }

  /**
   * Método para ser llamado cuando se envían datos de un formulario dinámico.
   * El componente que maneja el DOM (ej. AppComponent) llamará a este método.
   * @param payload - Datos del formulario.
   */
  reportFormSubmit(payload: DynamicFormDataPayload): void {
    this.formDataSubmitedSource.next(payload);
  }

  /**
   * Helper para extraer datos de un elemento HTMLFormElement.
   * Este puede ser usado por el componente antes de llamar a reportFormSubmit.
   */
  extractFormData(formElement: HTMLFormElement): { [key: string]: any } {
    const formData = new FormData(formElement);
    const formValues: { [key: string]: any } = {};
    formData.forEach((value, key) => {
      if (formValues.hasOwnProperty(key)) {
        if (Array.isArray(formValues[key])) {
          formValues[key].push(value);
        } else {
          formValues[key] = [formValues[key], value];
        }
      } else {
        formValues[key] = value;
      }
    });
    return formValues;
  }
}
