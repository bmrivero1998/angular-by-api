# Eventos que emite (`CustomEvent`, `event.detail`)

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
viewer.addEventListener('fileUploadChanged', (e) => {
  // e.detail = { controlName, formId, status: 'uploading' | 'done' | 'error', progress, result?, error? }
  // Avance y resultado de la subida de un campo con fileUploadConfig.uploadUrl. Ver "Subida de archivos".
});
viewer.addEventListener('controlChanged', (e) => {
  // e.detail = { controlName, value, formId, valid, invalid, dirty, touched, pending, errors }
  // Se dispara por CADA campo, en CADA cambio de valor o de estado.
});
viewer.addEventListener('formStateChanged', (e) => {
  // e.detail = { value, valid, invalid, dirty, pristine, touched, pending }
  // Snapshot del FormGroup COMPLETO (todas las secciones combinadas), debounced.
});
viewer.addEventListener('contentUpdated', (e) => {
  // e.detail = { mode: 'initial' | 'patched' | 'reloaded', changedIds, issues }
  // Cambió el contenido en pantalla. Ver "Actualizar el contenido".
});
```

`ready` se emite cuando la pantalla se pinta completa: en la primera carga y en cada recarga completa (cambió una sección `static`), no al actualizar una sección `dynamic`. Ver [Actualizar el contenido](updating-content.md).

## `formSubmit`

Se emite **una sola vez** por intento de envío válido, venga de donde venga:

- Enter dentro de un campo o un `<button type="submit">` sin acción.
- Un botón cuya `data-dynamic-action` incluya la palabra `submit` (por ejemplo `submit_form`; ver [Acciones integradas](#acciones-integradas)).

Antes de emitir se validan **todos** los formularios de la página. Si alguno es inválido no se emite `formSubmit`: se marcan los campos con error y se emite `errorOccurred`.

`event.detail` tiene siempre la misma forma, un objeto por formulario indexado por su `formId`:

```json
{
  "form_contacto": { "nombre": "Ana", "email": "ana@correo.com" },
  "form_envio": { "ciudad": "CDMX" }
}
```

Los campos deshabilitados (por ejemplo, los ocultos por `showIf` / `hideIf`) no se incluyen.

## Botones con `data-dynamic-action` dentro de un `<form>`

Un botón con `data-dynamic-action` nunca dispara el envío nativo del formulario, aunque sea de tipo `submit`. Solo produce su acción: si incluye la palabra `submit` se convierte en `formSubmit` como se describe arriba, y en cualquier otro caso llega como `actionTriggered`.

## Acciones integradas

El nombre de una acción se separa en **palabras** (`close_modal`, `close-modal` y `closeModal` son lo mismo) y se comparan palabras completas, no texto suelto. Estas son las que el widget reconoce; todas las demás llegan al host como `actionTriggered`:

| Palabras del nombre | Ejemplos | Qué hace el widget | ¿Llega al host? |
|---|---|---|---|
| incluye `submit` | `submit`, `submit_order`, `submitForm` | Valida **todos** los formularios y emite `formSubmit` (o marca los errores). | No: recibes `formSubmit` o `errorOccurred`. |
| incluye `close`, `cancel` o `dismiss` | `close`, `close_modal`, `modal-cancel` | Cierra el modal abierto. | Sí, como `actionTriggered`. |
| solo `reset`, `form` y `forms` (con `reset`) | `reset`, `reset_form`, `resetForm` | Vacía los formularios. | Sí, como `actionTriggered`. |
| exactamente `retry_load` | (botón "Reintentar" de la página de error) | Vuelve a pedir el contenido. | No. |

Lo que **no** se confunde (y llega al host sin efectos laterales): `open_modal`, `show_modal_help` o `modal_confirm` no cierran nada; `reset_password` no vacía el formulario; `resubmit_later` no envía nada.

Dentro de un modal, `close` y `cancel` lo cierran; `submit` y `save` exigen que el formulario del modal sea válido antes de reportarse; el resto se reporta tal cual y el modal sigue abierto.

## Registra los listeners antes de que cargue el widget

Los eventos de la primera carga (`ready`, `contentUpdated`, `errorOccurred`) se emiten en cuanto llega la respuesta. Si el elemento ya tiene `api-url` en el HTML y tu servidor responde muy rápido, puede llegar antes de que tu script registre los listeners. Para no perderlos, regístralos **antes** del `<script>` del widget, o asigna `localSchema` / `api-url` después de `customElements.whenDefined('ux-driven-viewer')`:

```html
<ux-driven-viewer id="viewer" api-url="https://tu-api.com/pantalla"></ux-driven-viewer>
<script>
  document.getElementById('viewer').addEventListener('ready', () => { /* ... */ });
</script>
<script src="https://tu-cdn.com/ux-driven-viewer.js"></script>
```

---

[← Volver al índice de documentación](../README.md#documentación)
