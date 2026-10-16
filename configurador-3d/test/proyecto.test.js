'use strict';
// Reglas del proyecto: palabras prohibidas, una misma línea visual y el contrato del HTML armado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const catalogo = require('../catalogo.json');
const { armar } = require('../scripts/armar-prototipo.js');

const RAIZ = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/** Todos los archivos del proyecto (incluido dist/ si existe). */
function archivos(dir) {
  const lista = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '__pycache__') continue;
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) lista.push(...archivos(ruta));
    else lista.push(ruta);
  }
  return lista;
}

test('ningún archivo del proyecto contiene la palabra prohibida', () => {
  // La palabra se arma por partes para que esta prueba no la contenga.
  const prohibida = ['gla', 'mp', 'ing'].join('');
  const encontrados = archivos(RAIZ).filter((f) => fs.readFileSync(f).toString('latin1').toLowerCase().includes(prohibida));
  assert.deepEqual(encontrados.map((f) => path.relative(RAIZ, f)), []);
});

/** Lee visor.js como en el navegador (sin dibujar nada) para ver su lenguaje de materiales. */
function materialesDelVisor() {
  const ventana = {};
  vm.runInNewContext(leer('visor.js'), { window: ventana });
  return ventana.DomoVisor.MATERIALES;
}

test('los tres modelos comparten un único negro, un único vidrio y una misma madera', () => {
  const M = materialesDelVisor();
  assert.deepEqual(Object.keys(M), ['negro', 'madera', 'vidrio']);
  const colores = (id) => catalogo.modelos.flatMap((m) => m.archivos_3d).find((a) => a.id === id).colores;
  // Cada color común sale de un archivo de DOMO.
  assert.equal(M.madera.hex, colores('dormi_aureo_a').piso, 'la madera es la del piso del archivo del Áureo');
  assert.equal(M.negro.hex, colores('dormi_patagonico').chapa_negra, 'el negro es la chapa negra del archivo del Patagónico');
  assert.equal(M.vidrio.hex, colores('dormi_patagonico').vidrio, 'el vidrio es el del archivo del Patagónico');
  // Los colores que el archivo del Áureo fija no se tocan.
  const roles = Object.values(M).flatMap((d) => d.roles);
  for (const fijo of ['madera_icosaedro', 'madera_dodecaedro', 'panel', 'incrustacion', 'puerta', 'puerta_detalle', 'persiana', 'podio', 'acero']) {
    assert.ok(!roles.includes(fijo), `${fijo} conserva el color del archivo de DOMO`);
  }
  // El Patagónico y el Cubic se arman solo con materiales del lenguaje común.
  for (const id of ['dormi_patagonico', 'cubic']) {
    const c = colores(id);
    if (!c) continue; // modelo 3D en preparación
    for (const rol of Object.keys(c)) assert.ok(roles.includes(rol), `${id}: el material "${rol}" es del lenguaje común`);
  }
});

/** Ancho y alto de un PNG (cabecera IHDR) o de un JPEG (marcador SOF). */
function medidaImagen(ruta) {
  const b = fs.readFileSync(ruta);
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  let i = 2;
  while (i < b.length) {
    const marca = b[i + 1];
    const largo = b.readUInt16BE(i + 2);
    if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + largo;
  }
  throw new Error(`No se pudo medir ${ruta}`);
}

test('las fotos de referencia tienen el mismo recorte y tamaño, y las miniaturas también', () => {
  const fotos = catalogo.modelos.map((m) => medidaImagen(path.join(RAIZ, m.imagen.archivo)));
  for (const f of fotos) assert.deepEqual(f, [400, 400], 'fotos cuadradas de 400 px (scripts/fotos.py)');
  for (const a of catalogo.modelos.flatMap((m) => m.archivos_3d)) {
    const ruta = path.join(RAIZ, a.miniatura);
    if (!fs.existsSync(ruta)) continue; // se genera cuando exista el GLB
    assert.deepEqual(medidaImagen(ruta), [640, 480], a.miniatura);
    assert.ok(fs.statSync(ruta).size < 120 * 1024, `${a.miniatura} pesa menos de 120 KB`);
  }
});

test('los colores de la página son solo variables de :root, redefinidas para el modo oscuro', () => {
  const css = leer('estilos.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{[^}]*color-scheme: dark;/);
  assert.match(css, /:root\[data-theme="dark"\] \{[^}]*color-scheme: dark;/);
  assert.match(css, /body \{[^}]*background: var\(--fondo\);/);
  // Fuera de los bloques de :root no queda ningún color escrito a mano.
  const sinRaiz = css
    .replace(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{[^}]*\}\s*\}/, '')
    .replace(/:root(\[data-theme="dark"\])? \{[^}]*\}/g, '');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(sinRaiz), 'hay un color fuera de las variables');
  // Un solo radio en toda la pantalla.
  const radios = new Set((sinRaiz.match(/border-radius:\s*([^;]+);/g) || []).map((r) => r.replace(/\s+/g, ' ')));
  assert.deepEqual([...radios].filter((r) => !/var\(--radio\)|: 0;/.test(r)), []);
});

test('el HTML armado cumple el contrato de la página privada', () => {
  const { html } = armar();
  assert.ok(html.startsWith('<title>Configurador DOMO BAIRES</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'));
  assert.match(html.slice(0, 600), /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=IBM\+Plex\+Mono[^"]*Jost[^"]*">/);
  assert.ok(!/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html));
  assert.ok(!/\balert\(|\bconfirm\(|\bprompt\(|window\.print|mailto:/.test(html));
  const scripts = html.match(/<script src="[^"]+"><\/script>/g);
  assert.deepEqual(scripts, [
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/environments/RoomEnvironment.js"></script>',
  ]);
  // Nada se carga desde archivos sueltos: imágenes y modelos van incrustados.
  assert.ok(!/src="imagenes\//.test(html));
  for (const a of catalogo.modelos.flatMap((m) => m.archivos_3d)) {
    if (fs.existsSync(path.join(RAIZ, a.archivo))) assert.ok(html.includes(`id="glb-${a.id}"`), a.id);
  }
});

test('el navegador solo guarda la configuración, siempre dentro de try/catch', () => {
  const app = leer('app.js');
  const usos = app.split('\n').filter((l) => /localStorage|sessionStorage/.test(l));
  assert.ok(usos.length > 0);
  for (const l of usos) assert.match(l, /try \{/, l.trim());
  assert.ok(!/fetch\([^)]*https?:/.test(app + leer('visor.js')), 'no se envía nada a servicios externos');
});
