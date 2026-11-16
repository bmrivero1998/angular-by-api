/**
 * Playground: una página host de mentira para desarrollar y probar el widget.
 *
 * A propósito NO usa Angular: consume `<ux-driven-viewer>` igual que lo haría
 * cualquier host real (propiedades JS + eventos del DOM). Lo único que comparte
 * con el runtime es que lo importa desde el código fuente para tener recarga
 * en caliente con `npm start`.
 */
import '../../runtime/src/main';

/** Esquemas servidos desde examples/schemas (ver `assets` en angular.json). */
const EXAMPLES: Record<string, string> = {
  'Static y dynamic (actualizar secciones)': 'schemas/secciones.json',
  'Subida de archivos (necesita npm run mock-api)': 'schemas/archivos.json',
  'Landing estática': 'schemas/landing.json',
  'Formulario básico': 'schemas/formulario-basico.json',
  'Formulario completo': 'schemas/formulario-completo.json',
};

const WIDGET_EVENTS = [
  'ready',
  'formSubmit',
  'actionTriggered',
  'errorOccurred',
  'modalResult',
  'fileSelected',
  'controlChanged',
  'formStateChanged',
  'contentUpdated',
  'fileUploadChanged',
];

interface Section {
  id_DocumentHTMLCSS: string;
  renderType: 'static' | 'dynamic';
  htmlComponent: string;
}

type ViewerElement = HTMLElement & {
  localSchema?: unknown;
  /** Lo publica el widget en el propio elemento (ver docs/updating-content.md). */
  updateSections?: (sections: unknown) => { mode: string; changedIds: string[]; issues: string[] };
};

const viewer = document.getElementById('pg-viewer') as ViewerElement;
const select = document.getElementById('pg-example') as HTMLSelectElement;
const status = document.getElementById('pg-status') as HTMLElement;
const eventList = document.getElementById('pg-events') as HTMLOListElement;
const clearButton = document.getElementById('pg-clear') as HTMLButtonElement;
const patchButton = document.getElementById('pg-patch') as HTMLButtonElement;
const staticButton = document.getElementById('pg-static') as HTMLButtonElement;
const resendButton = document.getElementById('pg-resend') as HTMLButtonElement;

/** Lo último que se le envió al widget, para poder modificar una sección y reenviar. */
let currentSchema: Section[] = [];

function describe(detail: unknown): string {
  try {
    // Elementos del DOM y eventos nativos no se pueden serializar: se resumen.
    return JSON.stringify(detail, (_key, value) =>
      value instanceof Node || value instanceof Event ? `[${value.constructor.name}]` : value,
    );
  } catch {
    return String(detail);
  }
}

function logEvent(name: string, detail: unknown): void {
  const item = document.createElement('li');
  const label = document.createElement('span');
  label.className = 'pg-ev';
  label.textContent = name;
  item.append(label, ' ', describe(detail));
  eventList.prepend(item);
}

async function loadExample(url: string): Promise<void> {
  status.textContent = `Cargando ${url}…`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    currentSchema = await response.json();
    viewer.localSchema = structuredClone(currentSchema);
    status.textContent = url;
  } catch (error) {
    status.textContent = `No se pudo cargar ${url}: ${String(error)}`;
  }
}

/**
 * Modifica una sección (le pone una marca de hora) y se la manda al widget con
 * `updateSections`: una `dynamic` solo actualiza esa sección; una `static`
 * recarga toda la pantalla. Compáralo escribiendo algo en el formulario antes.
 */
function changeSection(renderType: Section['renderType']): void {
  const candidates = currentSchema.filter((section) => section.renderType === renderType);
  const target = renderType === 'dynamic' ? candidates[candidates.length - 1] : candidates[0];
  if (!target || !viewer.updateSections) {
    status.textContent = `No hay ninguna sección ${renderType} en este ejemplo.`;
    return;
  }

  const stamp = `<small class="pg-stamp"> · actualizada ${new Date().toLocaleTimeString()}</small>`;
  target.htmlComponent = target.htmlComponent.replace(/<small class="pg-stamp">.*?<\/small>/, '');
  target.htmlComponent = target.htmlComponent.replace(/(<\/(?:span|footer|nav|div|p|form)>)$/, `${stamp}$1`);

  viewer.updateSections([structuredClone(target)]);
}

patchButton.addEventListener('click', () => changeSection('dynamic'));
staticButton.addEventListener('click', () => changeSection('static'));
resendButton.addEventListener('click', () => {
  const eventsBefore = eventList.childElementCount;
  viewer.localSchema = structuredClone(currentSchema);

  // Si el contenido es idéntico al que hay, el widget no emite nada: se dice
  // explícitamente para que no parezca que el estado anterior sigue vigente.
  setTimeout(() => {
    const emitted = Array.from(eventList.children)
      .slice(0, eventList.childElementCount - eventsBefore)
      .some((item) => item.textContent?.startsWith('contentUpdated'));
    if (!emitted) status.textContent = 'Reenviado el mismo JSON: sin cambios (no se emitió contentUpdated)';
  }, 150);
});

for (const [label, url] of Object.entries(EXAMPLES)) {
  select.add(new Option(label, url));
}

WIDGET_EVENTS.forEach((name) =>
  viewer.addEventListener(name, (event) => {
    const detail = (event as CustomEvent).detail;
    logEvent(name, detail);
    if (name === 'contentUpdated') {
      status.textContent = `contentUpdated: ${detail.mode}${detail.changedIds.length ? ' · ' + detail.changedIds.join(', ') : ''}`;
    }
  }),
);
select.addEventListener('change', () => loadExample(select.value));
clearButton.addEventListener('click', () => eventList.replaceChildren());

loadExample(select.value);
