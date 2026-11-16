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

> Mientras algo está pendiente (un archivo subiéndose, un validador asíncrono), `formIsInvalid` y `formIsInvalidOrPristine` **también deshabilitan** el botón: todavía no se puede enviar.

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

## Contrato y validación

El formato queda fijado por un JSON Schema (draft-07): [`schema/ux-driven-viewer.schema.json`](../schema/ux-driven-viewer.schema.json). Úsalo en tu editor (`"$schema"` no aplica a un arreglo en la raíz, pero VS Code lo toma en `json.schemas`) o en el backend que genera el JSON.

El engine trae además `validateSchema(json)`, sin dependencias, que comprueba lo mismo y **lo que un JSON Schema no puede**:

- `id_DocumentHTMLCSS` repetido entre secciones.
- `domSelector` y `errorDisplaySelector` que no encuentran ningún elemento en el `htmlComponent` de **su** sección (error); lo mismo con `buttonConfigs`, `dataBindings`, `tableBindings` y los selectores de `fileUploadConfig`, `rangeConfig`, `colorConfig` y `multiSelectConfig` (aviso).
- `matchControl` (y `disableWhen: "controlIsInvalid:x"`) hacia un control que no existe en el formulario.
- `controlName` repetido dentro de un mismo formulario.
- Tipos de validador y condiciones de botón desconocidos, `value` ausente o de tipo incorrecto, expresiones regulares inválidas.

```ts
import { validateSchema, formatSchemaIssue } from '@ux-driven-viewer/engine';

const issues = validateSchema(json);
issues.forEach((i) => console.log(i.severity, formatSchemaIssue(i)));
// error [2].formMappings[0].validatorConfig[1].type: Tipo de validador desconocido "telefono". ...
```

Cada `SchemaIssue` trae `path` (p. ej. `[2].formMappings[0].validatorConfig[1].type`), `message` en español, `severity` (`error` o `warning`; un campo desconocido es solo aviso) y `code` estable.

**En el widget** la validación es solo un aviso: al llegar contenido (`local-schema`, `api-url`, `updateSections`) se escribe un único `console.warn` con todos los problemas y se agregan, con el prefijo `Esquema`, al campo `issues` de `contentUpdated` (y por tanto a `errorOccurred`). Nunca impide pintar la pantalla. Lo que el widget ya informa por su cuenta (id ausente o repetido, `renderType` inválido) no se repite.

---

[← Volver al índice de documentación](../README.md#documentación)
