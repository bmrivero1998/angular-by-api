# Formato del JSON

Es un **arreglo** de "secciones". Cada objeto:

```json
{
  "id_DocumentHTMLCSS": "compiled-<timestamp>-<hash>",
  "htmlComponent": "<section id=\"...\">...</section>",
  "cssComponent": ".dynamic-compiled-<timestamp>-<hash> #elId { ... }",

  "formId": "form_ejemplo",
  "formMappings": [ /* ver validators.md */ ],
  "formInitialData": {},
  "buttonConfigs": [ /* ver más abajo */ ],
  "dataBindings": [ /* ver más abajo */ ],

  "renderType": "static | dynamic",
  "dynamicContentId": "content_<hash>",   // sin uso por ahora

  "otros": {
    "source": {},
    "warnings": [],
    "fixes": [],
    "accessibilityScore": 0.9
  }
}
```

Reglas clave:

- `id_DocumentHTMLCSS` identifica la sección: debe ser **único** en el arreglo. Es la clave con la que el widget compara y actualiza secciones.
- `renderType` es obligatorio y decide cómo se actualiza la sección, no dónde se pinta (el orden es el del arreglo): una `static` recarga toda la pantalla al cambiar; una `dynamic` solo se actualiza a sí misma. Ver [Actualizar el contenido](updating-content.md).
- `formId`, `formMappings`, `formInitialData` y `buttonConfigs` **solo van** si la sección trae un formulario real. Si no, se omiten del objeto (no se manda `null`).
- El `cssComponent` queda aislado a su sección automáticamente, sin importar si `renderType` es `"static"` o `"dynamic"`. No hace falta prefijar los selectores (si ya vienen con `.dynamic-` + `id_DocumentHTMLCSS`, se respetan). Ver [Estilos](styling.md).
- Puedes tener **múltiples forms independientes** en el mismo arreglo (cada uno con su propio `formId`) — todos se agregan al mismo `FormGroup` padre sin pisarse.
- El HTML se sanitiza con `DOMPurify` antes de renderizarse — cualquier `<script>` u `onerror=`/`onclick=` inline se elimina. **No confíes en poder ejecutar JS arbitrario desde el HTML del JSON.**

## Convención de HTML esperada

- El elemento raíz del `<form>` inyectado debe llevar `data-dynamic-form="<formId>"`.
- Cada `<div class="invalid-feedback">` de error debe llevar `data-error-for="<idDelInput>"` y coincidir con `errorDisplaySelector` del mapping.
- Cualquier botón con acción debe llevar `data-dynamic-action="nombre_de_la_accion"` — dispara `actionTriggered`/`actionClicked` con ese nombre. Puedes agregar `data-*` extra (ej. `data-plan-name="VIP"`) y te llega dentro de `clickedElement`.

## `buttonConfigs` — habilitar/deshabilitar botones

```json
{ "selector": "#el_submit", "disableWhen": "formIsInvalid" }
```

### Condiciones planas (`disableWhen` como string simple)

`formIsInvalid`, `formIsValid`, `formIsPristine`, `formIsDirty`, `formIsTouched`, `formIsUntouched`, `formIsPending`, `formIsInvalidOrPristine`, `formIsEmpty`, `formIsNotEmpty`, `alwaysDisable`, `neverDisable`.

### Condiciones por control (`tipo:control1,control2`)

`controlIsInvalid:email`, `controlIsValid:email`, `controlIsEmpty:nombre`, `controlIsNotEmpty:nombre`, `controlsDoNotMatch:password,confirmPassword`.

## `dataBindings` — texto estático inyectado post-render

```json
"dataBindings": [
  { "selector": "#footer_year", "value": "2026" }
]
```

Busca el elemento por selector y le setea `textContent` — útil para valores que cambian por sección sin tener que regenerar todo el `htmlComponent`.

## Convención de navegación / scroll (links `<a href="...">`)

| `href` | Comportamiento |
|---|---|
| `#idDeUnaSeccion` | Scroll suave automático a ese elemento (busca en **toda la página**, no solo dentro de la misma sección — funciona entre distintos bloques del JSON). Respeta `scroll-offset`. |
| `#` (solo el gato, sin id) | Scroll suave al **top absoluto de la página** (`y=0`), ignorando `scroll-offset` a propósito. Úsalo para el logo/marca del navbar. |
| Cualquier otro href (ruta real, URL externa) | **No navega solo.** Se emite `actionTriggered` con `action: 'navigate'` y `payload.route` — el host decide qué hacer (router, `window.location`, abrir pestaña, etc.). |

---

[← Volver al índice de documentación](../README.md#documentación)
