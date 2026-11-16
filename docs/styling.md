# Estilos

## De dónde sale el diseño

El widget no trae diseño propio. Todo el aspecto de una sección viene de su `cssComponent`, más el framework CSS que cargue la página host.

- **El widget no incluye ningún framework CSS.** Usa el que quieras (Bootstrap, Tailwind, Bulma, el tuyo...) y entrégaselo de una de estas formas, ver [Frameworks CSS](#frameworks-css-bootstrap-tailwind-y-otros).
- **Layout.** El widget coloca las secciones en un grid de 12 columnas. Cada sección ocupa las 12 salvo que indique otra cosa en `otros.source.colSpan`. El atributo `grid-gap` define la separación.

## Frameworks CSS (Bootstrap, Tailwind y otros)

El widget no usa Shadow DOM, así que **cualquier hoja que esté en la página aplica dentro de él**, igual que en el resto de tu HTML. Hay tres formas de entregársela:

| Forma | Quién decide | Cuándo usarla |
|---|---|---|
| `<link>` o `<script>` en tu página | El host | Lo normal: tu página ya usa el framework. |
| Atributo `stylesheets="url1 url2"` (o propiedad `viewer.stylesheets = [...]`) | El host | El widget carga la hoja por ti, una sola vez, aunque haya varios widgets. |
| `cssLinks: ["https://..."]` en una sección del JSON | El backend | El contenido trae sus propias hojas. Solo se cargan si son relativas o de un origen de confianza. |

```html
<!-- Bootstrap, cargado por el widget -->
<ux-driven-viewer api-url="/api/pantalla"
  stylesheets="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"></ux-driven-viewer>
```

- Una hoja que ya está en el `<head>` no se vuelve a añadir; una que falla o tarda más de 8 s se salta (con un aviso en consola) y nunca bloquea la pantalla.
- Solo se cargan URLs `http(s)` o relativas. Las hojas son **globales y se quedan** mientras la página viva.
- `cssLinks` sigue la misma regla que el resto de URLs del JSON (ver [Seguridad](security.md#a-dónde-se-pueden-enviar-datos)): un origen que no sea el de la página, `api-url` o `allowed-origins` se rechaza, no se carga y se informa por `errorOccurred`. Un CSS externo puede pedir imágenes y fuentes a otros sitios, por eso no se acepta cualquiera.

### Tailwind

Funciona de dos maneras:

1. **Compilado (recomendado en producción).** Genera tu CSS con la CLI de Tailwind apuntando a tus plantillas de JSON/HTML y cárgalo con `stylesheets` o un `<link>`. Ten en cuenta que Tailwind solo incluye las clases que ve al compilar: si el backend inventa clases nuevas, hay que recompilar.
2. **Play CDN (pruebas).** `<script src="https://cdn.tailwindcss.com"></script>` en tu página: observa el DOM y genera las clases que aparezcan, también las del widget. Ver [`examples/schemas/tailwind.json`](../examples/schemas/tailwind.json) y [`examples/demo.html`](../examples/demo.html).

No funcionaría con Shadow DOM (el Play CDN no ve dentro de él): es una de las razones de que el widget no lo use.

### Clases de validación

Por defecto el motor marca los campos con `is-invalid` / `is-valid` (Bootstrap). Con otro framework cámbialas con atributos:

```html
<ux-driven-viewer error-class="border-red-500 ring-2 ring-red-500" success-class="border-green-500"></ux-driven-viewer>
```

Aceptan varias clases separadas por espacio. Son **de todo el bundle**: si pones dos widgets en la página con clases distintas, gana el último en leerse.

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

Son las clases de Bootstrap. Se cambian con `error-class` / `success-class` en el widget (ver arriba) o, como librería Angular, con `DYNAMIC_CONFIG` (`errorClassName`, `successClassName`).

El texto del error se escribe en el elemento indicado por `errorDisplaySelector` de cada mapping; ver [validators.md](validators.md).

---

[← Volver al índice de documentación](../README.md#documentación)
