# Arquitectura y organización del repo

Este repositorio es un **workspace de Angular CLI** con dos piezas separadas:

1. **La librería** (`projects/dynamic-forms-engine/`) — el motor real del widget `<ux-driven-viewer>`. Es lo único que termina empaquetado y distribuido a los hosts que consumen el widget.
2. **La app de desarrollo** (`src/app/`) — un shell Angular normal que existe solo para probar la librería localmente durante el desarrollo (levantar `ng serve`, ver el widget renderizado con datos mock). **No se distribuye**; es equivalente a un "playground" o "sandbox app" para el equipo.

```
angular-by-api/
├── README.md                Guía de consumo del widget para equipos host (API, atributos, eventos, JSON)
├── ARCHITECTURE.md           Este documento: cómo está organizado el repo
├── angular.json               Config del workspace (dos "proyectos" lógicos: la app y la librería)
├── package.json                Scripts de build (build:pro / build:widget)
│
├── scripts/                   Scripts Node de build, fuera del código fuente de Angular
│   ├── build-elements.js         Build oficial del widget embebible (usado por npm run build:pro/build:widget)
│   └── legacy/
│       └── generate-iife-bundle.js   Alternativa antigua, no usada por ningún script — se conserva como referencia
│
├── examples/
│   └── demo.html               Página HTML mínima para probar el widget ya compilado (dist/) fuera de Angular
│
├── src/                        App de desarrollo (sandbox), NO la librería
│   ├── app/
│   │   ├── app.component.ts        Monta <ux-driven-viewer> con un formConfig de prueba hardcodeado
│   │   ├── app.routes.ts           Sin rutas (app de una sola pantalla)
│   │   ├── components/             Componentes de soporte del sandbox (loader, toasts, modal frame)
│   │   │   └── components.ts           Barrel simple que re-exporta DynamicViewerComponent
│   │   └── mocks/
│   │       └── getContent.mock.ts      JSON mock que simula la respuesta de una API real
│   └── main.ts / index.html / styles.css   Bootstrap estándar de Angular
│
└── projects/dynamic-forms-engine/   La librería (ver su propio README)
    └── src/lib/                      Componente, servicios, interceptores, interfaces, modelos, helpers
```

## Cómo se relacionan las piezas

- El **README raíz** documenta el widget desde la perspectiva de un equipo externo que lo consume (atributos, eventos, formato del JSON, seguridad). Es la puerta de entrada para cualquiera que integre `<ux-driven-viewer>` en su página.
- El **README de la librería** (`projects/dynamic-forms-engine/README.md`) documenta la implementación interna: qué hace cada servicio, cómo está dividido `src/lib`, y la deuda técnica conocida (acoplamiento de la librería con `src/app/` para mocks y un componente de modal).
- `src/app/` **no es parte del producto**: es el harness de desarrollo que permite ejecutar `ng serve` y ver el widget funcionando con datos falsos mientras se desarrolla la librería. Si algún día se separa la librería a su propio repo/paquete npm, todo `src/app/` quedaría atrás.
- `scripts/build-elements.js` es el único build "oficial" del widget distribuible: toma la salida de `ng build` (`runtime.js`, `polyfills.js`, `main.js`, `styles.css`) y genera `dist/elements/ux-driven-viewer.js`, el archivo que un host real incluye con un `<script>`. El detalle de por qué se concatena así (y no con `--single-bundle`) está en el README raíz, sección 11.
- `scripts/legacy/generate-iife-bundle.js` es un intento anterior de resolver el mismo problema (envolver el bundle de Angular para que no rompa `zone.js`), con otro enfoque (IIFE + strip de `export`). No está conectado a ningún script de `package.json`; se conserva solo como referencia histórica.
- `examples/demo.html` es la forma más rápida de verificar manualmente que un build (`dist/`) funciona fuera de Angular, sin depender de `ng serve` ni de la app de desarrollo.

## Convención de carpetas dentro de la librería

`projects/dynamic-forms-engine/src/lib` está organizado **por tipo de artefacto** (no por feature): `services/`, `interceptors/`, `interfaces/`, `models/`, `helpers/`, `constants/`. Con el volumen actual de archivos es el criterio más simple de mantener; si la librería crece mucho más, agrupar por feature (ej. `forms/`, `navigation/`, `modals/`) sería el siguiente paso natural — pero eso es un cambio de código (mover imports), no de este reordenamiento.
