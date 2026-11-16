import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ApiDrivenContent } from '@ux-driven-viewer/engine';
import { ContentChange } from '../content/dynamic-viewer.service';
import { ModalService } from '../modal/modal.service';
import { UXDrivenViewerWidgetComponent } from './ux-driven-viewer.component';

/**
 * Integración del widget con sus servicios REALES y un DOM real: lo que el
 * usuario ve cuando el host actualiza el contenido. Los specs unitarios usan
 * un servicio simulado y no pueden comprobar esto.
 */
describe('UXDrivenViewerWidgetComponent (actualización de contenido, integración)', () => {
  let fixture: ComponentFixture<UXDrivenViewerWidgetComponent>;
  let component: UXDrivenViewerWidgetComponent;
  let host: HTMLElement;

  const section = (
    id: string,
    renderType: 'static' | 'dynamic',
    html: string,
    extra: Partial<ApiDrivenContent> = {},
  ): ApiDrivenContent => ({ id_DocumentHTMLCSS: id, renderType, htmlComponent: html, ...extra });

  const nav = (text = 'Menú') => section('nav', 'static', `<nav id="nav">${text}</nav>`);
  const form = () =>
    section('datos', 'dynamic', '<form><input id="nombre" name="nombre"></form>', {
      formId: 'datos',
      formMappings: [{ controlName: 'nombre', domSelector: '#nombre' }],
    });
  const news = (text = 'Sin novedades') => section('novedades', 'dynamic', `<p id="texto">${text}</p>`);
  const footer = () => section('pie', 'static', '<footer id="pie">Pie</footer>');

  const schema = (overrides: Partial<Record<string, ApiDrivenContent>> = {}) => [
    overrides['nav'] ?? nav(),
    overrides['datos'] ?? form(),
    overrides['novedades'] ?? news(),
    overrides['pie'] ?? footer(),
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UXDrivenViewerWidgetComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => fixture?.destroy());

  function create(localSchema: unknown): void {
    fixture = TestBed.createComponent(UXDrivenViewerWidgetComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('localSchema', localSchema);
    fixture.detectChanges();
    host = fixture.nativeElement;
  }

  /** Reasigna localSchema, como haría el host al volver a enviar el JSON. */
  function resend(localSchema: unknown): void {
    fixture.componentRef.setInput('localSchema', localSchema);
    fixture.detectChanges();
  }

  const section$ = (id: string) => host.querySelector(`.dynamic-${id}`) as HTMLElement;
  const text = (id: string) => section$(id)?.textContent?.trim();
  const sectionIds = () =>
    Array.from(host.querySelectorAll('app-dynamic-viewer')).map((el) =>
      Array.from(el.classList).find((c) => c.startsWith('dynamic-'))!.replace('dynamic-', ''),
    );

  function type(selector: string, value: string): void {
    const input = host.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Marca el elemento DOM de cada sección para saber si se conservó o se recreó. */
  function tagSections(): void {
    host.querySelectorAll('app-dynamic-viewer').forEach((el) => ((el as any).__vivo = true));
  }
  const alive = (id: string) => !!(section$(id) as any)?.__vivo;

  describe('orden', () => {
    it('pinta las secciones en el orden del JSON, no las static primero', () => {
      create([news(), footer(), form(), nav()]);

      expect(sectionIds()).toEqual(['novedades', 'pie', 'datos', 'nav']);
    });
  });

  describe('cambia una sección dynamic', () => {
    beforeEach(() => {
      create(schema());
      type('#nombre', 'Ana');
      tagSections();
    });

    it('se actualiza solo esa sección y las demás conservan su elemento y lo que el usuario escribió', () => {
      resend(schema({ novedades: news('Nueva promoción') }));

      expect(text('novedades')).toBe('Nueva promoción');
      expect(alive('nav')).toBeTrue();
      expect(alive('datos')).toBeTrue();
      expect(alive('pie')).toBeTrue();
      expect(alive('novedades')).toBeFalse(); // esa sí se recreó
      expect((host.querySelector('#nombre') as HTMLInputElement).value).toBe('Ana');
      expect(component.formGroup.value).toEqual({ datos: { nombre: 'Ana' } });
    });

    it('updateSections con solo la sección que cambia produce el mismo resultado', () => {
      const result = component.updateSections([news('Solo esta')]);
      fixture.detectChanges();

      expect(result).toEqual(jasmine.objectContaining({ mode: 'patched', changedIds: ['novedades'] }));
      expect(text('novedades')).toBe('Solo esta');
      expect(alive('datos')).toBeTrue();
      expect((host.querySelector('#nombre') as HTMLInputElement).value).toBe('Ana');
    });

    it('la sección actualizada puede ser la que tiene el formulario: su estado se reinicia, el de las demás no', () => {
      component.updateSections([
        section('datos', 'dynamic', '<form><input id="nombre" name="nombre"><input id="apellido"></form>', {
          formId: 'datos',
          formMappings: [
            { controlName: 'nombre', domSelector: '#nombre' },
            { controlName: 'apellido', domSelector: '#apellido' },
          ],
        }),
      ]);
      fixture.detectChanges();

      expect(alive('datos')).toBeFalse();
      expect(alive('nav')).toBeTrue();
      expect(alive('novedades')).toBeTrue();
      expect(Object.keys(component.formGroup.value['datos'])).toEqual(['nombre', 'apellido']);
    });

    it('agregar una dynamic nueva no toca las existentes', () => {
      component.updateSections([section('promo', 'dynamic', '<p>Promo</p>')]);
      fixture.detectChanges();

      expect(sectionIds()).toEqual(['nav', 'datos', 'novedades', 'pie', 'promo']);
      expect(alive('datos')).toBeTrue();
      expect((host.querySelector('#nombre') as HTMLInputElement).value).toBe('Ana');
    });

    it('quitar una dynamic (reenviando el JSON sin ella) no toca las demás', () => {
      resend([nav(), form(), footer()]);

      expect(sectionIds()).toEqual(['nav', 'datos', 'pie']);
      expect(alive('datos')).toBeTrue();
    });

    it('emite contentUpdated con mode patched, y ready solo la primera vez', () => {
      const updates: ContentChange[] = [];
      component.contentUpdated.subscribe((c) => updates.push(c));
      let ready = 0;
      component.ready.subscribe(() => ready++);

      resend(schema({ novedades: news('v2') }));

      expect(updates).toEqual([{ mode: 'patched', changedIds: ['novedades'], issues: [] }]);
      expect(ready).toBe(0);
    });
  });

  describe('cambia una sección static: se recarga toda la pantalla', () => {
    beforeEach(() => {
      create(schema());
      type('#nombre', 'Ana');
      tagSections();
    });

    it('se recrean TODAS las secciones y se pierde lo escrito', () => {
      resend(schema({ nav: nav('Menú nuevo') }));

      expect(text('nav')).toBe('Menú nuevo');
      expect(alive('nav')).toBeFalse();
      expect(alive('datos')).toBeFalse();
      expect(alive('novedades')).toBeFalse();
      expect(alive('pie')).toBeFalse();
      expect((host.querySelector('#nombre') as HTMLInputElement).value).toBe('');
    });

    it('updateSections de una static produce lo mismo', () => {
      const result = component.updateSections([nav('Otro menú')]);
      fixture.detectChanges();

      expect(result.mode).toBe('reloaded');
      expect(alive('datos')).toBeFalse();
      expect((host.querySelector('#nombre') as HTMLInputElement).value).toBe('');
    });

    it('emite contentUpdated con mode reloaded y ready', () => {
      const updates: ContentChange[] = [];
      component.contentUpdated.subscribe((c) => updates.push(c));
      let ready = 0;
      component.ready.subscribe(() => ready++);

      resend(schema({ nav: nav('Menú nuevo') }));

      expect(updates).toEqual([{ mode: 'reloaded', changedIds: ['nav'], issues: [] }]);
      expect(ready).toBe(1);
    });

    it('agregar una static también recarga todo', () => {
      resend([...schema(), section('banner', 'static', '<aside id="banner">Banner</aside>')]);

      expect(alive('datos')).toBeFalse();
      expect(sectionIds()).toEqual(['nav', 'datos', 'novedades', 'pie', 'banner']);
    });
  });

  describe('reenviar el mismo JSON', () => {
    it('no recrea nada, no pierde lo escrito y no emite eventos', () => {
      create(schema());
      type('#nombre', 'Ana');
      tagSections();
      const updates: ContentChange[] = [];
      component.contentUpdated.subscribe((c) => updates.push(c));

      resend(schema()); // objetos nuevos, mismo contenido

      expect(updates).toEqual([]);
      ['nav', 'datos', 'novedades', 'pie'].forEach((id) => expect(alive(id)).toBeTrue());
      expect((host.querySelector('#nombre') as HTMLInputElement).value).toBe('Ana');
    });
  });

  describe('contenido incompleto', () => {
    it('una sección sin renderType se pinta (antes se descartaba en silencio) y se informa', () => {
      const errors: string[] = [];
      fixture = TestBed.createComponent(UXDrivenViewerWidgetComponent);
      component = fixture.componentInstance;
      component.errorOccurred.subscribe((e) => errors.push(e));
      fixture.componentRef.setInput('localSchema', [{ id_DocumentHTMLCSS: 'x', htmlComponent: '<p id="x">hola</p>' }]);
      fixture.detectChanges();
      host = fixture.nativeElement;

      expect(host.querySelector('#x')?.textContent).toBe('hola');
      expect(errors.some((e) => e.includes('"x"') && e.includes('renderType'))).toBeTrue();
    });
  });

  describe('dos widgets en la misma página', () => {
    it('cada uno tiene su propio contenido en memoria', async () => {
      create([news('del primero')]);
      const first = component;

      const second = TestBed.createComponent(UXDrivenViewerWidgetComponent);
      second.componentRef.setInput('localSchema', [section('otro', 'dynamic', '<p>del segundo</p>')]);
      second.detectChanges();

      const idsOf = async (c: UXDrivenViewerWidgetComponent) =>
        (await firstValueFrom(c.content$)).map((s) => s.id_DocumentHTMLCSS);

      expect(await idsOf(first)).toEqual(['novedades']);
      expect(await idsOf(second.componentInstance)).toEqual(['otro']);
      second.destroy();
    });
  });

  describe('contenido por API', () => {
    let http: HttpTestingController;

    function createWithApi(): void {
      fixture = TestBed.createComponent(UXDrivenViewerWidgetComponent);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('apiUrl', '/api/pantalla');
      fixture.detectChanges();
      host = fixture.nativeElement;
      http = TestBed.inject(HttpTestingController);
    }

    it('pide el contenido una sola vez al iniciar', () => {
      createWithApi();

      http.expectOne('/api/pantalla').flush(schema());
      http.expectNone('/api/pantalla');
      fixture.detectChanges();

      expect(sectionIds()).toEqual(['nav', 'datos', 'novedades', 'pie']);
    });

    it('refresh() vuelve a pedirlo y solo actualiza lo que cambió', () => {
      createWithApi();
      http.expectOne('/api/pantalla').flush(schema());
      fixture.detectChanges();
      type('#nombre', 'Ana');
      tagSections();
      const updates: ContentChange[] = [];
      component.contentUpdated.subscribe((c) => updates.push(c));

      component.refresh();
      expect(component.isLoading).toBeFalse(); // lo que está en pantalla se queda
      http.expectOne('/api/pantalla').flush(schema({ novedades: news('Cambió en el servidor') }));
      fixture.detectChanges();

      expect(updates).toEqual([{ mode: 'patched', changedIds: ['novedades'], issues: [] }]);
      expect(text('novedades')).toBe('Cambió en el servidor');
      expect(alive('datos')).toBeTrue();
      expect((host.querySelector('#nombre') as HTMLInputElement).value).toBe('Ana');
    });

    it('una respuesta rota no borra la pantalla', () => {
      createWithApi();
      http.expectOne('/api/pantalla').flush(schema());
      fixture.detectChanges();
      const errors: string[] = [];
      component.errorOccurred.subscribe((e) => errors.push(e));

      component.refresh();
      http.expectOne('/api/pantalla').flush({ content: '{ roto' });
      fixture.detectChanges();

      expect(sectionIds()).toEqual(['nav', 'datos', 'novedades', 'pie']);
      expect(errors.length).toBe(1);
    });
  });

  describe('métodos publicados en el elemento', () => {
    it('el host puede llamar updateSections desde el propio elemento', () => {
      create(schema());
      type('#nombre', 'Ana');
      tagSections();
      const element = host as HTMLElement & { updateSections: (s: unknown) => ContentChange };

      const result = element.updateSections([news('Desde el host')]);
      fixture.detectChanges();

      expect(result.mode).toBe('patched');
      expect(text('novedades')).toBe('Desde el host');
      expect(alive('datos')).toBeTrue();
    });
  });

  describe('errores de carga (API)', () => {
    let http: HttpTestingController;
    const failure = (status: number) => ({ status, statusText: 'Error' });

    function createWithApi(showErrorPage?: boolean): void {
      fixture = TestBed.createComponent(UXDrivenViewerWidgetComponent);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('apiUrl', '/api/pantalla');
      if (showErrorPage !== undefined) fixture.componentRef.setInput('showErrorPage', showErrorPage);
      fixture.detectChanges();
      host = fixture.nativeElement;
      http = TestBed.inject(HttpTestingController);
      spyOn(console, 'error');
    }

    const errorPage = () => host.querySelector('.ux-error') as HTMLElement | null;

    it('un 404 en la primera carga pinta la página de error, sin spinner y con ready', () => {
      createWithApi();
      const errors: string[] = [];
      const updates: ContentChange[] = [];
      let ready = 0;
      component.errorOccurred.subscribe((e) => errors.push(e));
      component.contentUpdated.subscribe((c) => updates.push(c));
      component.ready.subscribe(() => ready++);

      http.expectOne('/api/pantalla').flush(null, failure(404));
      fixture.detectChanges();

      expect(errorPage()?.textContent).toContain('404');
      expect(errorPage()?.textContent).toContain('No encontramos este contenido');
      expect(host.querySelector('.ux-error__retry')).toBeNull(); // reintentar no ayuda con un 404
      expect(component.isLoading).toBeFalse();
      expect(errors).toEqual(['Error cargando configuración dinámica (HTTP 404)']);
      expect(updates).toEqual([{ mode: 'initial', changedIds: ['ux-error-page'], issues: [] }]);
      expect(ready).toBe(1);
    });

    it('un 503 ofrece Reintentar; al pulsarlo pide el contenido otra vez y lo pinta en lugar del error', () => {
      createWithApi();
      http.expectOne('/api/pantalla').flush(null, failure(503));
      fixture.detectChanges();
      expect(errorPage()).not.toBeNull();

      (host.querySelector('.ux-error__retry') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(errorPage()).toBeNull(); // se quita mientras reintenta
      expect(host.querySelector('[role="status"]')).not.toBeNull(); // spinner

      http.expectOne('/api/pantalla').flush(schema());
      fixture.detectChanges();

      expect(sectionIds()).toEqual(['nav', 'datos', 'novedades', 'pie']);
      expect(errorPage()).toBeNull();
    });

    it('si el reintento vuelve a fallar, la página de error reaparece', () => {
      createWithApi();
      http.expectOne('/api/pantalla').flush(null, failure(500));
      fixture.detectChanges();

      (host.querySelector('.ux-error__retry') as HTMLButtonElement).click();
      http.expectOne('/api/pantalla').flush(null, failure(500));
      fixture.detectChanges();

      expect(errorPage()).not.toBeNull();
      expect(component.isLoading).toBeFalse();
    });

    it('un 403 muestra acceso no autorizado y la sección de error se aísla como cualquier otra', () => {
      createWithApi();

      http.expectOne('/api/pantalla').flush(null, failure(403));
      fixture.detectChanges();

      expect(errorPage()?.textContent).toContain('Acceso no autorizado');
      expect(host.querySelector('.dynamic-ux-error-page')).not.toBeNull();
    });

    it('si ya hay contenido en pantalla, un fallo al refrescar NO lo reemplaza por la página de error', () => {
      createWithApi();
      http.expectOne('/api/pantalla').flush(schema());
      fixture.detectChanges();
      type('#nombre', 'Ana');
      const errors: string[] = [];
      component.errorOccurred.subscribe((e) => errors.push(e));

      component.refresh();
      http.expectOne('/api/pantalla').flush(null, failure(500));
      fixture.detectChanges();

      expect(errorPage()).toBeNull();
      expect(sectionIds()).toEqual(['nav', 'datos', 'novedades', 'pie']);
      expect((host.querySelector('#nombre') as HTMLInputElement).value).toBe('Ana');
      expect(errors).toEqual(['Error cargando configuración dinámica (HTTP 500)']);
    });

    it('con show-error-page desactivado no se pinta nada y solo se informa', () => {
      createWithApi(false);
      const errors: string[] = [];
      component.errorOccurred.subscribe((e) => errors.push(e));

      http.expectOne('/api/pantalla').flush(null, failure(500));
      fixture.detectChanges();

      expect(errorPage()).toBeNull();
      expect(sectionIds()).toEqual([]);
      expect(errors.length).toBe(1);
    });

    it('un error que NO es de la carga de contenido no se convierte en página de error', () => {
      createWithApi();
      http.expectOne('/api/pantalla').flush(schema());
      fixture.detectChanges();

      // Otra petición HTTP de la aplicación que falla (p. ej. un validador asíncrono).
      TestBed.inject(HttpClient).get('/otra-api').subscribe({ error: () => {} });
      http.expectOne('/otra-api').flush(null, failure(500));
      fixture.detectChanges();

      expect(errorPage()).toBeNull();
      expect(sectionIds()).toEqual(['nav', 'datos', 'novedades', 'pie']);
    });
  });

  describe('acciones con "modal" en el nombre (DOM real)', () => {
    const button = (action: string) =>
      section('acc', 'static', `<button id="b" type="button" data-dynamic-action="${action}">x</button>`);

    function clickAction(action: string): string[] {
      create([button(action)]);
      const received: string[] = [];
      component.actionTriggered.subscribe((p) => received.push(p.action));
      (host.querySelector('#b') as HTMLButtonElement).click();
      return received;
    }

    it('open_modal llega al host (antes se tragaba y solo cerraba el modal)', () => {
      expect(clickAction('open_modal')).toEqual(['open_modal']);
    });

    it('close_modal llega al host además de cerrar el modal', () => {
      const modal = TestBed.inject(ModalService);
      spyOn(modal, 'close');

      expect(clickAction('close_modal')).toEqual(['close_modal']);
      expect(modal.close).toHaveBeenCalledTimes(1);
    });
  });
});
