import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
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
import { Observable, take } from 'rxjs';
import { DynamicViewerService } from '../../services/dynamic-viewer.service';

@Component({
  selector: 'app-pagina-principal',
  imports: [CommonModule, DynamicViewerComponent],
  templateUrl: './pagina-principal.component.html',
  styleUrl: './pagina-principal.component.css',
})
export class PaginaPrincipalComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  public displayableItems$: Observable<ApiDrivenContent[]>;
  public formGroup: FormGroup = new FormGroup({});
  public headersDataTable: string[] = [];
  public dataTable: any[] = [];
  constructor(
    private dws: DynamicViewerService,
    private readonly router: Router
  ) {
    this.displayableItems$ = this.dws.dynamicContent$;
  }

  ngOnInit() {
    this.dws.loadInitialContent('menuPrincipal').subscribe();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      const addUserForm = this.formGroup.get('addUserForm');

      if (addUserForm) {
        console.log("Deshabilitando el formulario 'addUserForm' al inicio.");
        addUserForm.disable();
      }

      const addColumnForm = this.formGroup.get('addColumnForm');
      if (addColumnForm) {
        addColumnForm.disable();
      }
    }, 100);
  }

  actualizarNombreConServicio(): void {
    const tableNameForm = this.formGroup.get(
      'updateTableTitleForm'
    ) as FormGroup;
    if (!tableNameForm || !tableNameForm.valid) {
      console.error('El formulario no es válido o no existe');
      return;
    } else {
      const nuevoNombre = tableNameForm.get('tableTitle')?.value;
      if (nuevoNombre) {
        this.dws.updateBindingValue(
          'user-table-card',
          '#table-title-display',
          nuevoNombre
        );
        this.userform.enable();
      }
    }
  }

  addNewUserToTable(newUserData: any) {
    // Tomamos el estado actual UNA SOLA VEZ para trabajar sobre él
    this.displayableItems$.pipe(take(1)).subscribe((currentState) => {
      const tableComponent = currentState.find(
        (c) => c.id_DocumentHTMLCSS === 'user-table-card'
      );
      const tableBinding = tableComponent?.tableBindings?.[0];

      if (tableBinding) {
        // Creamos el nuevo array de datos de forma inmutable
        const newData = [
          ...tableBinding.data,
          { id: Date.now() % 1000, ...newUserData },
        ];

        // Llamamos al nuevo y potente método del servicio
        this.dws.updateTable('user-table-card', '#main-user-table', {
          data: newData,
        });

        // Reseteamos el formulario
        this.formGroup.get('addUserForm')?.reset();
      }
    });
  }

  addNewColumnToTable(newColumnData: any) {
    this.displayableItems$.pipe(take(1)).subscribe((currentState) => {
      const tableComponent = currentState.find(
        (c) => c.id_DocumentHTMLCSS === 'user-table-card'
      );
      const tableBinding = tableComponent?.tableBindings?.[0];

      if (tableBinding) {
        // Creamos la nueva definición de la columna
        const newColumn = {
          header: newColumnData.columnHeader,
          key: newColumnData.columnKey,
        };

        // Creamos el nuevo array de columnas de forma inmutable
        const newColumns = [...tableBinding.columns, newColumn];
        this.dws.updateTable('user-table-card', '#main-user-table', {
          columns: newColumns,
        });

        this.formGroup.get('addColumnForm')?.reset();
      }
    });
  }

  handleViewerActionClick(payload: DynamicClickPayload): void {
    console.log('handleViewerActionClick', payload);
    switch (payload.action) {
      case 'updateTableTitle':
        this.actualizarNombreConServicio();
        break;
      case 'addUser':
        const nuevoUsuario = this.generarDatoParaTabla();
        this.addNewUserToTable(nuevoUsuario);

        break;
    }
  }

  private get userform(): FormGroup {
    return this.formGroup?.get('addUserForm') as FormGroup;
  }

  private generarDatoParaTabla(): any {
    this.userform;
    if (!this.userform || !this.userform.valid) {
      console.error('El formulario no es válido o no existe');
      return;
    } else {
      const name = this.userform.get('name')?.value;
      const email = this.userform.get('email')?.value;
      const age = this.userform.get('age')?.value;

      if (name && email && age) {
        return { name, email, age };
      }
    }
  }

  ngOnDestroy(): void {
    this.dws.clearContent();
  }
}
