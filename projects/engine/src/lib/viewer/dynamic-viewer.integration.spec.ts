import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DynamicViewerComponent } from './dynamic-viewer.component';
import { FormFieldMapping, ButtonConfig } from '../models/form-field-mapping.model';

/**
 * Pruebas de integración: el componente con TODOS sus servicios reales y un
 * DOM real, manejado como lo haría un usuario (escribir, salir del campo,
 * enviar). Los specs unitarios de cada servicio usan mocks y no detectan
 * fallos en la costura entre ellos; estos sí.
 */
describe('DynamicViewerComponent (integración de formularios)', () => {
  let fixture: ComponentFixture<DynamicViewerComponent>;
  let component: DynamicViewerComponent;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DynamicViewerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => fixture?.destroy());

  function render(html: string, formMappings: FormFieldMapping[], buttonConfigs?: ButtonConfig[]): void {
    fixture = TestBed.createComponent(DynamicViewerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('contentId', 'test');
    fixture.componentRef.setInput('formId', 'f1');
    fixture.componentRef.setInput('formMappings', formMappings);
    if (buttonConfigs) fixture.componentRef.setInput('buttonConfigs', buttonConfigs);
    fixture.componentRef.setInput('htmlContentString', html);
    fixture.detectChanges();
    host = fixture.nativeElement;
  }

  const el = <T extends HTMLElement = HTMLInputElement>(selector: string) => host.querySelector(selector) as T;

  function type(selector: string, value: string): void {
    const input = el(selector);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function blur(selector: string): void {
    el(selector).dispatchEvent(new Event('blur'));
  }

  function toggle(selector: string, checked: boolean): void {
    const input = el(selector);
    input.checked = checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const EMAIL_HTML = `
    <form>
      <input id="email" class="form-control">
      <div class="invalid-feedback" data-error-for="email"></div>
      <button id="send" type="submit">Enviar</button>
    </form>`;

  const EMAIL_MAPPING: FormFieldMapping = {
    controlName: 'email',
    domSelector: '#email',
    errorDisplaySelector: "[data-error-for='email']",
    validatorConfig: [
      { type: 'required', message: 'El correo es obligatorio' },
      { type: 'email', message: 'Correo inválido' },
    ],
  };

  describe('feedback de validación', () => {
    it('no muestra errores en un formulario recién cargado', () => {
      render(EMAIL_HTML, [EMAIL_MAPPING]);

      expect(el('#email').classList).not.toContain('is-invalid');
      expect(el("[data-error-for='email']").textContent).toBe('');
    });

    it('muestra el error y su mensaje en cuanto el usuario escribe un valor inválido', () => {
      render(EMAIL_HTML, [EMAIL_MAPPING]);

      type('#email', 'abc');

      expect(component.dynamicForm.get('email')!.dirty).toBeTrue();
      expect(el('#email').classList).toContain('is-invalid');
      expect(el('#email').getAttribute('aria-invalid')).toBe('true');
      expect(el("[data-error-for='email']").textContent).toBe('Correo inválido');
    });

    it('pasa a válido al corregir el valor', () => {
      render(EMAIL_HTML, [EMAIL_MAPPING]);

      type('#email', 'abc');
      type('#email', 'ana@correo.com');

      expect(el('#email').classList).toContain('is-valid');
      expect(el('#email').classList).not.toContain('is-invalid');
      expect(el('#email').hasAttribute('aria-invalid')).toBeFalse();
      expect(el("[data-error-for='email']").textContent).toBe('');
    });

    it('muestra el error de un campo obligatorio al salir de él sin escribir', () => {
      render(EMAIL_HTML, [EMAIL_MAPPING]);

      blur('#email');

      expect(component.dynamicForm.get('email')!.touched).toBeTrue();
      expect(el('#email').classList).toContain('is-invalid');
      expect(el("[data-error-for='email']").textContent).toBe('El correo es obligatorio');
    });

    it('pinta todos los errores tras un intento de submit inválido', () => {
      render(EMAIL_HTML, [EMAIL_MAPPING]);
      const submitted = jasmine.createSpy('formSubmitted');
      component.formSubmitted.subscribe(submitted);

      component.triggerSubmit();

      expect(submitted).not.toHaveBeenCalled();
      expect(el('#email').classList).toContain('is-invalid');
      expect(el("[data-error-for='email']").textContent).toBe('El correo es obligatorio');
    });

    it('pinta los errores cuando el host marca el formulario padre como touched', () => {
      render(EMAIL_HTML, [EMAIL_MAPPING]);

      component.dynamicForm.markAllAsTouched();

      expect(el('#email').classList).toContain('is-invalid');
    });

    it('emite controlValueChange con dirty/touched actualizados', () => {
      render(EMAIL_HTML, [EMAIL_MAPPING]);
      const changes: Array<{ dirty: boolean; touched: boolean }> = [];
      component.controlValueChange.subscribe((c) => changes.push({ dirty: c.dirty, touched: c.touched }));

      type('#email', 'a');
      blur('#email');

      expect(changes[changes.length - 1]).toEqual({ dirty: true, touched: true });
    });
  });

  describe('mensajes de error', () => {
    it('usa el mensaje de requiredTrue aunque Angular reporte la clave "required"', () => {
      render(
        `<input id="acepta" type="checkbox"><div data-error-for="acepta"></div>`,
        [
          {
            controlName: 'acepta',
            domSelector: '#acepta',
            errorDisplaySelector: "[data-error-for='acepta']",
            validatorConfig: [{ type: 'requiredTrue', message: 'Debes aceptar los términos' }],
          },
        ],
      );

      toggle('#acepta', true);
      toggle('#acepta', false);

      expect(el("[data-error-for='acepta']").textContent).toBe('Debes aceptar los términos');
    });

    it('usa un mensaje por defecto específico cuando el validador no trae mensaje', () => {
      render(`<input id="n"><div data-error-for="n"></div>`, [
        {
          controlName: 'n',
          domSelector: '#n',
          errorDisplaySelector: "[data-error-for='n']",
          validatorConfig: [{ type: 'maxLength', value: 2, message: '' }],
        },
      ]);

      type('#n', 'abcd');

      expect(el("[data-error-for='n']").textContent).toBe('El texto es muy largo.');
    });

    it('muestra el mensaje del validador asíncrono', fakeAsync(() => {
      render(`<input id="user"><div data-error-for="user"></div>`, [
        {
          controlName: 'user',
          domSelector: '#user',
          errorDisplaySelector: "[data-error-for='user']",
          asyncValidator: {
            endpoint: '/check-username',
            method: 'GET',
            errorKey: 'userTaken',
            message: 'Ese nombre ya está en uso',
            debounceTime: 10,
          },
        },
      ]);

      type('#user', 'ana');
      tick(10);
      TestBed.inject(HttpTestingController)
        .expectOne((req) => req.url === '/check-username')
        .flush({ isAvailable: false });

      expect(el('#user').classList).toContain('is-invalid');
      expect(el("[data-error-for='user']").textContent).toBe('Ese nombre ya está en uso');
    }));

    it('muestra el motivo cuando se rechaza un archivo', () => {
      render(`<input id="doc" type="file"><div data-error-for="doc"></div>`, [
        {
          controlName: 'doc',
          domSelector: '#doc',
          errorDisplaySelector: "[data-error-for='doc']",
          fileUploadConfig: { maxSize: 10 },
        },
      ]);
      const transfer = new DataTransfer();
      transfer.items.add(new File(['x'.repeat(50)], 'grande.pdf', { type: 'application/pdf' }));
      el('#doc').files = transfer.files;

      el('#doc').dispatchEvent(new Event('change', { bubbles: true }));

      expect(el("[data-error-for='doc']").textContent).toContain('grande.pdf excede el tamaño máximo');
      expect(component.dynamicForm.get('doc')!.value).toBeNull();
    });
  });

  describe('máscara', () => {
    const PHONE_MAPPING: FormFieldMapping = {
      controlName: 'tel',
      domSelector: '#tel',
      inputMask: '999-999-9999',
      validatorConfig: [
        { type: 'minLength', value: 10, message: 'Faltan dígitos' },
        { type: 'maxLength', value: 10, message: 'Sobran dígitos' },
      ],
    };

    it('formatea el input completo y guarda en el control el valor limpio', () => {
      render(`<input id="tel">`, [PHONE_MAPPING]);

      type('#tel', '5512345678');

      expect(el('#tel').value).toBe('551-234-5678');
      expect(component.dynamicForm.get('tel')!.value).toBe('5512345678');
      expect(component.dynamicForm.get('tel')!.valid).toBeTrue();
    });

    it('no pone maxlength/minlength nativos, que truncarían el valor formateado', () => {
      render(`<input id="tel">`, [PHONE_MAPPING]);

      expect(el('#tel').hasAttribute('maxlength')).toBeFalse();
      expect(el('#tel').hasAttribute('minlength')).toBeFalse();
    });

    it('conserva el formato al salir del campo', () => {
      render(`<input id="tel">`, [PHONE_MAPPING]);

      type('#tel', '5512345678');
      blur('#tel');

      expect(el('#tel').value).toBe('551-234-5678');
    });

    it('muestra formateado un valor puesto por código', () => {
      render(`<input id="tel">`, [PHONE_MAPPING]);

      component.setFormValue('tel', '5598765432');

      expect(el('#tel').value).toBe('559-876-5432');
    });

    it('valida sobre el valor limpio', () => {
      render(`<input id="tel">`, [PHONE_MAPPING]);

      type('#tel', '5512');

      expect(component.dynamicForm.get('tel')!.errors?.['minlength']).toBeDefined();
      expect(el('#tel').classList).toContain('is-invalid');
    });
  });

  describe('matchControl', () => {
    const HTML = `<input id="pass" type="password"><input id="pass2" type="password"><div data-error-for="pass2"></div>`;
    const MAPPINGS: FormFieldMapping[] = [
      { controlName: 'pass', domSelector: '#pass' },
      {
        controlName: 'pass2',
        domSelector: '#pass2',
        errorDisplaySelector: "[data-error-for='pass2']",
        validatorConfig: [{ type: 'matchControl', value: 'pass', message: 'Las contraseñas no coinciden' }],
      },
    ];

    it('marca el error cuando la confirmación no coincide', () => {
      render(HTML, MAPPINGS);

      type('#pass', 'secreto');
      type('#pass2', 'otra');

      expect(el('#pass2').classList).toContain('is-invalid');
      expect(el("[data-error-for='pass2']").textContent).toBe('Las contraseñas no coinciden');
    });

    it('quita el error al corregir el campo ORIGINAL, no solo la confirmación', () => {
      render(HTML, MAPPINGS);
      type('#pass', 'secreto');
      type('#pass2', 'otra');

      type('#pass', 'otra');

      expect(component.dynamicForm.get('pass2')!.valid).toBeTrue();
      expect(el('#pass2').classList).not.toContain('is-invalid');
    });

    it('avisa si el control de referencia no existe', () => {
      const errors: string[] = [];
      fixture = TestBed.createComponent(DynamicViewerComponent);
      fixture.componentInstance.componentError.subscribe((e) => errors.push(e));
      fixture.componentRef.setInput('contentId', 'test');
      fixture.componentRef.setInput('formMappings', [
        { controlName: 'pass2', domSelector: '#pass2', validatorConfig: [{ type: 'matchControl', value: 'noExiste', message: '' }] },
      ]);
      fixture.componentRef.setInput('htmlContentString', `<input id="pass2">`);
      fixture.detectChanges();

      expect(errors.some((e) => e.includes('matchControl') && e.includes('noExiste'))).toBeTrue();
    });
  });

  describe('valores iniciales', () => {
    it('respeta defaultValue false y 0 en vez de convertirlos en cadena vacía', () => {
      render(`<input id="a" type="checkbox"><input id="b" type="number">`, [
        { controlName: 'a', domSelector: '#a', defaultValue: false },
        { controlName: 'b', domSelector: '#b', defaultValue: 0 },
      ]);

      expect(component.getFormValues()).toEqual({ a: false, b: 0 });
    });

    it('adopta lo que ya trae el HTML cuando no hay defaultValue', () => {
      render(
        `<input id="nombre" value="Ana">
         <input id="acepta" type="checkbox" checked>
         <input id="noAcepta" type="checkbox">
         <select id="plan"><option value="basico">Básico</option><option value="pro" selected>Pro</option></select>
         <input type="radio" name="color" value="rojo"><input type="radio" name="color" value="azul" checked>`,
        [
          { controlName: 'nombre', domSelector: '#nombre' },
          { controlName: 'acepta', domSelector: '#acepta' },
          { controlName: 'noAcepta', domSelector: '#noAcepta' },
          { controlName: 'plan', domSelector: '#plan' },
          { controlName: 'color', domSelector: 'input[name="color"]' },
        ],
      );

      expect(component.getFormValues()).toEqual({
        nombre: 'Ana',
        acepta: true,
        noAcepta: false,
        plan: 'pro',
        color: 'azul',
      });
      expect(el<HTMLSelectElement>('#plan').value).toBe('pro');
      expect(component.dynamicForm.pristine).toBeTrue();
    });

    it('defaultValue y formInitialData ganan sobre el valor del HTML', () => {
      fixture = TestBed.createComponent(DynamicViewerComponent);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('contentId', 'test');
      fixture.componentRef.setInput('formInitialData', { ciudad: 'Puebla' });
      fixture.componentRef.setInput('formMappings', [
        { controlName: 'nombre', domSelector: '#nombre', defaultValue: 'Luis' },
        { controlName: 'ciudad', domSelector: '#ciudad' },
      ]);
      fixture.componentRef.setInput('htmlContentString', `<input id="nombre" value="Ana"><input id="ciudad" value="CDMX">`);
      fixture.detectChanges();
      host = fixture.nativeElement;

      expect(component.getFormValues()).toEqual({ nombre: 'Luis', ciudad: 'Puebla' });
      expect(el('#nombre').value).toBe('Luis');
      expect(el('#ciudad').value).toBe('Puebla');
    });

    it('un checkbox obligatorio sin marcar es inválido desde el inicio y tras desmarcarlo', () => {
      render(`<input id="acepta" type="checkbox">`, [
        { controlName: 'acepta', domSelector: '#acepta', validatorConfig: [{ type: 'required', message: '' }] },
      ]);
      const control = component.dynamicForm.get('acepta')!;

      expect(control.invalid).toBeTrue();
      toggle('#acepta', true);
      expect(control.valid).toBeTrue();
      toggle('#acepta', false);
      expect(control.invalid).toBeTrue();
    });
  });

  describe('botones y submit', () => {
    const BUTTONS: ButtonConfig[] = [{ selector: '#send', disableWhen: 'formIsInvalid' }];

    it('habilita el botón cuando el formulario pasa a ser válido', () => {
      render(EMAIL_HTML, [EMAIL_MAPPING], BUTTONS);
      expect(el<HTMLButtonElement>('#send').disabled).toBeTrue();

      type('#email', 'ana@correo.com');

      expect(el<HTMLButtonElement>('#send').disabled).toBeFalse();
    });

    it('recalcula botones que dependen de pristine cuando el usuario escribe', () => {
      render(EMAIL_HTML, [{ controlName: 'email', domSelector: '#email' }], [
        { selector: '#send', disableWhen: 'formIsPristine' },
      ]);
      expect(el<HTMLButtonElement>('#send').disabled).toBeTrue();

      type('#email', 'a');

      expect(el<HTMLButtonElement>('#send').disabled).toBeFalse();
    });

    it('recalcula controlsDoNotMatch cuando se toca el segundo campo', () => {
      render(
        `<input id="p1"><input id="p2"><button id="send" type="button">Enviar</button>`,
        [
          { controlName: 'p1', domSelector: '#p1' },
          { controlName: 'p2', domSelector: '#p2' },
        ],
        [{ selector: '#send', disableWhen: 'controlsDoNotMatch:p1,p2' }],
      );

      type('#p1', 'a');
      blur('#p1');
      type('#p2', 'b');
      expect(el<HTMLButtonElement>('#send').disabled).toBeFalse(); // p2 aún no se tocó

      blur('#p2');
      expect(el<HTMLButtonElement>('#send').disabled).toBeTrue();
    });

    it('emite formSubmitted una vez con un submit nativo válido', () => {
      render(EMAIL_HTML, [EMAIL_MAPPING]);
      const submitted = jasmine.createSpy('formSubmitted');
      component.formSubmitted.subscribe(submitted);
      type('#email', 'ana@correo.com');

      el<HTMLButtonElement>('#send').click();

      expect(submitted).toHaveBeenCalledOnceWith({ formId: 'f1', data: { email: 'ana@correo.com' } });
    });

    it('desactiva la validación nativa del navegador para que el submit inválido llegue al motor', () => {
      render(EMAIL_HTML, [EMAIL_MAPPING]);

      el<HTMLButtonElement>('#send').click();

      expect(el<HTMLFormElement>('form').noValidate).toBeTrue();
      expect(el('#email').classList).toContain('is-invalid');
    });

    it('un botón con data-dynamic-action dentro del form emite solo la acción, no un submit', () => {
      render(
        `<form><input id="email"><button id="act" data-dynamic-action="submit_form">Enviar</button></form>`,
        [{ controlName: 'email', domSelector: '#email' }],
      );
      const submitted = jasmine.createSpy('formSubmitted');
      const actions: string[] = [];
      component.formSubmitted.subscribe(submitted);
      component.actionClicked.subscribe((p) => actions.push(p.action));

      el<HTMLButtonElement>('#act').click();

      expect(actions).toEqual(['submit_form']);
      expect(submitted).not.toHaveBeenCalled();
    });
  });

  describe('filtro de teclas', () => {
    it('funciona aunque el name del HTML no coincida con controlName', () => {
      render(`<input id="el_1" name="otro">`, [{ controlName: 'edad', domSelector: '#el_1', keyFilter: 'int' }]);

      const event = new KeyboardEvent('keydown', { key: 'x', cancelable: true, bubbles: true });
      el('#el_1').dispatchEvent(event);

      expect(event.defaultPrevented).toBeTrue();
    });
  });

  describe('lógica condicional', () => {
    const VIP_HTML = `
      <form>
        <div class="mb-3"><input id="tieneVip" type="checkbox"></div>
        <div class="mb-3" id="vipWrap"><input id="vip" class="form-control"></div>
        <button id="send" type="submit">Enviar</button>
      </form>`;
    const VIP_MAPPINGS: FormFieldMapping[] = [
      { controlName: 'tieneVip', domSelector: '#tieneVip', defaultValue: false },
      {
        controlName: 'vip',
        domSelector: '#vip',
        showIf: 'form.tieneVip === true',
        validatorConfig: [{ type: 'required', message: 'El código VIP es obligatorio' }],
      },
    ];
    const vipWrap = () => el<HTMLElement>('#vipWrap');

    it('el campo condicional nace oculto en el primer pintado, sin esperar a un timer', () => {
      render(VIP_HTML, VIP_MAPPINGS);

      expect(vipWrap().style.display).toBe('none');
      expect(vipWrap().getAttribute('aria-hidden')).toBe('true');
    });

    it('lo muestra al marcar el checkbox, con el input habilitado, y lo oculta al desmarcar', fakeAsync(() => {
      render(VIP_HTML, VIP_MAPPINGS);

      toggle('#tieneVip', true);
      tick(60);
      expect(vipWrap().style.display).not.toBe('none');
      expect(el('#vip').disabled).toBeFalse();

      toggle('#tieneVip', false);
      tick(60);
      expect(vipWrap().style.display).toBe('none');
      expect(el('#vip').disabled).toBeTrue();
    }));

    it('un campo obligatorio oculto no bloquea el envío, y al mostrarse sí', fakeAsync(() => {
      render(VIP_HTML, VIP_MAPPINGS);
      const submitted = jasmine.createSpy('formSubmitted');
      component.formSubmitted.subscribe(submitted);

      component.triggerSubmit();
      expect(submitted).toHaveBeenCalledTimes(1);

      toggle('#tieneVip', true);
      tick(60);
      component.triggerSubmit();
      expect(submitted).toHaveBeenCalledTimes(1);
      expect(el('#vip').classList).toContain('is-invalid');
    }));

    it('actualiza el estado del botón al ocultar o mostrar un campo obligatorio', fakeAsync(() => {
      render(VIP_HTML, VIP_MAPPINGS, [{ selector: '#send', disableWhen: 'formIsInvalid' }]);
      expect(el<HTMLButtonElement>('#send').disabled).toBeFalse();

      toggle('#tieneVip', true);
      tick(60);
      expect(el<HTMLButtonElement>('#send').disabled).toBeTrue();

      toggle('#tieneVip', false);
      tick(60);
      expect(el<HTMLButtonElement>('#send').disabled).toBeFalse();
    }));

    it('evalúa la condición con el valor que ya trae el HTML (checkbox checked)', () => {
      render(VIP_HTML.replace('id="tieneVip" type="checkbox"', 'id="tieneVip" type="checkbox" checked'), [
        { controlName: 'tieneVip', domSelector: '#tieneVip' },
        VIP_MAPPINGS[1],
      ]);

      expect(vipWrap().style.display).not.toBe('none');
    });

    it('el campo oculto queda fuera de `value`, aunque getRawValue siga viéndolo', () => {
      render(VIP_HTML, VIP_MAPPINGS);

      expect(component.dynamicForm.value).toEqual({ tieneVip: false });
      expect(component.getFormValues()).toEqual({ tieneVip: false, vip: '' });
    });

    it('un select dirige la condición con === sobre texto', fakeAsync(() => {
      render(
        `<select id="tipo"><option value="estandar" selected>E</option><option value="premium">P</option></select>
         <div class="mb-3" id="extraWrap"><input id="extra"></div>`,
        [
          { controlName: 'tipo', domSelector: '#tipo' },
          { controlName: 'extra', domSelector: '#extra', showIf: "tipo === 'premium'" },
        ],
      );
      expect(el<HTMLElement>('#extraWrap').style.display).toBe('none');

      const select = el<HTMLSelectElement>('#tipo');
      select.value = 'premium';
      select.dispatchEvent(new Event('input', { bubbles: true }));
      tick(60);

      expect(el<HTMLElement>('#extraWrap').style.display).not.toBe('none');
    }));

    it('una expresión inválida no oculta el campo ni rompe el formulario', () => {
      spyOn(console, 'error');
      render(`<div class="mb-3" id="w"><input id="x"></div>`, [
        { controlName: 'x', domSelector: '#x', showIf: 'a ===' },
      ]);

      expect(el<HTMLElement>('#w').style.display).not.toBe('none');
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('aislamiento del CSS (DOM real, sin mocks)', () => {
    let pageElement: HTMLElement;

    beforeEach(() => {
      // Un elemento de la página host que usa la misma clase que el JSON.
      pageElement = document.createElement('div');
      pageElement.className = 'card';
      document.body.appendChild(pageElement);
    });

    afterEach(() => pageElement.remove());

    function renderWithCss(css: string, contentId = 'sec-css'): void {
      fixture = TestBed.createComponent(DynamicViewerComponent);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('contentId', contentId);
      fixture.componentRef.setInput('htmlContentString', '<div class="card" id="dentro">hola</div>');
      fixture.componentRef.setInput('cssContentString', css);
      document.body.appendChild(fixture.nativeElement);
      fixture.detectChanges();
      host = fixture.nativeElement;
    }

    afterEach(() => (fixture?.nativeElement as HTMLElement | undefined)?.remove());

    const border = (e: Element) => getComputedStyle(e).borderTopWidth;

    it('el CSS de la sección aplica dentro y NO a la página host', () => {
      renderWithCss('.card { border: 7px solid red }');

      expect(border(el('#dentro'))).toBe('7px');
      expect(border(pageElement)).toBe('0px');
    });

    it('el formato histórico (.dynamic-<id> .algo) sigue aplicando solo a la sección', () => {
      renderWithCss('.dynamic-sec-css .card { border: 5px solid red }');

      expect(border(el('#dentro'))).toBe('5px');
      expect(border(pageElement)).toBe('0px');
    });

    it('una regla sobre body o :root no toca la página', () => {
      const before = getComputedStyle(document.body).backgroundColor;
      renderWithCss('body { background: rgb(9, 9, 9) } :root { --x: 1 }');

      expect(getComputedStyle(document.body).backgroundColor).toBe(before);
      expect(getComputedStyle(host).backgroundColor).toBe('rgb(9, 9, 9)');
    });

    it('dos secciones con la misma clase en el CSS no se afectan entre sí', () => {
      renderWithCss('.card { border: 3px solid red }', 'sec-a');
      const first = host;
      const firstCard = first.querySelector('#dentro') as HTMLElement;

      const second = TestBed.createComponent(DynamicViewerComponent);
      second.componentRef.setInput('contentId', 'sec-b');
      second.componentRef.setInput('htmlContentString', '<div class="card" id="otra">hola</div>');
      second.componentRef.setInput('cssContentString', '.card { border: 8px solid blue }');
      document.body.appendChild(second.nativeElement);
      second.detectChanges();
      // TestBed retira los elementos raíz de fixtures anteriores al crear uno nuevo.
      document.body.appendChild(first);

      expect(border(firstCard)).toBe('3px');
      expect(border(second.nativeElement.querySelector('#otra'))).toBe('8px');
      second.nativeElement.remove();
      second.destroy();
    });

    it('al cambiar el CSS se vuelve a aislar y se retira el anterior', () => {
      renderWithCss('.card { border: 7px solid red }');

      fixture.componentRef.setInput('cssContentString', '.card { border: 2px solid red }');
      fixture.detectChanges();

      expect(border(el('#dentro'))).toBe('2px');
      expect(border(pageElement)).toBe('0px');
      expect(host.querySelectorAll('style').length).toBe(1);
    });

    it('el CSS de una sección sin contentId no se inyecta (no hay ámbito al que aislarlo)', () => {
      fixture = TestBed.createComponent(DynamicViewerComponent);
      fixture.componentRef.setInput('htmlContentString', '<div class="card" id="dentro">hola</div>');
      fixture.componentRef.setInput('cssContentString', '.card { border: 7px solid red }');
      document.body.appendChild(fixture.nativeElement);
      fixture.detectChanges();

      expect(border(pageElement)).toBe('0px');
    });
  });

  describe('subida de archivos', () => {
    const UPLOAD_HTML = `
      <form>
        <input id="doc" type="file">
        <progress id="avance"></progress>
        <ul id="lista"></ul>
        <div class="invalid-feedback" data-error-for="doc"></div>
        <button id="send" type="submit">Enviar</button>
      </form>`;
    const UPLOAD_MAPPING: FormFieldMapping = {
      controlName: 'doc',
      domSelector: '#doc',
      errorDisplaySelector: "[data-error-for='doc']",
      validatorConfig: [{ type: 'required', message: 'Adjunta un archivo' }],
      fileUploadConfig: { uploadUrl: '/api/archivos', progressSelector: '#avance', fileListSelector: '#lista' },
    };
    const SEND: ButtonConfig[] = [{ selector: '#send', disableWhen: 'formIsInvalidOrPristine' }];

    let backend: HttpTestingController;

    beforeEach(() => {
      render(UPLOAD_HTML, [UPLOAD_MAPPING], SEND);
      backend = TestBed.inject(HttpTestingController);
    });

    function choose(name = 'contrato.pdf', size = 3000): void {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(size)], name, { type: 'application/pdf' }));
      const input = el('#doc');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    it('antes de elegir un archivo, un campo obligatorio mantiene el formulario inválido', () => {
      expect(component.dynamicForm.get('doc')!.invalid).toBeTrue();
    });

    it('mientras sube, el formulario está pendiente: no se puede enviar y se avisa por qué', () => {
      choose();
      const submitted = jasmine.createSpy('formSubmitted');
      const errors: string[] = [];
      component.formSubmitted.subscribe(submitted);
      component.componentError.subscribe((e) => errors.push(e));

      component.triggerSubmit();

      expect(component.dynamicForm.pending).toBeTrue();
      expect(submitted).not.toHaveBeenCalled();
      expect(errors.some((e) => e.includes('en curso'))).toBeTrue();
      backend.expectOne('/api/archivos').flush('{}');
    });

    it('un botón con formIsPending/formIsInvalid se deshabilita mientras sube y se habilita al terminar', () => {
      choose();
      expect(el<HTMLButtonElement>('#send').disabled).toBeTrue();

      backend.expectOne('/api/archivos').flush('{"id":7}');

      expect(el<HTMLButtonElement>('#send').disabled).toBeFalse();
    });

    it('muestra el avance y la lista de archivos', () => {
      choose('contrato.pdf', 3000);

      backend.expectOne('/api/archivos').event({ type: HttpEventType.UploadProgress, loaded: 1500, total: 3000 });

      expect(el<HTMLProgressElement>('#avance').value).toBe(50);
      expect(el('#lista li').textContent).toBe('contrato.pdf (2.93 KB)');
    });

    it('al terminar, el envío lleva la respuesta del servidor como valor del campo', () => {
      choose();
      backend.expectOne('/api/archivos').flush('{"id":7,"url":"/f/7"}');
      const submitted = jasmine.createSpy('formSubmitted');
      component.formSubmitted.subscribe(submitted);

      component.triggerSubmit();

      expect(submitted).toHaveBeenCalledOnceWith({ formId: 'f1', data: { doc: { id: 7, url: '/f/7' } } });
    });

    it('si falla, el motivo aparece donde el JSON lo indica, el campo se marca inválido y el input se vacía', () => {
      choose('contrato.pdf');

      backend.expectOne('/api/archivos').flush('', { status: 500, statusText: 'Error' });

      expect(el("[data-error-for='doc']").textContent).toContain('No se pudo subir "contrato.pdf" (HTTP 500)');
      expect(el('#doc').classList).toContain('is-invalid');
      expect(el('#doc').value).toBe('');
      expect(el<HTMLProgressElement>('#avance').value).toBe(0);
      expect(component.dynamicForm.get('doc')!.value).toBeNull();
    });

    it('el formulario no se puede enviar tras un fallo, y vuelve a poder tras reintentar con éxito', () => {
      choose();
      backend.expectOne('/api/archivos').flush('', { status: 500, statusText: 'Error' });
      const submitted = jasmine.createSpy('formSubmitted');
      component.formSubmitted.subscribe(submitted);
      component.triggerSubmit();
      expect(submitted).not.toHaveBeenCalled();

      choose();
      backend.expectOne('/api/archivos').flush('{"id":9}');
      component.triggerSubmit();

      expect(submitted).toHaveBeenCalledOnceWith({ formId: 'f1', data: { doc: { id: 9 } } });
    });

    it('emite fileUploadChanged con cada etapa: subiendo, avance y hecho', () => {
      const events: Array<{ status: string; progress: number }> = [];
      component.fileUploadChanged.subscribe((c) => events.push({ status: c.status, progress: c.progress }));
      choose('a.pdf', 1000);

      const req = backend.expectOne('/api/archivos');
      req.event({ type: HttpEventType.UploadProgress, loaded: 500, total: 1000 });
      req.flush('{}');

      expect(events).toEqual([
        { status: 'uploading', progress: 0 },
        { status: 'uploading', progress: 50 },
        { status: 'done', progress: 100 },
      ]);
    });

    it('una uploadUrl hacia un origen no permitido se rechaza sin pedir nada y se explica', () => {
      render(UPLOAD_HTML, [{ ...UPLOAD_MAPPING, fileUploadConfig: { uploadUrl: 'https://evil.example/robar' } }], SEND);
      backend = TestBed.inject(HttpTestingController);

      choose();

      backend.expectNone(() => true);
      expect(el("[data-error-for='doc']").textContent).toContain('origen no permitido');
    });

    it('un origen declarado en uploadOrigins permite la URL absoluta', () => {
      fixture = TestBed.createComponent(DynamicViewerComponent);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('contentId', 'test');
      fixture.componentRef.setInput('formId', 'f1');
      fixture.componentRef.setInput('uploadOrigins', ['https://files.otro.com']);
      fixture.componentRef.setInput('formMappings', [
        { ...UPLOAD_MAPPING, fileUploadConfig: { uploadUrl: 'https://files.otro.com/up' } },
      ]);
      fixture.componentRef.setInput('htmlContentString', UPLOAD_HTML);
      fixture.detectChanges();
      host = fixture.nativeElement;
      backend = TestBed.inject(HttpTestingController);

      choose();

      backend.expectOne('https://files.otro.com/up').flush('{}');
    });
  });
});
