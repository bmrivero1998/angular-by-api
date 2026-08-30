# dynamic-forms-engine (librería interna)

Este `projects/` contiene el **motor** del widget `<ux-driven-viewer>`: toda la lógica que interpreta el JSON descrito en el [README raíz](../../README.md) y lo convierte en un formulario Angular real (render de HTML/CSS dinámico, sincronización con `FormGroup`, validadores, máscaras, navegación, modales, toasts, loader, etc.).

> Si buscas **cómo consumir** el widget ya compilado desde una página host, lee el [README raíz](../../README.md). Este documento es para quien trabaja **dentro** de la librería.

## Estructura de `src/lib`

```
src/lib/
├── dynamic-viewer.component.ts     Componente raíz (el custom element real detrás de <ux-driven-viewer>)
├── dynamic-config.token.ts         InjectionToken con la configuración inyectable del motor
├── public-api.ts                   Superficie pública exportada del paquete (actualmente vacía: el
│                                    consumo real es vía Angular Elements, no vía imports de TS)
├── constants/
│   └── dynamic-viewer.constants.ts Teclas permitidas y mapa de regex para `keyFilter`
├── helpers/
│   └── validators.helper.ts        Traduce `validatorConfig[].type` (string del JSON) a `ValidatorFn` de Angular
├── interceptors/
│   ├── html-sanitizer.interceptor.ts     Sanea el HTML crudo devuelto por la API con DOMPurify
│   ├── loader.interceptor.ts             Prende/apaga LoaderService por cada request HTTP
│   └── mock-error-handler.interceptor.ts Manejo de errores para el modo mock/demo
├── interfaces/
│   ├── Builder.interface.ts              Tipos del "builder" visual (StyleConfig, CssFramework, etc.)
│   └── DynamicContent.interface.ts       Forma del JSON del backend (ApiDrivenContent y afines)
├── models/
│   └── form-field-mapping.model.ts       FormFieldMapping, ButtonConfig, AsyncValidatorConfig
└── services/                             Ver tabla abajo
```

## Servicios (`src/lib/services`)

Cada responsabilidad que antes vivía como método privado del componente principal quedó separada en su propio servicio, testeable de forma aislada:

| Servicio | Responsabilidad |
|---|---|
| `DynamicContentService` | Trae el JSON del contenido (API real o mock) y lo normaliza a `ApiDrivenContent[]`. |
| `DynamicViewerService` | Orquesta el estado del contenido a mostrar (HTML/CSS activos, sanitización, tablas). |
| `DynamicGenerateHtmlService` | Genera/transforma fragmentos de HTML dinámico. |
| `FormDomSynchronizerService` | El corazón del motor de forms: crea el `FormGroup`, conecta cada `domSelector` con su `FormControl`, aplica validadores y limpia listeners al destruir. |
| `DynamicValidationService` | Construye validadores **asíncronos** (`AsyncValidatorFn`) que pegan a un endpoint configurado, con debounce. |
| `ButtonStateService` | Evalúa si un botón debe deshabilitarse según su `disableWhen` (puro: `FormGroup` + `ButtonConfig` → `boolean`). |
| `InputMaskingService` | Filtra teclas (`keyFilter`) y aplica máscaras de formato en vivo (`inputMask`). |
| `FileUploadService` | Valida archivos de inputs `type="file"` contra `fileUploadConfig` (tamaño, tipo, cantidad). |
| `DynamicInteractionService` | Bus de eventos (clicks, cambios de formulario) entre el DOM dinámico y el componente. |
| `DynamicInyectCssService` | Inyecta el `cssComponent` de cada sección como un `<style>` escopeado en el `<head>`. |
| `DynamicNavigationService` | Estado de menús/navegación dinámicos. |
| `DynamicStepperService` | Estado de wizards/steppers (declarado, aún no integrado en el flujo principal). |
| `DynamicComponentRegistryService` | Registro para montar componentes dinámicos (stepper, acordeón, tabs, modal, carrusel) por config. |
| `ModalServiceService` | Abre/cierra modales dinámicos reutilizando `DynamicContentService`. |
| `ToastService` | Bus de notificaciones tipo toast. |
| `LoaderService` | Contador de requests en vuelo para mostrar/ocultar el loader global. |
| `TimerManagerService` | Registro de `setTimeout`/`setInterval` por "scope" para limpiarlos todos en un solo `releaseAll(scopeId)`. |
| `ExternalLibsCleanupService` | Punto único para destruir instancias de librerías externas (ej. datepickers) antes de re-renderizar. |

## Acoplamiento conocido con la app de desarrollo

Dos archivos de la librería importan hoy directamente desde `src/app/` (la app host de `projects/../src`, ver [ARCHITECTURE.md](../../ARCHITECTURE.md)):

- `services/dynamic-content.service.ts` importa el mock `FORM_PRO_MOCK` desde `src/app/mocks/getContent.mock.ts`.
- `services/modal-service.service.ts` importa `ModalFrameComponent` desde `src/app/components/modal-frame/`.

Es deuda técnica preexistente (la librería no debería depender de la app que la consume para pruebas locales) documentada aquí para quien continúe el trabajo; no se modificó como parte de este reordenamiento porque implica tocar lógica, no solo organización.

## Comandos

```bash
ng build dynamic-forms-engine   # build de la librería como paquete Angular (dist/dynamic-forms-engine)
ng test dynamic-forms-engine    # unit tests (Karma/Jasmine) de los *.spec.ts en src/lib
```

Para el build real del widget embebible (`<ux-driven-viewer>` como custom element listo para un `<script>`), usa los scripts de la raíz del repo (`npm run build:pro` / `npm run build:widget`) — ver [README raíz, sección 11](../../README.md#11-build-interno-referencia-para-el-equipo).
