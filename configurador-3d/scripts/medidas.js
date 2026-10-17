#!/usr/bin/env node
/*
 * Copia al catálogo las medidas de cada modelo 3D de DOMO.
 *
 * Lee los datos (extras) del nodo "modelo" de cada GLB declarado en
 * catalogo.json -> modelos[].archivos_3d[] y escribe:
 *   - archivos_3d[].medidas  (ancho_m, fondo_m, alto_m y las que traiga el archivo)
 *   - archivos_3d[].puertas, .origen_glb (archivo de Blender, escena y colección) y
 *     .colores (color de cada material, en hexadecimal sRGB)
 *   - modelos[].medidas      (las del archivo 3D predeterminado del modelo)
 * Si un GLB todavía no existe, lo marca "en_preparacion" y deja sus datos en null.
 *
 * Sin dependencias: el GLB se lee a mano (cabecera de 12 bytes + bloque JSON).
 * Uso: node scripts/medidas.js            (escribe catalogo.json)
 *      node scripts/medidas.js --revisar  (solo compara; sale con error si hay diferencias)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const RUTA_CATALOGO = path.join(RAIZ, 'catalogo.json');

/** Devuelve el JSON interno de un archivo GLB (glTF binario). */
function leerJsonGlb(ruta) {
  const b = fs.readFileSync(ruta);
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${ruta} no es un GLB`);
  const largo = b.readUInt32LE(12);
  const tipo = b.readUInt32LE(16);
  if (tipo !== 0x4e4f534a) throw new Error(`${ruta}: el primer bloque no es JSON`);
  return JSON.parse(b.slice(20, 20 + largo).toString('utf8'));
}

const aHex = (lineal) => {
  const s = lineal <= 0.0031308 ? lineal * 12.92 : 1.055 * Math.pow(lineal, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, s)) * 255).toString(16).padStart(2, '0');
};

/** Datos que el configurador usa de un GLB: medidas, puertas, origen y colores por material. */
function datosGlb(ruta) {
  const j = leerJsonGlb(ruta);
  const nodo = (j.nodes || []).find((n) => n.name === 'modelo');
  if (!nodo || !nodo.extras) throw new Error(`${ruta}: falta el nodo "modelo" con sus datos`);
  const ex = nodo.extras;
  const m = ex.medidas || {};
  // Ancho, fondo y alto primero; después el resto en el orden del archivo.
  const medidas = {};
  for (const k of ['ancho_m', 'fondo_m', 'alto_m']) if (k in m) medidas[k] = m[k];
  for (const [k, v] of Object.entries(m)) if (!(k in medidas)) medidas[k] = v;
  const colores = {};
  for (const mat of j.materials || []) {
    const f = mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor;
    if (mat.name && f) colores[mat.name] = '#' + f.slice(0, 3).map(aHex).join('');
  }
  return {
    id: ex.id,
    medidas,
    puertas: typeof ex.puertas === 'number' ? ex.puertas : null,
    origen_glb: { archivo_blend: ex.fuente || null, escena: ex.escena || null, coleccion: ex.coleccion || null },
    colores,
  };
}

/** Catálogo con las medidas al día (no escribe nada). Devuelve { catalogo, avisos }. */
function actualizar(catalogo, raiz) {
  const cat = JSON.parse(JSON.stringify(catalogo));
  const avisos = [];
  for (const m of cat.modelos) {
    for (const a of m.archivos_3d || []) {
      const ruta = path.join(raiz || RAIZ, a.archivo);
      if (!fs.existsSync(ruta)) {
        Object.assign(a, { estado: 'en_preparacion', medidas: null, puertas: null, origen_glb: null, colores: null });
        avisos.push(`Falta ${a.archivo}: queda "en preparación".`);
        continue;
      }
      const d = datosGlb(ruta);
      if (d.id && d.id !== a.id) avisos.push(`${a.archivo} dice ser "${d.id}" y el catálogo lo llama "${a.id}".`);
      Object.assign(a, { estado: 'listo', medidas: d.medidas, puertas: d.puertas, origen_glb: d.origen_glb, colores: d.colores });
    }
    const pred = (m.archivos_3d || []).find((a) => a.id === m.modelo_3d);
    m.medidas = pred && pred.medidas ? pred.medidas : null;
    m.medidas_fuente = pred && pred.medidas ? pred.archivo : null;
  }
  return { catalogo: cat, avisos };
}

/** JSON con sangría de 2 espacios, pero con los objetos y listas cortos en una sola línea. */
function formatear(valor, sangria = '') {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  const simple = Object.values(valor).every((v) => v === null || typeof v !== 'object');
  if (simple) {
    const corto = Array.isArray(valor)
      ? '[' + valor.map((v) => JSON.stringify(v)).join(', ') + ']'
      : Object.keys(valor).length ? '{ ' + Object.entries(valor).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ') + ' }' : '{}';
    if (corto.length + sangria.length <= 100) return corto;
  }
  const dentro = sangria + '  ';
  if (Array.isArray(valor)) {
    if (!valor.length) return '[]';
    return '[\n' + valor.map((v) => dentro + formatear(v, dentro)).join(',\n') + '\n' + sangria + ']';
  }
  const claves = Object.keys(valor);
  if (!claves.length) return '{}';
  return '{\n' + claves.map((k) => `${dentro}${JSON.stringify(k)}: ${formatear(valor[k], dentro)}`).join(',\n') + '\n' + sangria + '}';
}

if (require.main === module) {
  const original = JSON.parse(fs.readFileSync(RUTA_CATALOGO, 'utf8'));
  const { catalogo, avisos } = actualizar(original);
  for (const a of avisos) console.warn('Aviso: ' + a);
  const texto = formatear(catalogo) + '\n';
  if (process.argv.includes('--revisar')) {
    const igual = JSON.stringify(original) === JSON.stringify(catalogo);
    console.log(igual ? 'El catálogo coincide con los modelos 3D.' : 'El catálogo NO coincide con los modelos 3D: correr "npm run medidas".');
    process.exit(igual ? 0 : 1);
  }
  fs.writeFileSync(RUTA_CATALOGO, texto);
  for (const m of catalogo.modelos) {
    const med = m.medidas;
    console.log(`${m.nombre}: ${med ? `${med.ancho_m} × ${med.fondo_m} × ${med.alto_m} m (${m.medidas_fuente})` : 'modelo 3D en preparación'}`);
  }
  console.log('catalogo.json actualizado.');
}

module.exports = { leerJsonGlb, datosGlb, actualizar, formatear };
