# Seguridad

Todo `htmlComponent` pasa por `DOMPurify.sanitize()` antes de renderizarse (con `data-dynamic-action` y `data-dynamic-form` permitidos explícitamente vía `ADD_ATTR`). Aun así, trata cualquier fuente de JSON como no confiable por default — el sanitizado es una capa de defensa, no una licencia para aceptar HTML de fuentes no verificadas sin revisión.
## Qué se sanitiza

- **HTML.** Se eliminan `<script>`, manejadores inline (`onclick=`, `onerror=`…) y URLs `javascript:`. Por eso el HTML del JSON no puede ejecutar código: la interacción se declara con `data-dynamic-action` y la decide el host.
- **Expresiones `showIf` / `hideIf`.** No se ejecutan como JavaScript: las analiza y evalúa un intérprete propio con un lenguaje reducido (sin asignaciones, llamadas arbitrarias ni acceso a `constructor`/`prototype`), así que no requieren `unsafe-eval` en tu Content Security Policy. Ver [conditional-logic.md](conditional-logic.md).
- **CSS.** El `cssComponent` queda aislado a su sección y se le elimina `@import` (ver [Estilos](styling.md)), de modo que no puede estilizar la página host ni cargar hojas externas. Su contenido, en cambio, no se filtra: una regla puede seguir usando `url(...)` para pedir imágenes o fuentes de otro origen. La librería incluye `HtmlSanitizerInterceptor`, que puede limpiar CSS y HTML de las respuestas HTTP, pero el runtime no lo registra por defecto.

## Reportar una vulnerabilidad

Ver [SECURITY.md](../SECURITY.md).

---

[← Volver al índice de documentación](../README.md#documentación)
