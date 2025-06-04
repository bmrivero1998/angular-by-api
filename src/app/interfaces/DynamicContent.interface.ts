import { SafeHtml } from '@angular/platform-browser';
import {
  ButtonConfig,
  FormFieldMapping,
} from '../models/form-field-mapping.model';

export interface ApiDrivenContent {
  plantillaHTML: string; // El HTML crudo
  css?: string; // El CSS para este contenido
  id_DocumentHTMLCSS: string; // Un ID único para este bloque de contenido/CSS
  configuracion?: string; // Configuración adicional, como un ID de formulario o nombre
  formId?: string; // Un ID específico para el formulario (si es diferente de id_DocumentHTMLCSS)
  formMappings?: FormFieldMapping[]; // Los mapeos para el FormDomSynchronizerService
  formInitialData?: any; // Datos iniciales para el FormGroup
  validators?: any[]; // Validadores para el FormGroup
  otros?: any; // Otros datos adicionales
  buttonConfigs?: ButtonConfig[]; // Configuración de botones
}

export interface DisplayableDynamicContent extends ApiDrivenContent {
  safeHtml: SafeHtml; // Contenido HTML seguro
  styleId?: string; // ID generado para la etiqueta <style>
}

export interface DynamicApiResponse {
  ok: boolean; // Indica si la petición fue exitosa
  doc: DynamicContentPayload[]; // Un array de objetos DynamicContentPayload
}
export interface DynamicContentPayload {
  url: string; // La URL de la API
  htmlComponent?: string; // El HTML crudo
  cssComponent?: string; // El CSS para este contenido
  plantillaHTML?: string; // El HTML crudo
  css?: string; // El CSS para este contenido
  id_DocumentHTMLCSS: string; // Un ID único para este bloque de contenido/CSS
  formId?: string; // Un ID específico para el formulario (si es diferente de id_DocumentHTMLCSS)
  formMappings?: FormFieldMapping[]; // Los mapeos para el FormDomSynchronizerService
  formInitialData?: any; // Datos iniciales para el FormGroup
  validators?: any[]; // Validadores para el FormGroup
  otros?: any; // Otros datos adicionales
  buttonConfigs?: ButtonConfig[]; // Configuración de botones
  buttonsConfig?:ButtonConfig[]
}

export interface DynamicClickPayload {
  sourceId?: string; // Un identificador opcional para saber de qué contenido dinámico vino el clic
  action: string; // El nombre de la acción (ej. el 'name' o 'data-action' del botón)
  clickedElement?: HTMLElement; // El elemento HTML que fue clickeado (opcional)
  originalEvent?: Event; // El evento original del DOM (opcional)
}

export interface DynamicFormDataPayload {
  sourceId?: string; // Un identificador opcional para el origen del formulario
  formName?: string; // El 'name' del formulario, si lo tiene
  data: { [key: string]: any }; // Los datos del formulario como un objeto clave-valor
}
