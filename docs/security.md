# Seguridad

Todo `htmlComponent` pasa por `DOMPurify.sanitize()` antes de renderizarse (con `data-dynamic-action` y `data-dynamic-form` permitidos explícitamente vía `ADD_ATTR`). Aun así, trata cualquier fuente de JSON como no confiable por default — el sanitizado es una capa de defensa, no una licencia para aceptar HTML de fuentes no verificadas sin revisión.
## Qué se sanitiza

- **HTML.** Se eliminan `<script>`, manejadores inline (`onclick=`, `onerror=`…) y URLs `javascript:`. Por eso el HTML del JSON no puede ejecutar código: la interacción se declara con `data-dynamic-action` y la decide el host.
- **Expresiones `showIf` / `hideIf`.** No se ejecutan como JavaScript: las analiza y evalúa un intérprete propio con un lenguaje reducido (sin asignaciones, llamadas arbitrarias ni acceso a `constructor`/`prototype`), así que no requieren `unsafe-eval` en tu Content Security Policy. Ver [conditional-logic.md](conditional-logic.md).
- **CSS.** El `cssComponent` queda aislado a su sección y se le elimina `@import` (ver [Estilos](styling.md)), de modo que no puede estilizar la página host ni cargar hojas externas. Su contenido, en cambio, no se filtra: una regla puede seguir usando `url(...)` para pedir imágenes o fuentes de otro origen.

## A dónde se pueden enviar datos

Hay dos cosas que el JSON puede pedir que se manden a una URL suya: los **archivos** de un campo (`fileUploadConfig.uploadUrl`) y lo que el usuario **escribe** en un campo con autocompletado (`autoCompleteConfig.sourceUrl`). No se confía en esa URL para mandar datos del usuario a cualquier sitio:

- Una URL **relativa** se resuelve contra `DYNAMIC_CONFIG.apiUrl` (librería Angular) o contra la página.
- Una URL **absoluta** solo se acepta si su origen es el de la página, el de `api-url` del widget, el de `DYNAMIC_CONFIG.apiUrl` o uno declarado en `allowed-origins` / `DYNAMIC_CONFIG.allowedOrigins`.
- Cualquier otra (`https://otro.com/...`, `//otro.com/...`, `javascript:`, `data:`, `ftp:`) falla **sin hacer ninguna petición**.

```html
<ux-driven-viewer api-url="https://api.mi-sitio.com/pantalla"
                  allowed-origins="https://files.mi-sitio.com, https://cdn.mi-sitio.com"></ux-driven-viewer>
```

Ver [Subida de archivos](file-upload.md#a-dónde-se-puede-subir) y [Autocompletado](validators.md#autocompleteconfig-sugerencias-mientras-se-escribe).

## Reportar una vulnerabilidad

Ver [SECURITY.md](../SECURITY.md).

---

[← Volver al índice de documentación](../README.md#documentación)
