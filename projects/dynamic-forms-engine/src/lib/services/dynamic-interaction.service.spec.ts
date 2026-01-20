import { TestBed } from '@angular/core/testing';
import { DynamicInteractionService } from './dynamic-interaction.service';
import { DynamicClickPayload, DynamicFormDataPayload } from '../interfaces/DynamicContent.interface';

describe('DynamicInteractionService', () => {
  let service: DynamicInteractionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DynamicInteractionService]
    });
    service = TestBed.inject(DynamicInteractionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- 1. Eventos de Click (reportClick) ---
  it('should emit click payload when reportClick is called', (done) => {
    // Ajustado a la interfaz DynamicClickPayload
    const mockPayload: DynamicClickPayload = {
      action: 'test-action',
      sourceId: 'btn-1',
      payload: { foo: 'bar' }, // Antes era 'context', ahora 'payload' según tu interfaz
      formIsValid: true,       // Propiedad válida según tu interfaz
      formErrors: null
    };

    service.clickAction$.subscribe((payload) => {
      expect(payload).toEqual(mockPayload);
      done();
    });

    service.reportClick(mockPayload);
  });

  // --- 2. Eventos de Submit (reportFormSubmit) ---
  it('should emit form submit payload when reportFormSubmit is called', (done) => {
    // Ajustado a la interfaz DynamicFormDataPayload
    const mockPayload: DynamicFormDataPayload = {
      sourceId: 'form-source-1', // Antes formId, ahora sourceId
      formName: 'userForm',
      data: { name: 'John' }
      // 'isValid' removido porque no existe en DynamicFormDataPayload
    };

    service.formDataSubmitted$.subscribe((payload) => {
      expect(payload).toEqual(mockPayload);
      done();
    });

    service.reportFormSubmit(mockPayload);
  });

  // --- 3. Extracción de Datos (extractFormData) ---
  describe('extractFormData', () => {
    
    it('should extract simple key-value pairs from form elements', () => {
      // Crear formulario simulado en el DOM
      const form = document.createElement('form');
      
      const inputName = document.createElement('input');
      inputName.name = 'username';
      inputName.value = 'admin';
      form.appendChild(inputName);

      const inputEmail = document.createElement('input');
      inputEmail.name = 'email';
      inputEmail.value = 'test@test.com';
      form.appendChild(inputEmail);

      const result = service.extractFormData(form);

      expect(result).toEqual({
        username: 'admin',
        email: 'test@test.com'
      });
    });

    it('should handle multiple values for the same key (arrays)', () => {
      const form = document.createElement('form');
      
      // Checkbox 1
      const check1 = document.createElement('input');
      check1.type = 'checkbox';
      check1.name = 'permissions';
      check1.value = 'read';
      check1.checked = true; // Importante para FormData
      form.appendChild(check1);

      // Checkbox 2
      const check2 = document.createElement('input');
      check2.type = 'checkbox';
      check2.name = 'permissions';
      check2.value = 'write';
      check2.checked = true; 
      form.appendChild(check2);

      // Input simple para verificar mezcla
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'id';
      hidden.value = '123';
      form.appendChild(hidden);

      const result = service.extractFormData(form);

      // Verificamos que se cree un array para claves duplicadas
      expect(result['permissions']).toBeInstanceOf(Array);
      expect(result['permissions']).toContain('read');
      expect(result['permissions']).toContain('write');
      expect(result['id']).toBe('123');
    });

    it('should extract duplicate keys as arrays even if created sequentially', () => {
      const form = document.createElement('form');
      
      // Simulamos inputs con el mismo nombre (ej. input arrays)
      const input1 = document.createElement('input');
      input1.name = 'tags';
      input1.value = 'angular';
      form.appendChild(input1);

      const input2 = document.createElement('input');
      input2.name = 'tags';
      input2.value = 'react';
      form.appendChild(input2);

      const result = service.extractFormData(form);

      expect(result).toEqual({
        tags: ['angular', 'react']
      });
    });
  });
});