# Seguridad

Todo `htmlComponent` pasa por `DOMPurify.sanitize()` antes de renderizarse (con `data-dynamic-action` y `data-dynamic-form` permitidos explícitamente vía `ADD_ATTR`). Aun así, trata cualquier fuente de JSON como no confiable por default — el sanitizado es una capa de defensa, no una licencia para aceptar HTML de fuentes no verificadas sin revisión.
## Qué se sanitiza

- **HTML.** Se eliminan `<script>`, manejadores inline (`onclick=`, `onerror=`…) y URLs `javascript:`. Por eso el HTML del JSON no puede ejecutar código: la interacción se declara con `data-dynamic-action` y la decide el host.
- **Expresiones `showIf` / `hideIf`.** Sí se ejecutan como código (ver [conditional-logic.md](conditional-logic.md)). Trátalas con el mismo cuidado que el HTML: solo deben venir de tu backend.
- **CSS.** El `cssComponent` se inserta sin filtrar. La librería incluye `HtmlSanitizerInterceptor`, que puede limpiar CSS y HTML de las respuestas HTTP, pero el runtime no lo registra por defecto.

## Reportar una vulnerabilidad

Ver [SECURITY.md](../SECURITY.md).

---

[← Volver al índice de documentación](../README.md#documentación)
