// Script legado: alternativa a scripts/build-elements.js que envuelve el main
// de Angular en una IIFE y elimina los `export` a mano. Se mantiene como
// referencia histórica, pero NO forma parte de ningún script de package.json:
// el build oficial del widget usa scripts/build-elements.js (ver README).
const fs = require('fs-extra');
const path = require('path');

(async function build() {
    // --- CONFIGURACIÓN ---
    // Asegúrate de que este nombre coincida con tu carpeta en dist
    const folderName = 'dynamic-forms-engine';
    const rootDir = path.join(__dirname, '..', '..');
    const projectDist = path.join(rootDir, 'dist', folderName, 'browser');

    const outputDir = path.join(rootDir, 'dist', 'bundle');
    const outputFile = path.join(outputDir, 'dynamic-engine.js');

    try {
        if (!fs.existsSync(projectDist)) {
            throw new Error(`❌ No encuentro la carpeta: ${projectDist}`);
        }

        await fs.ensureDir(outputDir);
        const files = await fs.readdir(projectDist);

        const mainJs = files.find(f => f.startsWith('main') && f.endsWith('.js'));
        const polyfillsJs = files.find(f => f.startsWith('polyfills') && f.endsWith('.js'));

        if (!mainJs || !polyfillsJs) {
            throw new Error('❌ Faltan archivos (main o polyfills). ¿Ejecutaste ng build?');
        }

        console.log(`📦 Procesando: ${mainJs}`);

        // 1. Leemos los contenidos
        const polyfillsContent = await fs.readFile(path.join(projectDist, polyfillsJs), 'utf8');
        let mainContent = await fs.readFile(path.join(projectDist, mainJs), 'utf8');

        // 2. EL TRUCO: Eliminamos los 'export' para que no rompan la IIFE
        // Esto busca "export" seguido de cualquier cosa y lo reemplaza con un comentario vacío
        // Nota: Es un regex simple pero efectivo para bundles minificados de Angular
        mainContent = mainContent.replace(/^export\s+.*;?$/gm, ''); // Para exports en linea nueva
        mainContent = mainContent.replace(/export\s*\{.*?\};?/g, ''); // Para export { ... }
        
        // 3. Empaquetamos
        const bundleContent = `
            /* --- POLYFILLS --- */
            ${polyfillsContent}
            
            /* --- MAIN (Scope Aislado) --- */
            (function() {
                ${mainContent}
            })();
        `;

        // 4. Guardamos
        await fs.outputFile(outputFile, bundleContent);

        console.log('\n✅ ¡ARREGLADO! Archivo generado sin exports:');
        console.log(`👉 ${outputFile}`);

    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();