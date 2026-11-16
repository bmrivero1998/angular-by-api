import { Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable } from 'rxjs';
import {
  ApiDrivenContent,
  DisplayableInAppComponent,
  TableBindingColumn,
  formatSchemaIssue,
  validateSchema,
} from '@ux-driven-viewer/engine';
import { DynamicContentService } from './dynamic-content.service';
import { DomSanitizer } from '@angular/platform-browser';
import { ERROR_PAGE_ID, buildErrorPage, classifyLoadError } from './error-pages';

/**
 * Qué hizo el widget con un contenido recibido:
 * - `initial`:   no había nada en memoria; se pintó todo.
 * - `unchanged`: lo recibido es idéntico a lo que ya hay; no se tocó nada.
 * - `patched`:   cambiaron solo secciones `dynamic`; se actualizó únicamente cada una de ellas.
 * - `reloaded`:  cambió una sección `static` (o su presencia u orden); se recargó TODA la pantalla.
 */
export type ContentChangeMode = 'initial' | 'unchanged' | 'patched' | 'reloaded';

export interface ContentChange {
  mode: ContentChangeMode;
  /** `id_DocumentHTMLCSS` de las secciones agregadas, quitadas o modificadas. */
  changedIds: string[];
  /** Problemas del contenido recibido (sin id, id repetido, sin renderType...). Se informan, no se ocultan. */
  issues: string[];
}

/** Una sección en memoria. */
interface Section {
  id: string;
  /** Lo que llegó (ya normalizado). Es contra lo que se compara un envío nuevo. */
  source: ApiDrivenContent;
  /** Lo que se pinta: `source` con las tablas ya generadas, más los cambios en caliente (updateTable / updateBindingValue). */
  rendered: ApiDrivenContent;
}

/**
 * Mantiene en memoria las secciones de la pantalla, identificadas por su
 * `id_DocumentHTMLCSS`, y decide qué hay que volver a pintar cuando llega
 * contenido nuevo.
 *
 * Modelo (`renderType`):
 * - **static**: estructura de la pantalla. Cambiar una sección estática
 *   recarga la pantalla completa, con todos sus componentes.
 * - **dynamic**: contenido actualizable. Cambiar una sección dinámica solo
 *   actualiza esa sección; las demás conservan su estado (lo que el usuario
 *   haya escrito en ellas, por ejemplo).
 *
 * El orden en pantalla es siempre el del JSON recibido.
 *
 * No es un singleton: se provee en cada widget (`providers` del componente),
 * de modo que dos `<ux-driven-viewer>` en la misma página tienen su propia
 * memoria y no se pisan.
 */
@Injectable()
export class DynamicViewerService {
  private sections: Section[] = [];
  private readonly _content$ = new BehaviorSubject<ApiDrivenContent[]>([]);

  /** Secciones a pintar, en el orden del JSON. */
  public readonly content$: Observable<ApiDrivenContent[]> = this._content$.asObservable();

  /**
   * Verdadero mientras lo que hay en pantalla es la página de error de una
   * carga fallida. No cuenta como contenido: el primer contenido real la
   * reemplaza, y `updateSections` no se mezcla con ella.
   */
  private errorState = false;

  /** Cambia con cada recarga completa: invalida la identidad de TODAS las secciones. */
  private epoch = 0;
  /** Cambia cuando se actualiza una sección concreta: invalida solo la suya. */
  private readonly revisions = new Map<string, number>();

  constructor(
    private dcs: DynamicContentService,
    private sanitizer: DomSanitizer,
  ) {}

  /**
   * Clave de identidad de una sección para `trackBy`. Mientras no cambie,
   * Angular conserva el componente ya creado (y su formulario); al cambiar,
   * lo destruye y crea uno nuevo.
   */
  public readonly trackSection = (_index: number, item: ApiDrivenContent): string =>
    `${this.epoch}:${this.revisions.get(item.id_DocumentHTMLCSS) ?? 0}:${item.id_DocumentHTMLCSS}`;

  /** Foto de las secciones que se están pintando. */
  public getContentValue(): ApiDrivenContent[] {
    return this._content$.getValue();
  }

  /** ¿Hay contenido real en pantalla? La página de error no cuenta. */
  public hasContent(): boolean {
    return this.sections.length > 0 && !this.errorState;
  }

  /** ¿Lo que se muestra es la página de error de una carga fallida? */
  public isShowingErrorPage(): boolean {
    return this.errorState;
  }

  /**
   * Pinta la página de error correspondiente a un fallo de carga (404, sin
   * acceso, servidor caído...). Solo actúa si todavía no hay contenido: si ya
   * hay una pantalla funcionando, un fallo al volver a cargar NO la reemplaza.
   */
  public showErrorPage(error: unknown): ContentChange {
    if (this.hasContent()) return { mode: 'unchanged', changedIds: [], issues: [] };

    const { kind, status } = classifyLoadError(error);
    this.epoch++;
    this.sections = [this.createSection(buildErrorPage(kind, status))];
    this.errorState = true;
    this.publish();
    return { mode: 'initial', changedIds: [ERROR_PAGE_ID], issues: [] };
  }

  // ---------------------------------------------------------------------------
  // Entradas de contenido
  // ---------------------------------------------------------------------------

  /**
   * Pide el contenido a la API y lo aplica. Sirve para la primera carga y
   * para volver a cargar: lo recibido se compara contra lo que hay en
   * memoria (ver `ContentChange`). Una respuesta ilegible NO borra lo que ya
   * se está mostrando; se informa en `issues`.
   */
  public loadInitialContent(pageIdentifier: string): Observable<ContentChange> {
    return this.dcs.getContent(pageIdentifier).pipe(map((apiResponse: unknown) => this.applyRaw(apiResponse)));
  }

  /**
   * Aplica contenido local (sin HTTP): un arreglo, un texto JSON o la
   * respuesta de la API (`{ content: "..." }`).
   */
  public setLocalContent(rawData: unknown): ContentChange {
    return this.applyRaw(rawData);
  }

  /**
   * Actualiza secciones concretas sin reenviar toda la pantalla. Cada sección
   * recibida reemplaza a la que tiene su mismo `id_DocumentHTMLCSS`; las que
   * no existían se agregan al final. Las demás no se tocan.
   */
  public updateSections(rawSections: unknown): ContentChange {
    const parsed = this.parse(rawSections);
    if (!parsed.ok) return { mode: 'unchanged', changedIds: [], issues: parsed.issues };

    const { sections: incoming, issues } = this.normalize(parsed.sections);
    issues.push(...this.checkSchema(parsed.sections));
    const incomingById = new Map(incoming.map((section) => [section.id_DocumentHTMLCSS, section]));

    const current = this.liveSections();
    const merged = current.map((section) => incomingById.get(section.id) ?? section.source);
    const existing = new Set(current.map((section) => section.id));
    incoming.forEach((section) => {
      if (!existing.has(section.id_DocumentHTMLCSS)) merged.push(section);
    });

    const change = this.reconcile(merged);
    change.issues.unshift(...issues);
    return change;
  }

  /** Vacía la pantalla. */
  public clearContent(): void {
    this.sections = [];
    this.errorState = false;
    this.epoch++;
    this._content$.next([]);
  }

  // ---------------------------------------------------------------------------
  // Cambios en caliente sobre una sección (no vienen del JSON)
  // ---------------------------------------------------------------------------

  /**
   * Cambia las columnas o los datos de una tabla de una sección. Solo se
   * actualiza esa sección.
   */
  public updateTable(
    contentId: string,
    tableSelector: string,
    newTableData: { columns?: TableBindingColumn[]; data?: any[] },
  ): void {
    const section = this.sections.find((s) => s.id === contentId);
    if (!section?.rendered.tableBindings) return;

    this.replaceRendered(
      section,
      this._processTableBindings({
        ...section.rendered,
        tableBindings: this._getUpdatedTableBindings(section.rendered.tableBindings, tableSelector, newTableData),
      }),
    );
  }

  /** Cambia el valor de un `dataBinding` de una sección. Solo se actualiza esa sección. */
  public updateBindingValue(contentId: string, bindingSelector: string, newValue: any): void {
    const section = this.sections.find((s) => s.id === contentId);
    if (!section?.rendered.dataBindings) return;

    this.replaceRendered(section, {
      ...section.rendered,
      dataBindings: section.rendered.dataBindings.map((b) =>
        b.selector === bindingSelector ? { ...b, value: newValue } : b,
      ),
    });
  }

  private replaceRendered(section: Section, rendered: ApiDrivenContent): void {
    section.rendered = rendered;
    this.bumpRevision(section.id);
    this.publish();
  }

  // ---------------------------------------------------------------------------
  // Reconciliación: qué hay que volver a pintar
  // ---------------------------------------------------------------------------

  private applyRaw(rawData: unknown): ContentChange {
    const parsed = this.parse(rawData);
    // Un contenido ilegible no debe vaciar la pantalla: se informa y se deja todo como está.
    if (!parsed.ok) return { mode: 'unchanged', changedIds: [], issues: parsed.issues };

    const { sections, issues } = this.normalize(parsed.sections);
    issues.push(...this.checkSchema(parsed.sections));
    const change = this.reconcile(sections);
    change.issues.unshift(...issues);
    return change;
  }

  /**
   * Compara lo recibido con lo que hay en memoria y actualiza solo lo
   * necesario:
   * - Cambió, apareció o desapareció una sección `static`, o se reordenaron
   *   las estáticas: se recarga TODO.
   * - Solo cambiaron secciones `dynamic`: se actualiza cada una de ellas y el
   *   resto conserva su componente (y su estado).
   * - Nada cambió: no se toca nada.
   */
  private reconcile(next: ApiDrivenContent[]): ContentChange {
    const previous = this.liveSections();

    if (previous.length === 0 && next.length === 0) {
      return { mode: 'unchanged', changedIds: [], issues: [] };
    }

    if (previous.length === 0) {
      this.sections = next.map((source) => this.createSection(source));
      this.errorState = false; // el primer contenido real reemplaza a la página de error
      this.publish();
      return { mode: 'initial', changedIds: next.map((s) => s.id_DocumentHTMLCSS), issues: [] };
    }

    const previousById = new Map(previous.map((section) => [section.id, section]));
    const nextIds = new Set(next.map((section) => section.id_DocumentHTMLCSS));

    const changedIds = [
      ...next
        .filter((source) => {
          const old = previousById.get(source.id_DocumentHTMLCSS);
          return !old || !deepEqual(old.source, source);
        })
        .map((source) => source.id_DocumentHTMLCSS),
      ...previous.filter((section) => !nextIds.has(section.id)).map((section) => section.id),
    ];

    const staticSections = (sources: ApiDrivenContent[]) => sources.filter((s) => s.renderType === 'static');
    const previousStatic = staticSections(previous.map((section) => section.source));
    const nextStatic = staticSections(next);
    const staticChanged =
      previousStatic.length !== nextStatic.length || previousStatic.some((s, i) => !deepEqual(s, nextStatic[i]));

    if (staticChanged) {
      this.epoch++;
      this.sections = next.map((source) => this.createSection(source));
      this.publish();
      return { mode: 'reloaded', changedIds, issues: [] };
    }

    const sameOrder =
      previous.length === next.length && previous.every((section, i) => section.id === next[i].id_DocumentHTMLCSS);

    if (changedIds.length === 0 && sameOrder) {
      return { mode: 'unchanged', changedIds: [], issues: [] };
    }

    const changed = new Set(changedIds);
    this.sections = next.map((source) => {
      const old = previousById.get(source.id_DocumentHTMLCSS);
      if (old && !changed.has(source.id_DocumentHTMLCSS)) return old; // misma sección: mismo componente
      this.bumpRevision(source.id_DocumentHTMLCSS);
      return this.createSection(source);
    });
    this.publish();
    return { mode: 'patched', changedIds, issues: [] };
  }

  /** Las secciones reales: la página de error de una carga fallida no cuenta como contenido previo. */
  private liveSections(): Section[] {
    return this.errorState ? [] : this.sections;
  }

  private createSection(source: ApiDrivenContent): Section {
    return { id: source.id_DocumentHTMLCSS, source, rendered: this._processTableBindings(source) };
  }

  private bumpRevision(id: string): void {
    this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
  }

  private publish(): void {
    this._content$.next(this.sections.map((section) => section.rendered));
  }

  // ---------------------------------------------------------------------------
  // Lectura y validación del contenido recibido
  // ---------------------------------------------------------------------------

  /** Acepta un arreglo, un texto JSON o `{ content: "<texto JSON>" }`. */
  private parse(rawData: unknown): { ok: true; sections: unknown[] } | { ok: false; issues: string[] } {
    try {
      let value: unknown = rawData;
      if (typeof value === 'string') value = JSON.parse(value);
      if (value && !Array.isArray(value) && typeof (value as { content?: unknown }).content === 'string') {
        value = JSON.parse((value as { content: string }).content);
      }
      if (Array.isArray(value)) return { ok: true, sections: value };
      return { ok: false, issues: ['El contenido recibido no es un arreglo de secciones.'] };
    } catch (error) {
      return { ok: false, issues: [`El contenido recibido no es un JSON válido: ${(error as Error).message}`] };
    }
  }

  /**
   * Compara el contenido recibido con el contrato (`validateSchema`) y lo
   * informa como aviso: un `console.warn` agrupado y entradas en `issues`.
   * Nunca bloquea ni cambia lo que se pinta. Lo que `normalize` ya informa
   * (id ausente o repetido, renderType, sección que no es objeto) se omite
   * para no avisar dos veces.
   */
  private checkSchema(rawSections: unknown[]): string[] {
    const found = validateSchema(rawSections).filter(
      (issue) => !/^\[\d+\](\.(id_DocumentHTMLCSS|renderType))?$/.test(issue.path),
    );
    if (found.length === 0) return [];

    const lines = found.map((issue) => `${issue.severity === 'error' ? 'Error' : 'Aviso'} ${formatSchemaIssue(issue)}`);
    console.warn(
      `[UXWidget] El JSON recibido no cumple el contrato (${found.length} problema${found.length === 1 ? '' : 's'}):\n` +
        lines.map((line) => ` - ${line}`).join('\n'),
    );
    return found.map((issue) => `Esquema ${formatSchemaIssue(issue)}`);
  }

  /**
   * Deja cada sección en un estado renderizable e informa de lo que no lo
   * estaba, en vez de descartarlo en silencio:
   * - sin `id_DocumentHTMLCSS`: se le asigna `section-<posición>`;
   * - `id_DocumentHTMLCSS` repetido: se conserva la primera;
   * - `renderType` ausente o inválido: se trata como `static`, que es lo
   *   seguro (cualquier cambio recarga todo).
   */
  private normalize(items: unknown[]): { sections: ApiDrivenContent[]; issues: string[] } {
    const issues: string[] = [];
    const seen = new Set<string>();
    const sections: ApiDrivenContent[] = [];

    items.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        issues.push(`La sección #${index + 1} no es un objeto; se ignora.`);
        return;
      }

      const raw = item as Partial<ApiDrivenContent>;
      let id = typeof raw.id_DocumentHTMLCSS === 'string' ? raw.id_DocumentHTMLCSS.trim() : '';
      let renderType = raw.renderType;
      let copy = false;

      if (!id) {
        id = `section-${index + 1}`;
        copy = true;
        issues.push(`La sección #${index + 1} no tiene id_DocumentHTMLCSS; se le asignó "${id}".`);
      }
      if (seen.has(id)) {
        issues.push(`El id_DocumentHTMLCSS "${id}" está repetido; se ignora la sección #${index + 1}.`);
        return;
      }
      seen.add(id);

      if (renderType !== 'static' && renderType !== 'dynamic') {
        issues.push(
          `La sección "${id}" no declara renderType 'static' ni 'dynamic' (recibido: ${String(renderType)}); se trata como 'static'.`,
        );
        renderType = 'static';
        copy = true;
      }

      sections.push(copy ? ({ ...raw, id_DocumentHTMLCSS: id, renderType } as ApiDrivenContent) : (raw as ApiDrivenContent));
    });

    return { sections, issues };
  }

  // ---------------------------------------------------------------------------
  // Tablas
  // ---------------------------------------------------------------------------

  private _getUpdatedTableBindings(currentBindings: any[], tableSelector: string, newTableData: any) {
    return currentBindings.map((table) => {
      if (table.tableSelector !== tableSelector) return table;
      return {
        ...table,
        columns: newTableData.columns || table.columns,
        data: newTableData.data || table.data,
      };
    });
  }

  private _processTableBindings(content: ApiDrivenContent): ApiDrivenContent {
    if (!content.tableBindings || !content.htmlComponent) return content;
    let finalHtml = content.htmlComponent;
    const container = document.createElement('div');
    container.innerHTML = finalHtml;
    content.tableBindings.forEach((tableBinding) => {
      const tableElement = container.querySelector(tableBinding.tableSelector);
      if (tableElement) {
        let theadHtml = '<thead><tr>';
        tableBinding.columns.forEach((col) => (theadHtml += `<th scope="col">${col.header}</th>`));
        if (tableBinding.actions && tableBinding.actions.length > 0) theadHtml += `<th scope="col">Acciones</th>`;
        theadHtml += '</tr></thead>';
        let tbodyHtml = '<tbody>';
        tableBinding.data.forEach((row) => {
          tbodyHtml += '<tr>';
          tableBinding.columns.forEach((col) => {
            tbodyHtml += `<td>${row[col.key] ?? ''}</td>`;
          });
          if (tableBinding.actions && tableBinding.actions.length > 0) {
            tbodyHtml += '<td>';
            tableBinding.actions.forEach((action) => {
              tbodyHtml += `<button type="button" class="${
                action.cssClass || 'btn btn-sm'
              }" data-dynamic-action="${action.action}" data-row-id="${row.id || ''}">${action.label}</button> `;
            });
            tbodyHtml += '</td>';
          }
          tbodyHtml += '</tr>';
        });
        tbodyHtml += '</tbody>';

        // El fragmento thead/tbody solo se parsea como tabla real si el nodo
        // destino YA es un <table>: el algoritmo de parseo de HTML ignora
        // silenciosamente <thead>/<tr>/<th>/<tbody>/<td> cuando el contexto
        // de inserción no es "in table" (p. ej. un <div> contenedor), y solo
        // deja el texto plano de las celdas. Si el selector apunta a otra
        // cosa (el caso más común: un <div id="miTabla"></div> placeholder),
        // hay que envolver el fragmento en un <table> propio para que el
        // navegador sí reconstruya la estructura.
        tableElement.innerHTML =
          tableElement.tagName === 'TABLE' ? theadHtml + tbodyHtml : `<table>${theadHtml}${tbodyHtml}</table>`;
      }
    });
    return { ...content, htmlComponent: container.innerHTML };
  }

  /**
   * Transforma la respuesta del microservicio en objetos listos para renderizar.
   * Incluye la sanitización de HTML para evitar bloqueos de seguridad de Angular.
   */
  processApiResponse(data: any): DisplayableInAppComponent[] {
    try {
      const rawData = typeof data === 'string' ? JSON.parse(data) : data;

      if (!Array.isArray(rawData)) {
        console.error('Invalid format: Expected an array of components', rawData);
        return [];
      }

      return rawData.map((item) => ({
        ...item,
        // Sanitizamos el HTML aquí para que DisplayableInAppComponent sea válido
        safeHtml: this.sanitizer.bypassSecurityTrustHtml(item.htmlComponent),
      }));
    } catch (error) {
      console.error('Error processing dynamic content JSON:', error);
      return [];
    }
  }
}

/** Igualdad estructural de datos JSON. Las funciones (p. ej. `disableWhen`) se comparan por referencia. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;

  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}
