import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ApiDrivenContent,
  DynamicClickPayload,
} from '../../interfaces/DynamicContent.interface';
import { CommonModule } from '@angular/common';
import { DynamicViewerComponent } from '../dynamic-viewer/dynamic-viewer.component';
import { finalize, Observable, take, tap } from 'rxjs';
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
  public staticContent$: Observable<ApiDrivenContent[]>;
  public dynamicContent$: Observable<ApiDrivenContent[]>;
  public showDynamicContent: boolean = true;
  public formGroup: FormGroup = new FormGroup({});
  public headersDataTable: string[] = [];
  public dataTable: any[] = [];
  constructor(
    private dws: DynamicViewerService,
    private readonly router: Router
  ) {
    this.staticContent$ = this.dws.staticContent$;
    this.dynamicContent$ = this.dws.dynamicContent$;
  }

  ngOnInit() {
    this.dws
      .loadInitialContent('plantillaModificada')
      .pipe(
        tap(() => (this.showDynamicContent = false)),
        finalize(() => (this.showDynamicContent = true))
      )
      .subscribe();
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
    const tableNameForm = this.userform;
    if (!tableNameForm) {
      console.error('El formulario no existe');
      return;
    } else {
      const nuevoNombre = tableNameForm.get('tableTitle')?.value;
      if (nuevoNombre) {
        this.dws.updateBindingValue(
          'demo-page-wrapper',
          '#table-title-display',
          nuevoNombre
        );
        this.userform.enable();
      }
    }
  }

  addNewUserToTable(newUserData: any) {
    this.dynamicContent$.pipe(take(1)).subscribe((currentState) => {
      const tableComponent = currentState.find(
        (c) => c.id_DocumentHTMLCSS === 'demo-page-wrapper'
      );
      const tableBinding = tableComponent?.tableBindings?.[0];

      if (tableBinding) {
        // Creamos el nuevo array de datos de forma inmutable
        const newData = [
          ...tableBinding.data,
          { id: Date.now() % 1000, ...newUserData },
        ];

        // Llamamos al nuevo y potente método del servicio
        this.dws.updateTable(
          tableComponent.id_DocumentHTMLCSS,
          '#main-user-table',
          {
            data: newData,
          }
        );

        // Reseteamos el formulario
        this.userform.controls['name'].setValue('');
        this.userform.controls['email'].setValue('');
        this.userform.controls['age'].setValue('');
      }
    });
  }

  addNewColumnToTable(newColumnData: any) {
    this.dynamicContent$.pipe(take(1)).subscribe((currentState) => {
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
      case 'navigate':
        this.dws
          .updateDynamicContent('menuPrincipal')
          .pipe(
            tap(() => (this.showDynamicContent = false)),
            finalize(() => (this.showDynamicContent = true))
          )
          .subscribe();
        break;
    }
  }

  private get userform(): FormGroup {
    return this.formGroup?.get('demoForms') as FormGroup;
  }

  private generarDatoParaTabla(): any {
    this.userform;
    console.log(this.userform);
    if (!this.userform) {
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
