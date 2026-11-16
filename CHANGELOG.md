# Changelog

Los cambios relevantes de este proyecto se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido (formularios de varios pasos)

- **Stepper dirigido por el HTML** de la sección, sin configuración aparte: `data-dynamic-stepper` en un contenedor, `data-dynamic-step="id"` en cada paso y botones con `data-dynamic-action="next_step"` / `"previous_step"`. Ver `docs/steppers.md`.
- "Siguiente" **valida los campos del paso actual**: si alguno es inválido (o está pendiente) no avanza, muestra sus errores y enfoca el primero. "Atrás" no valida y conserva lo escrito.
- Enter en un paso intermedio avanza en vez de enviar. Al enviar con un paso anterior inválido, el formulario **vuelve a ese paso** y muestra el error (también con varias secciones y con botones `submit_form`).
- Indicador de pasos opcional (`data-dynamic-stepper-nav`) con `data-step-state` (`active`, `completed`, `pending`) y `aria-current`; clic en un paso ya alcanzado vuelve a él. `data-show-on-step` muestra u oculta botones según el paso.
- Evento `stepChanged` (`formId`, `stepId`, `index`, `total`, `direction`, `completed`).
- Se elimina el antiguo `DynamicStepperService` (nunca se usó): era un servicio de estado con callbacks, sin forma de describirse en un JSON ni de dibujarse.

### Añadido (autocompletado)

- `autoCompleteConfig.sourceUrl` (y `queryParam`): las sugerencias se piden a un endpoint mientras se escribe (`GET <sourceUrl>?q=<texto>`), con lo que el autocompletado dinámico ya se puede usar desde el JSON. Acepta textos u objetos `{ value, label }`.
- Cada búsqueda cancela la anterior, `minChars` y `debounceTime` aceptan 0, con menos de `minChars` se vacía la lista y un fallo la deja vacía sin romper el campo.
- La `source` como función (solo librería Angular) por fin muestra lo que devuelve: antes lo imprimía en consola. Antes tampoco estaba documentado.
- Ejemplos `pasos.json` y `autocompletado.json`, y `GET /api/ciudades` en `npm run mock-api`.

### Cambiado (orígenes de confianza)

- Lo que el JSON puede pedir que se mande a una URL (los archivos de la subida y lo que el usuario escribe en el autocompletado) se rige por **una sola regla**: URL relativa, o absoluta del origen de la página, de `api-url` / `apiUrl`, de `allowed-origins` (widget) o de `allowedOrigins` (`DYNAMIC_CONFIG`). Cualquier otra falla sin hacer ninguna petición. Se exporta `resolveTrustedUrl`.

### Añadido (subida de archivos)

- **El motor ahora sube los archivos.** Con `fileUploadConfig.uploadUrl`, los archivos válidos se suben (multipart, una petición por archivo, en paralelo) apenas se eligen, con avance en `progressSelector`, lista de archivos en `fileListSelector` y el motivo de cualquier fallo en `errorDisplaySelector`. Al terminar, el valor del campo es la respuesta del servidor (un arreglo con varios archivos), y es lo que recibe `formSubmit`. Antes solo se validaba y se avisaba con `fileSelected`; la subida era cosa del host, que sigue pudiendo hacerla si no indica `uploadUrl`. Ver `docs/file-upload.md`.
- Evento `fileUploadChanged` (`status`: `uploading`, `done` o `error`, con `progress`, `result` y `error`).
- `method` (`POST` o `PUT`) y `fieldName` en `fileUploadConfig`.
- **La URL de subida no se confía a ciegas.** Una URL absoluta solo se acepta si su origen es el de la página, el de `api-url` / `apiUrl` o uno declarado en `allowed-origins` (widget) o `allowedOrigins` (`DYNAMIC_CONFIG`); cualquier otra falla sin hacer ninguna petición.
- `FileUploadTransferService` en la API pública de la librería.
- Ejemplo `examples/schemas/archivos.json`, API de prueba `npm run mock-api` y proxy del playground.

### Corregido (subida de archivos)

- Mientras un archivo sube, un botón con `formIsInvalid` o `formIsInvalidOrPristine` seguía **habilitado**: Angular no considera un formulario pendiente ni válido ni inválido. Ahora ambas condiciones deshabilitan el botón también mientras haya algo pendiente (una subida o un validador asíncrono).
- Enviar el formulario mientras algo está pendiente ya no se confunde con un formulario inválido: no se envía y se explica por qué.
- `maxCount` estaba documentado pero no existía en el tipo `FileUploadConfig`, que además estaba definido dos veces.
- Un error de un campo que trae su propio texto (el de una subida) se muestra en `errorDisplaySelector`.
- `ButtonStateService` no tenía pruebas.

### Añadido (errores de carga)

- **Página de error** cuando falla la primera carga por `api-url`: 404, sin acceso (401/403), servicio no disponible (sin red, 408, 429, 5xx) y error genérico. Los dos últimos ofrecen "Reintentar", que vuelve a pedir el contenido. Usa estilos propios, sin depender de Bootstrap ni de fuentes de iconos. Ver `docs/errors.md`.
- Atributo `show-error-page` (por defecto `true`): con `"false"` solo se emite `errorOccurred`, para que el host muestre su propia página.
- `errorOccurred` incluye el código HTTP: `Error cargando configuración dinámica (HTTP 404)`.

### Cambiado (errores de carga)

- Un fallo al **volver a cargar** (`refresh()`) con la pantalla ya funcionando no la reemplaza por una página de error: solo se informa.
- Se elimina `MockErrorHandlerInterceptor`. Nunca estuvo registrado, y de haberlo estado habría convertido **cualquier** error HTTP de la aplicación en una respuesta `200` falsa, también el de un validador asíncrono (un `500` en `/check-username` se habría leído como "usuario ya tomado"). Los fallos de carga se resuelven ahora de forma explícita, solo para el contenido de la pantalla.

### Corregido (acciones)

- Una acción con "modal" en el nombre (`open_modal`, `show_modal_help`, `modal_confirm`) **ya no se confunde con cerrar un modal ni se traga**: antes cerraba el modal y el host nunca la recibía, lo que hacía imposible abrir un modal desde una acción.
- Las acciones integradas se reconocen por **palabras completas** (`close_modal`, `close-modal` y `closeModal` son lo mismo) y no por texto suelto: `reset_password` ya no vacía el formulario, `resubmit_later` ya no envía nada y `disclose` ya no cierra un modal. Aplica al widget y al marco del modal.
- Las acciones de cerrar y de vaciar el formulario ahora **también se reportan al host** como `actionTriggered`, además de ejecutarse. `submit` sigue sin reportarse como acción (llega `formSubmit`). Ver `docs/events.md`.
- Los atributos HTML del elemento llegaban como texto: `show-back-to-top="false"` seguía mostrando el botón (el texto "false" cuenta como verdadero) y `debug="false"` activaba el modo debug. Ahora los booleanos y los números se convierten (`scroll-offset`, `grid-gap`, `back-to-top-threshold`, `form-state-debounce`).

### Documentación

- Se documenta que los listeners de los eventos de la primera carga deben registrarse antes del `<script>` del widget, para no perderlos si el servidor responde muy rápido.

### Cambiado (carga y actualización de contenido)

- **`static` y `dynamic` ahora significan cómo se actualiza una sección**, no dónde se pinta. Al recibir contenido, el widget lo compara por `id_DocumentHTMLCSS` contra lo que tiene en memoria: si cambia una sección `static` se recarga toda la pantalla; si cambian solo secciones `dynamic` se actualiza únicamente cada una, y las demás conservan su componente y lo que el usuario escribió; si no cambia nada, no se toca nada. Ver `docs/updating-content.md`.
- **El orden en pantalla es el del JSON.** Antes todas las `static` se pintaban primero, aunque estuvieran al final del arreglo.
- Las secciones `static` ya no se ven mientras carga y las `dynamic` no se ocultan: solo hay indicador de carga en la primera carga por API. Al volver a cargar, lo que está en pantalla se queda hasta que llega la respuesta.
- `ready` se emite cuando la pantalla se pinta completa (primera carga y recarga completa), no al actualizar una `dynamic`.
- Una respuesta ilegible de la API (o un JSON roto) ya no vacía la pantalla: se informa por `errorOccurred` y se deja todo como estaba.
- `DynamicViewerService` deja de ser un singleton: se provee en cada widget. Se eliminan `staticContent$`, `dynamicContent$`, `updateStaticContent` y `updateDynamicContent`; en su lugar hay `content$`, `getContentValue()` y `updateSections()`. `loadInitialContent` y `setLocalContent` devuelven un `ContentChange`.

### Añadido (carga y actualización de contenido)

- Método `updateSections([...])` en el elemento y en el widget: actualiza solo las secciones que se le mandan, por `id_DocumentHTMLCSS`.
- Método `refresh()` en el elemento (antes solo existía en el componente y no era accesible desde el custom element).
- Evento `contentUpdated` (`mode`: `initial`, `patched` o `reloaded`, más `changedIds` e `issues`).
- Ejemplo `examples/schemas/secciones.json` y botones en el playground para ver la diferencia entre actualizar una `dynamic`, una `static` o reenviar el mismo JSON.

### Corregido (carga de contenido)

- Dos `<ux-driven-viewer>` en la misma página compartían el contenido en memoria y se pisaban.
- Con `api-url`, el contenido se pedía dos veces al iniciar.
- Una sección sin `renderType` (o con un typo) se descartaba en silencio; ahora se pinta como `static` y se informa. Lo mismo con una sección sin `id_DocumentHTMLCSS` (se le asigna uno) o con un `id` repetido (se conserva la primera).

### Corregido (aislamiento del CSS)

- El `cssComponent` de cada sección queda aislado a esa sección: una regla `.card { … }` del JSON ya no afecta a las tarjetas de la página host ni a otras secciones. Antes dependía de que el backend prefijara bien cada selector; ahora el motor lo hace por su cuenta.
- Los JSON que ya prefijan sus selectores con `.dynamic-<id>` siguen funcionando sin cambios.
- `html`, `body` y `:root` dentro de un `cssComponent` se refieren a la raíz de la sección, no a la página.
- Los `@keyframes` se renombran por sección, para que dos secciones con el mismo nombre no se pisen.
- Se elimina `@import` de los `cssComponent`.
- El prefijo de aislamiento usa `:where()`, así que no cambia la especificidad de las reglas.
- Se quita el Bootstrap completo que iba empaquetado dentro del componente y que no aplicaba a nada (el HTML inyectado no lleva los atributos del componente). `ux-driven-viewer.js` pasa de unos 696 kB a unos 338 kB, y la librería deja de depender del paquete `bootstrap`.

### Cambiado (aislamiento del CSS)

- `DynamicViewerComponent` pone la clase `dynamic-<contentId>` en su propio elemento; ya no la pone el widget.
- `DynamicInyectCssService.injectCss` acepta un cuarto argumento `{ scopeClass }`. Se exportan `scopeCss` y `scopeClassFor`.
- Un `cssComponent` de una sección sin `contentId` no se inyecta.

### Corregido (lógica condicional)

- `showIf` / `hideIf` aceptan los literales `true`, `false` y `null` (`acepta === true`) y el prefijo `form.` (`form.tipo === 'premium'`). Antes lanzaban `SyntaxError` y el campo quedaba oculto para siempre; los ejemplos de la demo no funcionaban.
- Las expresiones ya no se ejecutan con `new Function`: se analizan con un evaluador propio de lenguaje reducido. Dejan de requerir `unsafe-eval` en la CSP del host y de poder acceder a `constructor` / `prototype`.
- Ocultar o mostrar un campo actualiza la validez del formulario, la del formulario padre y el estado de los botones. Antes un campo obligatorio oculto seguía bloqueando el envío, y el input rehabilitado podía quedar deshabilitado en el DOM.
- Un campo que el host deshabilitó por su cuenta, o con `alwaysDisabled`, ya no se rehabilita al mostrarse.
- La evaluación inicial es síncrona y ocurre cuando los controles ya tienen su valor inicial: el campo oculto nunca llega a pintarse, y una condición sobre un checkbox `checked` del HTML se evalúa bien.
- El contenedor a ocultar se elige por el ancestro más cercano y no por el primero de una lista fija, y nunca incluye a otros campos del formulario. Se dejan de considerar `.card-body`, `[id*="section"]`, `[id*="group"]` y `.row > div`, que podían ocultar la tarjeta entera.
- Un mapping sobre un elemento sin valor (p. ej. un contenedor) ya no vacía el control con cada tecla que se escribe en sus hijos.
- Los ejemplos de `examples/schemas` mapeaban el campo VIP a su contenedor en vez de al `<input>`.

### Corregido

- Los errores de validación ahora se muestran al escribir, al salir del campo y tras un intento de envío inválido. Antes los campos nunca se marcaban como `dirty` ni `touched`, así que no aparecía ningún error.
- Un campo con máscara ya no se trunca: no se le pone `maxlength` / `minlength` nativo, y el formato se conserva al salir del campo y al asignar el valor por código.
- El mensaje de `requiredTrue`, el del validador asíncrono y el motivo de rechazo de un archivo ahora se muestran. Hay mensajes por defecto para `maxlength`, `pattern`, `min` y `max`.
- `defaultValue: false` y `defaultValue: 0` se respetan (antes se convertían en `''`).
- Conectar un formulario ya no borra los valores que trae el HTML (`value`, `checked`, `<option selected>`).
- Un clic en un botón con `data-dynamic-action` dentro de un `<form>` ya no produce además un envío nativo (emitía `formSubmit` dos veces, con datos distintos).
- Un archivo rechazado ya no queda como valor del formulario, ni provoca un error interno al refrescar el input.
- `keyFilter` y las máscaras localizan el campo por `domSelector`; antes dependían de que el atributo `name` coincidiera con `controlName`.
- `keyFilter` ya no bloquea teclas de función, modificadores ni atajos con Alt.
- La posición del cursor al escribir en un campo con máscara.
- Los botones con condiciones basadas en `pristine` / `touched` (`formIsPristine`, `controlsDoNotMatch`…) se recalculan cuando cambia ese estado.

### Cambiado (afecta a quien consume el widget)

- Una expresión `showIf` / `hideIf` inválida deja el campo **visible** y se informa una vez en consola. Antes lo ocultaba en silencio.
- Un campo oculto por la lógica condicional queda deshabilitado y fuera de `value` del formulario, y al ocultarse o mostrarse emite eventos de estado (`controlChanged`, `formStateChanged`).
- `formSubmit` tiene una sola forma: `{ [formId]: { campo: valor } }`, con todos los formularios de la página. Antes, el envío con Enter emitía solo los campos de una sección, sin agrupar.
- `required` considera vacío un checkbox sin marcar.
- El motor añade `novalidate` a los `<form>` inyectados.
- `controlChanged` y `formStateChanged` también se emiten cuando cambia `touched` o `dirty`.
- Con máscara, el control guarda siempre el valor limpio, también en el evento `controlChanged`.

### Añadido

- Validador `matchControl` para comparar un campo con otro (confirmar contraseña).
- Atributo `aria-invalid` en los campos con error.
- Pruebas de integración del formulario con DOM real (`dynamic-viewer.integration.spec.ts`).

### Cambiado

- El repositorio se reorganiza en tres proyectos con dependencias en un solo sentido: `engine` (librería), `runtime` (custom element `<ux-driven-viewer>`) y `playground` (página host para desarrollo).
- La librería pasa a llamarse `@ux-driven-viewer/engine`, exporta su API en `public-api.ts` y vuelve a compilar con `ng build engine`.
- El modal, el loader, los toasts, la carga de contenido y los interceptores HTTP se mueven de la librería y de la app de demo al `runtime`.
- Cada proyecto compila en su propia carpeta de `dist/`.
- La documentación del README se divide por temas en `docs/`.
- Scripts de npm renombrados: `build:engine`, `build:runtime`, `test:engine`, `test:runtime`.

### Añadido

- Playground (`npm start`) con selector de ejemplos y visor de eventos.
- Esquemas de ejemplo en `examples/schemas` y un host mínimo en `examples/host-basico.html`.
- Licencia MIT, guía de contribución, política de seguridad y CI en GitHub Actions.
- `karma.conf.js` compartido, con un launcher headless apto para CI.

### Eliminado

- `bundle.js` y `demo.html`, obsoletos.
- `DynamicInteractionService` y `Builder.interface.ts`, que no se usaban.
- Dependencias sin uso: `@angular/router`, `crypto-js`, `concat`, `fs-extra`.

## [1.0.3]

Versión previa a la reorganización del repositorio.
