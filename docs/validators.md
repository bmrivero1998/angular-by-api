# `formMappings` — validadores y controles

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
| `required` | no | `Validators.required`; además un checkbox sin marcar (`false`) cuenta como vacío |
| `requiredTrue` | no | `Validators.requiredTrue` (checkboxes obligatorios) |
| `email` | no | `Validators.email` |
| `minLength` | sí (number) | `Validators.minLength(value)` |
| `maxLength` | sí (number) | `Validators.maxLength(value)` |
| `pattern` | sí (regex string) | `Validators.pattern(value)` |
| `min` | sí (number) | `Validators.min(value)` |
| `max` | sí (number) | `Validators.max(value)` |
| `matchValue` | sí (any) | Válido solo si el valor del control === `value` (un literal) |
| `matchControl` | sí (`controlName`) | Válido solo si vale lo mismo que otro control del mismo formulario. Para "confirmar contraseña" |

El `type` no distingue mayúsculas: `minLength` y `minlength` son equivalentes.

```json
{
  "controlName": "confirmarPassword",
  "domSelector": "#el_confirmar",
  "errorDisplaySelector": "[data-error-for='el_confirmar']",
  "validatorConfig": [
    { "type": "required", "message": "Confirma tu contraseña" },
    { "type": "matchControl", "value": "password", "message": "Las contraseñas no coinciden" }
  ]
}
```

### Cuándo se muestran los errores

Un campo se marca como inválido (clase `is-invalid`, atributo `aria-invalid="true"` y mensaje en `errorDisplaySelector`) cuando su valor no pasa la validación **y** el usuario ya interactuó con él:

- al escribir o cambiar su valor,
- al salir del campo (aunque no haya escrito nada),
- o tras un intento de envío, que marca todos los campos a la vez.

Un formulario recién cargado no muestra errores.

### Qué mensaje se muestra

Se muestra el del primer error del campo, con esta prioridad:

1. El `message` del validador correspondiente en `validatorConfig`.
2. El `message` del `asyncValidator`, si el error es el suyo.
3. El motivo que trae el propio error (archivos rechazados por tamaño, tipo o cantidad).
4. Un mensaje por defecto según el tipo de error.

### Valor inicial de cada campo

Por orden de prioridad: `formInitialData` de la sección, `defaultValue` del mapping y, si no hay ninguno, lo que ya traiga el HTML (`value="..."`, `checked`, `<option selected>`).

### Validación nativa del navegador

El motor añade `novalidate` a cada `<form>` inyectado: la validación y los mensajes son siempre los del motor, no los globos del navegador.

### `keyFilter` (bloquea teclas mientras se escribe)

Valores predefinidos: `int`, `number`, `alpha`, `alphanum`, `hex`, `decimal`. También acepta cualquier regex custom como string (ej. `"[A-Z]"`).

Solo filtra las teclas que escriben un carácter; no interfiere con atajos ni teclas de función. No filtra el texto pegado: combínalo con un validador `pattern` si necesitas garantizar el formato.

### `inputMask` (formato en vivo)

`9` = dígito, `x`/`X` = letra (se normaliza a mayúscula), `*` = alfanumérico, cualquier otro carácter = literal. Ej: `"999-999-9999"` para teléfono.

El input muestra el valor formateado (`551-234-5678`), pero el formulario guarda y valida el valor **limpio**, sin literales (`5512345678`). Por eso `minLength` / `maxLength` cuentan solo los caracteres de dato: para el teléfono del ejemplo son `10`, no `12`.

### `fileUploadConfig` (para inputs `type="file"`)

```json
{
  "controlName": "adjunto",
  "domSelector": "#el_archivo",
  "fileUploadConfig": {
    "accept": ".pdf,.jpg,.jpeg,.png",
    "multiple": false,
    "maxSize": 5242880,
    "maxCount": 1,
    "uploadUrl": "/api/archivos"
  }
}
```

Valida el tipo, el tamaño y la cantidad al elegir, y con `uploadUrl` también **sube** los archivos y deja la respuesta del servidor como valor del campo. Todas las opciones y el flujo completo están en [Subida de archivos](file-upload.md).

---

[← Volver al índice de documentación](../README.md#documentación)
