const fs = require('fs');
const path = require('path');

// AJUSTA EL NOMBRE DE TU PROYECTO AQUÍ (debe coincidir con outputPath en angular.json)
const projectName = 'dynamic-forms-engine';

const distPath = path.join(__dirname, 'dist', projectName);
const outDir = path.join(__dirname, 'dist', 'elements');
const outFile = path.join(outDir, 'ux-driven-viewer.js');

// Orden estricto: runtime -> polyfills (zone.js) -> main.
// IMPORTANTE: se concatenan como scripts clásicos, SIN envolver en función/IIFE/module,
// porque zone.js necesita parchar el scope global directamente. No usar --single-bundle
// de ngx-build-plus para este build: envuelve el output de forma que rompe ese parcheo
// y produce NG0908 (Angular requires Zone.js) en runtime.
const jsFiles = ['runtime.js', 'polyfills.js', 'main.js'];
const cssFile = 'styles.css';

(function build() {
  console.log('🏗️  Iniciando unificación de archivos (concat manual + CSS inyectado)...');

  if (!fs.existsSync(distPath)) {
    console.error(`❌ Error: No encuentro la carpeta: ${distPath}`);
    console.error('   Asegúrate de haber ejecutado "ng build" primero.');
    process.exit(1);
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  try {
    let bundle = '';

    for (const file of jsFiles) {
      const filePath = path.join(distPath, file);
      if (fs.existsSync(filePath)) {
        bundle += fs.readFileSync(filePath, 'utf8') + '\n';
        console.log(`   + JS agregado: ${file}`);
      } else {
        console.warn(`   ⚠️ Advertencia: No se encontró ${file}`);
      }
    }

    // Inyectar CSS como <style> vía JS, corriendo ANTES del bundle de Angular
    // para que los estilos ya estén en el <head> cuando el custom element renderice.
    const cssPath = path.join(distPath, cssFile);
    if (fs.existsSync(cssPath)) {
      const cssContent = fs.readFileSync(cssPath, 'utf8');
      const cssInjectionScript = `
(function () {
  var __uxDrivenStyle = document.createElement('style');
  __uxDrivenStyle.setAttribute('data-ux-driven-viewer', 'true');
  __uxDrivenStyle.textContent = ${JSON.stringify(cssContent)};
  document.head.appendChild(__uxDrivenStyle);
})();
`;
      bundle = cssInjectionScript + '\n' + bundle;
      console.log(`   + CSS inyectado vía JS: ${cssFile}`);
    } else {
      console.warn(`   ⚠️ No se encontró ${cssFile} (¿no hay estilos globales? revisa si es esperado)`);
    }

    fs.writeFileSync(outFile, bundle);
    console.log('------------------------------------------------');
    console.log('✅ ¡Éxito! Archivo generado en:');
    console.log(`   ${outFile}`);
    console.log('------------------------------------------------');
  } catch (err) {
    console.error('❌ Error unificando archivos:', err);
    process.exit(1);
  }
})();