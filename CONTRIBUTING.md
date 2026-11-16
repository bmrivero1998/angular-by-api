# Guía de contribución

## Preparar el entorno

Requiere Node 20 o superior.

```bash
npm install
npm start    # playground en http://localhost:4200
```

## Estructura del repositorio

| Carpeta | Qué es | Puede importar de |
|---|---|---|
| `projects/engine` | Librería Angular: el motor de render y formularios. | Nada del repo. |
| `projects/runtime` | El custom element `<ux-driven-viewer>`: widget, carga de contenido, modal. | `engine`, siempre vía `@ux-driven-viewer/engine`. |
| `projects/playground` | Página host para desarrollar y probar. | `runtime`. |
| `examples` | Esquemas JSON y hosts de ejemplo. | — |
| `docs` | Documentación de uso. | — |
| `scripts` | Scripts de build. | — |

La regla que mantiene esto ordenado: **las dependencias van en un solo sentido** (`engine ← runtime ← playground`). El `engine` nunca importa del `runtime`, y el `runtime` nunca importa archivos internos del `engine` por ruta relativa.

Dentro de `projects/engine/src/lib`:

| Carpeta | Contenido |
|---|---|
| `viewer/` | `DynamicViewerComponent`, el orquestador. |
| `forms/sync/` | Sincronización DOM ↔ `FormGroup`. |
| `forms/validation/` | Validadores síncronos y asíncronos. |
| `forms/conditional/` | `showIf` / `hideIf`. |
| `forms/controls/` | Controles especiales, archivos, máscaras. |
| `forms/buttons/` | Reglas `disableWhen`. |
| `dom/` | Listeners sobre el HTML inyectado, inyección de CSS, timers, limpieza. |
| `config/` | `DYNAMIC_CONFIG` y constantes. |
| `models/` | Interfaces del esquema JSON. |

Todo lo que deba ser público se exporta en `projects/engine/src/public-api.ts`.

## Comandos

```bash
npm run build:engine       # compila la librería en dist/engine
npm run build:runtime      # compila el widget y genera dist/elements/ux-driven-viewer.js
npm run build              # ambos

npm run test:engine        # tests de la librería (modo watch)
npm run test:runtime       # tests del runtime (modo watch)
npm run test:ci            # ambas suites, una sola pasada, headless
npm run test:e2e           # pruebas end-to-end con Playwright (requiere dist/ construido)
npm run mock-api           # API de prueba para la subida de archivos del playground (puerto 3001)
```

### Cómo se empaqueta el widget

`scripts/build-elements.js` concatena `runtime.js + polyfills.js + main.js` de `dist/runtime` **como scripts clásicos, en ese orden, sin envolverlos en una función ni en un módulo**, e inyecta `styles.css` mediante un `<style>` al inicio del bundle. `zone.js` necesita parchear el scope global; por eso no se usa `--single-bundle` de `ngx-build-plus`, que envuelve la salida y produce `NG0908` en ejecución.

## Pruebas end-to-end

`e2e/` prueba el **bundle compilado** (`dist/elements/ux-driven-viewer.js`) en un Chromium real: carga y `ready`, stepper, `static` vs `dynamic`, subida de archivos, autocompletado, páginas de error 404/503 y aislamiento de CSS.

```bash
npm run build                                  # `test:e2e` NO construye: exige dist/ ya compilado
npx playwright install --with-deps chromium   # una sola vez (en CI lo hace el workflow)
npm run test:e2e
```

- Usa la librería `playwright` con el runner de Node (`node --test`), sin `@playwright/test` ni trazas. Los tests corren en serie.
- `e2e/server.js` sirve la página host (`e2e/host/index.html`), el bundle, `examples/schemas` y reutiliza `scripts/mock-api.js`; escucha en un puerto libre, no hay que arrancar nada aparte.
- Si tu Chromium está en otra ruta, define `PW_CHROMIUM_PATH=/ruta/al/chromium`.
- Si cambias el código del widget, reconstruye (`npm run build`) antes de volver a ejecutarlas: si no, prueban el bundle viejo.
- En CI es el job `e2e` de `.github/workflows/ci.yml`, que depende de `build-and-test`.

## Antes de abrir un pull request

- `npm run test:ci` y `npm run build` en verde (y `npm run test:e2e` si tocas el comportamiento visible del widget).
- Cada cambio de comportamiento lleva un test que lo cubre. El spec vive junto al archivo que prueba.
- Si cambias el formato del JSON, los eventos o los atributos del widget, actualiza `docs/` y `CHANGELOG.md`.
- Prueba el cambio en el playground con alguno de los esquemas de `examples/schemas`.

## Commits

En español, con prefijo de tipo (`feat:`, `fix:`, `refactor:`, `doc:`, `test:`), en imperativo, explicando el porqué cuando no sea obvio.

## Código nuevo

- Un servicio, una responsabilidad. Evita añadir lógica de DOM o de formularios directamente al componente.
- Nada de `any` nuevo en la API pública.
- El HTML que llega del JSON no ejecuta código. Cualquier interacción nueva se declara con atributos `data-*` y se resuelve en el motor.
