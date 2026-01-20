import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalFrameComponent } from './modal-frame.component';
import { Component, Input } from '@angular/core';
import { FormControl, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ApiDrivenContent } from '../../../../projects/dynamic-forms-engine/src/lib/interfaces/DynamicContent.interface';
import { DynamicViewerComponent } from '../../../../projects/dynamic-forms-engine/src/lib/dynamic-viewer.component';

// 1. MOCK DEL COMPONENTE HIJO
// Se usa un mock para evitar cargar todas las dependencias del DynamicViewer real en este test
@Component({
  selector: 'app-dynamic-viewer',
  standalone: true,
  template: '<div>Mock Viewer</div>'
})
class MockDynamicViewerComponent {
  @Input() contentId: any;
  @Input() htmlContentString: any;
  @Input() cssContentString: any;
  @Input() formMappings: any;
  @Input() parentForm: any;
  @Input() dataBindings: any;
  @Input() buttonConfigs: any;
  @Input() formInitialData: any;
}

describe('ModalFrameComponent', () => {
  let component: ModalFrameComponent;
  let fixture: ComponentFixture<ModalFrameComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalFrameComponent, MockDynamicViewerComponent, ReactiveFormsModule] 
    })
    // Reemplazamos el DynamicViewerComponent real por el Mock dentro del componente standalone
    .overrideComponent(ModalFrameComponent, {
      remove: { imports: [DynamicViewerComponent] },
      add: { imports: [MockDynamicViewerComponent] }
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModalFrameComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- 1. INICIALIZACIÓN ---
  describe('Initialization (ngOnInit)', () => {
    it('should use default title if no config provided', () => {
      component.contentConfig = undefined as any;
      component.ngOnInit();
      expect(component.modalTitle).toBe('Información');
    });

    it('should use default title if dataBindings is empty or selector not found', () => {
      component.contentConfig = { 
        dataBindings: [{ selector: '#other', value: 'Ignored' }] 
      } as ApiDrivenContent;
      
      component.ngOnInit();
      expect(component.modalTitle).toBe('Información');
    });

    it('should update title from #modal-title-display binding', () => {
      component.contentConfig = { 
        dataBindings: [
          { selector: '#modal-title-display', value: 'Título Personalizado' }
        ] 
      } as ApiDrivenContent;
      
      component.ngOnInit();
      expect(component.modalTitle).toBe('Título Personalizado');
    });
  });

  // --- 2. CIERRE ---
  describe('Closing Logic', () => {
    it('should emit close event with result', () => {
      spyOn(component.close, 'emit');
      const result = { success: true };
      
      component.onClose(result);
      
      expect(component.close.emit).toHaveBeenCalledWith(result);
    });

    it('should emit close event with null if no result provided', () => {
      spyOn(component.close, 'emit');
      component.onClose();
      expect(component.close.emit).toHaveBeenCalledWith(null);
    });
  });

  // --- 3. SUBMIT DEL FORMULARIO HIJO ---
  describe('Form Submission from Child', () => {
    it('should normalize payload and emit triggerAction', () => {
      spyOn(component.triggerAction, 'emit');
      
      // 'as any' para permitir controles dinámicos en la prueba
      component.modalForm = new FormGroup({ testControl: new FormControl('testValue') }) as any;
      
      const childPayload = { formId: 'test', data: { extra: 123 } };
      
      component.onFormSubmit(childPayload);

      expect(component.triggerAction.emit).toHaveBeenCalledWith({
        action: 'submit',
        data: { extra: 123 },
        formValue: { testControl: 'testValue' },
        isValid: true 
      });
    });
  });

  // --- 4. MANEJO DE ACCIONES ---
  describe('Action Handling (onActionClick)', () => {
    
    // CASO A: Cerrar/Cancelar
    it('should call onClose when action implies closing', () => {
      spyOn(component, 'onClose'); 
      spyOn(component.triggerAction, 'emit'); 

      component.onActionClick({ action: 'close-modal' });
      expect(component.onClose).toHaveBeenCalled();
      expect(component.triggerAction.emit).not.toHaveBeenCalled();

      (component.onClose as jasmine.Spy).calls.reset();
      
      component.onActionClick({ action: 'btn-cancel' });
      expect(component.onClose).toHaveBeenCalled();
    });

    // CASO B: Submit Inválido
    it('should block emission and mark touched if form is invalid on submit/save', () => {
      spyOn(component.triggerAction, 'emit');
      
      component.modalForm = new FormGroup({
        reqField: new FormControl('', Validators.required)
      }) as any;

      component.onActionClick({ action: 'save-changes' });

      expect(component.modalForm.touched).toBeTrue(); 
      expect(component.triggerAction.emit).not.toHaveBeenCalled(); 
    });

    // CASO C: Submit Válido
    it('should emit triggerAction if form is valid on submit/save', () => {
      spyOn(component.triggerAction, 'emit');
      
      component.modalForm = new FormGroup({
        reqField: new FormControl('Valid', Validators.required)
      }) as any;

      const payload = { action: 'submit-data', data: { id: 1 } };
      component.onActionClick(payload);

      expect(component.triggerAction.emit).toHaveBeenCalledWith(jasmine.objectContaining({
        action: 'submit-data',
        isValid: true
      }));
    });

    // CASO D: Acción Genérica
    it('should emit triggerAction immediately for generic actions', () => {
      spyOn(component.triggerAction, 'emit');
      
      component.modalForm = new FormGroup({
        reqField: new FormControl('', Validators.required)
      }) as any;

      component.onActionClick({ action: 'print-report' });

      expect(component.triggerAction.emit).toHaveBeenCalledWith(jasmine.objectContaining({
        action: 'print-report'
      }));
    });

    // CASO E: Payload sin acción
    it('should handle payload with missing action property safely', () => {
      spyOn(component.triggerAction, 'emit');
      
      component.onActionClick({}); 

      expect(component.triggerAction.emit).toHaveBeenCalledWith(jasmine.objectContaining({
        action: undefined 
      }));
    });
  });
});