const fs = require('fs-extra');
const concat = require('concat');
const path = require('path');

(async function build() {
    // 1. Definimos las rutas. 
    // OJO: Angular 17+ pone los archivos dentro de la carpeta /browser
    const projectDist = path.join(__dirname, 'dist', 'angular-by-api', 'browser');
    const outputDir = path.join(__dirname, 'dist', 'bundle');
    const outputFile = path.join(outputDir, 'dynamic-viewer-v1.js');

    try {
        // Asegurar que existe la carpeta de salida
        await fs.ensureDir(outputDir);

        // 2. Leemos los archivos que realmente existen en el build
        const files = await fs.readdir(projectDist);

        // 3. Buscamos los archivos correctos ignorando el hash
        const mainJs = files.find(f => f.startsWith('main-') && f.endsWith('.js'));
        const polyfillsJs = files.find(f => f.startsWith('polyfills-') && f.endsWith('.js'));

        if (!mainJs || !polyfillsJs) {
            throw new Error('No se encontraron los archivos del build. ¿Ejecutaste ng build primero?');
        }

        const filesToConcat = [
            path.join(projectDist, polyfillsJs),
            path.join(projectDist, mainJs)
        ];

        // 4. Concatenamos todo en un único archivo
        await concat(filesToConcat, outputFile);

        console.log('\x1b[32m%s\x1b[0m', `--- BUNDLE CREADO CON ÉXITO ---`);
        console.log(`Ubicación: ${outputFile}`);
        console.log(`Archivos unidos: ${polyfillsJs} + ${mainJs}`);

    } catch (err) {
        console.error('\x1b[31m%s\x1b[0m', '--- ERROR EN EL BUNDLE ---');
        console.error(err);
        process.exit(1);
    }
})();