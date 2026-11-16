# Lógica condicional (`showIf` / `hideIf`)

Un `formMapping` puede mostrarse u ocultarse según el valor de otros campos del mismo formulario:

```json
{
  "controlName": "codigoVip",
  "domSelector": "input[name='codigoVip']",
  "showIf": "form.tipoCuenta === 'premium'",
  "validatorConfig": [{ "type": "required", "message": "El código VIP es obligatorio" }]
}
```

- `showIf`: el campo es visible solo cuando la expresión es verdadera.
- `hideIf`: el campo se oculta cuando la expresión es verdadera. Si un mapping trae ambas, gana `showIf`.
- El `domSelector` debe apuntar al **campo** (`<input>`, `<select>`...), no a su contenedor. El contenedor a ocultar se resuelve aparte, ver [Qué se oculta](#qué-se-oculta).

## Qué pasa al ocultar un campo

- Queda oculto (`display: none`, `aria-hidden="true"`) **desde el primer pintado**: no hay un instante en que se vea.
- Se **deshabilita**: deja de validarse, no bloquea el envío y no aparece en `value` del formulario.
- Al volver a mostrarse se rehabilita. Solo se rehabilita si lo deshabilitó la lógica condicional: un campo que el host dejó deshabilitado, o con `alwaysDisabled`, sigue deshabilitado.
- El estado del formulario y de los botones (`disableWhen`) se actualiza en el momento, también el del formulario padre.
- Su valor se conserva, salvo que actives `clearHiddenFields` en la configuración.

## Expresiones

Dentro de la expresión, cada `controlName` del formulario es una variable. También puedes escribir `form.campo`, que es lo mismo (salvo que exista un campo llamado `form`).

```text
tipoCuenta === 'premium'
form.acepta === true
edad >= 18 && (pais === 'MX' || pais === 'AR')
!isEmpty(correo) && correo.endsWith('@empresa.com')
plan === 'pro' ? true : false
```

El valor que se lee es el actual del control, incluso si ese campo está oculto: una condición puede depender de un campo oculto.

### Sintaxis admitida

| Elemento | Ejemplos |
|---|---|
| Literales | `42`, `3.5`, `'texto'`, `"texto"`, `true`, `false`, `null`, `undefined`, `['a', 'b']` |
| Comparación | `===`, `!==`, `==`, `!=`, `<`, `<=`, `>`, `>=` |
| Lógicos | `&&`, `\|\|`, `!`, `??` y el ternario `a ? b : c` |
| Aritmética | `+`, `-`, `*`, `/`, `%` y paréntesis |
| Propiedades | `form.tipo`, `form['con-guion']`, `lista[0]`, `texto.length` |
| Métodos de texto y listas | `includes`, `startsWith`, `endsWith`, `indexOf`, `toLowerCase`, `toUpperCase`, `trim` |

Una variable que no existe vale `undefined`, y un método llamado sobre un valor ausente no se cumple: `correo.endsWith('@x.com')` es falso mientras `correo` esté vacío, no un error.

### Funciones

| Función | Verdadera cuando |
|---|---|
| `isEmpty(v)` / `isNotEmpty(v)` | `v` es (o no es) `null`, `''` o una lista vacía |
| `hasValue(v)` | `v` no es `null`, `undefined` ni `''` |
| `isChecked(v)` | `v` es `true` o `'true'` |
| `isSelected(v)` | `v` tiene algún valor |
| `equals(a, b)` / `notEquals(a, b)` | comparación estricta |
| `gt`, `gte`, `lt`, `lte` `(a, b)` | comparación numérica |
| `includes(lista, v)` | `lista` es una lista que contiene `v` |
| `isValue('campo', v)` | el campo vale `v` |
| `getControl('campo')` | devuelve el valor del campo |
| `greaterThan('campo', n)` | el campo es un número mayor que `n` |
| `isValid('campo')` | el campo es válido y el usuario ya interactuó con él |

### Qué no existe

Asignaciones, funciones flecha, plantillas, `new`, `this`, `typeof` y similares, y el acceso a `constructor`, `prototype` o `__proto__`. Si una expresión los usa, se informa como error (ver abajo). Las expresiones **no se ejecutan como JavaScript**: las analiza un evaluador propio, así que no necesitan `unsafe-eval` en la Content Security Policy del host.

## Expresiones con errores

Si una expresión no es válida (error de sintaxis, función desconocida...), se informa **una sola vez** en la consola, con el campo y el motivo, y el campo **se deja visible**. Ocultarlo en silencio lo sacaría de la validación y del envío por un error de configuración.

```text
Error en showIf de "codigoVip" ("tipoCuenta ==="): Se esperaba ... el final de la expresión (posición 14)
```

## Qué se oculta

El motor oculta un contenedor, no solo el `<input>`, para que tampoco se vean la etiqueta ni el mensaje de error. Orden de decisión:

1. **`visibilityGroup`**, la forma recomendada. Si el mapping lo declara, se oculta el ancestro más cercano con `data-visibility-group` igual a ese valor. Tú decides exactamente qué se oculta.

   ```json
   { "controlName": "codigoVip", "domSelector": "#vip", "showIf": "...", "visibilityGroup": "vip" }
   ```
   ```html
   <div data-visibility-group="vip"><label>…</label><input id="vip"><div class="invalid-feedback"></div></div>
   ```

2. **El contenedor de campo más cercano**: `.form-group`, `.input-group`, `.field-container`, `.mb-3`, `.mb-4` o una columna de Bootstrap (`.col`, `.col-md-6`…).
   - Si ese contenedor incluye **otros campos del formulario**, se descarta: ocultar un campo nunca oculta a sus vecinos.
   - Si queda dentro de una columna que no tiene nada más, se oculta la columna entera para no dejar un hueco en la fila.
   - Nunca se sale del contenido de la sección.
3. **El propio elemento**, si no hay ningún contenedor reconocible.

Si el `domSelector` apunta a un contenedor (por ejemplo un `<div class="mb-3">` que envuelve el campo), se oculta ese contenedor tal cual. Aun así, **mapea el campo y no el contenedor**: un contenedor no tiene valor que leer y el control nunca recibiría lo que el usuario escribe.

## Configuración

Opciones de `DYNAMIC_CONFIG` (solo al usar la librería Angular directamente):

| Opción | Efecto |
|---|---|
| `conditionalDebounceTime` | Espera en ms entre un cambio y la reevaluación. Por defecto `50`. |
| `clearHiddenFields` | Vacía el valor de un campo al ocultarlo. |
| `emitVisibilityEvents` | Emite el evento DOM `field-visibility-change` (`detail`: `controlName`, `visible`, `element`) al mostrar u ocultar. |

---

[← Volver al índice de documentación](../README.md#documentación)
