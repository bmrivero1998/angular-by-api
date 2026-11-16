/*
 * API pública de @ux-driven-viewer/engine.
 * Lo que no se exporta aquí es detalle interno y puede cambiar sin aviso
 * (incluido todo lo que vive en lib/experimental).
 */

// Componente principal
export * from './lib/viewer/dynamic-viewer.component';

// Configuración
export * from './lib/config/dynamic-config.token';
export * from './lib/config/dynamic-viewer.constants';

// Modelos del esquema JSON
export * from './lib/models/form-field-mapping.model';
export * from './lib/models/dynamic-content.model';

// Formularios
export * from './lib/forms/sync/form-dom-synchronizer.service';
export * from './lib/forms/sync/form-dom-value-sync.service';
export * from './lib/forms/validation/validators.helper';
export * from './lib/forms/validation/dynamic-validation.service';
export * from './lib/forms/conditional/form-conditional-logic.service';
export * from './lib/forms/controls/form-special-controls.service';
export { FileUploadService } from './lib/forms/controls/file-upload.service';
export * from './lib/forms/controls/file-upload-transfer.service';
export * from './lib/forms/controls/trusted-url';
export * from './lib/forms/controls/input-masking.service';
export * from './lib/forms/buttons/button-state.service';
export * from './lib/forms/stepper/form-stepper';
export * from './lib/forms/stepper/form-stepper.service';

// DOM
export * from './lib/dom/dom-interactions.service';
export * from './lib/dom/dynamic-inyect-css.service';
export { scopeCss, scopeClassFor } from './lib/dom/css-scoper';
export * from './lib/dom/timer-manager.service';
export * from './lib/dom/external-libs-cleanup.service';

// Seguridad
export * from './lib/security/html-sanitizer.interceptor';
