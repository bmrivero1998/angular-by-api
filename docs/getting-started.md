# Primeros pasos

## Instalación en un host

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!-- Bootstrap 5 recomendado (ver [Requisitos del host](#requisitos-y-recomendaciones-del-host)) -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
</head>
<body>
  <ux-driven-viewer
    id="myApp"
    api-url="https://tu-api.com/viewer/{id}/main"
    scroll-offset="72">
  </ux-driven-viewer>

  <!-- Bootstrap JS: solo si tu contenido usa data-bs-* (navbar toggler, accordion, carousel) -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>

  <!-- El widget. SIN type="module": zone.js necesita scope global clásico. -->
  <script src="https://tu-cdn.com/ux-driven-viewer.js"></script>
</body>
</html>
```

⚠️ **Nunca uses `type="module"`** en el `<script>` del widget. Los módulos ES corren en scope aislado y modo estricto, y `zone.js` necesita parchar el scope global clásico para que Angular funcione. Con `type="module"` el widget falla con `NG0908`.

## Atributos del elemento (`@Input`)

| Atributo HTML | Tipo | Default | Descripción |
|---|---|---|---|
| `api-url` | string | — | URL de tu API que devuelve el arreglo JSON (ver [schema.md](schema.md)). Se ignora si `local-schema` está seteado por JS. |
| `local-schema` | *(solo por JS)* | — | El arreglo JSON directo, sin pegarle a ninguna API. Ver más abajo. Tiene prioridad sobre `api-url`. |
| `external-form` | *(solo por JS)* | — | Un `FormGroup` de Angular externo, si quieres que el widget se integre a un form padre existente en vez de crear el suyo. |
| `initial-data` | *(solo por JS, objeto)* | — | `{campo: valor}` para precargar el form una vez construido. |
| `modal-schema` / `modal-endpoint` / `modal-context` | — | — | Igual que `local-schema`/`api-url` pero para abrir un modal. |
| `scroll-offset` | number | `0` | Píxeles de compensación para el scroll suave de anchors (`#id`). Úsalo si tienes un navbar `fixed-top`. |
| `grid-gap` | number | `0` | Gap en px entre secciones del grid estructural de 12 columnas. |
| `show-back-to-top` | boolean | `true` | Muestra/oculta el botón flotante "volver arriba". |
| `back-to-top-threshold` | number | `400` | Píxeles de scroll antes de que aparezca el botón "volver arriba". |
| `debug` | boolean | `false` | Si es `true`, loguea en consola cada evento interno (`controlChanged`, `formStateChanged`, `actionTriggered` crudo). Útil para debuggear en un host sin devtools cómodos. |
| `form-state-debounce` | number | `150` | Debounce en ms del evento `formStateChanged`. `0` = emite en cada tecla. |
| `allowed-origins` | texto | — | Orígenes, separados por coma, a los que el contenido puede enviar datos del usuario (subida de archivos, sugerencias de autocompletado) además del de la página y del de `api-url`. Ver [Seguridad](security.md#a-dónde-se-pueden-enviar-datos). |
| `stylesheets` | texto | — | Hojas de estilo que carga el widget (separadas por espacio o coma): Bootstrap, Tailwind compilado, la de tu marca. Ver [Estilos](styling.md#frameworks-css-bootstrap-tailwind-y-otros). |
| `error-class` / `success-class` | texto | `is-invalid` / `is-valid` | Clases (separadas por espacio) para un campo inválido / válido. Con Tailwind, por ejemplo `border-red-500`. |
| `show-error-page` | boolean | `true` | Si falla la primera carga por `api-url`, pinta una página de error. Con `"false"` solo se emite `errorOccurred`. Ver [Errores de carga](errors.md). |

## Métodos del elemento

Además de los atributos, el elemento expone dos métodos (disponibles una vez creado; si los llamas al cargar la página, espera al evento `ready`):

| Método | Qué hace |
|---|---|
| `viewer.updateSections([...])` | Actualiza solo las secciones que le mandas, por `id_DocumentHTMLCSS`. Devuelve `{ mode, changedIds, issues }`. |
| `viewer.refresh()` | Vuelve a pedir el JSON a `api-url` y actualiza lo que cambió. |

Ver [Actualizar el contenido](updating-content.md).

Los atributos numéricos y booleanos se convierten por ti: `show-back-to-top="false"` desactiva el botón y `scroll-offset="72"` es el número 72. Un atributo booleano presente sin valor (`debug`) es verdadero, y un número inválido cae al valor por defecto.

**Nota:** los atributos HTML solo aceptan strings. Para pasar `local-schema` (un arreglo) o `external-form` (un `FormGroup`), asígnalos como **propiedad JS**, no como atributo:

```js
const viewer = document.getElementById('myApp');
fetch('./mi-landing.json')
  .then(r => r.json())
  .then(data => { viewer.localSchema = data; });
```

## Requisitos y recomendaciones del host

- **Bootstrap JS** (`bootstrap.bundle.min.js`), no solo el CSS, si tu HTML usa `data-bs-toggle` (navbar collapse, accordion, carousel, tooltips). Esos widgets de Bootstrap funcionan nativos, sin JS de tu motor.
- **Navbar fijo → usa `fixed-top`, nunca `sticky-top`.** El widget envuelve cada sección en un `display: grid`; un navbar de ancho completo ocupa una fila del grid exactamente de su propio alto, así que `position: sticky` no tiene espacio para "pegarse" y se pierde al hacer scroll. `position: fixed` no tiene ese problema porque se ancla al viewport. Compensa con `padding-top` en la primera sección visible.
- **Cache-busting del bundle.** Si sirves el JS del widget con nombre de archivo fijo, versiona el nombre (`ux-driven-viewer.v1.3.js`) o manda `Cache-Control` corto — de lo contrario un fix puede tardar horas en llegar a producción por caché del navegador/CDN.
- **IDs únicos por página.** Si vas a renderizar dos `<ux-driven-viewer>` (o el mismo JSON dos veces) en la misma página, asegúrate de que los `id` generados no colisionen — son IDs de HTML globales.

---

[← Volver al índice de documentación](../README.md#documentación)
