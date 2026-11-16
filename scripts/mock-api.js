/**
 * API de prueba para el playground, sin dependencias:
 *   - `POST|PUT /api/archivos`   recibe subidas de archivos
 *   - `GET /api/ciudades?q=...`  sugerencias para el autocompletado
 *
 *   npm run mock-api          # escucha en http://localhost:3001
 *   npm start                 # el playground redirige /api a ese puerto (ver proxy.conf.json)
 *
 * Lee el cuerpo despacio (64 KB cada 80 ms) para que el avance se vea incluso
 * con archivos pequeños. Respuestas especiales según el nombre del archivo:
 *   - contiene "fallo"  -> 500
 *   - contiene "grande" -> 413
 *   - contiene "vacio"  -> 200 sin cuerpo
 */
const http = require('http');

const CHUNK_BYTES = 64 * 1024;
const CHUNK_DELAY_MS = 80;
let nextId = 1;

function readSlowly(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let buffered = Buffer.alloc(0);

    req.on('error', reject);
    req.on('end', () => {
      parts.push(buffered);
      resolve(Buffer.concat(parts));
    });
    req.on('data', (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length >= CHUNK_BYTES) {
        parts.push(buffered);
        buffered = Buffer.alloc(0);
        req.pause();
        setTimeout(() => req.resume(), CHUNK_DELAY_MS);
      }
    });
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function handleUpload(req, res) {
  const body = await readSlowly(req);
  const header = body.subarray(0, 2048).toString('latin1');
  const match = /filename="([^"]*)"/.exec(header);
  const name = match ? Buffer.from(match[1], 'latin1').toString('utf8') : 'archivo';

  if (name.includes('fallo')) return send(res, 500, { error: 'Fallo simulado' });
  if (name.includes('grande')) return send(res, 413, { error: 'Archivo demasiado grande' });
  if (name.includes('vacio')) return send(res, 200);

  const id = nextId++;
  send(res, 200, { id, name, size: body.length, url: `/archivos/${id}` });
}

const CITIES = [
  'Buenos Aires', 'Bahía Blanca', 'Córdoba', 'Corrientes', 'Rosario', 'Mendoza', 'Mar del Plata',
  'Salta', 'San Juan', 'San Luis', 'San Miguel de Tucumán', 'Santa Fe', 'Santiago del Estero', 'Neuquén',
];

/** GET /api/ciudades?q=cor -> ["Córdoba", "Corrientes"] (tarda un poco, como un servicio real). */
function handleCities(req, res) {
  // Sin acentos ni mayúsculas: "cor" encuentra "Córdoba".
  const plain = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const q = plain(new URL(req.url, 'http://localhost').searchParams.get('q') || '');
  const matches = CITIES.filter((city) => plain(city).includes(q));
  setTimeout(() => send(res, 200, matches), 150);
}

function createServer() {
  return http.createServer((req, res) => {
    const path = (req.url || '').split('?')[0];
    if (path === '/api/archivos' && (req.method === 'POST' || req.method === 'PUT')) {
      handleUpload(req, res).catch(() => send(res, 500, { error: 'Error leyendo la subida' }));
    } else if (path === '/api/ciudades' && req.method === 'GET') {
      handleCities(req, res);
    } else {
      send(res, 404, { error: 'No encontrado' });
    }
  });
}

module.exports = { handleUpload, handleCities, createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3001;
  createServer().listen(port, () => console.log(`API de prueba en http://localhost:${port}  (POST /api/archivos)`));
}
