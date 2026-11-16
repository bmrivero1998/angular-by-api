# Errores de carga y páginas de error

## Qué pasa cuando falla la carga

Si el widget pide su contenido a `api-url` y la petición falla, **siempre** emite `errorOccurred`, con el código HTTP cuando lo hay:

```js
viewer.addEventListener('errorOccurred', (e) => {
  // "Error cargando configuración dinámica (HTTP 404)"
});
```

Además, **si es la primera carga** (todavía no hay nada en pantalla), el widget pinta una página de error en lugar de dejar la pantalla en blanco:

| Respuesta | Página | ¿Ofrece "Reintentar"? |
|---|---|---|
| 404 | "No encontramos este contenido" | No: reintentar no cambia nada. |
| 401, 403 | "Acceso no autorizado" | No. |
| Sin respuesta (sin red, servidor caído), 408, 429, 5xx | "Servicio no disponible" | Sí. |
| Cualquier otro código (400, 409, 422...) o un error que no es HTTP | "Algo salió mal" | Sí. |

La página muestra el código HTTP cuando lo hay, usa estilos propios (no depende de Bootstrap ni de fuentes de iconos en la página host) y, como cualquier sección, su CSS queda aislado.

## "Reintentar"

El botón vuelve a pedir el contenido (equivale a `viewer.refresh()`): la página de error se quita, se muestra el indicador de carga y, si la respuesta es correcta, aparece el contenido. Si vuelve a fallar, la página de error reaparece.

## Si ya hay contenido, no se reemplaza

Un fallo al **volver a cargar** (`refresh()`) con la pantalla ya funcionando **no** la reemplaza por una página de error: un fallo pasajero no debe destruir lo que el usuario está usando. Solo se emite `errorOccurred` y todo queda como estaba.

## Eventos

La página de error es una sección más (`id_DocumentHTMLCSS: "ux-error-page"`), de modo que su aparición se reporta como cualquier carga:

```js
viewer.addEventListener('contentUpdated', (e) => {
  // e.detail = { mode: 'initial', changedIds: ['ux-error-page'], issues: [] }
});
viewer.addEventListener('ready', () => { /* se emite también tras un fallo de la primera carga */ });
```

Cuando el contenido real llega, reemplaza a la página de error y se reporta como `initial`.

## Mostrar tu propia página de error

Con `show-error-page="false"` el widget no pinta nada al fallar la primera carga y solo emite `errorOccurred`, para que el host muestre la suya:

```html
<ux-driven-viewer api-url="https://tu-api.com/pantalla" show-error-page="false"></ux-driven-viewer>
```

## Qué NO se convierte en página de error

Solo la **carga del contenido** de la pantalla. Cualquier otra petición HTTP de la aplicación (por ejemplo la de un validador asíncrono de un campo) sigue fallando como lo que es: un error de esa petición. Un contenido que llega pero es ilegible (JSON roto, algo que no es un arreglo de secciones) tampoco: no se borra nada y se informa por `errorOccurred`. Ver [Actualizar el contenido](updating-content.md).

---

[← Volver al índice de documentación](../README.md#documentación)
