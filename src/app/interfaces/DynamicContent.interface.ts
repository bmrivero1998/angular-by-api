export interface DynamicContentInterface {
  configuracion: string; // Configuration details, e.g., for API calls or settings
  plantillaHTML: string; // HTML template for the dynamic content
  css: string; // CSS styles for the dynamic content
  otros?: { [key: string]: any }; // Additional properties
}


export interface DynamicClickPayload {
  sourceId?: string; // Un identificador opcional para saber de qué contenido dinámico vino el clic
  action: string;    // El nombre de la acción (ej. el 'name' o 'data-action' del botón)
  clickedElement?: HTMLElement; // El elemento HTML que fue clickeado (opcional)
  originalEvent?: Event; // El evento original del DOM (opcional)
}

export interface DynamicFormDataPayload {
  sourceId?: string; // Un identificador opcional para el origen del formulario
  formName?: string;  // El 'name' del formulario, si lo tiene
  data: { [key: string]: any }; // Los datos del formulario como un objeto clave-valor
}