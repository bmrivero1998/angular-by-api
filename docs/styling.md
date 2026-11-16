# Estilos

## De dónde sale el diseño

El widget no trae diseño propio. Todo el aspecto de una sección viene de su `cssComponent`, más el framework CSS que cargue la página host.

- **Bootstrap lo pone el host.** Si tu HTML usa clases de Bootstrap, la página debe cargar su CSS (y su JS si usas `data-bs-*`). Ver [Primeros pasos](getting-started.md).
- **Layout.** El widget coloca las secciones en un grid de 12 columnas. Cada sección ocupa las 12 salvo que indique otra cosa en `otros.source.colSpan`. El atributo `grid-gap` define la separación.

## Alcance del `cssComponent`

Cada sección se renderiza dentro de un elemento con la clase `dynamic-<id_DocumentHTMLCSS>`. El CSS de la sección **debe** prefijar todos sus selectores con esa clase:

```css
/* id_DocumentHTMLCSS = "compiled-123" */
.dynamic-compiled-123 .hero { padding: 96px 16px; }
.dynamic-compiled-123 #el_titulo { font-weight: 700; }
```

> **Importante:** hoy el motor no aísla el CSS por su cuenta. El `<style>` de cada sección se inserta tal cual en la página, así que una regla sin prefijo (por ejemplo `.card { ... }`) afecta también al resto de la página host. El aislamiento automático está pendiente.

## Clases de validación

El motor marca cada campo según su estado:

| Estado | Clase por defecto |
|---|---|
| Inválido (tras interactuar) | `is-invalid` |
| Válido (tras interactuar) | `is-valid` |
| Deshabilitado | `disabled` |

Son las clases de Bootstrap. Si integras el motor como librería Angular puedes cambiarlas con `DYNAMIC_CONFIG` (`errorClassName`, `successClassName`), por ejemplo para Tailwind.

El texto del error se escribe en el elemento indicado por `errorDisplaySelector` de cada mapping; ver [validators.md](validators.md).

---

[← Volver al índice de documentación](../README.md#documentación)
