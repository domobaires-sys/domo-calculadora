'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { Almacen } = require('../src/almacen');
const { crearApp } = require('../src/app');

const TOKEN = 'clave-de-prueba';
let servidor, base, dataDir;

test.before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domo-test-'));
  const almacen = new Almacen({ dataDir, catalogoInicial: path.join(__dirname, '..', 'catalogo-inicial.json') });
  const silencio = { info() {}, error() {} };
  servidor = http.createServer(crearApp({ almacen, adminToken: TOKEN, log: silencio }));
  await new Promise(r => servidor.listen(0, r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
test.after(() => { servidor.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const pedir = async (metodo, ruta, cuerpo, admin = false) => {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const tipo = r.headers.get('content-type') || '';
  return { status: r.status, datos: tipo.includes('json') ? await r.json() : await r.text() };
};

test('catálogo público y cotización', async () => {
  const { status, datos } = await pedir('GET', '/api/catalogo');
  assert.equal(status, 200);
  assert.equal(datos.pasos[0].id, 'linea');
  assert.equal(datos.seleccion_inicial.tamano, 'd6');
  const q = await pedir('POST', '/api/cotizar', { seleccion: { linea: 'confort', tamano: 'd8' } });
  assert.equal(q.datos.ok, true);
  assert.equal(q.datos.medidas.diametro_m, 8);
});

test('errores claros en JSON inválido y rutas desconocidas', async () => {
  const r = await fetch(base + '/api/cotizar', { method: 'POST', body: '{roto' });
  assert.equal(r.status, 400);
  assert.equal((await pedir('GET', '/api/nada')).status, 404);
  assert.equal((await pedir('DELETE', '/api/catalogo')).status, 405);
});

test('el admin requiere clave', async () => {
  assert.equal((await pedir('GET', '/api/admin/catalogo')).status, 401);
  assert.equal((await pedir('GET', '/api/admin/catalogo', undefined, true)).status, 200);
});

test('editar el catálogo: valida, versiona, guarda historial y restaura', async () => {
  const { datos: cat } = await pedir('GET', '/api/admin/catalogo', undefined, true);
  const v0 = cat.version;

  const roto = structuredClone(cat);
  roto.pasos[0].opciones[0].precio.valor = -1;
  const r1 = await pedir('PUT', '/api/admin/catalogo', roto, true);
  assert.equal(r1.status, 422);
  assert.match(r1.datos.errores.join(), /precio.valor/);

  cat.pasos.find(p => p.id === 'puertas').opciones[0].precio.valor = 999;
  cat.textos.boton_enviar = 'Quiero mi domo';
  const r2 = await pedir('PUT', '/api/admin/catalogo', cat, true);
  assert.equal(r2.status, 200);
  assert.equal(r2.datos.version, v0 + 1);

  const publico = await pedir('GET', '/api/catalogo');
  assert.equal(publico.datos.textos.boton_enviar, 'Quiero mi domo');
  const q = await pedir('POST', '/api/cotizar', { seleccion: {} });
  assert.equal(q.datos.items.find(i => i.opcion === 'puerta_simple').importe, 999);

  // Guardar sobre una versión vieja da conflicto en vez de pisar cambios.
  const r3 = await pedir('PUT', '/api/admin/catalogo', { ...cat, version: v0 }, true);
  assert.equal(r3.status, 409);

  const hist = await pedir('GET', '/api/admin/historial', undefined, true);
  assert.equal(hist.datos[0].version, v0);
  const r4 = await pedir('POST', `/api/admin/historial/${hist.datos[0].archivo}/restaurar`, undefined, true);
  assert.equal(r4.status, 200);
  assert.equal(r4.datos.version, v0 + 2);
  const q2 = await pedir('POST', '/api/cotizar', { seleccion: {} });
  assert.equal(q2.datos.items.find(i => i.opcion === 'puerta_simple').importe, 650);
});

test('pedidos de presupuesto: validación, guardado, estado y CSV', async () => {
  const sinDatos = await pedir('POST', '/api/presupuestos', { cliente: {}, seleccion: {} });
  assert.equal(sinDatos.status, 422);
  const malaConfig = await pedir('POST', '/api/presupuestos', { cliente: { nombre: 'Ana', telefono: '11 5555' }, seleccion: { tamano: 'd10' } });
  assert.equal(malaConfig.status, 422);

  // El precio lo recalcula el servidor: lo que mande el navegador se ignora.
  const ok = await pedir('POST', '/api/presupuestos', { cliente: { nombre: 'Ana', email: 'ana@ejemplo.com' }, seleccion: {}, total: 1 });
  assert.equal(ok.status, 200);
  assert.match(ok.datos.numero, /^DOMO-\d{4}-0001$/);

  const lista = await pedir('GET', '/api/admin/presupuestos', undefined, true);
  assert.equal(lista.datos.length, 1);
  assert.ok(lista.datos[0].cotizacion.total > 1000);
  assert.equal(lista.datos[0].cotizacion.disponibilidad, undefined);

  const cambio = await pedir('PATCH', `/api/admin/presupuestos/${ok.datos.numero}`, { estado: 'contactado', notas: 'Llamar el lunes' }, true);
  assert.equal(cambio.datos.estado, 'contactado');
  assert.equal((await pedir('PATCH', `/api/admin/presupuestos/${ok.datos.numero}`, { estado: 'cualquiera' }, true)).status, 422);

  const csv = await pedir('GET', '/api/admin/presupuestos.csv', undefined, true);
  assert.match(csv.datos, /DOMO-\d{4}-0001,.*,contactado,Ana,ana@ejemplo.com/);
});

test('las páginas del configurador y del panel se sirven', async () => {
  const r1 = await fetch(base + '/');
  assert.match(await r1.text(), /Configurador/);
  const r2 = await fetch(base + '/admin');
  assert.match(await r2.text(), /Panel de opciones/);
  assert.equal((await fetch(base + '/../server.js')).status, 404);
});
