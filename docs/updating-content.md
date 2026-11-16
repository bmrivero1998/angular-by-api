# Actualizar el contenido: `static` y `dynamic`

El widget guarda en memoria las secciones que recibe, identificadas por su `id_DocumentHTMLCSS`. Cuando le mandas contenido nuevo, **compara por `id` contra lo que ya tiene** y decide qué hay que volver a pintar. El `renderType` de cada sección es lo que decide cómo se actualiza:

| `renderType` | Qué es | Qué pasa si cambia |
|---|---|---|
| `static` | La estructura de la pantalla (menú, pie, marcos). | Se **recarga la pantalla completa**, con todos sus componentes. |
| `dynamic` | Contenido que se actualiza (formularios, listados, avisos). | Se actualiza **solo esa sección**. Las demás no se tocan y conservan su estado: lo que el usuario escribió en sus formularios sigue ahí. |

El **orden en pantalla es el del JSON**, sea `static` o `dynamic`. `renderType` no cambia dónde se pinta una sección, solo cómo se actualiza.

## Cómo se manda el cambio

### 1. Reenviar el JSON completo

Vuelve a asignar `localSchema` (o llama a `refresh()` si usas `api-url`). Lo recibido se compara con lo que hay en memoria:

```js
viewer.localSchema = nuevoJson;   // el JSON completo, con el cambio dentro
```

| Qué cambió respecto a lo que había | Resultado (`mode`) |
|---|---|
| Nada | `unchanged`: no se toca nada y no se emite ningún evento. |
| Solo secciones `dynamic` (modificadas, agregadas, quitadas o reordenadas) | `patched`: se actualiza solo lo que cambió. |
| Una sección `static` (modificada, agregada, quitada, reordenada, o un `renderType` que cambia) | `reloaded`: se recarga toda la pantalla. |

Una sección "cambia" si su contenido es distinto, comparado campo por campo; el orden de las claves dentro del JSON no cuenta.

### 2. Mandar solo las secciones que cambian

`viewer.updateSections([...])` recibe únicamente las secciones modificadas. Cada una reemplaza a la que tiene su mismo `id_DocumentHTMLCSS`; las nuevas se agregan al final; el resto no se toca.

```js
const resultado = viewer.updateSections([
  {
    id_DocumentHTMLCSS: 'novedades',
    renderType: 'dynamic',
    htmlComponent: '<p>Hay una oferta nueva</p>',
  },
]);
// resultado = { mode: 'patched', changedIds: ['novedades'], issues: [] }
```

> `updateSections` y `refresh` están disponibles en el elemento una vez que se crea. Si los llamas justo al cargar la página, espera al evento `ready`.

Para **quitar** una sección, reenvía el JSON completo sin ella (una `dynamic` desaparece sin tocar las demás; quitar una `static` recarga todo).

### 3. Con `api-url`

`viewer.refresh()` vuelve a pedir el JSON a la API y lo compara igual que en el caso 1. Lo que ya está en pantalla se queda mientras llega la respuesta; el indicador de carga solo aparece la primera vez. Si la respuesta no se puede leer, **no se borra la pantalla**: se informa por `errorOccurred`.

## Qué se conserva y qué se pierde

- Al actualizar una `dynamic`, esa sección se vuelve a crear: **su formulario se reinicia**. Las demás conservan su elemento, su formulario y lo que el usuario haya escrito.
- Al recargar por un cambio `static`, se recrean **todas** las secciones: se pierde lo escrito en todos los formularios. Es el motivo de la regla: una sección `static` es la que no esperas cambiar mientras alguien está usando la pantalla.
- Reenviar el mismo contenido nunca recrea nada.

## Evento `contentUpdated`

Se emite cada vez que cambia algo en pantalla (no si fue `unchanged`):

```js
viewer.addEventListener('contentUpdated', (e) => {
  // e.detail = { mode: 'initial' | 'patched' | 'reloaded', changedIds: string[], issues: string[] }
});
```

- `initial`: la primera carga.
- `patched`: solo se actualizaron las `dynamic` de `changedIds`.
- `reloaded`: se recargó toda la pantalla; `changedIds` lista las secciones que cambiaron.

`ready` se emite en `initial` y en `reloaded` (cuando la pantalla se pinta completa), no en `patched`.

## Contenido incompleto

Antes, una sección mal formada se descartaba en silencio. Ahora se pinta si se puede y se informa por `errorOccurred` (un mensaje por problema, también incluidos en `issues`):

| Problema | Qué se hace |
|---|---|
| Sin `renderType`, o con un valor que no es `static` ni `dynamic` | Se trata como `static` (lo seguro: cualquier cambio recarga todo). |
| Sin `id_DocumentHTMLCSS` | Se le asigna `section-<posición>`. |
| `id_DocumentHTMLCSS` repetido | Se conserva la primera sección y se ignora la repetida. |
| Algo que no es un objeto | Se ignora. |
| Un JSON ilegible o que no es un arreglo | No se cambia nada. |

## Varios widgets en la misma página

Cada `<ux-driven-viewer>` tiene su propia memoria de secciones: dos widgets con contenido distinto no se pisan.

## Cambios en caliente (librería Angular / servicio)

`DynamicViewerService` también permite cambiar una sección sin pasar por el JSON, con `updateTable(id, selector, datos)` y `updateBindingValue(id, selector, valor)`. Solo renuevan esa sección y no cuentan como cambio del JSON: reenviar el mismo JSON después no los revierte.

---

[← Volver al índice de documentación](../README.md#documentación)
