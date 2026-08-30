# ux-driven-viewer — Guía de consumo del MFE

Motor de UI dinámica ("Backend-Driven UI"): recibe un JSON que describe secciones de pantalla (HTML + CSS + validación de formularios + acciones) y lo renderiza como Angular real dentro de un **custom element**, embebible en cualquier página con una línea de `<script>`.

---

## 1. Instalación en un host

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!-- Bootstrap 5 recomendado (ver sección 8) -->
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

---

## 2. Atributos del elemento (`@Input`)

| Atributo HTML | Tipo | Default | Descripción |
|---|---|---|---|
| `api-url` | string | — | URL de tu API que devuelve el arreglo JSON (sección 4). Se ignora si `local-schema` está seteado por JS. |
| `local-schema` | *(solo por JS)* | — | El arreglo JSON directo, sin pegarle a ninguna API. Ver sección 3. Tiene prioridad sobre `api-url`. |
| `external-form` | *(solo por JS)* | — | Un `FormGroup` de Angular externo, si quieres que el widget se integre a un form padre existente en vez de crear el suyo. |
| `initial-data` | *(solo por JS, objeto)* | — | `{campo: valor}` para precargar el form una vez construido. |
| `modal-schema` / `modal-endpoint` / `modal-context` | — | — | Igual que `local-schema`/`api-url` pero para abrir un modal. |
| `scroll-offset` | number | `0` | Píxeles de compensación para el scroll suave de anchors (`#id`). Úsalo si tienes un navbar `fixed-top`. |
| `grid-gap` | number | `0` | Gap en px entre secciones del grid estructural de 12 columnas. |
| `show-back-to-top` | boolean | `true` | Muestra/oculta el botón flotante "volver arriba". |
| `back-to-top-threshold` | number | `400` | Píxeles de scroll antes de que aparezca el botón "volver arriba". |
| `debug` | boolean | `false` | Si es `true`, loguea en consola cada evento interno (`controlChanged`, `formStateChanged`, `actionTriggered` crudo). Útil para debuggear en un host sin devtools cómodos. |
| `form-state-debounce` | number | `150` | Debounce en ms del evento `formStateChanged`. `0` = emite en cada tecla. |

**Nota:** los atributos HTML solo aceptan strings. Para pasar `local-schema` (un arreglo) o `external-form` (un `FormGroup`), asígnalos como **propiedad JS**, no como atributo:

```js
const viewer = document.getElementById('myApp');
fetch('./mi-landing.json')
  .then(r => r.json())
  .then(data => { viewer.localSchema = data; });
```

---

## 3. Eventos que emite (`CustomEvent`, `event.detail`)

```js
viewer.addEventListener('ready', (e) => { /* boolean: terminó de cargar */ });
viewer.addEventListener('formSubmit', (e) => { /* data del form al hacer submit válido */ });
viewer.addEventListener('actionTriggered', (e) => {
  // e.detail = { action, sourceId, clickedElement, originalEvent, context: { formValue, formValid } }
});
viewer.addEventListener('errorOccurred', (e) => { /* string con el error */ });
viewer.addEventListener('modalResult', (e) => { /* data devuelta por un modal al cerrarse */ });
viewer.addEventListener('fileSelected', (e) => {
  // e.detail = { controlName, file, formId, isMultiple }
});
viewer.addEventListener('controlChanged', (e) => {
  // e.detail = { controlName, value, formId, valid, invalid, dirty, touched, pending, errors }
  // Se dispara por CADA campo, en CADA cambio de valor o de estado.
});
viewer.addEventListener('formStateChanged', (e) => {
  // e.detail = { value, valid, invalid, dirty, pristine, touched, pending }
  // Snapshot del FormGroup COMPLETO (todas las secciones combinadas), debounced.
});
```

---

## 4. Formato del JSON (`local-schema` / respuesta de `api-url`)

Es un **arreglo** de "secciones". Cada objeto:

```json
{
  "id_DocumentHTMLCSS": "compiled-<timestamp>-<hash>",
  "htmlComponent": "<section id=\"...\">...</section>",
  "cssComponent": ".dynamic-compiled-<timestamp>-<hash> #elId { ... }",

  "formId": "form_ejemplo",
  "formMappings": [ /* ver sección 5 */ ],
  "formInitialData": {},
  "buttonConfigs": [ /* ver sección 7 */ ],
  "dataBindings": [ /* ver sección 8 */ ],

  "renderType": "static | dynamic",
  "dynamicContentId": "content_<hash>",

  "otros": {
    "source": {},
    "warnings": [],
    "fixes": [],
    "accessibilityScore": 0.9
  }
}
```

Reglas clave:

- `formId`, `formMappings`, `formInitialData` y `buttonConfigs` **solo van** si la sección trae un formulario real. Si no, se omiten del objeto (no se manda `null`).
- El `cssComponent` **siempre** escopea sus selectores con el prefijo `dynamic-` + `id_DocumentHTMLCSS`, sin importar si `renderType` es `"static"` o `"dynamic"`.
- Puedes tener **múltiples forms independientes** en el mismo arreglo (cada uno con su propio `formId`) — todos se agregan al mismo `FormGroup` padre sin pisarse.
- El HTML se sanitiza con `DOMPurify` antes de renderizarse — cualquier `<script>` u `onerror=`/`onclick=` inline se elimina. **No confíes en poder ejecutar JS arbitrario desde el HTML del JSON.**

---

## 5. `formMappings` — validadores y controles

```json
{
  "controlName": "email",
  "domSelector": "#el_abc123",
  "eventType": "input",
  "errorDisplaySelector": "[data-error-for='el_abc123']",
  "keyFilter": "email",
  "inputMask": "999-999-9999",
  "validatorConfig": [
    { "type": "required", "message": "Campo requerido" },
    { "type": "email", "message": "Email inválido" },
    { "type": "minLength", "value": 10, "message": "Mínimo 10 caracteres" },
    { "type": "maxLength", "value": 10, "message": "Máximo 10 caracteres" }
  ]
}
```

### Tipos de `validatorConfig[].type` soportados

| Tipo | `value` requerido | Equivalente Angular |
|---|---|---|
| `required` | no | `Validators.required` |
| `requiredTrue` | no | `Validators.requiredTrue` (checkboxes obligatorios) |
| `email` | no | `Validators.email` |
| `minLength` | sí (number) | `Validators.minLength(value)` |
| `maxLength` | sí (number) | `Validators.maxLength(value)` |
| `pattern` | sí (regex string) | `Validators.pattern(value)` |
| `min` | sí (number) | `Validators.min(value)` |
| `max` | sí (number) | `Validators.max(value)` |
| `matchValue` | sí (any) | Válido solo si el valor del control === `value` |

### `keyFilter` (bloquea teclas mientras se escribe)

Valores predefinidos: `int`, `number`, `alpha`, `alphanum`, `hex`, `decimal`. También acepta cualquier regex custom como string (ej. `"[A-Z]"`).

### `inputMask` (formato en vivo)

`9` = dígito, `x`/`X` = letra (se normaliza a mayúscula), `*` = alfanumérico, cualquier otro carácter = literal. Ej: `"999-999-9999"` para teléfono.

### `fileUploadConfig` (para inputs `type="file"`)

```json
{
  "controlName": "adjunto",
  "domSelector": "#el_archivo",
  "fileUploadConfig": {
    "accept": ".pdf,.jpg,.jpeg,.png",
    "multiple": false,
    "maxSize": 5242880,
    "maxCount": 1
  }
}
```

---

## 6. Convención de HTML esperada

- El elemento raíz del `<form>` inyectado debe llevar `data-dynamic-form="<formId>"`.
- Cada `<div class="invalid-feedback">` de error debe llevar `data-error-for="<idDelInput>"` y coincidir con `errorDisplaySelector` del mapping.
- Cualquier botón con acción debe llevar `data-dynamic-action="nombre_de_la_accion"` — dispara `actionTriggered`/`actionClicked` con ese nombre. Puedes agregar `data-*` extra (ej. `data-plan-name="VIP"`) y te llega dentro de `clickedElement`.

---

## 7. `buttonConfigs` — habilitar/deshabilitar botones

```json
{ "selector": "#el_submit", "disableWhen": "formIsInvalid" }
```

### Condiciones planas (`disableWhen` como string simple)

`formIsInvalid`, `formIsValid`, `formIsPristine`, `formIsDirty`, `formIsTouched`, `formIsUntouched`, `formIsPending`, `formIsInvalidOrPristine`, `formIsEmpty`, `formIsNotEmpty`, `alwaysDisable`, `neverDisable`.

### Condiciones por control (`tipo:control1,control2`)

`controlIsInvalid:email`, `controlIsValid:email`, `controlIsEmpty:nombre`, `controlIsNotEmpty:nombre`, `controlsDoNotMatch:password,confirmPassword`.

---

## 8. `dataBindings` — texto estático inyectado post-render

```json
"dataBindings": [
  { "selector": "#footer_year", "value": "2026" }
]
```

Busca el elemento por selector y le setea `textContent` — útil para valores que cambian por sección sin tener que regenerar todo el `htmlComponent`.

---

## 9. Convención de navegación / scroll (links `<a href="...">`)

| `href` | Comportamiento |
|---|---|
| `#idDeUnaSeccion` | Scroll suave automático a ese elemento (busca en **toda la página**, no solo dentro de la misma sección — funciona entre distintos bloques del JSON). Respeta `scroll-offset`. |
| `#` (solo el gato, sin id) | Scroll suave al **top absoluto de la página** (`y=0`), ignorando `scroll-offset` a propósito. Úsalo para el logo/marca del navbar. |
| Cualquier otro href (ruta real, URL externa) | **No navega solo.** Se emite `actionTriggered` con `action: 'navigate'` y `payload.route` — el host decide qué hacer (router, `window.location`, abrir pestaña, etc.). |

---

## 10. Requisitos y recomendaciones del host

- **Bootstrap JS** (`bootstrap.bundle.min.js`), no solo el CSS, si tu HTML usa `data-bs-toggle` (navbar collapse, accordion, carousel, tooltips). Esos widgets de Bootstrap funcionan nativos, sin JS de tu motor.
- **Navbar fijo → usa `fixed-top`, nunca `sticky-top`.** El widget envuelve cada sección en un `display: grid`; un navbar de ancho completo ocupa una fila del grid exactamente de su propio alto, así que `position: sticky` no tiene espacio para "pegarse" y se pierde al hacer scroll. `position: fixed` no tiene ese problema porque se ancla al viewport. Compensa con `padding-top` en la primera sección visible.
- **Cache-busting del bundle.** Si sirves el JS del widget con nombre de archivo fijo, versiona el nombre (`ux-driven-viewer.v1.3.js`) o manda `Cache-Control` corto — de lo contrario un fix puede tardar horas en llegar a producción por caché del navegador/CDN.
- **IDs únicos por página.** Si vas a renderizar dos `<ux-driven-viewer>` (o el mismo JSON dos veces) en la misma página, asegúrate de que los `id` generados no colisionen — son IDs de HTML globales.

---

## 11. Build interno (referencia para el equipo)

```bash
npm run build:pro
# = ng build --configuration=production --output-hashing=none && node scripts/build-elements.js
```

`scripts/build-elements.js` concatena `runtime.js + polyfills.js + main.js` **como scripts clásicos, en ese orden, sin envolver en función/módulo** (necesario para que `zone.js` parche el scope global correctamente), e inyecta el `styles.css` vía un `<style>` creado por JS al inicio del bundle. El resultado queda en `dist/elements/ux-driven-viewer.js`. **No usar `--single-bundle` de `ngx-build-plus`** para este build — envuelve el output de forma que rompe el parcheo de `zone.js` y produce `NG0908` en runtime.

Para probar el widget ya buildeado sin subirlo a ningún host, abre `examples/demo.html` (sirviéndolo con un servidor estático, no con `file://`, para que los `<script type="module">` funcionen) después de correr `ng build`.

Ver [`ARCHITECTURE.md`](./ARCHITECTURE.md) para un mapa completo de cómo está organizado el repo (librería, app de desarrollo, scripts y ejemplos).

---

## 12. Seguridad

Todo `htmlComponent` pasa por `DOMPurify.sanitize()` antes de renderizarse (con `data-dynamic-action` y `data-dynamic-form` permitidos explícitamente vía `ADD_ATTR`). Aun así, trata cualquier fuente de JSON como no confiable por default — el sanitizado es una capa de defensa, no una licencia para aceptar HTML de fuentes no verificadas sin revisión.