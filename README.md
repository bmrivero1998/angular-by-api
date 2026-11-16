# ux-driven-viewer

**Motor de UI dinámica (Backend-Driven UI) para Angular.** Recibe un JSON que describe secciones de pantalla (HTML, CSS, validación de formularios y acciones) y lo renderiza dentro de un **custom element**, embebible en cualquier página con una etiqueta `<script>`. La página host no necesita saber que hay Angular detrás.

[![CI](https://github.com/bmrivero1998/angular-by-api/actions/workflows/ci.yml/badge.svg)](https://github.com/bmrivero1998/angular-by-api/actions/workflows/ci.yml)
![Angular](https://img.shields.io/badge/Angular-19-dd0031?logo=angular&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-green.svg)](LICENSE)

## Uso rápido

```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />

<ux-driven-viewer id="viewer"></ux-driven-viewer>

<!-- Sin type="module": zone.js necesita el scope global clásico. -->
<script src="ux-driven-viewer.js"></script>
<script>
  const viewer = document.getElementById('viewer');

  viewer.localSchema = [
    {
      id_DocumentHTMLCSS: 'hola',
      renderType: 'static',
      htmlComponent:
        '<section class="saludo"><h1>Hola</h1>' +
        '<button type="button" class="btn btn-primary" data-dynamic-action="saludar">Saludar</button></section>',
      cssComponent: '.dynamic-hola .saludo { padding: 48px; text-align: center; }',
    },
  ];

  viewer.addEventListener('actionTriggered', (e) => console.log(e.detail.action)); // "saludar"
</script>
```

En lugar de `localSchema` puedes indicar `api-url="https://tu-api.com/pantalla"` y el widget pedirá el JSON por su cuenta.

Hay un host completo en [`examples/host-basico.html`](examples/host-basico.html) y esquemas listos para copiar en [`examples/schemas`](examples/schemas).

## Documentación

| Tema | Contenido |
|---|---|
| [Primeros pasos](docs/getting-started.md) | Instalación en un host, atributos del elemento, requisitos. |
| [Formato del JSON](docs/schema.md) | Secciones, convención de HTML, `buttonConfigs`, `dataBindings`, navegación. |
| [Actualizar el contenido](docs/updating-content.md) | `static` vs `dynamic`, `updateSections`, `refresh`, `contentUpdated`. |
| [Formularios de varios pasos](docs/steppers.md) | `data-dynamic-stepper`, validación por paso, indicador, `stepChanged`. |
| [Subida de archivos](docs/file-upload.md) | `fileUploadConfig`, subida con avance, resultado en el formulario, orígenes permitidos. |
| [Errores de carga](docs/errors.md) | Páginas de error, "Reintentar", `show-error-page`, `errorOccurred`. |
| [Validadores y controles](docs/validators.md) | `formMappings`, validadores, `keyFilter`, máscaras, archivos. |
| [Lógica condicional](docs/conditional-logic.md) | `showIf` / `hideIf`. |
| [Eventos](docs/events.md) | Qué emite el widget y con qué datos. |
| [Estilos](docs/styling.md) | Alcance del CSS, Bootstrap, clases de validación. |
| [Seguridad](docs/security.md) | Qué se sanitiza y qué no. |

## Estructura del repositorio

```
projects/
├── engine/       Librería Angular: el motor (render, formularios, validación).
├── runtime/      El custom element <ux-driven-viewer>: motor + carga de contenido,
│                 modal, loader y toasts. Produce ux-driven-viewer.js.
└── playground/   Página host para desarrollar y probar.
examples/         Esquemas JSON y hosts de ejemplo.
docs/             Documentación de uso.
scripts/          Scripts de build.
```

Las dependencias van en un solo sentido: `engine ← runtime ← playground`.

- ¿Tu aplicación ya es Angular? Puedes usar la librería directamente: ver [`projects/engine`](projects/engine/README.md).
- ¿Cualquier otra página? Usa el custom element, como en el ejemplo de arriba.

## Desarrollo

Requiere Node 20 o superior.

```bash
npm install
npm start              # playground en http://localhost:4200
npm run build          # librería (dist/engine) + widget (dist/elements/ux-driven-viewer.js)
npm run test:ci        # todas las pruebas, una sola pasada
npm run mock-api       # API de prueba para la subida de archivos (puerto 3001)
```

El playground carga los esquemas de `examples/schemas` y muestra en vivo los eventos que emite el widget.

Más detalle en la [guía de contribución](CONTRIBUTING.md).

## Estado del proyecto

En estabilización. La estructura y el formato del JSON están definidos y los problemas detectados en la revisión inicial (formularios, lógica condicional, CSS, carga de contenido, acciones, subida de archivos) están corregidos. Funcionalidades incluidas: formularios con validación y máscaras, lógica condicional, formularios de varios pasos, subida de archivos, autocompletado, páginas de error y actualización parcial de contenido.

Queda código sin uso: el loader, los toasts y su `LoaderInterceptor`, la navegación y el registro de componentes (en `projects/engine/src/lib/experimental`), y `HtmlSanitizerInterceptor`, que no se registra por defecto.

## Contribuir

Las contribuciones son bienvenidas: lee [CONTRIBUTING.md](CONTRIBUTING.md). Para problemas de seguridad, sigue [SECURITY.md](SECURITY.md).

## Licencia

[MIT](LICENSE)
