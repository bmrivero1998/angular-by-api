export const MockNotFoundPage = {
  ok: false,
  doc: [
    {
      renderType: 'dynamic',
      id_DocumentHTMLCSS: '404-page',
      htmlComponent:
        '\n    <div class="d-flex flex-column align-items-center justify-content-center" style="margin-left: 265px; margin-right: 15px; padding-top: 75px; padding-bottom: 65px; min-height: calc(100vh - 75px - 65px);">\n      <div class="card shadow-lg rounded-3 bg-white p-5 text-center" style="max-width: 600px; width: 100%;">\n        <i class="bi bi-exclamation-triangle-fill text-warning mb-4" style="font-size: 8rem;"></i>\n        <h1 class="display-1 fw-bold text-danger">404</h1>\n        <h2 class="display-5 mb-4 text-secondary">¡Página No Encontrada!</h2>\n        <p class="lead mb-4 text-secondary">Lo sentimos, la página que estás buscando no existe o se ha movido.</p>\n        <a href="/" class="btn btn-primary btn-lg"><i class="bi bi-house-door-fill me-2"></i>Ir a la página de Inicio</a>\n      </div>\n    </div>',
      cssComponent: '',
      formId: null,
      formMappings: [],
      buttonConfigs: [],
    },
  ],
};

export const MockMaintenancePage = {
  ok: true,
  doc: [
    {
      renderType: 'dynamic',
      id_DocumentHTMLCSS: 'maintenance-page',
      htmlComponent:
        '\n    <div class="d-flex flex-column align-items-center justify-content-center" style="margin-left: 265px; margin-right: 15px; padding-top: 75px; padding-bottom: 65px; min-height: calc(100vh - 75px - 65px);">\n      <div class="card shadow-lg rounded-3 bg-white p-5 text-center" style="max-width: 600px; width: 100%;">\n        <i class="bi bi-tools text-info mb-4" style="font-size: 8rem;"></i>\n        <h1 class="display-3 fw-bold text-primary">¡Estamos en Mantenimiento!</h1>\n        <h2 class="display-6 mb-4 text-secondary">Mejorando tu experiencia.</h2>\n        <p class="lead mb-4 text-secondary">Disculpa las molestias. Estamos realizando actualizaciones importantes y volveremos en breve.</p>\n        <button type="button" onclick="location.reload();" class="btn btn-success btn-lg"><i class="bi bi-arrow-clockwise me-2"></i>Recargar Página</button>\n      </div>\n    </div>',
      cssComponent: '',
      formId: null,
      formMappings: [],
      buttonConfigs: [],
    },
  ],
};
