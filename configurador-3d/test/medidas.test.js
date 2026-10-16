'use strict';
// Lectura de los GLB sin dependencias y comportamiento cuando un modelo 3D todavía no existe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { leerJsonGlb, datosGlb, actualizar } = require('../scripts/medidas.js');
const catalogo = require('../catalogo.json');

const RAIZ = path.join(__dirname, '..');

/** GLB mínimo (solo el bloque JSON) para probar sin depender de los modelos reales. */
function glbDePrueba(json) {
  let texto = Buffer.from(JSON.stringify(json), 'utf8');
  const relleno = (4 - (texto.length % 4)) % 4;
  texto = Buffer.concat([texto, Buffer.alloc(relleno, 0x20)]);
  const cab = Buffer.alloc(20);
  cab.writeUInt32LE(0x46546c67, 0);
  cab.writeUInt32LE(2, 4);
  cab.writeUInt32LE(20 + texto.length, 8);
  cab.writeUInt32LE(texto.length, 12);
  cab.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([cab, texto]);
}

test('lee las medidas, las puertas y los colores del nodo "modelo" de un GLB', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'domo-glb-'));
  const ruta = path.join(dir, 'x.glb');
  fs.writeFileSync(ruta, glbDePrueba({
    asset: { version: '2.0' },
    nodes: [{ name: 'modelo', extras: { id: 'x', fuente: 'a.blend', escena: 'E', coleccion: 'C', puertas: 1, medidas: { piso_area_m2: 5.44, ancho_m: 3.4, fondo_m: 3.2, alto_m: 3.5 } } }],
    materials: [{ name: 'panel', pbrMetallicRoughness: { baseColorFactor: [1, 0.2140, 0, 1] } }],
  }));
  const d = datosGlb(ruta);
  assert.deepEqual(Object.keys(d.medidas), ['ancho_m', 'fondo_m', 'alto_m', 'piso_area_m2']);
  assert.equal(d.puertas, 1);
  assert.deepEqual(d.origen_glb, { archivo_blend: 'a.blend', escena: 'E', coleccion: 'C' });
  assert.deepEqual(d.colores, { panel: '#ff7f00' });
  fs.writeFileSync(ruta, 'no es un glb');
  assert.throws(() => leerJsonGlb(ruta));
});

test('un GLB que falta queda "en preparación", sin medidas inventadas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'domo-sin-glb-'));
  const { catalogo: c, avisos } = actualizar(catalogo, dir);
  assert.equal(avisos.length, 4);
  for (const m of c.modelos) {
    assert.equal(m.medidas, null);
    for (const a of m.archivos_3d) {
      assert.equal(a.estado, 'en_preparacion');
      assert.equal(a.medidas, null);
    }
  }
});

test('los GLB presentes cumplen el contrato del visor (nodo "modelo", grupos y hojas de puerta)', () => {
  for (const m of catalogo.modelos) {
    for (const a of m.archivos_3d) {
      const ruta = path.join(RAIZ, a.archivo);
      if (!fs.existsSync(ruta)) continue;
      const j = leerJsonGlb(ruta);
      const nombres = j.nodes.map((n) => n.name);
      assert.ok(nombres.includes('modelo'), a.id);
      const hojas = nombres.filter((n) => /^puerta_hoja_\d+$/.test(n));
      assert.equal(hojas.length, a.puertas, `${a.id}: una hoja por puerta`);
      assert.ok(fs.statSync(ruta).size < 600 * 1024, `${a.id} pesa menos de 600 KB`);
    }
  }
});
