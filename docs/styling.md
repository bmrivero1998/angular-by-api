# Estilos

## De dónde sale el diseño

El widget no trae diseño propio. Todo el aspecto de una sección viene de su `cssComponent`, más el framework CSS que cargue la página host.

- **Bootstrap lo pone el host.** Si tu HTML usa clases de Bootstrap, la página debe cargar su CSS (y su JS si usas `data-bs-*`). Ver [Primeros pasos](getting-started.md).
- **Layout.** El widget coloca las secciones en un grid de 12 columnas. Cada sección ocupa las 12 salvo que indique otra cosa en `otros.source.colSpan`. El atributo `grid-gap` define la separación.

## Alcance del `cssComponent`

Cada sección se renderiza dentro de un elemento con la clase `dynamic-<id_DocumentHTMLCSS>`, y **el motor aísla su CSS a ese elemento automáticamente**: una regla de una sección nunca afecta a otra sección ni a la página host. No necesitas prefijar nada.

```css
/* id_DocumentHTMLCSS = "compiled-123" */
.card  { border: 1px solid #ddd; }        /* solo las .card de esta sección */
h1     { font-weight: 700; }              /* solo los h1 de esta sección */
```

Por debajo, cada selector se reescribe como `:where(.dynamic-compiled-123) .card`. El prefijo usa `:where()` para **no sumar especificidad**: el CSS compite contra el resto de reglas exactamente igual que si estuviera sin aislar.

### Qué ocurre con cada cosa

| En el `cssComponent` | Resultado |
|---|---|
| `.card { … }`, `h1 { … }`, `* { … }` | Aplican solo dentro de la sección. |
| `.dynamic-<id> .card { … }` (formato histórico) | Se respeta tal cual: ya estaba aislado. Los JSON que ya prefijan no hay que tocarlos. |
| `.dynamic-<id> { … }` | Estila el propio contenedor de la sección. |
| `body { … }`, `html { … }`, `:root { … }` | Significan "la raíz de la sección", no la página. Las variables CSS de `:root` quedan definidas solo para esa sección. |
| `@media`, `@supports`, `@container`, `@layer { … }` | Sus reglas internas también se aíslan. |
| CSS anidado (`.a { .b { … } }`) | Se aísla la regla exterior; las anidadas la heredan. |
| `@keyframes nombre` | Se renombra a `dynamic-<id>__nombre` y se actualizan `animation` / `animation-name`, así dos secciones pueden usar el mismo nombre sin pisarse. |
| `@import` | **Se elimina.** Carga recursos externos y no se permite. |
| `@font-face`, `@property`, `@page` | Se dejan tal cual: sus nombres son globales por definición y no se pueden aislar con selectores. Si dos secciones declaran la misma `font-family` con fuentes distintas, gana la última. |

Una regla cuyo selector el navegador no admite tras reescribirlo se descarta en lugar de dejarla sin aislar.

### Lo que sigue siendo global

El aislamiento va en una sola dirección: protege a la página de la sección, pero **la página sigue afectando a la sección**. El widget no usa Shadow DOM a propósito, para que el Bootstrap del host, sus `data-bs-*` y las anclas entre secciones sigan funcionando. Una regla del host como `h1 { color: red }` colorea también los `h1` de las secciones, salvo que la sección declare su propio estilo.

### Para quien usa la librería Angular

`DynamicViewerComponent` pone la clase `dynamic-<contentId>` en su elemento anfitrión y aísla su `cssContentString` contra ella. Si inyectas CSS por tu cuenta con `DynamicInyectCssService`, pasa `{ scopeClass }` como cuarto argumento, o usa directamente `scopeCss(css, scopeClass)`.

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
