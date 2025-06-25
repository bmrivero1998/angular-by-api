import { SafeHtml } from '@angular/platform-browser';
import {
  ButtonConfig,
  FormFieldMapping,
} from '../models/form-field-mapping.model';

export interface ApiDrivenContent {
  htmlComponent: string; // El HTML crudo
  cssComponent?: string; // El CSS para este contenido
  id_DocumentHTMLCSS: string; // Un ID único para este bloque de contenido/CSS
  configuracion?: string; // Configuración adicional, como un ID de formulario o nombre
  formId?: string; // Un ID específico para el formulario (si es diferente de id_DocumentHTMLCSS)
  formMappings?: FormFieldMapping[]; // Los mapeos para el FormDomSynchronizerService
  formInitialData?: any; // Datos iniciales para el FormGroup
  validators?: any[]; // Validadores para el FormGroup
  otros?: any; // Otros datos adicionales
  buttonConfigs?: ButtonConfig[]; // Configuración de botones
  dataBindings?: DataBinding[]; // Mapeos de datos para actualizar el DOM
  tableBindings?: TableBinding[]; // Mapeos de tablas para renderizar datos
  renderType: 'static' | 'dynamic'; // Tipo de renderizado: 'static' para contenido estático, 'dynamic' para contenido dinámico
  dynamicContentId?: string; // Un ID opcional para identificar el contenido dinámico
}

export interface DataBinding {
  selector: string; // El ID del elemento en el DOM que se va a actualizar
  value: string | number | boolean | null | undefined; // El valor a mostrar
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
  url?: string; // La URL de la API
  htmlComponent?: string; // El HTML crudo
  cssComponent?: string; // El CSS para este contenido
  id_DocumentHTMLCSS: string; // Un ID único para este bloque de contenido/CSS
  formId?: string; // Un ID específico para el formulario (si es diferente de id_DocumentHTMLCSS)
  formMappings?: FormFieldMapping[]; // Los mapeos para el FormDomSynchronizerService
  formInitialData?: any; // Datos iniciales para el FormGroup
  validators?: any[]; // Validadores para el FormGroup
  otros?: any; // Otros datos adicionales
  buttonConfigs?: ButtonConfig[]; // Configuración de botones
  dataBindings?: DataBinding[]; // Mapeos de datos para actualizar el DOM
  tableBindings?: TableBinding[]; // Mapeos de tablas para renderizar datos
  renderType: 'static' | 'dynamic'; // Tipo de renderizado: 'static' para contenido estático, 'dynamic' para contenido dinámico
  dynamicContentId?: string; // Un ID opcional para identificar el contenido dinámico
}

export interface DynamicClickPayload {
  sourceId?: string; // Un identificador opcional para saber de qué contenido dinámico vino el clic
  action: string; // El nombre de la acción (ej. el 'name' o 'data-action' del botón)
  clickedElement?: HTMLElement; // El elemento HTML que fue clickeado (opcional)
  originalEvent?: Event; // El evento original del DOM (opcional)
  payload?: any; // Cualquier dato adicional que se quiera enviar con el clic
  formId?: string; // Un ID de formulario asociado al clic, si aplica
  formData?: { [key: string]: any }; // Datos del formulario asociados al clic, si aplica
}

export interface DynamicFormSubmited {
  formId?: string;
  data: any;
}

export interface DynamicFormDataPayload {
  sourceId?: string; // Un identificador opcional para el origen del formulario
  formName?: string; // El 'name' del formulario, si lo tiene
  data: { [key: string]: any }; // Los datos del formulario como un objeto clave-valor
}

export interface TableBindingAction {
  label: string; // Texto del botón (ej. 'Editar')
  action: string; // La acción a emitir (ej. 'edit-user')
  cssClass?: string; // Clases CSS para el botón (ej. 'btn btn-sm btn-primary')
}

export interface TableBinding {
  tableSelector: string; // El selector CSS para encontrar la <table> en el htmlComponent
  columns: TableBindingColumn[]; // La definición de las columnas
  data: any[]; // El array de objetos a renderizar
  actions?: TableBindingAction[]; // Opcional: acciones para cada fila
}

export interface TableBindingColumn {
  key: string; // La clave del objeto de datos (ej. 'firstName')
  header: string; // El texto que se mostrará en el <thead> (ej. 'Nombre')
  isHtml?: boolean; // Opcional: si el contenido es HTML y no texto plano
}
