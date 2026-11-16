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
- Un botón cuya `data-dynamic-action` contenga `submit` (por ejemplo `submit_form`).

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

Un botón con `data-dynamic-action` nunca dispara el envío nativo del formulario, aunque sea de tipo `submit`. Solo produce su acción: si el nombre contiene `submit` se convierte en `formSubmit` como se describe arriba, y en cualquier otro caso llega como `actionTriggered`.

---

[← Volver al índice de documentación](../README.md#documentación)
