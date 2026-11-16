# Subida de archivos

Un campo `<input type="file">` se declara con `fileUploadConfig` en su `formMapping`. El motor valida lo que el usuario elige y, si indicas una `uploadUrl`, **lo sube por ti**, con avance, y deja el resultado en el formulario.

```json
{
  "controlName": "contrato",
  "domSelector": "#contrato",
  "errorDisplaySelector": "[data-error-for='contrato']",
  "validatorConfig": [{ "type": "required", "message": "Adjunta el contrato" }],
  "fileUploadConfig": {
    "accept": ".pdf,image/*",
    "maxSize": 2097152,
    "uploadUrl": "/api/archivos",
    "progressSelector": "#avance_contrato",
    "fileListSelector": "#lista_contrato"
  }
}
```

## Opciones

| Opción | Qué hace |
|---|---|
| `accept` | Tipos aceptados (`.pdf,.docx`, `image/*`). Se aplica al input y se valida al elegir. |
| `maxSize` | Tamaño máximo **por archivo**, en bytes. |
| `multiple` | Permite elegir varios archivos. |
| `maxCount` | Cantidad máxima de archivos (con `multiple`). |
| `uploadUrl` | Si se indica, los archivos válidos se **suben** a esta URL. Sin ella solo se valida y se avisa con `fileSelected`: la subida la haces tú. Ver [A dónde se puede subir](#a-dónde-se-puede-subir). |
| `method` | `POST` (por defecto) o `PUT`. |
| `fieldName` | Nombre del campo multipart que lleva el archivo. Por defecto `file`. |
| `progressSelector` | Elemento donde mostrar el avance: un `<progress>` (se le asigna `value`, con `max` 100) o cualquier otro (se escribe `45%`). |
| `fileListSelector` | Elemento donde listar los archivos elegidos con su tamaño: un `<ul>` / `<ol>` (un `<li>` por archivo) o cualquier otro (texto separado por comas). |

## Qué pasa al elegir un archivo

1. **Se valida** (tipo, tamaño, cantidad). Si algo no cumple, no se sube nada: el campo queda vacío y el motivo aparece en `errorDisplaySelector`.
2. Si es válido, el control toma el archivo, se lista en `fileListSelector` y se emite `fileSelected`.
3. Con `uploadUrl`, empieza la subida:
   - El campo queda **pendiente**: el formulario no es válido, no se puede enviar y los botones con `disableWhen: "formIsInvalid"` (o `formIsInvalidOrPristine`, `formIsPending`) se deshabilitan.
   - El avance se muestra en `progressSelector` y se emite `fileUploadChanged` (`status: "uploading"`).
4. **Al terminar bien**, el valor del campo pasa a ser **la respuesta del servidor** (el JSON ya interpretado; texto si no es JSON). Si la respuesta viene vacía, el valor es el nombre del archivo. Con `multiple`, es un arreglo en el mismo orden de los archivos. Se emite `fileUploadChanged` con `status: "done"` y `result`.
5. **Si falla**, el campo queda sin valor y con el error, el motivo se muestra en `errorDisplaySelector` (con el nombre del archivo) y el input se vacía para poder volver a elegir el mismo archivo. Se emite `fileUploadChanged` con `status: "error"`.

Elegir otros archivos mientras se sube **cancela** la subida anterior (se aborta la petición); destruir el formulario también.

El valor final es lo que recibe `formSubmit`:

```json
{ "formulario": { "contrato": { "id": 42, "name": "contrato.pdf", "url": "/archivos/42" } } }
```

Si el usuario envía el formulario mientras algo sube, **no se envía** y se informa por `errorOccurred` ("Hay operaciones en curso…").

## La petición

Una petición `multipart/form-data` **por archivo**, en paralelo, con el archivo en el campo `fieldName`. Con varios archivos, el avance es la suma de todos y, si uno falla, falla toda la subida y se cancelan las demás.

El motor **no añade cabeceras**. Para autenticar, usa un interceptor de `HttpClient` en tu aplicación (solo con la librería Angular; el widget sin Angular sube con las cookies del navegador).

### Mensajes de error

| Situación | Mensaje |
|---|---|
| Sin conexión | `No se pudo subir "a.pdf": sin conexión con el servidor.` |
| 413 | `El servidor rechazó "a.pdf": el archivo es demasiado grande.` |
| 415 | `El servidor rechazó "a.pdf": tipo de archivo no admitido.` |
| 401 / 403 | `No tienes permiso para subir "a.pdf".` |
| Otro código | `No se pudo subir "a.pdf" (HTTP 500).` |

## A dónde se puede subir

La `uploadUrl` viene en el JSON, así que **no se confía en ella** para mandar los archivos del usuario a cualquier sitio:

- Una URL **relativa** se resuelve contra `DYNAMIC_CONFIG.apiUrl` (en la librería Angular) o contra la página.
- Una URL **absoluta** solo se acepta si su origen es: el de la página, el de `api-url` del widget, el de `DYNAMIC_CONFIG.apiUrl`, o uno que declares explícitamente. Cualquier otro (`https://otro.com/...`, `//otro.com/...`, `javascript:`, `data:`) falla sin hacer ninguna petición, con el mensaje "La URL de subida apunta a un origen no permitido".

Para permitir otros orígenes (la misma regla vale para el autocompletado):

```html
<!-- widget -->
<ux-driven-viewer api-url="https://api.mi-sitio.com/pantalla"
                  allowed-origins="https://files.mi-sitio.com, https://cdn.mi-sitio.com"></ux-driven-viewer>
```

```ts
// librería Angular
{ provide: DYNAMIC_CONFIG, useValue: { apiUrl: 'https://api.mi-sitio.com', allowedOrigins: ['https://files.mi-sitio.com'] } }
```

## Eventos

```js
viewer.addEventListener('fileSelected', (e) => {
  // e.detail = { controlName, file, formId, isMultiple }   (también sin uploadUrl)
});

viewer.addEventListener('fileUploadChanged', (e) => {
  // e.detail = { controlName, formId, status: 'uploading' | 'done' | 'error', progress, result?, error? }
  // progress va de 0 a 100; solo se emite cuando cambia.
});
```

## Probarlo en el playground

```bash
npm run mock-api   # API de prueba en http://localhost:3001 (otra terminal)
npm start          # elige "Subida de archivos"
```

El servidor de prueba lee despacio para que el avance se vea. Un archivo con "fallo" en el nombre devuelve 500, con "grande" un 413 y con "vacio" una respuesta sin cuerpo.

---

[← Volver al índice de documentación](../README.md#documentación)
