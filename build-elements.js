const fs = require('fs-extra');
const concat = require('concat');

(async function build() {
  const files = [
    './dist/angular-by-api/browser/polyfills.js',
    './dist/angular-by-api/browser/main.js'
  ];

  await fs.ensureDir('dist/uxdriven-widget');
  
  // Concatenar todo en un solo archivo
  await concat(files, 'dist/uxdriven-widget/ux-driven-viewer.js');
  
  // Copiar estilos si los hubiera extra
  // await fs.copy('./dist/angular-by-api/browser/styles.css', 'dist/uxdriven-widget/styles.css');

  console.info('✅ Microfrontend creado en: dist/uxdriven-widget/ux-driven-viewer.js');
})();