import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AbstractControl, AsyncValidatorFn, ValidationErrors } from '@angular/forms';
import { Observable, of, timer } from 'rxjs';
import { catchError, map, switchMap, first } from 'rxjs/operators';
import { DYNAMIC_CONFIG } from '../dynamic-config.token';
import { AsyncValidatorConfig } from '../models/form-field-mapping.model';


/**
 * Servicio para la creación de validadores asíncronos dinámicos.
 * 
 * Proporciona funcionalidades para generar validadores que realizan peticiones HTTP
 * a endpoints configurados para verificar la disponibilidad o validez de valores
 * en controles de formulario. Los validadores incluyen debounce integrado para
 * optimizar el rendimiento y manejo de errores robusto.
 * 
 * Este servicio está diseñado para ser utilizado con {@link DYNAMIC_CONFIG} que
 * define la configuración base de la API. Si no se proporciona configuración,
 * se utilizan valores por defecto o URLs relativas.
 * 
 * @author Angular Dynamic Forms Team
 * @version 1.0.0
 * @since 2.5.0
 * 
 * @see AsyncValidatorFn
 * @see AsyncValidatorConfig
 * @see DYNAMIC_CONFIG
 * 
 * @example
 * // Uso en un componente o servicio:
 * const validator = validationService.createAsyncValidator({
 *   endpoint: '/api/check-email',
 *   method: 'POST',
 *   errorKey: 'emailTaken',
 *   debounceTime: 1000
 * });
 * 
 * emailControl.setAsyncValidators([validator]);
 */
@Injectable({
  providedIn: 'root'
})
export class DynamicValidationService {
  private http = inject(HttpClient);
  private config = inject(DYNAMIC_CONFIG, { optional: true });

   /**
   * Crea un validador asíncrono reutilizable para verificación de disponibilidad.
   * 
   * Genera un validador que realiza una petición HTTP (GET o POST) a un endpoint
   * configurado para validar si un valor está disponible. El validador incluye:
   * - Debounce automático para prevenir peticiones excesivas
   * - Manejo automático de errores (retorna null en caso de error)
   * - Soporte para ambos métodos HTTP GET y POST
   * - Integración con configuración global de API
   * 
   * El validador solo se activa cuando el control tiene un valor no vacío.
   * 
   * @param config - Configuración del validador asíncrono
   * @return AsyncValidatorFn - Función validadora que puede ser asignada a un control
   * 
   * @throws Ninguna excepción explícita. Los errores HTTP son manejados internamente.
   * 
   * @see AsyncValidatorConfig#endpoint - Endpoint relativo para la validación
   * @see AsyncValidatorConfig#method - Método HTTP ('GET' o 'POST')
   * @see AsyncValidatorConfig#errorKey - Clave del error en ValidationErrors
   * @see AsyncValidatorConfig#debounceTime - Tiempo de debounce en ms (opcional, default: 500)
   * 
   * @example
   * // Validador para verificar nombre de usuario disponible
   * const usernameValidator = service.createAsyncValidator({
   *   endpoint: '/users/check-username',
   *   method: 'GET',
   *   errorKey: 'usernameTaken',
   *   debounceTime: 300
   * });
   * 
   * @example  
   * // Validador con método POST
   * const emailValidator = service.createAsyncValidator({
   *   endpoint: '/auth/check-email',
   *   method: 'POST',
   *   errorKey: 'emailRegistered'
   * });
   */
  createAsyncValidator(config: AsyncValidatorConfig): AsyncValidatorFn {
    return (control: AbstractControl): Observable<ValidationErrors | null> => {
      if (!control.value) return of(null);

      const baseUrl = this.config?.apiUrl || '';
      const url = `${baseUrl}${config.endpoint}`;

      return timer(config.debounceTime || 500).pipe(
        switchMap(() => {
          const request = config.method === 'POST'
            ? this.http.post<{ isAvailable: boolean }>(url, { value: control.value })
            : this.http.get<{ isAvailable: boolean }>(url, { params: { value: control.value } });

          return request.pipe(
            map(res => (res.isAvailable ? null : { [config.errorKey]: true })),
            catchError(() => of(null))
          );
        }),
        first()
      );
    };
  }
}