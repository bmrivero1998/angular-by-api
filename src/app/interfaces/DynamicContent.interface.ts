export interface DynamicContentInterface {
  configuracion: string; // Configuration details, e.g., for API calls or settings
  plantillaHTML: string; // HTML template for the dynamic content
  css: string; // CSS styles for the dynamic content
  otros?: { [key: string]: any }; // Additional properties
}