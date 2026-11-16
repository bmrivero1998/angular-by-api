# Formularios de varios pasos (stepper)

Un formulario se puede dividir en pasos. Se declara **en el propio HTML de la sección**, con atributos `data-*`; no necesita configuración aparte en el JSON.

```html
<form data-dynamic-stepper>
  <ol data-dynamic-stepper-nav></ol>

  <div data-dynamic-step="datos" data-step-title="Tus datos">
    <input id="nombre"> <input id="correo">
  </div>
  <div data-dynamic-step="plan" data-step-title="Plan">
    <select id="plan">…</select>
  </div>
  <div data-dynamic-step="confirmar" data-step-title="Confirmar">
    <input id="acepta" type="checkbox">
  </div>

  <button type="button" data-dynamic-action="previous_step" data-show-on-step="not-first">Atrás</button>
  <button type="button" data-dynamic-action="next_step"     data-show-on-step="not-last">Siguiente</button>
  <button type="submit"                                      data-show-on-step="last">Enviar</button>
</form>
```

Los campos se declaran en `formMappings` como siempre (un solo formulario, un solo `formId`). Cada campo pertenece al paso que lo contiene en el HTML.

## Atributos

| Atributo | Dónde | Qué hace |
|---|---|---|
| `data-dynamic-stepper` | un contenedor (normalmente el `<form>`) | Activa el stepper. |
| `data-dynamic-step="id"` | cada paso | Un paso. El `id` es opcional (si falta es `step-1`, `step-2`…). |
| `data-step-title="…"` | un paso | Título en el indicador. Por defecto, el `id`. |
| `data-dynamic-stepper-nav` | un elemento vacío | El motor dibuja aquí el indicador de pasos. |
| `data-show-on-step="…"` | cualquier elemento (botones) | Solo se ve en ciertos pasos. Ver abajo. |
| `data-dynamic-action="next_step"` / `"previous_step"` | un botón | Avanzar / retroceder. |

`data-show-on-step` acepta una lista separada por comas; el elemento se ve si se cumple alguna condición: `first`, `last`, `not-first`, `not-last` o el `id` de un paso (`data-show-on-step="first, confirmar"`).

## Cómo se comporta

- **Se ve un paso a la vez**; los demás se esconden (`display: none`, `aria-hidden`).
- **"Siguiente" valida los campos del paso actual.** Si alguno es inválido (o está pendiente, por ejemplo un archivo subiéndose), no avanza: marca los campos del paso como tocados para que se vean sus errores y enfoca el primero inválido. Los errores de pasos posteriores no se muestran antes de llegar a ellos.
- **"Atrás" no valida.** Lo que el usuario escribió se conserva.
- **Enter** dentro de un paso intermedio avanza al siguiente; solo en el último paso envía.
- **Al enviar**, si un paso anterior quedó inválido (el usuario volvió y lo borró, o algo lo cambió), el formulario vuelve a ese paso y muestra su error en lugar de fallar en silencio. Si hay varias secciones, cada una con pasos vuelve a su primer paso inválido.
- Los campos **deshabilitados** (por ejemplo, ocultos por `showIf`) no cuentan para validar un paso.
- El envío lleva los datos de **todos** los pasos en un solo `formSubmit`.
- Un `next_step` / `previous_step` en una sección **sin** `data-dynamic-stepper` llega al host como cualquier otra acción.

## El indicador

`[data-dynamic-stepper-nav]` se rellena con un elemento por paso: `<li>` si es un `<ol>`/`<ul>` y `<span>` en cualquier otro caso. Cada uno trae el número (`.step-index`) y el título (`.step-title`), y estos atributos para que lo estilices en tu `cssComponent`:

| Atributo | Valores |
|---|---|
| `data-step-state` | `active` (el actual), `completed` (ya pasó) o `pending` (todavía no). |
| `aria-current="step"` | En el paso actual. |

```css
.stepper-nav li[data-step-state='active']    { color: #0d6efd; font-weight: 600; }
.stepper-nav li[data-step-state='completed'] { color: #198754; cursor: pointer; }
```

Hacer clic en un paso **ya alcanzado** vuelve a él. A uno al que todavía no se llegó no se puede saltar: solo se llega con "Siguiente".

Los pasos también reciben `data-step-state`, por si quieres estilarlos.

## Evento `stepChanged`

```js
viewer.addEventListener('stepChanged', (e) => {
  // e.detail = { formId, stepId, index, total, direction, completed }
  // direction: 'init' (el paso con el que arranca) | 'next' | 'previous' | 'goto'
  // completed: ids de los pasos ya completados
});
```

## Limitaciones

- Al cambiar el HTML de la sección (por ejemplo con `updateSections`) el stepper vuelve al primer paso, igual que el resto del formulario.
- Un paso cuyos campos estén todos ocultos por `showIf` no se salta solo: se ve vacío y se avanza con "Siguiente".
- Si el HTML no declara ningún `data-dynamic-step`, no hay stepper.

---

[← Volver al índice de documentación](../README.md#documentación)
