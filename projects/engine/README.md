# @ux-driven-viewer/engine

Motor de UI dinámica (Backend-Driven UI) para Angular. Renderiza HTML y CSS descritos en un JSON y los sincroniza con un `FormGroup` de Reactive Forms: validadores, máscaras, visibilidad condicional, estado de botones y acciones.

Es la librería que usa por dentro el custom element [`<ux-driven-viewer>`](../../README.md). Úsala directamente si tu aplicación ya es Angular y quieres controlar tú la carga de contenido.

## Uso

```ts
import { Component } from '@angular/core';
import { DynamicViewerComponent } from '@ux-driven-viewer/engine';

@Component({
  standalone: true,
  imports: [DynamicViewerComponent],
  template: `
    <app-dynamic-viewer
      [contentId]="section.id_DocumentHTMLCSS"
      [htmlContentString]="section.htmlComponent"
      [cssContentString]="section.cssComponent"
      [formId]="section.formId"
      [formMappings]="section.formMappings"
      [buttonConfigs]="section.buttonConfigs"
      (formSubmitted)="onSubmit($event)"
      (actionClicked)="onAction($event)">
    </app-dynamic-viewer>
  `,
})
export class MiPantallaComponent {
  section = /* un objeto del JSON, ver docs/schema.md */;
}
```

La aplicación debe proveer `HttpClient` (`provideHttpClient()`), que usan los validadores asíncronos.

## Configuración opcional

```ts
import { DYNAMIC_CONFIG } from '@ux-driven-viewer/engine';

providers: [
  {
    provide: DYNAMIC_CONFIG,
    useValue: { errorClassName: 'is-invalid', successClassName: 'is-valid' },
  },
];
```

## Documentación

- [Formato del JSON](../../docs/schema.md)
- [Validadores y controles](../../docs/validators.md)
- [Lógica condicional](../../docs/conditional-logic.md)
- [Estilos](../../docs/styling.md)
- [Seguridad](../../docs/security.md)

## Licencia

MIT
