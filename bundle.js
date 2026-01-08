const concat = require('concat');
const fs = require('fs-extra');

(async function build() {
  const files = [
    './dist/angular-by-api/browser/polyfills.js',
    './dist/angular-by-api/browser/main.js'
  ];

  await fs.ensureDir('dist/bundle');
  await concat(files, 'dist/bundle/dynamic-viewer-v1.js');
  console.log('¡Bundle generado con éxito en dist/bundle/dynamic-viewer-v1.js!');
})();