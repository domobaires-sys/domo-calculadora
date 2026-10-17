'use strict';
// Contenido del catálogo: solo los tres Dormis, opciones concretas, precios pendientes y fuentes declaradas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const catalogo = require('../catalogo.json');
const { actualizar } = require('../scripts/medidas.js');

const RAIZ = path.join(__dirname, '..');
const modelo = (id) => catalogo.modelos.find((m) => m.id === id);

test('hay exactamente tres modelos: Dormi Áureo, Dormi Patagónico y Cubic', () => {
  assert.deepEqual(catalogo.modelos.map((m) => m.id), ['dormi_aureo', 'dormi_patagonico', 'cubic']);
  assert.deepEqual(catalogo.modelos.map((m) => m.nombre), ['Dormi Áureo', 'Dormi Patagónico', 'Cubic']);
});

test('cada modelo declara su GLB, su miniatura y una foto de referencia que existe', () => {
  const esperado = { dormi_aureo: ['dormi_aureo_a', 'dormi_aureo_b'], dormi_patagonico: ['dormi_patagonico'], cubic: ['cubic'] };
  for (const m of catalogo.modelos) {
    assert.deepEqual(m.archivos_3d.map((a) => a.id), esperado[m.id], m.id);
    assert.ok(m.archivos_3d.some((a) => a.id === m.modelo_3d), `${m.id}: el archivo predeterminado está declarado`);
    for (const a of m.archivos_3d) {
      assert.equal(a.archivo, `modelos/${a.id}.glb`);
      assert.equal(a.miniatura, `imagenes/miniatura_${a.id}.webp`);
    }
    assert.ok(fs.existsSync(path.join(RAIZ, m.imagen.archivo)), m.imagen.archivo);
    assert.ok(m.imagen.alt && m.descripcion);
  }
  assert.equal(modelo('dormi_aureo').modelo_3d, 'dormi_aureo_a', 'la trama A (la de las capturas de DOMO) va por defecto');
});

test('el Dormi Áureo tiene exactamente sus dos opciones: trama A/B y cuatro colores de paneles', () => {
  const ops = modelo('dormi_aureo').opciones;
  assert.deepEqual(ops.map((o) => [o.id, o.nombre, o.tipo, o.predeterminada]), [
    ['trama', 'Diseño de la trama', 'modelo_3d', 'a'],
    ['color', 'Color de los paneles', 'color_material', 'natural'],
  ]);
  assert.deepEqual(ops[0].valores.map((v) => [v.id, v.nombre, v.archivo_3d]), [['a', 'Opción A', 'dormi_aureo_a'], ['b', 'Opción B', 'dormi_aureo_b']]);
  assert.equal(ops[1].material, 'panel');
  assert.deepEqual(ops[1].valores.map((v) => [v.id, v.nombre, v.hex]), [
    ['natural', 'Natural', null],
    ['azul', 'Azul Francia', '#1f3f8f'],
    ['blanco', 'Blanco', '#eef1f5'],
    ['negro', 'Negro', '#1c1d21'],
  ]);
});

test('el Dormi Patagónico y el Cubic no tienen opciones de diseño, pero sí su composición', () => {
  for (const id of ['dormi_patagonico', 'cubic']) {
    assert.deepEqual(modelo(id).opciones, [], id);
    assert.ok(modelo(id).composicion.length >= 4, id);
  }
  for (const m of catalogo.modelos) {
    for (const c of m.composicion) {
      assert.ok(['confirmado', 'pendiente'].includes(c.estado), `${m.id}/${c.id}`);
      if (c.estado === 'confirmado') assert.ok(c.valor || c.plantilla, `${m.id}/${c.id} confirmado sin dato`);
    }
  }
});

test('las medidas que no son comparables entre modelos dicen exactamente qué miden', () => {
  // El ancho × fondo × alto del Áureo incluye el podio; su archivo lo trae así.
  assert.equal(modelo('dormi_aureo').medidas_nota, 'con el podio');
  assert.ok(modelo('dormi_aureo').fuente_medidas_nota in catalogo.fuentes);
  // El Patagónico mide su planta por fuera de los muros: el resumen informa la de adentro.
  const pat = modelo('dormi_patagonico');
  assert.equal(pat.medida_superficie, 'piso_interior_area_m2');
  assert.match(pat.etiquetas_medidas.piso_area_m2, /por fuera/);
  assert.match(pat.etiquetas_medidas.piso_interior_area_m2, /por dentro/);
  for (const m of catalogo.modelos) {
    const clave = m.medida_superficie || 'piso_area_m2';
    assert.ok(m.etiquetas_medidas && m.etiquetas_medidas[clave], `${m.id}: la superficie del resumen tiene su etiqueta propia`);
  }
});

test('las modalidades son Kit, Media obra y Llave en mano, con las descripciones de DOMO', () => {
  assert.deepEqual(catalogo.modalidades.map((x) => [x.id, x.nombre, x.descripcion]), [
    ['kit', 'Kit', 'Recibís la estructura cortada y numerada, con manual de montaje.'],
    ['media_obra', 'Media obra', 'Montamos la estructura y el cerramiento. Terminaciones interiores por tu cuenta.'],
    ['llave_en_mano', 'Llave en mano', 'Obra completa, con terminaciones.'],
  ]);
});

test('ningún precio está en cero y hoy todos están pendientes', () => {
  for (const m of catalogo.modelos) {
    assert.deepEqual(Object.keys(m.precios), catalogo.modalidades.map((x) => x.id), m.id);
    for (const [k, p] of Object.entries(m.precios)) {
      assert.equal(p.estado, 'pendiente', `${m.id}/${k}`);
      assert.ok(!('importe' in p) || p.importe > 0, `${m.id}/${k}`);
    }
  }
  const todo = JSON.stringify(catalogo.modelos);
  assert.ok(!/"importe":\s*0[,}]/.test(todo));
});

test('todos los identificadores son simples y cada dato nombra una fuente declarada', () => {
  const ids = [];
  for (const m of catalogo.modelos) {
    ids.push(m.id, ...m.archivos_3d.map((a) => a.id));
    for (const o of m.opciones) ids.push(o.id, ...o.valores.map((v) => v.id));
    assert.ok(!m.opciones.some((o) => o.id === 'entrega'), 'la clave "entrega" está reservada para el código');
  }
  ids.push(...catalogo.modalidades.map((x) => x.id));
  for (const id of ids) assert.match(id, /^[a-z0-9_]+$/, id);
  const usadas = new Set();
  JSON.stringify(catalogo, (k, v) => { if (/^fuente(_\w+)?$/.test(k) && typeof v === 'string') usadas.add(v); return v; });
  usadas.delete('Lista de precios de DOMO de la fecha'); // texto del ejemplo de precio
  for (const f of usadas) assert.ok(f in catalogo.fuentes, `fuente sin declarar: ${f}`);
});

test('las medidas del catálogo coinciden con los datos de los GLB presentes', () => {
  const { catalogo: alDia } = actualizar(catalogo, RAIZ);
  assert.deepEqual(catalogo, alDia, 'correr "npm run medidas" para actualizar catalogo.json');
  for (const m of catalogo.modelos) {
    for (const a of m.archivos_3d) {
      const hay = fs.existsSync(path.join(RAIZ, a.archivo));
      assert.equal(a.estado, hay ? 'listo' : 'en_preparacion', a.id);
      if (hay) for (const k of ['ancho_m', 'fondo_m', 'alto_m']) assert.ok(a.medidas[k] > 0, `${a.id}.${k}`);
    }
  }
});
