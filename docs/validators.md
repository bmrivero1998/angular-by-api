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

[← Volver al índice de documentación](../README.md#documentación)
