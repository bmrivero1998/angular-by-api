import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { DisplayableInAppComponent } from '../../app.component';
import {
  ApiDrivenContent,
  DynamicClickPayload,
  DynamicContentPayload,
} from '../../interfaces/DynamicContent.interface';
import { DynamicContentService } from '../../services/dynamic-content.service';
import { CommonModule } from '@angular/common';
import { DynamicViewerComponent } from '../dynamic-viewer/dynamic-viewer.component';
import { Observable } from 'rxjs';
import { DynamicViewerService } from '../../services/dynamic-viewer.service';

@Component({
  selector: 'app-pagina-principal',
  imports: [CommonModule, DynamicViewerComponent],
  templateUrl: './pagina-principal.component.html',
  styleUrl: './pagina-principal.component.css',
})
export class PaginaPrincipalComponent implements OnInit, OnDestroy {
  public displayableItems$: Observable<ApiDrivenContent[]>;

  constructor(
    private dws: DynamicViewerService,
    private readonly router: Router
  ) {
    this.displayableItems$ = this.dws.dynamicContent$;
  }

  ngOnInit() {
    this.dws.loadInitialContent('menuPrincipal').subscribe();

    setInterval(() => this.actualizarNombreConServicio(), 3000);
  }

  actualizarNombreConServicio(): void {
    const nuevoNombre = this.generarNombreAleatorio();
    this.dws.updateBindingValue('header-001', '#username-display', nuevoNombre);
  }

  handleViewerActionClick(payload: DynamicClickPayload): void {
    if (payload.action === 'logout') {
      this.router.navigate(['/login']);
    } else if (payload.action === 'navigate') {
      this.router.navigate([payload.payload?.route]);
    }
  }

  generarNombreAleatorio(): string {
    const nombres = ['Carlos', 'Ana', 'Juan', 'Sofía'];
    const apellidos = ['García', 'Rodríguez', 'Martínez', 'López'];
    const nombreAleatorio = nombres[Math.floor(Math.random() * nombres.length)];
    const apellidoAleatorio =
      apellidos[Math.floor(Math.random() * apellidos.length)];
    return `${nombreAleatorio} ${apellidoAleatorio}`;
  }

  ngOnDestroy(): void {
    this.dws.clearContent();
  }
}
