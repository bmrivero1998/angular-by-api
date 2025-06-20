import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { DisplayableInAppComponent } from '../../app.component';
import {
  ApiDrivenContent,
  DynamicClickPayload,
} from '../../interfaces/DynamicContent.interface';
import { DynamicContentService } from '../../services/dynamic-content.service';
import { CommonModule } from '@angular/common';
import { DynamicViewerComponent } from '../dynamic-viewer/dynamic-viewer.component';

@Component({
  selector: 'app-pagina-principal',
  imports: [CommonModule, DynamicViewerComponent],
  templateUrl: './pagina-principal.component.html',
  styleUrl: './pagina-principal.component.css',
})
export class PaginaPrincipalComponent implements OnInit, OnDestroy {
  public displayableItems: DisplayableInAppComponent[] = [];
  public parentForm: FormGroup = new FormGroup({});

  constructor(
    private dcs: DynamicContentService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private readonly router: Router,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.loadDynamicContent();
  }

  private loadDynamicContent(): void {
    this.dcs.getContent('menuPrincipal').subscribe({
      next: (apiResponseData: ApiDrivenContent[]) => {
        if (!apiResponseData || apiResponseData.length === 0) {
          this.displayableItems = [];
          this.cdr.detectChanges();
          return;
        }

        this.displayableItems = apiResponseData.map((item) => ({
          ...item,
          safeHtml: this.sanitizer.bypassSecurityTrustHtml(
            item.htmlComponent || ''
          ),
        }));

        this.cdr.detectChanges();
      },
      error: (err) => {
        /* ... manejo de error ... */
      },
    });
  }
  handleViewerFormSubmission(payload: { formId?: string; data: any }): void {
    console.log(
      `AppComponent: Formulario ${payload.formId} enviado desde viewer con datos:`,
      payload.data
    );

    this.http
      .get('https://jsonplaceholder.typicode.com/todos/1?_delay=2000')
      .subscribe((response) => {
        console.log('Respuesta recibida:', response);
        this.router.navigate(['/principal']);
      });
  }

  handleViewerActionClick(payload: DynamicClickPayload): void {
    if (!payload || !payload.action) {
      console.warn('handleViewerActionClick: Payload o action no definidos');
      return;
    }
    if (payload.action === 'logout') {
      console.log('handleViewerActionClick: Acción de logout detectada');
      this.router.navigate(['/login']);
      return;
    }
    console.log(
      `AppComponent: Acción ${payload.action} clickeada desde viewer con datos:`,
      payload
    );
    this.realizarModificiacionDataBlindings();
  }

  realizarModificiacionDataBlindings(): void {
    const headerComponent = this.displayableItems.find(
      (c) => c.id_DocumentHTMLCSS === 'header-001'
    );

    if (headerComponent && headerComponent.dataBindings) {
      const userBinding = headerComponent.dataBindings.find(
        (b) => b.selector === 'username-display'
      );

      if (userBinding) {
        userBinding.value = this.generarNombreAleatorio();

        headerComponent.dataBindings = [...headerComponent.dataBindings];

        this.displayableItems = [...this.displayableItems];
      }
    }
  }

  /**
   * Genera un nombre y apellido aleatorio de una lista predefinida.
   * @returns Un string con un nombre completo, ej. "Sofía López".
   */
  generarNombreAleatorio(): string {
    const nombres = [
      'Carlos',
      'Ana',
      'Juan',
      'Sofía',
      'Luis',
      'María',
      'David',
      'Laura',
      'José',
      'Elena',
    ];
    const apellidos = [
      'García',
      'Rodríguez',
      'Martínez',
      'Hernández',
      'López',
      'González',
      'Pérez',
      'Sánchez',
    ];

    const nombreAleatorio = nombres[Math.floor(Math.random() * nombres.length)];
    const apellidoAleatorio =
      apellidos[Math.floor(Math.random() * apellidos.length)];

    return `${nombreAleatorio} ${apellidoAleatorio}`;
  }

  ngOnDestroy() {}
}
