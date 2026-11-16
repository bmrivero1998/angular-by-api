import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export interface Toast {
  message: string;
  classname?: string;
  delay?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private toastSubject = new Subject<Toast>();
  public toast$: Observable<Toast> = this.toastSubject.asObservable();

  constructor() {}

  /**
   * Muestra una notificación toast.
   * @param message El mensaje a mostrar.
   * @param options Opciones adicionales como la clase de estilo y el delay.
   */
  show(message: string, options: { classname?: string; delay?: number } = {}) {
    this.toastSubject.next({ message, ...options });
  }
}
