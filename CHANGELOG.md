# Changelog

Los cambios relevantes de este proyecto se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Cambiado

- El repositorio se reorganiza en tres proyectos con dependencias en un solo sentido: `engine` (librería), `runtime` (custom element `<ux-driven-viewer>`) y `playground` (página host para desarrollo).
- La librería pasa a llamarse `@ux-driven-viewer/engine`, exporta su API en `public-api.ts` y vuelve a compilar con `ng build engine`.
- El modal, el loader, los toasts, la carga de contenido y los interceptores HTTP se mueven de la librería y de la app de demo al `runtime`.
- Cada proyecto compila en su propia carpeta de `dist/`.
- La documentación del README se divide por temas en `docs/`.
- Scripts de npm renombrados: `build:engine`, `build:runtime`, `test:engine`, `test:runtime`.

### Añadido

- Playground (`npm start`) con selector de ejemplos y visor de eventos.
- Esquemas de ejemplo en `examples/schemas` y un host mínimo en `examples/host-basico.html`.
- Licencia MIT, guía de contribución, política de seguridad y CI en GitHub Actions.
- `karma.conf.js` compartido, con un launcher headless apto para CI.

### Eliminado

- `bundle.js` y `demo.html`, obsoletos.
- `DynamicInteractionService` y `Builder.interface.ts`, que no se usaban.
- Dependencias sin uso: `@angular/router`, `crypto-js`, `concat`, `fs-extra`.

## [1.0.3]

Versión previa a la reorganización del repositorio.
