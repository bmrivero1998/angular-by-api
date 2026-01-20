import { TestBed } from '@angular/core/testing';
import { DynamicViewerService } from './dynamic-viewer.service';
import { DynamicContentService } from './dynamic-content.service';
import { DomSanitizer } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { ApiDrivenContent } from '../interfaces/DynamicContent.interface';

describe('DynamicViewerService', () => {
  let service: DynamicViewerService;
  let dcsSpy: jasmine.SpyObj<DynamicContentService>;
  let sanitizerSpy: jasmine.SpyObj<DomSanitizer>;

  const mockStaticContent: ApiDrivenContent = {
    id_DocumentHTMLCSS: 'header',
    htmlComponent: '<header>Header</header>',
    renderType: 'static'
  };

  const mockDynamicContent: ApiDrivenContent = {
    id_DocumentHTMLCSS: 'form',
    htmlComponent: '<form>Form</form>',
    renderType: 'dynamic'
  };

  beforeEach(() => {
    dcsSpy = jasmine.createSpyObj('DynamicContentService', ['getContent']);
    sanitizerSpy = jasmine.createSpyObj('DomSanitizer', ['bypassSecurityTrustHtml']);

    // Mock simple para el sanitizer
    sanitizerSpy.bypassSecurityTrustHtml.and.callFake((val) => val);

    TestBed.configureTestingModule({
      providers: [
        DynamicViewerService,
        { provide: DynamicContentService, useValue: dcsSpy },
        { provide: DomSanitizer, useValue: sanitizerSpy }
      ]
    });
    service = TestBed.inject(DynamicViewerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- 1. Load Initial Content (API) ---
  describe('loadInitialContent', () => {
    it('should load content from API, parse it, and distribute to streams', (done) => {
      const apiResponse = [mockStaticContent, mockDynamicContent];
      dcsSpy.getContent.and.returnValue(of(apiResponse));

      service.loadInitialContent('page-1').subscribe(() => {
        expect(service.getStaticContentValue()).toEqual([mockStaticContent]);
        expect(service.getDynamicContentValue()).toEqual([mockDynamicContent]);
        done();
      });

      expect(dcsSpy.getContent).toHaveBeenCalledWith('page-1');
    });

    it('should handle API response wrapped in { content: string } JSON', (done) => {
      const wrappedResponse = {
        content: JSON.stringify([mockStaticContent])
      };
      dcsSpy.getContent.and.returnValue(of(wrappedResponse));

      service.loadInitialContent('page-wrapped').subscribe(() => {
        expect(service.getStaticContentValue().length).toBe(1);
        expect(service.getStaticContentValue()[0].id_DocumentHTMLCSS).toBe('header');
        done();
      });
    });

    it('should handle invalid JSON in API response gracefully', (done) => {
      const invalidResponse = { content: '{ invalid json ' };
      dcsSpy.getContent.and.returnValue(of(invalidResponse));

      spyOn(console, 'error'); // Supress console error

      service.loadInitialContent('page-error').subscribe(() => {
        expect(service.getStaticContentValue()).toEqual([]);
        expect(service.getDynamicContentValue()).toEqual([]);
        done();
      });
    });
  });

  // --- 2. Local Content Injection (setLocalContent) ---
  describe('setLocalContent', () => {
    it('should parse String JSON input', () => {
      const jsonString = JSON.stringify([mockStaticContent]);
      service.setLocalContent(jsonString);
      expect(service.getStaticContentValue().length).toBe(1);
    });

    it('should parse Object input with content property', () => {
      const jsonObj = { content: JSON.stringify([mockDynamicContent]) };
      service.setLocalContent(jsonObj);
      expect(service.getDynamicContentValue().length).toBe(1);
    });

    it('should parse Array input directly', () => {
      const arrayInput = [mockStaticContent, mockDynamicContent];
      service.setLocalContent(arrayInput);
      expect(service.getStaticContentValue().length).toBe(1);
      expect(service.getDynamicContentValue().length).toBe(1);
    });

    it('should handle parsing errors gracefully', () => {
      spyOn(console, 'error');
      service.setLocalContent('{ bad json }');
      expect(service.getStaticContentValue()).toEqual([]);
    });
  });

  // --- 3. Partial Updates (Update Dynamic/Static) ---
  describe('Partial Updates', () => {
    it('should update only dynamic content stream', (done) => {
      dcsSpy.getContent.and.returnValue(of([mockDynamicContent]));
      
      // Pre-set static content to ensure it's not cleared
      service.setLocalContent([mockStaticContent]);

      service.updateDynamicContent('api-dyn').subscribe(() => {
        expect(service.getDynamicContentValue().length).toBe(1);
        expect(service.getStaticContentValue().length).toBe(1); // Should remain
        done();
      });
    });

    it('should update only static content stream', (done) => {
      dcsSpy.getContent.and.returnValue(of([mockStaticContent]));
      
      service.updateStaticContent('api-static').subscribe(() => {
        expect(service.getStaticContentValue().length).toBe(1);
        done();
      });
    });
  });

  // --- 4. Table Processing & Updating ---
  describe('Table Operations', () => {
    const tableContent: ApiDrivenContent = {
      id_DocumentHTMLCSS: 'table-doc',
      htmlComponent: '<div id="myTable"></div>',
      renderType: 'dynamic',
      tableBindings: [{
        tableSelector: '#myTable',
        columns: [{ key: 'name', header: 'Name' }],
        data: [{ id: 1, name: 'John' }],
        actions: [{ label: 'Edit', action: 'edit' }]
      }]
    };

    it('should generate HTML table structure when processing content', () => {
      service.setLocalContent([tableContent]);
      const content = service.getDynamicContentValue()[0];
      
      expect(content.htmlComponent).toContain('<thead');
      expect(content.htmlComponent).toContain('<th>Name</th>');
      expect(content.htmlComponent).toContain('John');
      expect(content.htmlComponent).toContain('button'); // Action button
    });

    it('should update table data in Dynamic stream', () => {
      service.setLocalContent([tableContent]);

      service.updateTable('table-doc', '#myTable', {
        data: [{ id: 2, name: 'Jane' }]
      });

      const updatedContent = service.getDynamicContentValue()[0];
      expect(updatedContent.htmlComponent).toContain('Jane');
      expect(updatedContent.htmlComponent).not.toContain('John');
    });

    it('should update table data in Static stream', () => {
      const staticTableContent = { ...tableContent, renderType: 'static' as const };
      service.setLocalContent([staticTableContent]);

      service.updateTable('table-doc', '#myTable', {
        data: [{ id: 3, name: 'Bob' }]
      });

      const updatedContent = service.getStaticContentValue()[0];
      expect(updatedContent.htmlComponent).toContain('Bob');
    });
  });

  // --- 5. Data Binding Updates ---
  describe('Data Binding Updates', () => {
    const bindingContent: ApiDrivenContent = {
      id_DocumentHTMLCSS: 'binding-doc',
      htmlComponent: '<span id="name"></span>',
      renderType: 'static',
      dataBindings: [{ selector: '#name', value: 'Old' }]
    };

    it('should update binding value in Static stream', () => {
      service.setLocalContent([bindingContent]);

      service.updateBindingValue('binding-doc', '#name', 'New Value');

      const updated = service.getStaticContentValue()[0];
      expect(updated.dataBindings?.[0].value).toBe('New Value');
    });

    it('should update binding value in Dynamic stream', () => {
      const dynBindingContent = { ...bindingContent, renderType: 'dynamic' as const };
      service.setLocalContent([dynBindingContent]);

      service.updateBindingValue('binding-doc', '#name', 'Dynamic Val');

      const updated = service.getDynamicContentValue()[0];
      expect(updated.dataBindings?.[0].value).toBe('Dynamic Val');
    });
  });

  // --- 6. Utilities ---
  describe('Utilities', () => {
    it('should clear all content', () => {
      service.setLocalContent([mockStaticContent, mockDynamicContent]);
      service.clearContent();
      expect(service.getStaticContentValue()).toEqual([]);
      expect(service.getDynamicContentValue()).toEqual([]);
    });

    it('should processApiResponse and sanitize HTML', () => {
      const raw = [{ htmlComponent: '<script>alert()</script>', id_DocumentHTMLCSS: '1', renderType: 'static' }];
      const processed = service.processApiResponse(raw);
      
      expect(processed.length).toBe(1);
      expect(sanitizerSpy.bypassSecurityTrustHtml).toHaveBeenCalled();
    });

    it('should handle errors in processApiResponse', () => {
      spyOn(console, 'error');
      const res = service.processApiResponse(null); // Invalid input
      expect(res).toEqual([]);
    });
  });

  // --- 7. Robustness & Edge Cases (100% Branch Coverage) ---
  describe('Robustness & Edge Cases', () => {
    it('should do nothing if updating a table for a non-existent contentId', () => {
      service.setLocalContent([mockDynamicContent]);
      
      // Intentamos actualizar una tabla en un ID que no existe
      // Esto prueba el camino "if (index === -1) return false" en tryUpdateTableInStream
      service.updateTable('GHOST-ID', '#myTable', { data: [] });

      // Verificamos que nada cambió
      expect(service.getDynamicContentValue()[0].htmlComponent).toEqual('<form>Form</form>');
    });

    it('should do nothing if updating a binding for a non-existent contentId', () => {
      service.setLocalContent([mockDynamicContent]);

      // Prueba el camino "if (index === -1) return false" en tryUpdateBindingInStream
      service.updateBindingValue('GHOST-ID', '#sel', 'val');
      
      expect(service.getDynamicContentValue().length).toBe(1);
    });

    it('should handle table processing where selector is valid but HTML does not contain element', () => {
      const brokenTableContent: ApiDrivenContent = {
        id_DocumentHTMLCSS: 'broken-table',
        htmlComponent: '<div>No table here</div>', // HTML sin la tabla
        renderType: 'dynamic',
        tableBindings: [{
          tableSelector: '#missingTable', // Selector que no hace match
          columns: [],
          data: []
        }]
      };

      service.setLocalContent([brokenTableContent]);
      const content = service.getDynamicContentValue()[0];
      
      // Prueba el camino "if (tableElement) { ... }" cuando es falso
      // El HTML no debería haber cambiado
      expect(content.htmlComponent).toContain('No table here');
    });
  });
});