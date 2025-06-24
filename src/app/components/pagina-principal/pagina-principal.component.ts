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
import { ModalService } from '../../services/modal-service.service';
import { ToastService } from '../../services/toast.service';

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
  private userId: string = '0';

  constructor(
    private dws: DynamicViewerService,
    private readonly router: Router,
    private modalService: ModalService,
    private toastService: ToastService
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
  /**
   * Busca un usuario por su ID en las tablas de contenido estático y dinámico,
   * y lo elimina si lo encuentra.
   * @param userId - El ID del usuario a eliminar.
   */
  private removeUserFromTable(userId: string): void {
    if (!userId) {
      console.error('Se requiere un ID de usuario para eliminar.');
      return;
    }

    // Asumimos que estos métodos existen en tu servicio
    const staticState = this.dws.getStaticContentValue();
    const dynamicState = this.dws.getDynamicContentValue();

    // La función auxiliar ahora usa .filter() para eliminar correctamente
    const findAndDeleteInState = (
      state: ApiDrivenContent[],
      idToRemove: string
    ): boolean => {
      let itemFoundAndDeleted = false;
      for (const component of state) {
        if (!component.tableBindings) continue;

        for (const table of component.tableBindings) {
          // Verificamos si el usuario existe en esta tabla
          const userExists = table.data.some((row) => row.id == idToRemove);

          if (userExists) {
            // PUNTO CLAVE: Usamos .filter() para crear un nuevo array
            // que excluye al usuario con el ID coincidente.
            const newData = table.data.filter((row) => row.id != idToRemove);

            // Actualizamos la tabla con el nuevo array de datos (ya sin el usuario)
            this.dws.updateTable(
              component.id_DocumentHTMLCSS,
              table.tableSelector,
              { data: newData }
            );

            itemFoundAndDeleted = true;
            // Rompemos los bucles porque ya lo encontramos y eliminamos
            return itemFoundAndDeleted;
          }
        }
        if (itemFoundAndDeleted) break;
      }
      return itemFoundAndDeleted;
    };

    // Buscamos y eliminamos en el estado estático
    if (findAndDeleteInState(staticState, userId)) {
      this.toastService.show('Usuario eliminado con éxito.', {
        classname: 'bg-success text-light',
      });
      return;
    }

    // Si no, buscamos y eliminamos en el estado dinámico
    if (findAndDeleteInState(dynamicState, userId)) {
      this.toastService.show('Usuario eliminado con éxito.', {
        classname: 'bg-success text-light',
      });
      return;
    }

    // Si llegamos aquí, no se encontró al usuario
    console.error(
      `No se encontró un usuario con el ID ${userId} para eliminar.`
    );
  }

  /**
   * Busca un usuario por su ID en las tablas de contenido estático y dinámico,
   * y actualiza sus datos si lo encuentra.
   * @param updatedUserData - El objeto del usuario con los datos actualizados.
   * Debe contener una propiedad 'id'.
   */
  public updateUserInTable(updatedUserData: {
    id: any;
    [key: string]: any;
  }): void {
    if (!updatedUserData?.id) {
      console.error(
        'Los datos para actualizar están incompletos. Se requiere un ID.'
      );
      this.toastService.show(
        'Los datos para actualizar están incompletos. Se requiere un ID.',
        {
          classname: 'bg-danger text-light',
          delay: 10000,
        }
      );
      return;
    }
    const staticState = this.dws.getStaticContentValue();
    const dynamicState = this.dws.getDynamicContentValue();

    const findAndUpdateInState = (
      state: ApiDrivenContent[],
      userData: { id: any }
    ): boolean => {
      let itemFoundAndUpdated = false;

      for (const component of state) {
        if (!component.tableBindings) continue;
        for (const table of component.tableBindings) {
          const userIndex = table.data.findIndex(
            (row) => row.id == userData.id
          );

          if (userIndex !== -1) {
            const newData = table.data.map((row) => {
              if (row.id == userData.id) {
                return { ...row, ...userData };
              }
              return row;
            });
            this.dws.updateTable(
              component.id_DocumentHTMLCSS,
              table.tableSelector,
              {
                data: newData,
              }
            );

            itemFoundAndUpdated = true;
            return itemFoundAndUpdated;
          }
        }
        if (itemFoundAndUpdated) break;
      }
      return itemFoundAndUpdated;
    };

    if (findAndUpdateInState(staticState, updatedUserData)) {
      this.toastService.show('Usuario actualizado con éxito!', {
        classname: 'bg-success text-light',
        delay: 10000,
      });
      return;
    }

    if (findAndUpdateInState(dynamicState, updatedUserData)) {
      this.toastService.show('Usuario actualizado con éxito!', {
        classname: 'bg-success text-light',
        delay: 10000,
      });
      return;
    }

    console.error(
      `No se encontró un usuario con el ID ${updatedUserData.id} para actualizar.`
    );
  }

  addNewColumnToTable(newColumnData: any) {
    this.dynamicContent$.pipe(take(1)).subscribe((currentState) => {
      const tableComponent = currentState.find(
        (c) => c.id_DocumentHTMLCSS === 'user-table-card'
      );
      const tableBinding = tableComponent?.tableBindings?.[0];

      if (tableBinding) {
        const newColumn = {
          header: newColumnData.columnHeader,
          key: newColumnData.columnKey,
        };

        const newColumns = [...tableBinding.columns, newColumn];
        this.dws.updateTable('user-table-card', '#main-user-table', {
          columns: newColumns,
        });

        this.formGroup.get('addColumnForm')?.reset();
      }
    });
  }

  handleViewerActionClick(payload: DynamicClickPayload): void {
    switch (payload.action) {
      case 'edit-user':
        this.handleEditUser(payload);
        break;
      case 'delete-user':
        this.handleDeleteUser(payload);
        break;

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
      case 'logout':
        this.router.navigate(['/login']);
        break;
    }
  }

  private get userform(): FormGroup {
    return this.formGroup?.get('demoForms') as FormGroup;
  }

  private generarDatoParaTabla(): any {
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

  private openModal(
    modalId: string,
    data: { name: string; email: string }
  ): void {
    this.modalService
      .open('1', data)
      .pipe(take(1))
      .subscribe((result) => {
        if (result) {
          this.handleModalResult(result);
        } else {
        }
      });
  }

  /**
   * Maneja la acción de clic para un botón en una fila de la tabla
   * y extrae los datos de esa fila.
   * @param payload El objeto DynamicClickPayload recibido del evento.
   */
  private handleEditUser(payload: DynamicClickPayload): void {
    if (!payload.clickedElement) {
      console.error('El payload de la acción no contenía el elemento del DOM.');
      return;
    }

    const rowId = payload.clickedElement.dataset['rowId'];

    if (!rowId) {
      console.error('El botón pulsado no contenía el atributo data-row-id.');
      return;
    }

    this.dynamicContent$.pipe(take(1)).subscribe((currentState) => {
      const tableComponent = currentState.find(
        (c) => c.id_DocumentHTMLCSS === 'center-content-001'
      );
      const tableBinding = tableComponent?.tableBindings;
      tableBinding?.forEach((item) => {
        if (item?.data) {
          const rowData = item.data.find((row) => row.id == rowId);
          this.userId = rowId;
          if (rowData) {
            this.openModal('modalAddUser', rowData);
          } else {
            console.error(
              `No se encontraron datos para la fila con ID: ${rowId} en el estado actual.`
            );
          }
        }
      });
    });
  }

  private handleDeleteUser(payload: DynamicClickPayload): void {
    if (!payload.clickedElement) {
      console.error('El payload de la acción no contenía el elemento del DOM.');
      return;
    }

    const rowId = payload.clickedElement.dataset['rowId'];

    if (!rowId) {
      console.error('El botón pulsado no contenía el atributo data-row-id.');
      return;
    }

    this.dynamicContent$.pipe(take(1)).subscribe((currentState) => {
      const tableComponent = currentState.find(
        (c) => c.id_DocumentHTMLCSS === 'center-content-001'
      );
      const tableBinding = tableComponent?.tableBindings;
      tableBinding?.forEach((item) => {
        if (item?.data) {
          const rowData = item.data.find((row) => row.id == rowId);
          this.userId = rowId;
          if (rowData) {
            this.removeUserFromTable(rowId);
          } else {
            console.error(
              `No se encontraron datos para la fila con ID: ${rowId} en el estado actual.`
            );
          }
        }
      });
    });
  }

  private handleModalResult(result: any): void {
    const formData = result.genericForm;

    if (formData) {
      const nombreUsuario = formData.name;
      const correoUsuario = formData.email;

      const nuevoUsuario = {
        id: this.userId,
        name: nombreUsuario,
        email: correoUsuario,
      };

      this.updateUserInTable(nuevoUsuario);
    }
  }
  ngOnDestroy(): void {}
}
