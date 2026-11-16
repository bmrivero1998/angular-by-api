# Changelog

Los cambios relevantes de este proyecto se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

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
