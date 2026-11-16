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
];

type ViewerElement = HTMLElement & { localSchema?: unknown };

const viewer = document.getElementById('pg-viewer') as ViewerElement;
const select = document.getElementById('pg-example') as HTMLSelectElement;
const status = document.getElementById('pg-status') as HTMLElement;
const eventList = document.getElementById('pg-events') as HTMLOListElement;
const clearButton = document.getElementById('pg-clear') as HTMLButtonElement;

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
    viewer.localSchema = await response.json();
    status.textContent = url;
  } catch (error) {
    status.textContent = `No se pudo cargar ${url}: ${String(error)}`;
  }
}

for (const [label, url] of Object.entries(EXAMPLES)) {
  select.add(new Option(label, url));
}

WIDGET_EVENTS.forEach((name) =>
  viewer.addEventListener(name, (event) => logEvent(name, (event as CustomEvent).detail)),
);
select.addEventListener('change', () => loadExample(select.value));
clearButton.addEventListener('click', () => eventList.replaceChildren());

loadExample(select.value);
