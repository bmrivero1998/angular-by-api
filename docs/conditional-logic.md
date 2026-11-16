# Lógica condicional (`showIf` / `hideIf`)

Un `formMapping` puede mostrarse u ocultarse según el valor de otros campos del mismo formulario:

```json
{
  "controlName": "codigoVip",
  "domSelector": "#el_codigo_vip",
  "showIf": "tipoCuenta === 'premium'",
  "visibilityGroup": "vip"
}
```

- `showIf`: el campo es visible solo cuando la expresión es verdadera.
- `hideIf`: el campo se oculta cuando la expresión es verdadera. Si un mapping trae ambas, gana `showIf`.
- Un campo oculto queda **deshabilitado**, así que sus validadores no bloquean el formulario.

## Expresiones

Dentro de la expresión, cada `controlName` del formulario está disponible como variable:

```text
tipoCuenta === 'premium'
edad >= 18 && pais === 'MX'
gt(edad, 17) || isNotEmpty(codigoPromocional)
```

Funciones disponibles:

| Función | Verdadera cuando |
|---|---|
| `isEmpty(v)` / `isNotEmpty(v)` | `v` es (o no es) `null`, `''` o un arreglo vacío |
| `hasValue(v)` | `v` no es `null`, `undefined` ni `''` |
| `isChecked(v)` | `v` es `true` o `'true'` (checkboxes) |
| `isSelected(v)` | `v` tiene algún valor |
| `equals(a, b)` / `notEquals(a, b)` | comparación estricta |
| `gt`, `gte`, `lt`, `lte` `(a, b)` | comparación numérica |
| `includes(arr, v)` | `arr` es un arreglo que contiene `v` |

## Qué elemento se oculta

1. Si el mapping trae `visibilityGroup`, se oculta el ancestro más cercano con `data-visibility-group="<valor>"`. **Es la forma recomendada**: tú decides exactamente qué se oculta (label, input y mensaje de error juntos).
2. Si no, el motor busca un contenedor habitual hacia arriba (`.form-group`, `.input-group`, columnas de Bootstrap, `.mb-3`, `.mb-4`, `.field-container`, `.card-body`…).
3. Si no encuentra ninguno, oculta el propio elemento.

## Limitaciones conocidas

Estas limitaciones están identificadas y pendientes de corrección:

- Los literales `true`, `false` y `null` no se pueden usar dentro de la expresión. Para checkboxes usa `isChecked(campo)` en lugar de `campo === true`.
- No existe el prefijo `form.`: escribe `tipoCuenta === 'premium'`, no `form.tipoCuenta === 'premium'`.
- La búsqueda automática de contenedor (punto 2) puede ocultar más de lo esperado si el campo no tiene un contenedor propio; usa `visibilityGroup`.
- Las expresiones se evalúan con `new Function`, por lo que un host con una Content Security Policy estricta necesita permitir `unsafe-eval`.

---

[← Volver al índice de documentación](../README.md#documentación)
