const fs = require('fs');
const path = require('path');

// 1. AJUSTA EL NOMBRE DE TU PROYECTO AQUÍ
// (Debe coincidir con la carpeta que se genera dentro de /dist)
const projectName = 'dynamic-forms-engine'; 

// Rutas de origen y destino
const distPath = path.join(__dirname, 'dist', projectName);
const outDir = path.join(__dirname, 'dist', 'elements');
const outFile = path.join(outDir, 'ux-driven-viewer.js');

// Archivos a unir (en orden estricto)
const files = [
  'runtime.js',
  'polyfills.js',
  'main.js'
];

(async function build() {
  console.log('🏗️  Iniciando unificación de archivos (Modo Nativo)...');

  // Verificar que exista el origen
  if (!fs.existsSync(distPath)) {
    console.error(`❌ Error: No encuentro la carpeta: ${distPath}`);
    console.error('   Asegúrate de haber ejecutado "ng build" primero.');
    process.exit(1);
  }

  // Crear carpeta de destino si no existe
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Leer y concatenar archivos
  try {
    let bundle = '';
    
    for (const file of files) {
      const filePath = path.join(distPath, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        bundle += content + '\n';
        console.log(`   + Agregado: ${file}`);
      } else {
        console.warn(`   ⚠️ Advertencia: No se encontró ${file}`);
      }
    }

    // Escribir el archivo final
    fs.writeFileSync(outFile, bundle);
    console.log('------------------------------------------------');
    console.log(`✅ ¡Éxito! Archivo generado en:`);
    console.log(`   ${outFile}`);
    console.log('------------------------------------------------');

  } catch (err) {
    console.error('❌ Error unificando archivos:', err);
    process.exit(1);
  }
})();