/**
 * Pruebas e2e del bundle compilado (dist/elements/ux-driven-viewer.js) en Chromium real.
 * Runner: node:test + la librería `playwright` (sin @playwright/test, sin trazas).
 */
const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createE2eServer } = require('./server');

const SCHEMAS = path.resolve(__dirname, '..', 'examples', 'schemas');
const schema = (name) => JSON.parse(fs.readFileSync(path.join(SCHEMAS, `${name}.json`), 'utf8'));
const TIMEOUT = 10000;

let server, browser, baseUrl, context, page;

before(async () => {
  assert.ok(fs.existsSync(path.resolve(__dirname, '..', 'dist', 'elements', 'ux-driven-viewer.js')), 'Falta dist/elements/ux-driven-viewer.js: ejecuta `npm run build`.');
  server = createE2eServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
});
after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});
beforeEach(async () => {
  context = await browser.newContext();
  context.setDefaultTimeout(TIMEOUT);
  page = await context.newPage();
});
afterEach(async () => {
  await context.close();
});

/** Abre el host y espera a que el custom element esté definido. */
async function open(query = '') {
  await page.goto(`${baseUrl}/${query}`);
  await page.evaluate(() => customElements.whenDefined('ux-driven-viewer'));
}
/** Asigna `localSchema` y devuelve cuando el widget emitió `ready` por esa carga. */
async function load(sections) {
  const before = await countEvents('ready');
  await page.evaluate((s) => { document.getElementById('viewer').localSchema = s; }, sections);
  await waitEvents('ready', before + 1);
}
const events = (name) => page.evaluate((n) => window.__events.filter((e) => e.name === n), name);
const countEvents = async (name) => (await events(name)).length;
async function waitEvents(name, count) {
  await page.waitForFunction(([n, c]) => window.__events.filter((e) => e.name === n).length >= c, [name, count]);
}
const viewer = () => page.locator('ux-driven-viewer');

test('carga inicial: renderiza el esquema y emite ready', async () => {
  await open();
  assert.equal(await countEvents('ready'), 0);
  await load(schema('landing'));
  await viewer().locator('#hero_title').waitFor();
  assert.equal(await viewer().locator('#hero_title').textContent(), 'Landing de ejemplo');
  assert.equal(await viewer().locator('#footer_year').textContent(), '2026');
  const ready = await events('ready');
  assert.equal(ready.length, 1);
  assert.equal(ready[0].detail, true);
  const updated = await events('contentUpdated');
  assert.equal(updated[0].detail.mode, 'initial');
  assert.deepEqual(await events('errorOccurred'), []);
});

test('carga por api-url desde el servidor', async () => {
  await open('?api=/schemas/landing.json');
  await viewer().locator('#hero_title').waitFor();
  await waitEvents('ready', 1);
  assert.equal(await viewer().locator('#hero_title').textContent(), 'Landing de ejemplo');
});

test('stepper: valida al avanzar, permite volver y envía', async () => {
  await open();
  await load(schema('pasos'));
  const next = viewer().getByRole('button', { name: 'Siguiente' });
  const back = viewer().getByRole('button', { name: 'Atrás' });

  // Paso 1: no avanza con campos vacíos y muestra errores.
  assert.equal(await back.isVisible(), false, 'en el primer paso no hay Atrás');
  const initialSteps = (await events('stepChanged')).length;
  await next.click();
  await viewer().getByText('Escribe tu nombre').waitFor();
  await viewer().getByText('Escribe tu correo').waitFor();
  assert.equal((await events('stepChanged')).length, initialSteps);

  // Correo inválido sigue bloqueando.
  await viewer().locator('#nombre').fill('Ana');
  await viewer().locator('#correo').fill('no-es-correo');
  await next.click();
  await viewer().getByText('Correo inválido').waitFor();
  assert.equal((await events('stepChanged')).length, initialSteps);

  await viewer().locator('#correo').fill('ana@correo.com');
  await next.click();
  await waitEvents('stepChanged', initialSteps + 1);
  let step = (await events('stepChanged')).at(-1).detail;
  assert.equal(step.stepId, 'plan');
  assert.equal(step.index, 1);
  assert.equal(step.total, 3);
  assert.equal(step.direction, 'next');

  // Paso 2: exige plan.
  await next.click();
  await viewer().locator("[data-error-for='plan']").getByText('Elige un plan').waitFor();
  assert.equal((await events('stepChanged')).length, initialSteps + 1);

  // Volver conserva lo escrito.
  await back.click();
  await waitEvents('stepChanged', initialSteps + 2);
  step = (await events('stepChanged')).at(-1).detail;
  assert.equal(step.stepId, 'datos');
  assert.equal(step.direction, 'previous');
  assert.equal(await viewer().locator('#nombre').inputValue(), 'Ana');

  await next.click();
  await waitEvents('stepChanged', initialSteps + 3);
  await viewer().locator('#plan').selectOption('pro');
  await next.click();
  await waitEvents('stepChanged', initialSteps + 4);
  assert.equal((await events('stepChanged')).at(-1).detail.stepId, 'confirmar');

  // Último paso: exige aceptar términos y no envía antes.
  const submit = viewer().getByRole('button', { name: 'Enviar' });
  await submit.click();
  await viewer().getByText('Debes aceptar los términos').waitFor();
  assert.equal((await events('formSubmit')).length, 0);

  await viewer().locator('#acepta').check();
  await submit.click();
  await waitEvents('formSubmit', 1);
  const sent = (await events('formSubmit'))[0].detail;
  assert.deepEqual(sent.registro, { nombre: 'Ana', correo: 'ana@correo.com', plan: 'pro', acepta: true });
});

test('updateSections: dynamic conserva lo escrito, static recarga', async () => {
  await open();
  await load(schema('secciones'));
  const input = viewer().locator('#nombre');
  await input.fill('texto del usuario');

  // Cambio en otra sección dynamic: patched y el input sigue igual.
  await page.evaluate(() => {
    document.getElementById('viewer').updateSections([
      { id_DocumentHTMLCSS: 'novedades', renderType: 'dynamic', htmlComponent: '<div id="nov">Novedad nueva</div>' },
    ]);
  });
  await viewer().locator('#nov').waitFor();
  const patched = (await events('contentUpdated')).at(-1).detail;
  assert.equal(patched.mode, 'patched');
  assert.deepEqual(patched.changedIds, ['novedades']);
  assert.equal(await input.inputValue(), 'texto del usuario');
  assert.equal(await countEvents('ready'), 1, 'dynamic no debe recargar la pantalla');

  // Cambio en una static: reloaded y se pierde lo escrito.
  await page.evaluate(() => {
    document.getElementById('viewer').updateSections([
      { id_DocumentHTMLCSS: 'pie', renderType: 'static', htmlComponent: '<footer id="pie2">Pie nuevo</footer>' },
    ]);
  });
  await viewer().locator('#pie2').waitFor();
  await waitEvents('ready', 2);
  assert.equal((await events('contentUpdated')).at(-1).detail.mode, 'reloaded');
  assert.equal(await viewer().locator('#nombre').inputValue(), '');
});

test('subida de archivos: progreso y resultado correcto', async () => {
  await open();
  await load(schema('archivos'));
  await viewer().locator('#contrato').setInputFiles({
    name: 'contrato.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(300 * 1024, 1),
  });
  await waitEvents('fileUploadChanged', 1);
  await page.waitForFunction(() => window.__events.some((e) => e.name === 'fileUploadChanged' && e.detail.status === 'done'));
  const evs = await events('fileUploadChanged');
  const statuses = evs.map((e) => e.detail.status);
  assert.equal(statuses[0], 'uploading');
  assert.equal(statuses.at(-1), 'done');
  const progress = evs.map((e) => e.detail.progress).filter((p) => typeof p === 'number');
  assert.ok(progress.length > 0 && progress.at(-1) >= progress[0], 'el progreso no retrocede');
  assert.equal(evs.at(-1).detail.controlName, 'contrato');
  assert.equal(evs.at(-1).detail.result.name, 'contrato.pdf');
  assert.equal(await viewer().locator('#avance_contrato').getAttribute('value'), '100');
  assert.match(await viewer().locator('#lista_contrato').textContent(), /contrato\.pdf/);
});

for (const [name, label] of [['fallo.pdf', '500'], ['grande.pdf', '413']]) {
  test(`subida de archivos: ${name} produce error (${label})`, async () => {
    await open();
    await load(schema('archivos'));
    await viewer().locator('#contrato').setInputFiles({
      name, mimeType: 'application/pdf', buffer: Buffer.alloc(1024, 1),
    });
    await page.waitForFunction(() => window.__events.some((e) => e.name === 'fileUploadChanged' && e.detail.status === 'error'));
    const err = (await events('fileUploadChanged')).find((e) => e.detail.status === 'error').detail;
    assert.equal(err.controlName, 'contrato');
    assert.ok(err.error, 'incluye el motivo del error');
    assert.ok(!(await events('fileUploadChanged')).some((e) => e.detail.status === 'done'));
  });
}

test('autocompletado: sugerencias desde sourceUrl', async () => {
  await open();
  const requests = [];
  page.on('request', (r) => { if (r.url().includes('/api/ciudades')) requests.push(r.url()); });
  await load(schema('autocompletado'));
  const input = viewer().locator('#ciudad');
  await input.click();
  await input.pressSequentially('c', { delay: 20 });
  await page.waitForTimeout(500);
  assert.equal(requests.length, 0, 'con menos de minChars no consulta');
  await input.pressSequentially('or', { delay: 20 });
  const options = () => page.evaluate(() => [...document.querySelectorAll('#datalist-ciudad option')].map((o) => o.value));
  await page.waitForFunction(() => document.querySelectorAll('#datalist-ciudad option').length > 0);
  assert.deepEqual(await options(), ['Córdoba', 'Corrientes']);
  assert.ok(requests.some((u) => /[?&]q=cor/.test(u)));

  // Otra búsqueda reemplaza las sugerencias.
  await input.fill('');
  await input.pressSequentially('san', { delay: 20 });
  await page.waitForFunction(() => [...document.querySelectorAll('#datalist-ciudad option')].some((o) => o.value === 'Salta' || o.value === 'San Juan'));
  const second = await options();
  assert.ok(second.includes('San Juan') && !second.includes('Córdoba'));
});

test('error 404: página sin botón Reintentar y errorOccurred', async () => {
  await open('?api=/fixtures/not-found');
  await viewer().getByText('No encontramos este contenido').waitFor();
  assert.equal(await viewer().getByRole('button', { name: 'Reintentar' }).count(), 0);
  assert.match(await viewer().locator('.ux-error').textContent(), /404/);
  await waitEvents('errorOccurred', 1);
  assert.match(String((await events('errorOccurred'))[0].detail), /404/);
});

test('error 503: página con Reintentar que recupera el contenido', async () => {
  const key = `k${Date.now()}${Math.random()}`;
  await open(`?api=${encodeURIComponent(`/fixtures/flaky?fails=2&key=${key}`)}`);
  await viewer().getByText('Servicio no disponible').waitFor();
  assert.match(await viewer().locator('.ux-error').textContent(), /503/);
  const retry = viewer().getByRole('button', { name: 'Reintentar' });

  // Segundo intento: sigue fallando y la página reaparece.
  await retry.click();
  await waitEvents('errorOccurred', 2);
  await viewer().getByText('Servicio no disponible').waitFor();

  // Tercer intento: el servidor ya responde.
  await viewer().getByRole('button', { name: 'Reintentar' }).click();
  await viewer().locator('#ok').waitFor();
  assert.equal(await viewer().locator('#ok').textContent(), 'Contenido recuperado');
  assert.equal(await viewer().locator('.ux-error').count(), 0);
});

test('aislamiento CSS: el host entra, el widget no sale', async () => {
  await open();
  await load([
    {
      id_DocumentHTMLCSS: 'aislada', renderType: 'static',
      htmlComponent: '<h2 id="in-h2">Dentro</h2><p id="in-p">Texto</p><h1 id="in-h1">Titulo</h1>',
      cssComponent: 'p { color: rgb(0, 128, 0); } h2 { font-size: 40px; } body { background: rgb(1, 2, 3); }',
    },
    { id_DocumentHTMLCSS: 'otra', renderType: 'static', htmlComponent: '<p id="other-p">Otra sección</p>' },
  ]);
  await viewer().locator('#in-p').waitFor();
  const style = (sel, prop) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);

  // Hacia dentro: la regla del host `h1 { color: red }` aplica (no hay Shadow DOM).
  assert.equal(await style('#in-h1', 'color'), 'rgb(255, 0, 0)');
  // Hacia fuera: el CSS de la sección no toca al host ni a otras secciones.
  assert.equal(await style('#in-p', 'color'), 'rgb(0, 128, 0)');
  assert.equal(await style('#host-probe', 'color'), 'rgb(0, 0, 255)');
  assert.notEqual(await style('#other-p', 'color'), 'rgb(0, 128, 0)');
  assert.notEqual(await style('#host-h1', 'fontSize'), '40px');
  assert.notEqual(await style('body', 'backgroundColor'), 'rgb(1, 2, 3)');
});
