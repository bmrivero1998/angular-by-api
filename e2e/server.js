/**
 * Servidor de las pruebas e2e, sin dependencias:
 *   /                     página host mínima (e2e/host/index.html)
 *   /widget.js            el bundle compilado (dist/elements/ux-driven-viewer.js)
 *   /schemas/<n>.json     esquemas de examples/schemas
 *   /api/archivos|ciudades   scripts/mock-api.js
 *   /fixtures/*           respuestas de error para las páginas de error
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createServer: createMockApi } = require('../scripts/mock-api');

const ROOT = path.resolve(__dirname, '..');
const BUNDLE = path.join(ROOT, 'dist', 'elements', 'ux-driven-viewer.js');

function createE2eServer() {
  const mockApi = createMockApi().listeners('request')[0];
  const hits = new Map();

  const sendFile = (res, file, type) => {
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end('no encontrado');
        return;
      }
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(data);
    });
  };

  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const p = url.pathname;

    if (p.startsWith('/api/')) return mockApi(req, res);
    if (p === '/' || p === '/index.html') return sendFile(res, path.join(__dirname, 'host', 'index.html'), 'text/html; charset=utf-8');
    if (p === '/widget.js') return sendFile(res, BUNDLE, 'application/javascript; charset=utf-8');

    const schema = /^\/schemas\/([\w-]+)\.json$/.exec(p);
    if (schema) return sendFile(res, path.join(ROOT, 'examples', 'schemas', `${schema[1]}.json`), 'application/json; charset=utf-8');

    if (p === '/fixtures/not-found') return res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"no existe"}');

    // /fixtures/flaky?key=x&fails=1 -> responde 503 las primeras `fails` veces y luego el esquema "novedades".
    if (p === '/fixtures/flaky') {
      const key = url.searchParams.get('key') || 'default';
      const fails = Number(url.searchParams.get('fails') || 1);
      const n = (hits.get(key) || 0) + 1;
      hits.set(key, n);
      if (n <= fails) return res.writeHead(503, { 'Content-Type': 'application/json' }).end('{"error":"caido"}');
      return res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify([{ id_DocumentHTMLCSS: 'recuperado', renderType: 'dynamic', htmlComponent: '<p id="ok">Contenido recuperado</p>' }]),
      );
    }

    res.writeHead(404).end('no encontrado');
  });
}

module.exports = { createE2eServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 4300;
  createE2eServer().listen(port, () => console.log(`e2e en http://localhost:${port}`));
}
